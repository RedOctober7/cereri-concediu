import {
  ConstraintScope,
  ConstraintType,
  LeaveStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  addDaysUTC,
  addYearsUTC,
  startOfDayUTC,
  todayInBucharest,
  utcDate,
} from "@/lib/dates";
import {
  calculateWorkingDays,
  intervalIntersectsMonth,
} from "@/lib/holidays";
import { addWorkingDays } from "@/lib/working-days";
import { monthName, type ValidationResult } from "@/lib/constraints/types";
import { parseConstraintConfig } from "@/lib/validators";

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

type LeaveInterval = { startDate: Date; endDate: Date; workingDays: number };

const daysFormatter = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 });

/** „1 zi lucrătoare”, „5 zile lucrătoare”, „20 de zile lucrătoare”. */
function workingDaysText(count: number): string {
  if (count === 1) return "1 zi lucrătoare";
  const lastTwo = count % 100;
  return `${count} ${lastTwo === 0 || lastTwo >= 20 ? "de " : ""}zile lucrătoare`;
}

/**
 * Intervale de concediu lipite: între două cereri nu există nicio zi lucrătoare (ex.
 * luni–vineri și luni–vineri din săptămâna următoare) formează un singur concediu
 * neîntrerupt. Zilele lucrătoare ale blocului sunt suma celor din cereri (cererile
 * active nu se suprapun, vezi hasOverlappingOwnLeave).
 */
export function mergeAdjacentLeaves(leaves: LeaveInterval[]): LeaveInterval[] {
  const sorted = [...leaves].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const blocks: LeaveInterval[] = [];
  for (const leave of sorted) {
    const last = blocks.at(-1);
    if (
      last &&
      (leave.startDate <= addDaysUTC(last.endDate, 1) ||
        calculateWorkingDays(addDaysUTC(last.endDate, 1), addDaysUTC(leave.startDate, -1)) === 0)
    ) {
      last.endDate = leave.endDate > last.endDate ? leave.endDate : last.endDate;
      last.workingDays += leave.workingDays;
    } else {
      blocks.push({ ...leave });
    }
  }
  return blocks;
}

/**
 * MIN_ONE_VACATION_OF_N_DAYS (Codul muncii, art. 148: cel puțin 10 zile lucrătoare de
 * concediu neîntrerupt pe an). Nu blochează: adminul primește o atenționare când
 *  - în anul cererii (anul primei zile) angajatul nu are încă un concediu neîntrerupt
 *    de cel puțin `minDays` zile lucrătoare, aprobat sau în așteptare (cererea curentă
 *    și cererile lipite de ea contează: dacă împreună ajung la `minDays`, e în regulă);
 *  - și tocmai această cerere îi coboară soldul sub `minDays`: înainte de ea soldul
 *    (minus cererile în așteptare, încă nescăzute) acoperea un astfel de concediu,
 *    după ea nu. Dacă soldul era deja prea mic, cererea nu schimbă nimic și trece.
 * Un concediu care trece peste Revelion contează pentru ambii ani.
 */
async function uninterruptedVacationViolation({
  userId,
  start,
  end,
  workingDays,
  availableDays,
  minDays,
}: {
  userId: string;
  start: Date;
  end: Date;
  workingDays: number;
  availableDays: number;
  minDays: number;
}): Promise<string | null> {
  if (workingDays >= minDays) {
    return null;
  }

  const year = start.getUTCFullYear();
  const yearStart = utcDate(year, 0, 1);
  const yearEnd = utcDate(year, 11, 31);

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: ACTIVE_LEAVE_STATUSES },
      OR: [
        { status: LeaveStatus.PENDING_ADMIN },
        // Cu o lună de margine, ca un concediu lipit peste Revelion să fie întreg.
        {
          startDate: { lte: addDaysUTC(yearEnd, 31) },
          endDate: { gte: addDaysUTC(yearStart, -31) },
        },
      ],
    },
    select: { startDate: true, endDate: true, workingDays: true, status: true },
  });

  const blocks = mergeAdjacentLeaves([
    ...leaves.map(({ startDate, endDate, workingDays: days }) => ({
      startDate,
      endDate,
      workingDays: days,
    })),
    { startDate: start, endDate: end, workingDays },
  ]);
  const hasLongVacation = blocks.some(
    (block) =>
      block.workingDays >= minDays && block.startDate <= yearEnd && block.endDate >= yearStart
  );
  if (hasLongVacation) {
    return null;
  }

  const pendingDays = leaves
    .filter((leave) => leave.status === LeaveStatus.PENDING_ADMIN)
    .reduce((sum, leave) => sum + leave.workingDays, 0);
  const before = Math.round((availableDays - pendingDays) * 100) / 100;
  const after = Math.round((before - workingDays) * 100) / 100;
  if (before < minDays || after >= minDays) {
    return null;
  }

  return `În ${year} nu există încă un concediu neîntrerupt de cel puțin ${workingDaysText(minDays)}, iar după această cerere ar rămâne ${daysFormatter.format(after)} zile disponibile (Codul muncii, art. 148)`;
}

