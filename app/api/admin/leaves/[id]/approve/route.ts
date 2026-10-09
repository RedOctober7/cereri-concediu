import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateLeavePDF } from '@/lib/pdf/generate';
import { uploadPDF } from '@/lib/supabase-storage';
import { sendLeaveApprovedEmail } from '@/lib/emails/send';
import { createAuditLog } from '@/lib/audit/log';
import { calculateWorkingDays } from '@/lib/holidays';

const NOT_PENDING_MESSAGE = 'Cererea nu mai este în așteptare.';

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

        await tx.user.update({
          where: { id: leaveRequest.userId },
          data: {
            availableDays: {
              decrement: workingDays,
            },
          },
        });

        return {
          updatedRequest: await tx.leaveRequest.findUniqueOrThrow({ where: { id } }),
          storedWorkingDays: current.workingDays,
        };
      }
    );

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
      details: {
        workingDays: updatedRequest.workingDays,
        storedWorkingDays,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
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