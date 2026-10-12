import { NextResponse } from "next/server";
import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api-session";
import { createAuditLog } from "@/lib/audit/log";
import { cancelLeave } from "@/lib/leaves/cancel";

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

    // Angajatul își poate anula cererile în așteptare și concediile aprobate care nu au
    // început; la un concediu aprobat zilele se întorc în sold.
    const result = await cancelLeave(id, {
      ownerId: auth.session.user.id,
      statuses: [LeaveStatus.PENDING_ADMIN, LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN],
      notCancellableMessage: "Doar cererile în așteptare sau aprobate pot fi anulate.",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await createAuditLog({
      userId: auth.session.user.id,
      action: "LEAVE_CANCELLED",
      entityType: "LeaveRequest",
      entityId: id,
      details: {
        previousStatus: result.previousStatus,
        refundedDays: result.refundedDays,
      },
    });

    const updated = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
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
