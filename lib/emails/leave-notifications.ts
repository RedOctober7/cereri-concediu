import { prisma } from '@/lib/db';
import { findLeaveForPdf, renderLeavePdf, storeLeavePdf } from '@/lib/pdf/leave-pdf';
import { sendLeaveApprovedEmail } from './send';

// Efectele de după o decizie pe cerere (PDF, stocare, emailuri). Rulează după
// commit și nu aruncă niciodată: cererea e deja salvată, iar un eșec aici doar se
// loghează (angajatul poate descărca PDF-ul oricând din „Cererile mele”).

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
