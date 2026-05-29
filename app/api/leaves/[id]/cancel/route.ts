import { NextResponse } from "next/server";
import { LeaveStatus } from "@prisma/client";
import { startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api-session";
import { createAuditLog } from "@/lib/audit/log";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const auth = await requireSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const today = startOfDay(toZonedTime(new Date(), "Europe/Bucharest"));

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
      return NextResponse.json(
        { error: "Doar cererile în așteptare pot fi anulate." },
        { status: 400 }
      );
    }

    if (startOfDay(leave.startDate) <= today) {
      return NextResponse.json(
        { error: "Nu poți anula o cerere care a început deja sau începe astăzi." },
        { status: 400 }
      );
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveStatus.CANCELLED },
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
