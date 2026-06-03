import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  // Vercel trimite Authorization: Bearer {secret}
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');
  
  const validVercel = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const validManual = cronSecret === process.env.CRON_SECRET;
  
  if (!validVercel && !validManual) {
    return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
  }

  const now = new Date();
  const lastYear = now.getFullYear() - 1;

  const users = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      role: 'EMPLOYEE',
    },
    include: {
      leaveRequests: {
        where: {
          status: { in: ['APPROVED_AUTO', 'APPROVED_ADMIN'] },
          startDate: {
            gte: new Date(lastYear, 0, 1),
            lt: new Date(lastYear + 1, 0, 1),
          },
        },
      },
      accruals: {
        where: { year: lastYear },
      },
    },
  });

  let processed = 0;

  for (const user of users) {
    const totalAccrued = user.accruals.reduce((sum, a) => sum + a.days, 0);
    const totalUsed = user.leaveRequests.reduce((sum, r) => sum + r.workingDays, 0);
    const unused = Math.max(0, totalAccrued - totalUsed);

    if (unused > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { availableDays: { decrement: unused } },
      });

      console.log(`[Rollover] User ${user.id}: -${unused} zile expirate din ${lastYear}`);
    }

    processed++;
  }

  console.log(`[Rollover] Procesat ${processed} useri, an ${lastYear}`);

  return NextResponse.json({ success: true, processed, year: lastYear });
}