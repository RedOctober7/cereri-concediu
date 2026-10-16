import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyCronRequest } from '@/lib/cron-auth';
import { adjustAvailableDays } from '@/lib/leaves/balance';
import { MONTHLY_ACCRUAL_DAYS, monthsToAccrue, type AccrualMonth } from '@/lib/leaves/accrual';

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

  // Luna încheiată și orice lună ratată înainte (rulare eșuată, cron oprit), după
  // calendarul din România, indiferent de fusul orar al serverului (vezi monthsToAccrue).
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { active: true, deletedAt: null, role: 'EMPLOYEE' },
    select: { id: true, hireDate: true, createdAt: true },
  });

  const existing = await prisma.leaveAccrual.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
    select: { userId: true, year: true, month: true },
  });
  const accruedByUser = new Map<string, AccrualMonth[]>();
  for (const row of existing) {
    const list = accruedByUser.get(row.userId) ?? [];
    list.push({ year: row.year, month: row.month });
    accruedByUser.set(row.userId, list);
  }

  const due = users.flatMap((user) =>
    monthsToAccrue({
      hireDate: user.hireDate,
      createdAt: user.createdAt,
      accrued: accruedByUser.get(user.id) ?? [],
      now,
    }).map((month) => ({ userId: user.id, ...month }))
  );

  let accrued = 0;
  let skipped = 0;
  let failed = 0;
  const months = new Set<string>();

  for (const { userId, year, month } of due) {
    try {
      // Rândul de acumulare și creșterea soldului se scriu împreună sau deloc. O rulare
      // concurentă se lovește de constrângerea unică și sare luna (P2002).
      await prisma.$transaction([
        prisma.leaveAccrual.create({
          data: { userId, month, year, days: MONTHLY_ACCRUAL_DAYS },
          select: { id: true },
        }),
        adjustAvailableDays(prisma, userId, MONTHLY_ACCRUAL_DAYS),
      ]);

      accrued++;
      months.add(`${month}/${year}`);
    } catch (e) {
      if (isAlreadyAccrued(e)) {
        skipped++;
      } else {
        failed++;
        console.error(`[Accrual] Eroare user ${userId}, luna ${month}/${year}:`, e);
      }
    }
  }

  const summary = {
    accrued,
    skipped,
    failed,
    upToDate: users.length - new Set(due.map((entry) => entry.userId)).size,
    months: [...months],
  };
  console.log(
    `[Accrual] ${accrued} acumulări (${summary.months.join(', ') || 'nicio lună'}), ${skipped} sărite, ${failed} erori`
  );

  if (failed > 0) {
    return NextResponse.json(
      {
        error: `Acumularea lunară nu a reușit pentru toți angajații (erori: ${failed}). Lunile rămase se recuperează la următoarea rulare.`,
        success: false,
        ...summary,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, ...summary });
}
