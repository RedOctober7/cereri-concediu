import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyCronRequest } from '@/lib/cron-auth';

// Un angajat înseamnă câteva interogări; lăsăm timp pentru firme mai mari.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) {
    return authError;
  }

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = lastMonth.getMonth() + 1;
  const year = lastMonth.getFullYear();
  const cutoffDate = new Date(year, month - 1, 15);

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

  for (const user of dueUsers) {
    try {
      await prisma.leaveAccrual.create({
        data: {
          userId: user.id,
          month,
          year,
          days: 1.75,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { availableDays: { increment: 1.75 } },
      });

      accrued++;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        skipped++;
      } else {
        console.error(`[Accrual] Eroare user ${user.id}:`, e);
      }
    }
  }

  console.log(`[Accrual] ${month}/${year}: ${accrued} acumulări, ${skipped} sărite`);

  return NextResponse.json({ success: true, accrued, skipped, month, year });
}