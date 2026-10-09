import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyCronRequest } from '@/lib/cron-auth';

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) {
    return authError;
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