import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { startOfDayUTC, todayInBucharest } from "@/lib/dates";
import { isApprovedStatus } from "@/lib/leaves/status";

export type CancelLeaveResult =
  | {
      ok: true;
      userId: string;
      previousStatus: LeaveStatus;
      /** Zilele returnate în sold (0 pentru o cerere care era încă în așteptare). */
      refundedDays: number;
      availableDaysBefore: number;
      availableDaysAfter: number;
    }
  | { ok: false; status: number; error: string };

const CHANGED_MESSAGE = "Cererea s-a schimbat între timp. Reîncarcă pagina.";

/**
 * Anulează o cerere care nu a început încă. O cerere aprobată își returnează zilele în
 * sold, în aceeași tranzacție, sub lock pe rândul angajatului (ca aprobarea și crearea).
 *
 * - `ownerId`: doar cererile acestui angajat (anularea făcută de angajat);
 * - `statuses`: ce statusuri pot fi anulate de cel care cere anularea.
 */
export async function cancelLeave(
  leaveId: string,
  options: { ownerId?: string; statuses: readonly LeaveStatus[]; notCancellableMessage: string }
): Promise<CancelLeaveResult> {
  const today = todayInBucharest();

  return prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.findFirst({
      where: { id: leaveId, ...(options.ownerId ? { userId: options.ownerId } : {}) },
      select: { id: true, userId: true, status: true, startDate: true, workingDays: true },
    });
    if (!leave) {
      return { ok: false, status: 404, error: "Cererea nu a fost găsită." };
    }
    if (!options.statuses.includes(leave.status)) {
      return { ok: false, status: 400, error: options.notCancellableMessage };
    }
    if (startOfDayUTC(leave.startDate) <= today) {
      return {
        ok: false,
        status: 400,
        error: "Concediul a început deja sau începe astăzi și nu mai poate fi anulat.",
      };
    }

    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${leave.userId} FOR UPDATE`;

    // Condiționat de status: o aprobare, respingere sau altă anulare simultană câștigă
    // o singură dată, iar zilele nu se returnează de două ori.
    const { count } = await tx.leaveRequest.updateMany({
      where: { id: leave.id, status: leave.status },
      data: { status: LeaveStatus.CANCELLED },
    });
    if (count !== 1) {
      return { ok: false, status: 409, error: CHANGED_MESSAGE };
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: leave.userId },
      select: { availableDays: true },
    });
    const refundedDays = isApprovedStatus(leave.status) ? leave.workingDays : 0;
    const availableDaysAfter = Math.round((user.availableDays + refundedDays) * 100) / 100;
    if (refundedDays > 0) {
      await tx.user.update({
        where: { id: leave.userId },
        data: { availableDays: availableDaysAfter },
        select: { id: true },
      });
    }

    return {
      ok: true,
      userId: leave.userId,
      previousStatus: leave.status,
      refundedDays,
      availableDaysBefore: user.availableDays,
      availableDaysAfter,
    };
  });
}
