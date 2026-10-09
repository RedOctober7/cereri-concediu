import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import {
  constraintConfigError,
  constraintUpdateSchema,
} from "@/lib/validators";
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

    if (parsed.data.type !== undefined || parsed.data.config !== undefined) {
      // Payload-ul poate avea doar tipul sau doar config-ul: validăm perechea
      // care va fi salvată, completată cu valorile existente ale regulii.
      const configError = constraintConfigError(
        parsed.data.type ?? existing.type,
        parsed.data.config ?? existing.config
      );
      if (configError) {
        return NextResponse.json({ error: configError }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.scope) updateData.scope = parsed.data.scope;
    if (parsed.data.type) updateData.type = parsed.data.type;
    if (parsed.data.workPointId !== undefined) {
      updateData.workPointId = parsed.data.workPointId ?? null;
    }
    if (parsed.data.config) updateData.config = parsed.data.config;
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active;

    const updated = await prisma.constraint.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: updateData as any,
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