import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateLeavePDF } from '@/lib/pdf/generate';
import { uploadPDF } from '@/lib/supabase-storage';
import { sendLeaveApprovedEmail } from '@/lib/emails/send';
import { createAuditLog } from '@/lib/audit/log';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: {
          include: { workPoint: true },
        },
      },
    });

    if (!leaveRequest) {
      return NextResponse.json({ error: 'Cererea nu există' }, { status: 404 });
    }

    if (leaveRequest.status !== 'PENDING_ADMIN') {
      return NextResponse.json(
        { error: 'Cererea nu este în așteptare' },
        { status: 400 }
      );
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'APPROVED_ADMIN',
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: leaveRequest.userId },
        data: {
          availableDays: {
            decrement: leaveRequest.workingDays,
          },
        },
      });

      return updated;
    });

    const pdfBuffer = await generateLeavePDF({
      request: {
        id: updatedRequest.id,
        startDate: updatedRequest.startDate,
        endDate: updatedRequest.endDate,
        workingDays: updatedRequest.workingDays,
        approvedAt: updatedRequest.approvedAt,
        createdAt: updatedRequest.createdAt,
      },
      user: {
        firstName: leaveRequest.user.firstName,
        lastName: leaveRequest.user.lastName,
        jobTitle: leaveRequest.user.jobTitle,
        employer: leaveRequest.user.employer,
        workPoint: leaveRequest.user.workPoint,
      },
    });

    const pdfPath = await uploadPDF(
      leaveRequest.userId,
      updatedRequest.id,
      pdfBuffer
    );

    await prisma.leaveRequest.update({
      where: { id },
      data: { pdfUrl: pdfPath },
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: leaveRequest.userId },
    });

    await sendLeaveApprovedEmail({
      to: leaveRequest.user.email,
      firstName: leaveRequest.user.firstName,
      lastName: leaveRequest.user.lastName,
      startDate: updatedRequest.startDate,
      endDate: updatedRequest.endDate,
      workingDays: updatedRequest.workingDays,
      availableDaysAfter: updatedUser?.availableDays || 0,
      approvedByAdmin: true,
      pdfBuffer,
      requestId: updatedRequest.id,
    });

    await createAuditLog({
      userId: session.user.id,
      action: 'LEAVE_ADMIN_APPROVED',
      entityType: 'LeaveRequest',
      entityId: id,
      details: { workingDays: leaveRequest.workingDays },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Approve Leave]', error);
    return NextResponse.json(
      { error: 'A apărut o eroare. Reîncearcă.' },
      { status: 500 }
    );
  }
}