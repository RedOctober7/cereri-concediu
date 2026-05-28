import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { constraintCreateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";

export async function GET() {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const constraints = await prisma.constraint.findMany({
      include: {
        workPoint: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: constraints });
  } catch (error) {
    console.error("[Constraints] Eroare listare:", error);
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
    const parsed = constraintCreateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const constraint = await prisma.constraint.create({
      data: {
        scope: parsed.data.scope,
        type: parsed.data.type,
        workPointId: parsed.data.workPointId || null,
        config: parsed.data.config,
        active: parsed.data.active ?? true,
      },
    });

    await createAuditLog({
      userId: auth.session.user.id,
      action: "CREATE_CONSTRAINT",
      entityType: "Constraint",
      entityId: constraint.id,
      details: parsed.data as Record<string, unknown>,
    });

    return NextResponse.json({ data: constraint }, { status: 201 });
  } catch (error) {
    console.error("[Constraints] Eroare creare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
