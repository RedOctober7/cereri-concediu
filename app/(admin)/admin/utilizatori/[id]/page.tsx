import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { LeaveStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toDateOnlyString, todayInBucharest, utcDate } from "@/lib/dates";
import { BALANCE_ADJUSTMENT_ACTION } from "@/lib/audit/actions";
import {
  UserDetailClient,
  type BalanceAdjustmentRow,
  type UserDetail,
} from "@/components/admin/UserDetailClient";

const LEAVE_HISTORY_LIMIT = 100;
const ADJUSTMENTS_LIMIT = 5;

function readAdjustment(details: unknown): { delta: number; reason: string; after: number } | null {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return null;
  }
  const { delta, reason, after } = details as Record<string, unknown>;
  if (typeof delta !== "number" || typeof reason !== "string" || typeof after !== "number") {
    return null;
  }
  return { delta, reason, after };
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      username: true,
      jobTitle: true,
      employer: true,
      role: true,
      active: true,
      mustChangePassword: true,
      availableDays: true,
      initialLeaveDays: true,
      hireDate: true,
      workPointId: true,
      updatedAt: true,
      workPoint: { select: { id: true, name: true } },
    },
  });

  // Pagina administrează conturile de angajat (aceleași ca în listă).
  if (!user || user.role !== "EMPLOYEE") {
    notFound();
  }

  const year = todayInBucharest().getUTCFullYear();

  const [
    workPoints,
    leaves,
    leaveCount,
    takenThisYear,
    pending,
    accruals,
    adjustmentLogs,
    otherUsers,
  ] = await Promise.all([
      prisma.workPoint.findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: { id: true, name: true, active: true },
      }),
      prisma.leaveRequest.findMany({
        where: { userId: id },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: LEAVE_HISTORY_LIMIT,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          workingDays: true,
          status: true,
          rejectionReason: true,
          createdAt: true,
        },
      }),
      prisma.leaveRequest.count({ where: { userId: id } }),
      // Concediul aprobat care începe anul acesta (an calendaristic, ora României).
      prisma.leaveRequest.aggregate({
        where: {
          userId: id,
          status: { in: [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN] },
          startDate: { gte: utcDate(year, 0, 1), lt: utcDate(year + 1, 0, 1) },
        },
        _sum: { workingDays: true },
      }),
      prisma.leaveRequest.aggregate({
        where: { userId: id, status: LeaveStatus.PENDING_ADMIN },
        _sum: { workingDays: true },
        _count: { _all: true },
      }),
      prisma.leaveAccrual.findMany({
        where: { userId: id },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { id: true, month: true, year: true, days: true, createdAt: true },
      }),
      prisma.auditLog.findMany({
        where: { action: BALANCE_ADJUSTMENT_ACTION, entityType: "User", entityId: id },
        orderBy: { createdAt: "desc" },
        take: ADJUSTMENTS_LIMIT,
        select: {
          id: true,
          details: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        select: { jobTitle: true },
        distinct: ["jobTitle"],
      }),
    ]);

  const adjustments: BalanceAdjustmentRow[] = adjustmentLogs.flatMap((log) => {
    const details = readAdjustment(log.details);
    return details
      ? [
          {
            id: log.id,
            ...details,
            createdAt: log.createdAt.toISOString(),
            actorName: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
          },
        ]
      : [];
  });

  const detail: UserDetail = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    username: user.username,
    jobTitle: user.jobTitle,
    employer: user.employer,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    availableDays: user.availableDays,
    initialLeaveDays: user.initialLeaveDays,
    hireDate: toDateOnlyString(user.hireDate),
    workPointId: user.workPointId,
    workPointName: user.workPoint?.name ?? null,
    version: user.updatedAt.toISOString(),
  };

  const collator = new Intl.Collator("ro", { sensitivity: "base" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <UserDetailClient
        user={detail}
        isSelf={session.user.id === user.id}
        workPoints={workPoints}
        jobTitles={otherUsers.map((row) => row.jobTitle).sort(collator.compare)}
        stats={{
          year,
          takenThisYear: takenThisYear._sum.workingDays ?? 0,
          pendingCount: pending._count._all,
          pendingDays: pending._sum.workingDays ?? 0,
        }}
        leaves={leaves.map((leave) => ({
          id: leave.id,
          startDate: toDateOnlyString(leave.startDate),
          endDate: toDateOnlyString(leave.endDate),
          workingDays: leave.workingDays,
          status: leave.status,
          rejectionReason: leave.rejectionReason,
          createdAt: leave.createdAt.toISOString(),
        }))}
        leaveTotal={leaveCount}
        accruals={accruals.map((accrual) => ({
          id: accrual.id,
          month: accrual.month,
          year: accrual.year,
          days: accrual.days,
          createdAt: accrual.createdAt.toISOString(),
        }))}
        adjustments={adjustments}
      />
    </div>
  );
}
