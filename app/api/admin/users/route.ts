import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { userCreateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";
import { findDuplicateAccount } from "./duplicates";
import { sendWelcomeEmail } from "@/lib/emails/send";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const workPointId = searchParams.get("workPointId");
    const active = searchParams.get("active");
    const search = searchParams.get("search");

    const users = await prisma.user.findMany({
      where: {
        role: Role.EMPLOYEE,
        ...(workPointId ? { workPointId } : {}),
        ...(active === "true" ? { active: true } : {}),
        ...(active === "false" ? { active: false } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { username: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        workPoint: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    console.error("[Users] Eroare listare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body: unknown = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Datele trimise nu sunt valide." }, { status: 400 });
    }
    const parsed = userCreateSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
      return NextResponse.json(
        { error: issue?.message ?? "Date invalide.", ...(field ? { field } : {}) },
        { status: 400 }
      );
    }

    const username = parsed.data.username.toLowerCase();
    const email = parsed.data.email.toLowerCase();
    const duplicate = await findDuplicateAccount({ username, email });
    if (duplicate) {
      return NextResponse.json(duplicate, { status: 409 });
    }

    const workPointId = parsed.data.workPointId || null;
    if (workPointId) {
      const workPoint = await prisma.workPoint.findUnique({
        where: { id: workPointId },
        select: { active: true },
      });
      if (!workPoint?.active) {
        return NextResponse.json(
          {
            error: "Punctul de lucru selectat nu există sau este inactiv.",
            field: "workPointId",
          },
          { status: 400 }
        );
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email,
        username,
        passwordHash,
        role: Role.EMPLOYEE,
        jobTitle: parsed.data.jobTitle,
        employer: parsed.data.employer,
        workPointId,
        hireDate: parsed.data.hireDate,
        initialLeaveDays: parsed.data.initialLeaveDays,
        availableDays: parsed.data.initialLeaveDays,
        active: parsed.data.active ?? true,
        mustChangePassword: true,
      },
      include: {
        workPoint: { select: { name: true } },
      },
    });

    await createAuditLog({
      userId: auth.session.user.id,
      action: "CREATE_USER",
      entityType: "User",
      entityId: user.id,
      details: {
        email: user.email,
        username: user.username,
        workPointId: user.workPointId,
        initialLeaveDays: user.initialLeaveDays,
      },
    });

    // Contul există deja; un email netrimis nu anulează crearea, dar adminul trebuie să
    // afle că angajatul nu a primit parola.
    let warning: string | undefined;
    try {
      const result = await sendWelcomeEmail({
        to: user.email,
        fullName: `${user.firstName} ${user.lastName}`,
        username: user.username,
        password: parsed.data.password,
      });
      if (!result.sent) {
        warning =
          result.reason === "demo"
            ? "Contul a fost creat. Pe demo emailurile nu se trimit: comunică-i angajatului numele de utilizator și parola."
            : "Contul a fost creat, dar emailurile nu sunt configurate. Comunică-i angajatului numele de utilizator și parola.";
      }
    } catch (emailError) {
      console.error("[Users] Eroare email:", emailError);
      warning =
        "Contul a fost creat, dar emailul de bun venit nu a putut fi trimis. Comunică-i angajatului numele de utilizator și parola.";
    }

    return NextResponse.json(warning ? { data: user, warning } : { data: user }, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Cont creat în paralel cu același username sau email.
      return NextResponse.json(
        { error: "Există deja un utilizator cu acest email sau nume de utilizator." },
        { status: 409 }
      );
    }
    console.error("[Users] Eroare creare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}