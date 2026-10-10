import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { sendLeaveRejectedEmail } from '@/lib/emails/send';
import { createAuditLog } from '@/lib/audit/log';
import { z } from 'zod';

const rejectSchema = z.object({
  rejectionReason: z.string().min(10, 'Motivul trebuie să aibă minim 10 caractere'),
});

const NOT_PENDING_MESSAGE = 'Cererea nu mai este în așteptare.';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdminSession();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { session } = auth;

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
      return NextResponse.json({ error: NOT_PENDING_MESSAGE }, { status: 400 });
    }

    // Condiționat de status, ca să nu suprascrie o aprobare sau o anulare
    // făcută între timp (o singură instrucțiune UPDATE, deci atomică).
    const { count } = await prisma.leaveRequest.updateMany({
      where: { id, status: 'PENDING_ADMIN' },
      data: {
        status: 'REJECTED',
        rejectionReason,
      },
    });

    if (count !== 1) {
      return NextResponse.json({ error: NOT_PENDING_MESSAGE }, { status: 400 });
    }

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