import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { workPointUpdateSchema } from "@/lib/validators";
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
    const parsed = workPointUpdateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const existing = await prisma.workPoint.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Punctul de lucru nu a fost găsit." },
        { status: 404 }
      );
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

    await createAuditLog({
      userId: auth.session.user.id,
      action: "UPDATE_WORK_POINT",
      entityType: "WorkPoint",
      entityId: workPoint.id,
      details: parsed.data as Record<string, unknown>,
    });

    return NextResponse.json({ data: workPoint });
  } catch (error) {
    console.error("[WorkPoints] Eroare actualizare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