function blocked(blockingError: string, workingDays: number): ValidationResult {
  return {
    violations: [],
    workingDays,
    blockingError,
  };
}

/**
 * Folosită atât de previzualizare (GET /api/leaves/validate), cât și la creare
 * (POST /api/leaves), ca ambele să aplice aceleași reguli.
 */
export async function validateLeaveRequest(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<ValidationResult> {
  const violations: string[] = [];
  const start = startOfDayUTC(startDate);
  const end = startOfDayUTC(endDate);
  const workingDays = calculateWorkingDays(start, end);
  const today = todayInBucharest();

  if (start < today) {
    return blocked("Perioada selectată trebuie să fie în viitor.", workingDays);
  }

  if (end > addYearsUTC(today, 1)) {
    return blocked(
      "Perioada nu poate depăși un an de la data curentă.",
      workingDays
    );
  }

  if (workingDays < 1) {
    return blocked("Selectează cel puțin o zi lucrătoare.", workingDays);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { workPoint: true },
  });

  if (!user || !user.active || user.deletedAt) {
    return blocked("Contul utilizatorului nu este valid.", workingDays);
  }

  if (await hasOverlappingOwnLeave(userId, start, end)) {
    return blocked(OVERLAPPING_LEAVE_MESSAGE, workingDays);
  }

  // Zilele cererilor în așteptare nu sunt încă scăzute din sold, dar sunt deja cerute:
  // altfel două cereri care împreună depășesc soldul ar trece fiecare de verificare.
  const pending = await prisma.leaveRequest.aggregate({
    where: { userId, status: LeaveStatus.PENDING_ADMIN },
    _sum: { workingDays: true },
  });
  const pendingDays = pending._sum.workingDays ?? 0;
  const freeDays = Math.round((user.availableDays - pendingDays) * 100) / 100;
  if (workingDays > freeDays) {
    violations.push(
      pendingDays > 0
        ? `Cererea depășește zilele disponibile (${daysFormatter.format(freeDays)} disponibile după cererile în așteptare, ${workingDays} solicitate)`
        : `Cererea depășește zilele disponibile (${daysFormatter.format(freeDays)} disponibile, ${workingDays} solicitate)`
    );
  }

  const constraints = await getActiveConstraints(user.workPointId);

  for (const constraint of constraints) {
    // Config-ul vine din JSON: un rând invalid (date vechi) e ignorat, nu aplicat greșit.
    const parsedConfig = parseConstraintConfig(constraint.type, constraint.config);
    if (!parsedConfig.success) {
      console.warn(
        `[Constraints] Regula ${constraint.id} (${constraint.type}) are config invalid și a fost ignorată.`
      );
      continue;
    }
    const config = parsedConfig.data as Record<string, number>;

    switch (constraint.type) {
      case ConstraintType.MIN_NOTICE_DAYS: {
        const minDate = addWorkingDays(today, config.days);
        if (start < minDate) {
          violations.push(
            `Preaviz minim ${workingDaysText(config.days)} (cererea trebuia depusă cu cel puțin ${workingDaysText(config.days)} înainte)`
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
      case ConstraintType.MIN_ONE_VACATION_OF_N_DAYS: {
        const violation = await uninterruptedVacationViolation({
          userId,
          start,
          end,
          workingDays,
          availableDays: user.availableDays,
          minDays: config.days,
        });
        if (violation) {
          violations.push(violation);
        }
        break;
      }
      default:
        break;
    }
  }

  // O regulă globală și una pe punct de lucru cu aceeași valoare dau același mesaj.
  const uniqueViolations = [...new Set(violations)];

  return {
    violations: uniqueViolations,
    workingDays,
    blockingError: null,
  };
}
