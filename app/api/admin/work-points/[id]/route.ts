import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { workPointUpdateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";
import { DUPLICATE_NAME_ERROR, workPointNameTaken } from "../names";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const NOT_FOUND = { error: "Punctul de lucru nu a fost găsit." };
const SERVER_ERROR = {
  error: "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Datele trimise nu sunt valide." }, { status: 400 });
    }
    const parsed = workPointUpdateSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
      return NextResponse.json(
        { error: issue?.message ?? "Date invalide.", ...(field ? { field } : {}) },
        { status: 400 }
      );
    }

    const existing = await prisma.workPoint.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    if (
      parsed.data.name &&
      parsed.data.name.toLowerCase() !== existing.name.toLowerCase() &&
      (await workPointNameTaken(parsed.data.name, id))
    ) {
      return NextResponse.json(DUPLICATE_NAME_ERROR, { status: 409 });
    }

    const workPoint = await prisma.workPoint.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.address !== undefined
          ? { address: parsed.data.address || null }
          : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    });

    // Doar ce s-a schimbat, ca { from, to }, ca în jurnalul utilizatorilor.
    const changes: Record<string, { from: string | boolean | null; to: string | boolean | null }> =
      {};
    for (const field of ["name", "address", "active"] as const) {
      if (parsed.data[field] !== undefined && existing[field] !== workPoint[field]) {
        changes[field] = { from: existing[field], to: workPoint[field] };
      }
    }

    if (Object.keys(changes).length > 0) {
      await createAuditLog({
        userId: auth.session.user.id,
        action: "UPDATE_WORK_POINT",
        entityType: "WorkPoint",
        entityId: workPoint.id,
        details: { name: workPoint.name, changes },
      });
    }

    return NextResponse.json({ data: workPoint });
  } catch (error) {
    console.error("[WorkPoints] Eroare actualizare:", error);
    return NextResponse.json(SERVER_ERROR, { status: 500 });
  }
}

/**
 * Ștergere definitivă, doar pentru un punct de lucru fără angajați (inclusiv
 * dezactivați) și fără reguli: altfel s-ar pierde legătura din istoricul lor.
 * Pentru restul există dezactivarea.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;

    const deleted = await prisma.$transaction(async (tx) => {
      // Cheile străine sunt ON DELETE SET NULL, deci baza nu ne-ar opri: blocăm rândul
      // (o atribuire în paralel ia FOR KEY SHARE pe el și așteaptă), apoi numărăm.
      await tx.$queryRaw`SELECT "id" FROM "WorkPoint" WHERE "id" = ${id} FOR UPDATE`;
      const workPoint = await tx.workPoint.findUnique({
        where: { id },
        select: {
          name: true,
          address: true,
          _count: { select: { users: true, constraints: true } },
        },
      });
      if (!workPoint) {
        return null;
      }
      if (workPoint._count.users > 0 || workPoint._count.constraints > 0) {
        throw new Error("WORK_POINT_IN_USE");
      }
      await tx.workPoint.delete({ where: { id } });
      return workPoint;
    });

    if (!deleted) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    await createAuditLog({
      userId: auth.session.user.id,
      action: "DELETE_WORK_POINT",
      entityType: "WorkPoint",
      entityId: id,
      details: { name: deleted.name, address: deleted.address },
    });

    return NextResponse.json({ data: { id } });
  } catch (error) {
    if (error instanceof Error && error.message === "WORK_POINT_IN_USE") {
      return NextResponse.json(
        {
          error:
            "Punctul de lucru are angajați sau reguli și nu poate fi șters. Dezactivează-l în schimb.",
        },
        { status: 409 }
      );
    }
    console.error("[WorkPoints] Eroare ștergere:", error);
    return NextResponse.json(SERVER_ERROR, { status: 500 });
  }
}
