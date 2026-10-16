import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDaysUTC } from "@/lib/dates";
import { BALANCE_ADJUSTMENT_ACTION } from "@/lib/audit/actions";
import {
  YEARLY_ROLLOVER_ACTION,
  expiryDeadline,
  nextExpiringYear,
  parseAdjustmentDetails,
  parseRolloverDetails,
  projectExpiringDays,
  userEntitlements,
  type LeaveDays,
  type YearlyDays,
} from "@/lib/leaves/rollover";

export type UpcomingExpiry = {
  /** Anul ale cărui zile expiră. */
  year: number;
  /** Ultima zi în care un concediu poate începe ca să folosească aceste zile (30 iunie). */
  lastDay: Date;
  /** Zilele care ar expira, pe angajat; lipsesc angajații cu 0 zile. */
  byUser: Map<string, number>;
};

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/**
 * Zilele care vor expira la următorul termen (art. 146 alin. 2), pentru angajații dați,
 * dacă nu își mai planifică concediu până atunci. Folosit pentru avertizarea din timp a
 * angajaților și a administratorului.
 */
export async function getUpcomingExpiry(
  userIds: string[],
  now: Date = new Date()
): Promise<UpcomingExpiry> {
  const year = nextExpiringYear(now);
  const lastDay = addDaysUTC(expiryDeadline(year), -1);
  const byUser = new Map<string, number>();

  if (userIds.length === 0) {
    return { year, lastDay, byUser };
  }

  const [users, accruals, rolloverLogs, adjustmentLogs, leaves] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, availableDays: true, initialLeaveDays: true, hireDate: true, createdAt: true },
    }),
    prisma.leaveAccrual.groupBy({
      by: ["userId", "year"],
      where: { userId: { in: userIds } },
      _sum: { days: true },
    }),
    prisma.auditLog.findMany({
      where: { action: YEARLY_ROLLOVER_ACTION, entityType: "User", entityId: { in: userIds } },
      select: { entityId: true, details: true },
    }),
    prisma.auditLog.findMany({
      where: { action: BALANCE_ADJUSTMENT_ACTION, entityType: "User", entityId: { in: userIds } },
      select: { entityId: true, details: true, createdAt: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId: { in: userIds },
        status: {
          in: [LeaveStatus.PENDING_ADMIN, LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN],
        },
      },
      select: { userId: true, status: true, startDate: true, workingDays: true },
    }),
  ]);

  const accrualsByUser = new Map<string, YearlyDays[]>();
  for (const row of accruals) {
    push(accrualsByUser, row.userId, { year: row.year, days: row._sum.days ?? 0 });
  }
  const expiredByUser = new Map<string, YearlyDays[]>();
  for (const log of rolloverLogs) {
    const entry = parseRolloverDetails(log.details);
    if (log.entityId && entry) {
      push(expiredByUser, log.entityId, entry);
    }
  }
  const adjustmentsByUser = new Map<string, YearlyDays[]>();
  for (const log of adjustmentLogs) {
    const entry = parseAdjustmentDetails(log.details, log.createdAt);
    if (log.entityId && entry) {
      push(adjustmentsByUser, log.entityId, entry);
    }
  }
  const pendingByUser = new Map<string, LeaveDays[]>();
  const approvedByUser = new Map<string, LeaveDays[]>();
  for (const leave of leaves) {
    const target = leave.status === LeaveStatus.PENDING_ADMIN ? pendingByUser : approvedByUser;
    push(target, leave.userId, { startDate: leave.startDate, workingDays: leave.workingDays });
  }

  for (const user of users) {
    const days = projectExpiringDays({
      year,
      availableDays: user.availableDays,
      entitlements: userEntitlements(
        user,
        accrualsByUser.get(user.id) ?? [],
        adjustmentsByUser.get(user.id) ?? []
      ),
      alreadyExpired: expiredByUser.get(user.id) ?? [],
      pendingLeaves: pendingByUser.get(user.id) ?? [],
      approvedLeaves: approvedByUser.get(user.id) ?? [],
    });
    if (days > 0) {
      byUser.set(user.id, days);
    }
  }

  return { year, lastDay, byUser };
}
