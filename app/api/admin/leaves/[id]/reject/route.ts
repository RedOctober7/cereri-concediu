import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { sendLeaveRejectedEmail } from '@/lib/emails/send';
import { createAuditLog } from '@/lib/audit/log';
import { z } from 'zod';

const rejectSchema = z.object({
  rejectionReason: z
    .string({ error: 'Motivul respingerii este obligatoriu.' })
    .trim()
    .min(10, 'Motivul trebuie să aibă minim 10 caractere.'),
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

    const body = await req.json().catch(() => null);
    const parsed = rejectSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Date invalide.' },
        { status: 400 }
      );
    }
    const { rejectionReason } = parsed.data;

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

    // Cererea e deja respinsă; un email eșuat nu trebuie să pară o respingere eșuată.
    let emailError: string | null = null;
    try {
      await sendLeaveRejectedEmail({
        to: leaveRequest.user.email,
        firstName: leaveRequest.user.firstName,
        lastName: leaveRequest.user.lastName,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        workingDays: leaveRequest.workingDays,
        rejectionReason,
      });
    } catch (error) {
      console.error('[Reject Leave] email după respingere:', error);
      emailError = 'Cererea a fost respinsă, dar emailul către angajat nu a putut fi trimis.';
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'LEAVE_REJECTED',
      entityType: 'LeaveRequest',
      entityId: id,
      details: { rejectionReason, ...(emailError ? { emailFailed: true } : {}) },
    });

    return NextResponse.json(
      emailError ? { success: true, warning: emailError } : { success: true }
    );
  } catch (error) {
    console.error('[Reject Leave]', error);
    return NextResponse.json(
      { error: 'A apărut o eroare. Reîncearcă.' },
      { status: 500 }
    );
  }
}