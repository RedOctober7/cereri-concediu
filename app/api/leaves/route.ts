import { NextResponse, after } from "next/server";
import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api-session";
import { leaveCreateSchema } from "@/lib/validators";
import {
  OVERLAPPING_LEAVE_MESSAGE,
  hasOverlappingOwnLeave,
  validateLeaveRequest,
} from "@/lib/constraints/validate";
import { createAuditLog } from "@/lib/audit/log";
import { employeeSnapshotFrom } from "@/lib/pdf/snapshot";
import { notifyAdminsLeavePending } from "@/lib/emails/leave-notifications";

export async function GET() {
  try {
    const auth = await requireSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const leaves = await prisma.leaveRequest.findMany({
      where: { userId: auth.session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: leaves });
  } catch (error) {
    console.error("[Leaves] Eroare listare:", error);
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
    const auth = await requireSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body: unknown = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Datele trimise nu sunt valide." }, { status: 400 });
    }
    const parsed = leaveCreateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const start = parsed.data.startDate;
    const end = parsed.data.endDate;

    // Aceleași reguli ca la previzualizare (GET /api/leaves/validate). Nicio cerere nu
    // se aprobă automat: toate ajung la administrator, cu regulile încălcate ca atenționări.
    const validation = await validateLeaveRequest(
      auth.session.user.id,
      start,
      end
    );

    if (validation.blockingError) {
      return NextResponse.json(
        { error: validation.blockingError },
        { status: 400 }
      );
    }

    const leave = await prisma.$transaction(async (tx) => {
      // Blochează rândul utilizatorului până la commit: două cereri simultane ale
      // aceluiași angajat se serializează, deci verificarea de mai jos o vede pe prima.
      await tx.$queryRaw`
        SELECT id FROM "User" WHERE id = ${auth.session.user.id} FOR UPDATE
      `;
      if (await hasOverlappingOwnLeave(auth.session.user.id, start, end, tx)) {
        throw new Error("OVERLAPPING_LEAVE");
      }

      const employee = await tx.user.findUniqueOrThrow({
        where: { id: auth.session.user.id },
        select: {
          firstName: true,
          lastName: true,
          jobTitle: true,
          employer: true,
          workPoint: { select: { name: true } },
        },
      });

      return tx.leaveRequest.create({
        data: {
          userId: auth.session.user.id,
          startDate: start,
          endDate: end,
          workingDays: validation.workingDays,
          status: LeaveStatus.PENDING_ADMIN,
          violationReasons: validation.violations,
          employeeSnapshot: employeeSnapshotFrom(employee),
        },
      });
    });

    await createAuditLog({
      userId: auth.session.user.id,
      action: "LEAVE_PENDING_ADMIN",
      entityType: "LeaveRequest",
      entityId: leave.id,
      details: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        workingDays: validation.workingDays,
        violations: validation.violations,
      },
    });

    // După răspuns: PDF-ul, stocarea și emailurile nu întârzie și nu pot face să
    // eșueze cererea, care e deja salvată (funcțiile notify* nu aruncă).
    after(() => notifyAdminsLeavePending(leave.id));

    return NextResponse.json(
      {
        data: leave,
        validation,
        message: "Cerere trimisă spre aprobare administrator.",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "OVERLAPPING_LEAVE") {
        return NextResponse.json(
          { error: OVERLAPPING_LEAVE_MESSAGE },
          { status: 400 }
        );
      }
    }
    console.error("[Leaves] Eroare creare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
