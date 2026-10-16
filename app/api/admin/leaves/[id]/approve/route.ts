import { after, NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { notifyLeaveApproved } from '@/lib/emails/leave-notifications';
import { createAuditLog } from '@/lib/audit/log';
import { calculateWorkingDays } from '@/lib/holidays';
import { adjustAvailableDays } from '@/lib/leaves/balance';
import { availableDaysText, workingDaysText } from '@/lib/constraints/messages';

const NOT_PENDING_MESSAGE = 'Cererea nu mai este în așteptare.';


class NegativeBalanceError extends Error {
  constructor(
    readonly availableDays: number,
    readonly workingDays: number
  ) {
    super('NEGATIVE_BALANCE');
  }
}

/** Corpul e opțional: { allowNegativeBalance: true } confirmă aprobarea peste sold. */
async function readAllowNegativeBalance(req: NextRequest): Promise<boolean> {
  try {
    const body: unknown = await req.json();
    return (
      typeof body === 'object' &&
      body !== null &&
      (body as Record<string, unknown>).allowNegativeBalance === true
    );
  } catch {
    return false;
  }
}

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
    const allowNegativeBalance = await readAllowNegativeBalance(req);

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
      return NextResponse.json({ error: NOT_PENDING_MESSAGE }, { status: 400 });
    }

    const { updatedRequest, storedWorkingDays } = await prisma.$transaction(
      async (tx) => {
        // Ca la crearea cererii: blochează rândul angajatului până la commit, ca
        // aprobările (și cererile noi) aceluiași angajat să se serializeze.
        await tx.$queryRaw`
          SELECT id FROM "User" WHERE id = ${leaveRequest.userId} FOR UPDATE
        `;

        const current = await tx.leaveRequest.findUnique({
          where: { id },
          select: {
            status: true,
            startDate: true,
            endDate: true,
            workingDays: true,
          },
        });
        if (!current || current.status !== 'PENDING_ADMIN') {
          throw new Error('LEAVE_NOT_PENDING');
        }

        // Valoarea salvată poate fi veche (ex. 6–7 ianuarie au devenit sărbători).
        const workingDays = calculateWorkingDays(current.startDate, current.endDate);
        if (workingDays < 1) {
          throw new Error('NO_WORKING_DAYS');
        }

        const overlapping = await tx.leaveRequest.findFirst({
          where: {
            userId: leaveRequest.userId,
            id: { not: id },
            status: { in: ['APPROVED_AUTO', 'APPROVED_ADMIN'] },
            startDate: { lte: current.endDate },
            endDate: { gte: current.startDate },
          },
          select: { id: true },
        });
        if (overlapping) {
          throw new Error('OVERLAPPING_APPROVED_LEAVE');
        }

        // Soldul se citește sub lock: dacă aprobarea l-ar face negativ (ex. altă cerere
        // a fost aprobată între timp), adminul trebuie să confirme explicit.
        const employee = await tx.user.findUniqueOrThrow({
          where: { id: leaveRequest.userId },
          select: { availableDays: true },
        });
        if (workingDays > employee.availableDays + 1e-9 && !allowNegativeBalance) {
          throw new NegativeBalanceError(employee.availableDays, workingDays);
        }

        // Condiționat de status: o aprobare/respingere/anulare simultană câștigă
        // o singură dată, iar zilele nu se scad de două ori.
        const { count } = await tx.leaveRequest.updateMany({
          where: { id, status: 'PENDING_ADMIN' },
          data: {
            status: 'APPROVED_ADMIN',
            approvedById: session.user.id,
            approvedAt: new Date(),
            workingDays,
          },
        });
        if (count !== 1) {
          throw new Error('LEAVE_NOT_PENDING');
        }

        await adjustAvailableDays(tx, leaveRequest.userId, -workingDays);

        return {
          updatedRequest: await tx.leaveRequest.findUniqueOrThrow({ where: { id } }),
          storedWorkingDays: current.workingDays,
        };
      }
    );

    // PDF-ul (cu numele adminului), stocarea și emailul rulează după răspuns și
    // tolerează erorile separat: un Storage indisponibil nu mai oprește emailul.
    after(() => notifyLeaveApproved(id));

    await createAuditLog({
      userId: session.user.id,
      action: 'LEAVE_ADMIN_APPROVED',
      entityType: 'LeaveRequest',
      entityId: id,
      details: {
        workingDays: updatedRequest.workingDays,
        storedWorkingDays,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof NegativeBalanceError) {
      return NextResponse.json(
        {
          error: `Angajatul are ${availableDaysText(error.availableDays)}, iar cererea are ${workingDaysText(error.workingDays)}. Confirmă aprobarea dacă firma acordă concediu în avans.`,
          code: 'NEGATIVE_BALANCE',
        },
        { status: 409 }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'LEAVE_NOT_PENDING') {
        return NextResponse.json({ error: NOT_PENDING_MESSAGE }, { status: 400 });
      }
      if (error.message === 'NO_WORKING_DAYS') {
        return NextResponse.json(
          { error: 'Perioada cererii nu conține nicio zi lucrătoare.' },
          { status: 400 }
        );
      }
      if (error.message === 'OVERLAPPING_APPROVED_LEAVE') {
        return NextResponse.json(
          {
            error:
              'Angajatul are deja un concediu aprobat care se suprapune cu această perioadă.',
          },
          { status: 400 }
        );
      }
    }
    console.error('[Approve Leave]', error);
    return NextResponse.json(
      { error: 'A apărut o eroare. Reîncearcă.' },
      { status: 500 }
    );
  }
}