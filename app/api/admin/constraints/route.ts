import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { constraintCreateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";
import { SERVER_ERROR, checkWorkPoint, validationError } from "./shared";

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
    return NextResponse.json(SERVER_ERROR, { status: 500 });
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
      return validationError(parsed.error.issues[0]);
    }

    let workPointName: string | null = null;
    if (parsed.data.workPointId) {
      const check = await checkWorkPoint(parsed.data.workPointId);
      if ("response" in check) {
        return check.response;
      }
      workPointName = check.name;
    }

    const constraint = await prisma.constraint.create({
      data: {
        scope: parsed.data.scope,
        type: parsed.data.type,
        workPointId: parsed.data.workPointId,
        config: parsed.data.config,
        active: parsed.data.active ?? true,
      },
    });

    await createAuditLog({
      userId: auth.session.user.id,
      action: "CREATE_CONSTRAINT",
      entityType: "Constraint",
      entityId: constraint.id,
      details: {
        type: constraint.type,
        scope: constraint.scope,
        workPointId: constraint.workPointId,
        workPointName,
        config: parsed.data.config,
        active: constraint.active,
      },
    });

    return NextResponse.json({ data: constraint }, { status: 201 });
  } catch (error) {
    console.error("[Constraints] Eroare creare:", error);
    return NextResponse.json(SERVER_ERROR, { status: 500 });
  }
}
