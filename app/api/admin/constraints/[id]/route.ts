import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { constraintUpdateSchema } from "@/lib/validators";
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
    const parsed = constraintUpdateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const existing = await prisma.constraint.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Regula nu a fost găsită." },
        { status: 404 }
      );
    }

    const updated = await prisma.constraint.update({
      where: { id },
      data: {
        ...(parsed.data.scope ? { scope: parsed.data.scope } : {}),
        ...(parsed.data.type ? { type: parsed.data.type } : {}),
        ...(parsed.data.workPointId !== undefined
          ? { workPointId: parsed.data.workPointId || null }
          : {}),
        ...(parsed.data.config ? { config: parsed.data.config } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    });

    await createAuditLog({
      userId: auth.session.user.id,
      action: "UPDATE_CONSTRAINT",
      entityType: "Constraint",
      entityId: updated.id,
      details: parsed.data as Record<string, unknown>,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[Constraints] Eroare actualizare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
