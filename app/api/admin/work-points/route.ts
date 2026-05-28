import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { workPointCreateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";

export async function GET() {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const workPoints = await prisma.workPoint.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { users: true, constraints: true },
        },
      },
    });

    return NextResponse.json({ data: workPoints });
  } catch (error) {
    console.error("[WorkPoints] Eroare listare:", error);
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
    const parsed = workPointCreateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const workPoint = await prisma.workPoint.create({
      data: {
        name: parsed.data.name,
        address: parsed.data.address || null,
      },
    });

    await createAuditLog({
      userId: auth.session.user.id,
      action: "CREATE_WORK_POINT",
      entityType: "WorkPoint",
      entityId: workPoint.id,
      details: {
        name: workPoint.name,
      },
    });

    return NextResponse.json({ data: workPoint }, { status: 201 });
  } catch (error) {
    console.error("[WorkPoints] Eroare creare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
