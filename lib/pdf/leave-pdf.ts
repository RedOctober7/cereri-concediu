import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  StorageNotConfiguredError,
  downloadPDF,
  pdfStoragePath,
  uploadPDF,
} from '@/lib/supabase-storage';
import { leavePdfFileName } from './content';
import { approvalFor, generateLeavePDF } from './generate';

// PDF-ul unei cereri aprobate: din Storage când există (și e generat cu șablonul
// curent), altfel generat pe loc. Stocarea e opțională: fără Supabase, sau când
// Supabase nu răspunde, PDF-ul se generează la fiecare descărcare.

const leavePdfSelect = {
  id: true,
  userId: true,
  status: true,
  pdfUrl: true,
  startDate: true,
  endDate: true,
  workingDays: true,
  createdAt: true,
  approvedAt: true,
  approvedById: true,
  user: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
      employer: true,
      availableDays: true,
      workPoint: { select: { name: true } },
    },
  },
} satisfies Prisma.LeaveRequestSelect;

export type LeaveForPdf = Prisma.LeaveRequestGetPayload<{ select: typeof leavePdfSelect }>;

export function findLeaveForPdf(id: string): Promise<LeaveForPdf | null> {
  return prisma.leaveRequest.findUnique({ where: { id }, select: leavePdfSelect });
}

export async function renderLeavePdf(leave: LeaveForPdf): Promise<Buffer> {
  return generateLeavePDF({
    request: leave,
    user: leave.user,
    approval: await approvalFor(leave),
  });
}

export function leavePdfDownloadName(leave: LeaveForPdf): string {
  return leavePdfFileName(leave.user, leave.startDate);
}

/** PDF-ul stocat, dacă e generat cu șablonul curent și Storage răspunde; altfel null. */
export async function readStoredLeavePdf(leave: LeaveForPdf): Promise<Buffer | null> {
  if (!leave.pdfUrl || leave.pdfUrl !== pdfStoragePath(leave.userId, leave.id)) {
    return null;
  }
  try {
    return await downloadPDF(leave.pdfUrl);
  } catch (error) {
    if (!(error instanceof StorageNotConfiguredError)) {
      console.error(`[PDF] Citirea PDF-ului stocat pentru ${leave.id} a eșuat:`, error);
    }
    return null;
  }
}

/** Încarcă PDF-ul și salvează calea în cerere; un eșec doar se loghează (întoarce null). */
export async function storeLeavePdf(leave: LeaveForPdf, pdf: Buffer): Promise<string | null> {
  try {
    const path = await uploadPDF(leave.userId, leave.id, pdf);
    if (path !== leave.pdfUrl) {
      await prisma.leaveRequest.update({ where: { id: leave.id }, data: { pdfUrl: path } });
    }
    return path;
  } catch (error) {
    // Lipsa configurării e semnalată o dată de lib/supabase-storage.ts.
    if (!(error instanceof StorageNotConfiguredError)) {
      console.error(`[PDF] Stocarea PDF-ului pentru ${leave.id} a eșuat:`, error);
    }
    return null;
  }
}
