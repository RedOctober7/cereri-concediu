import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { constraintCreateSchema, constraintUpdateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";
import { SERVER_ERROR, checkWorkPoint, validationError } from "../shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const NOT_FOUND = { error: "Regula nu a fost găsită." };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body: unknown = await request.json();
    const patch = constraintUpdateSchema.safeParse(body);

    if (!patch.success) {
      return validationError(patch.error.issues[0]);
    }

    const existing = await prisma.constraint.findUnique({
      where: { id },
      include: { workPoint: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    // Payload-ul poate fi parțial (ex. doar { active }): validăm regula așa cum va
    // arăta după salvare, ca tipul, config-ul și punctul de lucru să rămână coerente.
    const merged = constraintCreateSchema.safeParse({
      scope: patch.data.scope ?? existing.scope,
      type: patch.data.type ?? existing.type,
      workPointId:
        patch.data.workPointId !== undefined ? patch.data.workPointId : existing.workPointId,
      config: patch.data.config !== undefined ? patch.data.config : existing.config,
      active: patch.data.active ?? existing.active,
    });
    if (!merged.success) {
      return validationError(merged.error.issues[0]);
    }
    const next = merged.data;

    let workPointName = existing.workPoint?.name ?? null;
    if (next.workPointId !== existing.workPointId) {
      workPointName = null;
      if (next.workPointId) {
        const check = await checkWorkPoint(next.workPointId);
        if ("response" in check) {
          return check.response;
        }
        workPointName = check.name;
      }
    }

    const updated = await prisma.constraint.update({
      where: { id },
      data: {
        scope: next.scope,
        type: next.type,
        workPointId: next.workPointId,
        config: next.config,
        active: next.active ?? existing.active,
      },
    });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (existing.scope !== updated.scope) {
      changes.scope = { from: existing.scope, to: updated.scope };
    }
    if (existing.type !== updated.type) {
      changes.type = { from: existing.type, to: updated.type };
    }
    if (existing.workPointId !== updated.workPointId) {
      changes.workPointId = { from: existing.workPointId, to: updated.workPointId };
    }
    if (JSON.stringify(existing.config) !== JSON.stringify(updated.config)) {
      changes.config = { from: existing.config, to: updated.config };
    }
    if (existing.active !== updated.active) {
      changes.active = { from: existing.active, to: updated.active };
    }

    if (Object.keys(changes).length > 0) {
      await createAuditLog({
        userId: auth.session.user.id,
        action: "UPDATE_CONSTRAINT",
        entityType: "Constraint",
        entityId: updated.id,
        details: {
          type: updated.type,
          scope: updated.scope,
          workPointId: updated.workPointId,
          workPointName,
          changes,
        },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[Constraints] Eroare actualizare:", error);
    return NextResponse.json(SERVER_ERROR, { status: 500 });
  }
}

/**
 * Ștergere definitivă. Cererile deja depuse își păstrează motivele (violationReasons
 * sunt texte), deci nu pierdem istoric; în jurnal rămâne o copie a regulii.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const existing = await prisma.constraint.findUnique({
      where: { id },
      include: { workPoint: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    const { count } = await prisma.constraint.deleteMany({ where: { id } });
    if (count === 0) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    await createAuditLog({
      userId: auth.session.user.id,
      action: "DELETE_CONSTRAINT",
      entityType: "Constraint",
      entityId: id,
      details: {
        type: existing.type,
        scope: existing.scope,
        workPointId: existing.workPointId,
        workPointName: existing.workPoint?.name ?? null,
        config: existing.config,
        active: existing.active,
      },
    });

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("[Constraints] Eroare ștergere:", error);
    return NextResponse.json(SERVER_ERROR, { status: 500 });
  }
}
