import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyCronRequest } from '@/lib/cron-auth';
import { adjustAvailableDays } from '@/lib/leaves/balance';
import { MONTHLY_ACCRUAL_DAYS, monthsToAccrue, type AccrualMonth } from '@/lib/leaves/accrual';

// Un angajat înseamnă câteva interogări; lăsăm timp pentru firme mai mari.
export const maxDuration = 300;

/** Rând UPDATE_USER în care contul a fost reactivat (changes.active: false → true). */
function wasReactivation(details: unknown): boolean {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) {
    return false;
  }
  const changes = (details as { changes?: unknown }).changes;
  if (typeof changes !== 'object' || changes === null) {
    return false;
  }
  const active = (changes as { active?: unknown }).active;
  return typeof active === 'object' && active !== null && (active as { to?: unknown }).to === true;
}

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

  const userIds = users.map((user) => user.id);
  const [existing, updateLogs] = await Promise.all([
    prisma.leaveAccrual.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, year: true, month: true },
    }),
    // Reactivările (UPDATE_USER cu active false → true): lunile de dinainte, când contul
    // era dezactivat, nu se recuperează.
    prisma.auditLog.findMany({
      where: { action: 'UPDATE_USER', entityType: 'User', entityId: { in: userIds } },
      select: { entityId: true, details: true, createdAt: true },
    }),
  ]);
  const reactivatedAtByUser = new Map<string, Date>();
  for (const log of updateLogs) {
    if (log.entityId && wasReactivation(log.details)) {
      const previous = reactivatedAtByUser.get(log.entityId);
      if (!previous || log.createdAt > previous) {
        reactivatedAtByUser.set(log.entityId, log.createdAt);
      }
    }
  }
  const accruedByUser = new Map<string, AccrualMonth[]>();
  for (const row of existing) {
    const list = accruedByUser.get(row.userId) ?? [];
    list.push({ year: row.year, month: row.month });
    accruedByUser.set(row.userId, list);
  }

  const due = users
    .map((user) => ({
      userId: user.id,
      months: monthsToAccrue({
        hireDate: user.hireDate,
        createdAt: user.createdAt,
        accrued: accruedByUser.get(user.id) ?? [],
        reactivatedAt: reactivatedAtByUser.get(user.id) ?? null,
        now,
      }),
    }))
    .filter((entry) => entry.months.length > 0);

  let accrued = 0;
  let skipped = 0;
  let failed = 0;
  const months = new Set<string>();

  for (const { userId, months: userMonths } of due) {
    try {
      // Toate lunile unui angajat și creșterea soldului se scriu împreună sau deloc, ca o
      // eroare să nu lase o lună lipsă înaintea unei luni scrise (n-ar mai fi recuperată).
      // O rulare concurentă se lovește de constrângerea unică și sare angajatul (P2002).
      await prisma.$transaction([
        ...userMonths.map(({ year, month }) =>
          prisma.leaveAccrual.create({
            data: { userId, month, year, days: MONTHLY_ACCRUAL_DAYS },
            select: { id: true },
          })
        ),
        adjustAvailableDays(prisma, userId, MONTHLY_ACCRUAL_DAYS * userMonths.length),
      ]);

      accrued += userMonths.length;
      for (const { year, month } of userMonths) {
        months.add(`${month}/${year}`);
      }
    } catch (e) {
      if (isAlreadyAccrued(e)) {
        skipped++;
      } else {
        failed++;
        console.error(`[Accrual] Eroare user ${userId}:`, e);
      }
    }
  }

  const summary = {
    accrued,
    skipped,
    failed,
    upToDate: users.length - due.length,
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
