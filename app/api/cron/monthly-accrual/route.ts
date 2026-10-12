import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyCronRequest } from '@/lib/cron-auth';
import { adjustAvailableDays } from '@/lib/leaves/balance';
import { todayInBucharest, utcDate } from '@/lib/dates';

// Un angajat înseamnă câteva interogări; lăsăm timp pentru firme mai mari.
export const maxDuration = 300;

// LeaveAccrual are @@unique([userId, month, year]): P2002 înseamnă că luna a fost deja acumulată.
function isAlreadyAccrued(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) {
    return authError;
  }

  // Luna încheiată, după calendarul din România, indiferent de fusul orar al serverului.
  const today = todayInBucharest();
  const lastMonth = utcDate(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
  const month = lastMonth.getUTCMonth() + 1;
  const year = lastMonth.getUTCFullYear();
  // hireDate este `@db.Date`: comparăm cu ziua de 15 la miezul nopții UTC.
  const cutoffDate = utcDate(year, month - 1, 15);

  const users = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      role: 'EMPLOYEE',
      hireDate: { lt: cutoffDate },
    },
    select: { id: true },
  });

  // Filtru rapid: cine are deja acumularea pe luna asta este sărit, ca o rulare repetată
  // (ex. după un timeout) să avanseze repede. Garanția rămâne constrângerea unică din bază.
  const alreadyAccrued = await prisma.leaveAccrual.findMany({
    where: { month, year },
    select: { userId: true },
  });
  const accruedIds = new Set(alreadyAccrued.map((accrual) => accrual.userId));
  const dueUsers = users.filter((user) => !accruedIds.has(user.id));

  let accrued = 0;
  let skipped = users.length - dueUsers.length;
  let failed = 0;

  for (const user of dueUsers) {
    try {
      // Rândul de acumulare și creșterea soldului se scriu împreună sau deloc.
      await prisma.$transaction([
        prisma.leaveAccrual.create({
          data: {
            userId: user.id,
            month,
            year,
            days: 1.75,
          },
          select: { id: true },
        }),
        adjustAvailableDays(prisma, user.id, 1.75),
      ]);

      accrued++;
    } catch (e) {
      if (isAlreadyAccrued(e)) {
        skipped++;
      } else {
        failed++;
        console.error(`[Accrual] Eroare user ${user.id}:`, e);
      }
    }
  }

  console.log(
    `[Accrual] ${month}/${year}: ${accrued} acumulări, ${skipped} sărite, ${failed} erori`
  );

  const summary = { accrued, skipped, failed, month, year };

  if (failed > 0) {
    return NextResponse.json(
      {
        error: `Acumularea lunară nu a reușit pentru toți angajații (erori: ${failed}).`,
        success: false,
        ...summary,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, ...summary });
}