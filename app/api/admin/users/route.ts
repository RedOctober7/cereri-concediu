import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { userCreateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";
import { WelcomeEmail } from "@/lib/emails/WelcomeEmail";
import { Resend } from "resend";
import { render } from "@react-email/render";

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

    const body: unknown = await request.json();
    const parsed = userCreateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const duplicate = await prisma.user.findFirst({
      where: {
        OR: [
          { username: parsed.data.username.toLowerCase() },
          { email: parsed.data.email.toLowerCase() },
        ],
      },
      select: { id: true, email: true, username: true },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "Există deja un utilizator cu acest email sau username." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email.toLowerCase(),
        username: parsed.data.username.toLowerCase(),
        passwordHash,
        role: Role.EMPLOYEE,
        jobTitle: parsed.data.jobTitle,
        employer: parsed.data.employer,
        workPointId: parsed.data.workPointId || null,
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
      },
    });

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const html = await render(WelcomeEmail({
        fullName: `${user.firstName} ${user.lastName}`,
        username: user.username,
        password: parsed.data.password,
      }));
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'noreply@example.ro',
        to: user.email,
        subject: 'Cont nou creat - Cereri Concediu',
        html,
      });
    } catch (emailError) {
      console.error('[Users] Eroare email:', emailError);
    }

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
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