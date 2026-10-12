import { prisma } from '@/lib/db';
import { findLeaveForPdf, renderLeavePdf, storeLeavePdf } from '@/lib/pdf/leave-pdf';
import { sendLeaveApprovedEmail, sendLeavePendingAdminEmail } from './send';

// Efectele de după crearea sau decizia unei cereri (PDF, stocare, emailuri).
// Rulează după commit și nu aruncă niciodată: cererea e deja salvată, iar un eșec
// aici doar se loghează (angajatul poate descărca PDF-ul oricând din „Cererile mele”).

/**
 * După aprobare (automată sau de admin): generează PDF-ul, îl stochează (dacă
 * Storage e configurat) și trimite angajatului emailul de aprobare cu PDF-ul atașat.
 */
export async function notifyLeaveApproved(leaveId: string): Promise<void> {
  try {
    const leave = await findLeaveForPdf(leaveId);
    if (!leave || (leave.status !== 'APPROVED_AUTO' && leave.status !== 'APPROVED_ADMIN')) {
      return;
    }

    let pdf: Buffer | null = null;
    try {
      pdf = await renderLeavePdf(leave);
    } catch (error) {
      console.error(`[Notificări] Generarea PDF-ului pentru ${leaveId} a eșuat:`, error);
    }
    if (pdf) {
      await storeLeavePdf(leave, pdf);
    }

    const result = await sendLeaveApprovedEmail({
      to: leave.user.email,
      firstName: leave.user.firstName,
      lastName: leave.user.lastName,
      startDate: leave.startDate,
      endDate: leave.endDate,
      workingDays: leave.workingDays,
      availableDaysAfter: leave.user.availableDays,
      approvedByAdmin: leave.status === 'APPROVED_ADMIN',
      pdfBuffer: pdf,
    });
    if (result.sent) {
      await prisma.leaveRequest.update({
        where: { id: leaveId },
        data: { emailSentAt: new Date() },
      });
    }
  } catch (error) {
    console.error(`[Notificări] Emailul de aprobare pentru ${leaveId} nu a fost trimis:`, error);
  }
}

/** Cererea a ajuns la PENDING_ADMIN: anunță toți administratorii activi. */
export async function notifyAdminsLeavePending(leaveId: string): Promise<void> {
  try {
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: {
        status: true,
        startDate: true,
        endDate: true,
        workingDays: true,
        violationReasons: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!leave || leave.status !== 'PENDING_ADMIN') {
      return;
    }

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', active: true, deletedAt: null },
      select: { email: true },
    });
    if (admins.length === 0) {
      console.warn(`[Notificări] Niciun administrator activ pentru cererea ${leaveId}.`);
      return;
    }

    await sendLeavePendingAdminEmail({
      adminEmails: admins.map((admin) => admin.email),
      employeeFirstName: leave.user.firstName,
      employeeLastName: leave.user.lastName,
      startDate: leave.startDate,
      endDate: leave.endDate,
      workingDays: leave.workingDays,
      violationReasons: leave.violationReasons,
    });
  } catch (error) {
    console.error(`[Notificări] Emailul către administratori pentru ${leaveId} nu a fost trimis:`, error);
  }
}
