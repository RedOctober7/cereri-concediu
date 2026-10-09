import {
  ConstraintScope,
  ConstraintType,
  LeaveStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { startOfDayUTC, todayInBucharest } from "@/lib/dates";
import {
  calculateWorkingDays,
  intervalIntersectsMonth,
} from "@/lib/holidays";
import { addWorkingDays } from "@/lib/working-days";
import type { ValidationResult } from "@/lib/constraints/types";

const MONTH_NAMES = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
];

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Luna ${month}`;
}

export const OVERLAPPING_LEAVE_MESSAGE =
  "Ai deja o cerere de concediu care se suprapune cu această perioadă.";

const ACTIVE_LEAVE_STATUSES = [
  LeaveStatus.PENDING_ADMIN,
  LeaveStatus.APPROVED_AUTO,
  LeaveStatus.APPROVED_ADMIN,
];

/** Ce folosește hasOverlappingOwnLeave: merge atât cu prisma, cât și cu tx din $transaction. */
type LeaveFinder = {
  leaveRequest: {
    findFirst(args: Prisma.LeaveRequestFindFirstArgs): PromiseLike<unknown>;
  };
};

/** Există o cerere proprie activă (în așteptare sau aprobată) care se suprapune? */
export async function hasOverlappingOwnLeave(
  userId: string,
  startDate: Date,
  endDate: Date,
  db: LeaveFinder = prisma
): Promise<boolean> {
  const existing = await db.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: ACTIVE_LEAVE_STATUSES },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });
  return existing !== null;
}

async function getActiveConstraints(workPointId: string | null) {
  return prisma.constraint.findMany({
    where: {
      active: true,
      OR: [{ scope: ConstraintScope.GLOBAL }, { workPointId }],
    },
  });
}

async function countOverlappingApprovedLeaves(
  workPointId: string,
  startDate: Date,
  endDate: Date,
  excludeUserId: string
) {
  return prisma.leaveRequest.count({
    where: {
      user: { workPointId, active: true, deletedAt: null },
      userId: { not: excludeUserId },
      status: { in: [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
}

async function countActiveUsersAtWorkPoint(workPointId: string) {
  return prisma.user.count({
    where: {
      workPointId,
      active: true,
      deletedAt: null,
      role: "EMPLOYEE",
    },
  });
}

export async function validateLeaveRequest(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<ValidationResult> {
  const violations: string[] = [];
  const start = startOfDayUTC(startDate);
  const end = startOfDayUTC(endDate);
  const workingDays = calculateWorkingDays(start, end);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { workPoint: true },
  });

  if (!user || !user.active || user.deletedAt) {
    return {
      needsAdminApproval: true,
      violations: ["Contul utilizatorului nu este valid."],
      workingDays,
      blockingError: null,
    };
  }

  if (await hasOverlappingOwnLeave(userId, start, end)) {
    return {
      needsAdminApproval: true,
      violations: [],
      workingDays,
      blockingError: OVERLAPPING_LEAVE_MESSAGE,
    };
  }

  if (workingDays > user.availableDays) {
    violations.push(
      `Cererea depășește zilele disponibile (${user.availableDays} disponibile, ${workingDays} solicitate)`
    );
  }

  const constraints = await getActiveConstraints(user.workPointId);

  for (const constraint of constraints) {
    const config = constraint.config as Record<string, number>;

    switch (constraint.type) {
      case ConstraintType.MIN_NOTICE_DAYS: {
        const minDate = addWorkingDays(todayInBucharest(), config.days);
        if (start < minDate) {
          violations.push(
            `Preaviz minim ${config.days} zile lucrătoare (cererea trebuia depusă cu cel puțin ${config.days} zile înainte)`
          );
        }
        break;
      }
      case ConstraintType.MAX_CONSECUTIVE_DAYS: {
        if (workingDays > config.days) {
          violations.push(
            `Maxim ${config.days} zile consecutive permise (solicitate: ${workingDays})`
          );
        }
        break;
      }
      case ConstraintType.BLACKOUT_MONTH: {
        if (intervalIntersectsMonth(start, end, config.month)) {
          violations.push(
            `Luna ${monthName(config.month)} este perioadă restricționată`
          );
        }
        break;
      }
      case ConstraintType.MAX_CONCURRENT_PERCENT: {
        if (user.workPointId) {
          const overlapping = await countOverlappingApprovedLeaves(
            user.workPointId,
            start,
            end,
            userId
          );
          const totalAtWorkPoint = await countActiveUsersAtWorkPoint(
            user.workPointId
          );
          if (totalAtWorkPoint > 0) {
            const projectedPercent =
              ((overlapping + 1) / totalAtWorkPoint) * 100;
            if (projectedPercent > config.percent) {
              violations.push(
                `Maxim ${config.percent}% din echipă poate fi simultan în concediu (s-ar depăși: ${projectedPercent.toFixed(1)}%)`
              );
            }
          }
        }
        break;
      }
      case ConstraintType.MIN_ONE_VACATION_OF_N_DAYS:
        break;
      default:
        break;
    }
  }

  return {
    needsAdminApproval: violations.length > 0,
    violations,
    workingDays,
    blockingError: null,
  };
}
