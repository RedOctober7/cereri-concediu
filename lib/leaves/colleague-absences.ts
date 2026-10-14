import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isApprovedStatus } from "@/lib/leaves/status";

// Cine mai lipsește de la același punct de lucru în perioada unei cereri. Nu e o
// regulă și nu blochează nimic: îi arată adminului (și angajatului, la previzualizare)
// colegii aflați în concediu, ca să decidă în cunoștință de cauză. Se numără oamenii,
// nu cererile: un coleg cu două cereri în aceeași perioadă apare o singură dată.

const APPROVED_STATUSES = [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN];

export type ColleagueLeave = {
  userId: string;
  startDate: Date;
  endDate: Date;
  status: LeaveStatus;
  user: { firstName: string; lastName: string; workPointId: string | null };
};

export type ColleagueAbsence = {
  userId: string;
  firstName: string;
  lastName: string;
  /** Zilele din perioada cererii în care colegul lipsește (tăiate la perioada cererii). */
  periods: { start: Date; end: Date; pending: boolean }[];
};

export type AbsenceQuery = {
  userId: string;
  workPointId: string | null;
  start: Date;
  end: Date;
};

/**
 * Grupează pe oameni concediile colegilor care ating perioada [start, end] a cererii.
 * Ignoră cererile proprii, alte puncte de lucru și concediile care nu se suprapun.
 * Un angajat fără punct de lucru nu are colegi.
 */
export function groupColleagueAbsences(
  request: AbsenceQuery,
  leaves: ColleagueLeave[]
): ColleagueAbsence[] {
  if (!request.workPointId) return [];

  const byUser = new Map<string, ColleagueAbsence>();
  for (const leave of leaves) {
    if (leave.userId === request.userId) continue;
    if (leave.user.workPointId !== request.workPointId) continue;
    if (leave.startDate > request.end || leave.endDate < request.start) continue;

    let absence = byUser.get(leave.userId);
    if (!absence) {
      absence = {
        userId: leave.userId,
        firstName: leave.user.firstName,
        lastName: leave.user.lastName,
        periods: [],
      };
      byUser.set(leave.userId, absence);
    }
    absence.periods.push({
      start: leave.startDate > request.start ? leave.startDate : request.start,
      end: leave.endDate < request.end ? leave.endDate : request.end,
      pending: !isApprovedStatus(leave.status),
    });
  }

  return [...byUser.values()]
    .map((absence) => ({
      ...absence,
      periods: absence.periods.sort((a, b) => a.start.getTime() - b.start.getTime()),
    }))
    // Alfabetic după nume, apoi prenume, ca în restul aplicației.
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, "ro") ||
        a.firstName.localeCompare(b.firstName, "ro")
    );
}

/**
 * Concediile colegilor activi de la punctele de lucru date, care ating [start, end].
 * Cu `includePending`, și cererile încă în așteptare (doar pentru admin: angajații văd
 * în calendar doar concediile aprobate ale colegilor).
 */
export async function findColleagueLeaves({
  workPointIds,
  start,
  end,
  includePending,
}: {
  workPointIds: string[];
  start: Date;
  end: Date;
  includePending: boolean;
}): Promise<ColleagueLeave[]> {
  if (workPointIds.length === 0) return [];
  return prisma.leaveRequest.findMany({
    where: {
      status: {
        in: includePending ? [...APPROVED_STATUSES, LeaveStatus.PENDING_ADMIN] : APPROVED_STATUSES,
      },
      startDate: { lte: end },
      endDate: { gte: start },
      // Colegii dezactivați sau șterși nu mai lipsesc de la punctul de lucru.
      user: { workPointId: { in: workPointIds }, active: true, deletedAt: null },
    },
    select: {
      userId: true,
      startDate: true,
      endDate: true,
      status: true,
      user: { select: { firstName: true, lastName: true, workPointId: true } },
    },
  });
}

/** Forma trimisă către interfață: perioadele sunt deja formatate („3–5 nov 2026”). */
export type ColleagueAbsenceView = {
  name: string;
  periods: { label: string; pending: boolean }[];
};

/**
 * `nameOrder`: „Prenume Nume” (implicit, ca în paginile de admin) sau „Nume Prenume”
 * (ca în calendarul angajatului, afișat lângă previzualizare).
 */
export function toAbsenceViews(
  absences: ColleagueAbsence[],
  formatPeriod: (start: Date, end: Date) => string,
  nameOrder: "firstLast" | "lastFirst" = "firstLast"
): ColleagueAbsenceView[] {
  return absences.map((absence) => ({
    name:
      nameOrder === "lastFirst"
        ? `${absence.lastName} ${absence.firstName}`
        : `${absence.firstName} ${absence.lastName}`,
    periods: absence.periods.map((period) => ({
      label: formatPeriod(period.start, period.end),
      pending: period.pending,
    })),
  }));
}

/** Colegii care lipsesc în perioada unei singure cereri (previzualizarea angajatului). */
export async function findColleagueAbsences(
  request: AbsenceQuery,
  { includePending }: { includePending: boolean }
): Promise<ColleagueAbsence[]> {
  if (!request.workPointId) return [];
  const leaves = await findColleagueLeaves({
    workPointIds: [request.workPointId],
    start: request.start,
    end: request.end,
    includePending,
  });
  return groupColleagueAbsences(request, leaves);
}
