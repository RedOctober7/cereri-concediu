import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
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
  });

  let accrued = 0;
  let skipped = 0;

  for (const user of users) {
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