import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendLeaveRejectedEmail } from '@/lib/emails/send';
import { createAuditLog } from '@/lib/audit/log';
import { z } from 'zod';

const rejectSchema = z.object({
  rejectionReason: z.string().min(10, 'Motivul trebuie să aibă minim 10 caractere'),
});

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

    const body = await req.json();
    const { rejectionReason } = rejectSchema.parse(body);

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: true },
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

    await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason,
      },
    });

    await sendLeaveRejectedEmail({
      to: leaveRequest.user.email,
      firstName: leaveRequest.user.firstName,
      lastName: leaveRequest.user.lastName,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      workingDays: leaveRequest.workingDays,
      rejectionReason,
    });

    await createAuditLog({
      userId: session.user.id,
      action: 'LEAVE_REJECTED',
      entityType: 'LeaveRequest',
      entityId: id,
      details: { rejectionReason },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Reject Leave]', error);
    return NextResponse.json(
      { error: 'A apărut o eroare. Reîncearcă.' },
      { status: 500 }
    );
  }
}