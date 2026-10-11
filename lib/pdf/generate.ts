import { renderToBuffer } from '@react-pdf/renderer';
import type { LeaveStatus } from '@prisma/client';
import { createElement } from 'react';
import { prisma } from '@/lib/db';
import { CerereConcediuPDF } from './CerereConcediu';
import type { LeaveApproval } from './content';
import { registerPdfFonts } from './fonts';

export interface GeneratePDFInput {
  request: {
    id: string;
    startDate: Date;
    endDate: Date;
    workingDays: number;
    approvedAt?: Date | null;
    createdAt: Date;
  };
  user: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    employer: string;
    workPoint?: { name: string } | null;
  };
  /** Cine și când a aprobat; dacă lipsește, se citește din baza de date după request.id. */
  approval?: LeaveApproval;
}

/** Aprobarea unei cereri deja citite, cu numele administratorului care a aprobat-o. */
export async function approvalFor(leave: {
  status: LeaveStatus;
  approvedAt: Date | null;
  approvedById: string | null;
}): Promise<LeaveApproval> {
  const approvedBy =
    leave.status === 'APPROVED_ADMIN' && leave.approvedById
      ? await prisma.user.findUnique({
          where: { id: leave.approvedById },
          select: { firstName: true, lastName: true },
        })
      : null;
  return { status: leave.status, approvedAt: leave.approvedAt, approvedBy };
}

/** Starea aprobării cererii, cu numele administratorului care a aprobat-o. */
export async function loadLeaveApproval(requestId: string): Promise<LeaveApproval | null> {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { status: true, approvedAt: true, approvedById: true },
  });
  return leave ? approvalFor(leave) : null;
}

export async function generateLeavePDF(input: GeneratePDFInput): Promise<Buffer> {
  registerPdfFonts();

  const approval = input.approval ?? (await loadLeaveApproval(input.request.id));
  if (!approval) {
    throw new Error(`Cererea ${input.request.id} nu există.`);
  }

  const element = createElement(CerereConcediuPDF, {
    request: input.request,
    user: input.user,
    approval,
    appName: process.env.APP_NAME?.trim() || 'Cereri Concediu',
    generatedAt: new Date(),
  });
  // renderToBuffer cere un element <Document>; componenta îl întoarce, dar tipul
  // lui createElement nu o arată.
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  return Buffer.from(buffer);
}
