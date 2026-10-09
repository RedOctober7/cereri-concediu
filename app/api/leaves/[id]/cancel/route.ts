import { NextResponse } from "next/server";
import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { startOfDayUTC, todayInBucharest } from "@/lib/dates";
import { requireSession } from "@/lib/api-session";
import { createAuditLog } from "@/lib/audit/log";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const NOT_PENDING_MESSAGE = "Doar cererile în așteptare pot fi anulate.";

export async function POST(_request: Request, context: RouteContext) {
  try {
    const auth = await requireSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const today = todayInBucharest();

    const leave = await prisma.leaveRequest.findFirst({
      where: { id, userId: auth.session.user.id },
    });

    if (!leave) {
      return NextResponse.json(
        { error: "Cererea nu a fost găsită." },
        { status: 404 }
      );
    }

    if (leave.status !== LeaveStatus.PENDING_ADMIN) {
      return NextResponse.json({ error: NOT_PENDING_MESSAGE }, { status: 400 });
    }

    if (startOfDayUTC(leave.startDate) <= today) {
      return NextResponse.json(
        { error: "Nu poți anula o cerere care a început deja sau începe astăzi." },
        { status: 400 }
      );
    }

    // Condiționat de status: dacă adminul a aprobat sau a respins între timp,
    // anularea nu mai suprascrie decizia (zilele aprobate rămân scăzute corect).
    const { count } = await prisma.leaveRequest.updateMany({
      where: {
        id,
        userId: auth.session.user.id,
        status: LeaveStatus.PENDING_ADMIN,
      },
      data: { status: LeaveStatus.CANCELLED },
    });

    if (count !== 1) {
      return NextResponse.json({ error: NOT_PENDING_MESSAGE }, { status: 400 });
    }

    const updated = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id },
    });

    await createAuditLog({
      userId: auth.session.user.id,
      action: "LEAVE_CANCELLED",
      entityType: "LeaveRequest",
      entityId: leave.id,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[Leaves] Eroare anulare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
