import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { userUpdateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body: unknown = await request.json();
    const parsed = userUpdateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Utilizatorul nu a fost găsit." },
        { status: 404 }
      );
    }

    let passwordHash: string | undefined;
    if (parsed.data.password) {
      passwordHash = await bcrypt.hash(parsed.data.password, 12);
    }

    const newInitialLeaveDays = parsed.data.initialLeaveDays;

    const { updated, balanceChange } = await prisma.$transaction(async (tx) => {
      // Soldul inițial face parte din availableDays (la creare availableDays =
      // initialLeaveDays), deci o corectură se aplică și soldului, ca diferență.
      // Blocăm rândul (ca la crearea cererilor și la rollover-ul anual) ca
      // diferența să fie calculată din valorile curente, nu dintr-o citire veche.
      let before: { initialLeaveDays: number; availableDays: number } | null =
        null;
      let availableDaysDelta = 0;
      if (newInitialLeaveDays !== undefined) {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
        before = await tx.user.findUniqueOrThrow({
          where: { id },
          select: { initialLeaveDays: true, availableDays: true },
        });
        availableDaysDelta = newInitialLeaveDays - before.initialLeaveDays;
      }

      const updated = await tx.user.update({
        where: { id },
        // tx nu are tipul cu omit-ul global, deci îl cerem explicit.
        omit: { passwordHash: true },
        data: {
          ...(parsed.data.firstName ? { firstName: parsed.data.firstName } : {}),
          ...(parsed.data.lastName ? { lastName: parsed.data.lastName } : {}),
          ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}),
          ...(parsed.data.username
            ? { username: parsed.data.username.toLowerCase() }
            : {}),
          ...(parsed.data.jobTitle ? { jobTitle: parsed.data.jobTitle } : {}),
          ...(parsed.data.employer ? { employer: parsed.data.employer } : {}),
          ...(parsed.data.workPointId !== undefined
            ? { workPointId: parsed.data.workPointId || null }
            : {}),
          ...(parsed.data.hireDate ? { hireDate: parsed.data.hireDate } : {}),
          ...(newInitialLeaveDays !== undefined
            ? { initialLeaveDays: newInitialLeaveDays }
            : {}),
          ...(availableDaysDelta !== 0
            ? { availableDays: { increment: availableDaysDelta } }
            : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          ...(parsed.data.forcePasswordReset !== undefined
            ? { mustChangePassword: parsed.data.forcePasswordReset }
            : {}),
          // Dezactivarea e un soft-delete; la reactivare trebuie șters și deletedAt,
          // altfel login-ul și cron-urile (care filtrează deletedAt: null) îl ignoră.
          ...(parsed.data.active === false ? { deletedAt: new Date() } : {}),
          ...(parsed.data.active === true ? { deletedAt: null } : {}),
        },
      });

      return {
        updated,
        balanceChange:
          before && availableDaysDelta !== 0
            ? {
                initialLeaveDaysBefore: before.initialLeaveDays,
                initialLeaveDaysAfter: updated.initialLeaveDays,
                availableDaysBefore: before.availableDays,
                availableDaysAfter: updated.availableDays,
              }
            : null,
      };
    });

    // Parola în clar nu ajunge niciodată în audit log; notăm doar că a fost resetată.
    const { password, ...auditDetails } = parsed.data;
    await createAuditLog({
      userId: auth.session.user.id,
      action: "UPDATE_USER",
      entityType: "User",
      entityId: updated.id,
      details: {
        ...auditDetails,
        ...(password ? { passwordReset: true } : {}),
        ...(balanceChange ?? {}),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[Users] Eroare actualizare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
