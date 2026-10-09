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

    const updated = await prisma.user.update({
      where: { id },
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
        ...(parsed.data.initialLeaveDays !== undefined
          ? { initialLeaveDays: parsed.data.initialLeaveDays }
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

    await createAuditLog({
      userId: auth.session.user.id,
      action: "UPDATE_USER",
      entityType: "User",
      entityId: updated.id,
      details: parsed.data as Record<string, unknown>,
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
