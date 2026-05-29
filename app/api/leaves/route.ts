import { NextResponse } from "next/server";
import { LeaveStatus } from "@prisma/client";
import { addYears, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api-session";
import { leaveCreateSchema } from "@/lib/validators";
import { validateLeaveRequest } from "@/lib/constraints/validate";
import { calculateWorkingDays } from "@/lib/holidays";
import { createAuditLog } from "@/lib/audit/log";

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

    const body: unknown = await request.json();
    const parsed = leaveCreateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const start = startOfDay(parsed.data.startDate);
    const end = startOfDay(parsed.data.endDate);
    const today = startOfDay(toZonedTime(new Date(), "Europe/Bucharest"));
    const maxDate = addYears(today, 1);

    if (start > end) {
      return NextResponse.json(
        { error: "Data de început trebuie să fie înainte de data de sfârșit." },
        { status: 400 }
      );
    }

    if (start < today) {
      return NextResponse.json(
        { error: "Perioada selectată trebuie să fie în viitor." },
        { status: 400 }
      );
    }

    if (end > maxDate) {
      return NextResponse.json(
        { error: "Perioada nu poate depăși un an de la data curentă." },
        { status: 400 }
      );
    }

    const workingDays = calculateWorkingDays(start, end);
    if (workingDays < 1) {
      return NextResponse.json(
        { error: "Selectează cel puțin o zi lucrătoare." },
        { status: 400 }
      );
    }

    const validation = await validateLeaveRequest(
      auth.session.user.id,
      start,
      end
    );

    const leave = await prisma.$transaction(async (tx) => {
      if (!validation.needsAdminApproval) {
        const user = await tx.user.findUnique({
          where: { id: auth.session.user.id },
        });
        if (!user) {
          throw new Error("USER_NOT_FOUND");
        }
        if (validation.workingDays > user.availableDays) {
          throw new Error("INSUFFICIENT_DAYS");
        }

        const created = await tx.leaveRequest.create({
          data: {
            userId: auth.session.user.id,
            startDate: start,
            endDate: end,
            workingDays: validation.workingDays,
            status: LeaveStatus.APPROVED_AUTO,
            violationReasons: [],
            approvedAt: new Date(),
          },
        });

        await tx.user.update({
          where: { id: auth.session.user.id },
          data: {
            availableDays: { decrement: validation.workingDays },
          },
        });

        return created;
      }

      return tx.leaveRequest.create({
        data: {
          userId: auth.session.user.id,
          startDate: start,
          endDate: end,
          workingDays: validation.workingDays,
          status: LeaveStatus.PENDING_ADMIN,
          violationReasons: validation.violations,
        },
      });
    });

    await createAuditLog({
      userId: auth.session.user.id,
      action: validation.needsAdminApproval
        ? "LEAVE_PENDING_ADMIN"
        : "LEAVE_AUTO_APPROVED",
      entityType: "LeaveRequest",
      entityId: leave.id,
      details: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        workingDays: validation.workingDays,
        violations: validation.violations,
      },
    });

    return NextResponse.json(
      {
        data: leave,
        validation,
        message: validation.needsAdminApproval
          ? "Cerere trimisă spre aprobare administrator."
          : "Cerere aprobată automat.",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INSUFFICIENT_DAYS") {
        return NextResponse.json(
          { error: "Nu ai suficiente zile disponibile." },
          { status: 400 }
        );
      }
      if (error.message === "USER_NOT_FOUND") {
        return NextResponse.json(
          { error: "Contul nu a fost găsit." },
          { status: 404 }
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
