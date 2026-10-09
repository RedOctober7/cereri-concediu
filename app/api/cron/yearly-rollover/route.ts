import { NextRequest, NextResponse } from 'next/server';
import { LeaveStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyCronRequest } from '@/lib/cron-auth';
import {
  YEARLY_ROLLOVER_ACTION,
  computeExpiringDays,
  expiryDeadline,
  latestExpiredYear,
  openingBalanceYear,
} from '@/lib/leaves/rollover';

const MIN_YEAR = 2000;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) {
    return authError;
  }

  // Pe 1 iulie Y expiră zilele născute în Y - 2 (Codul Muncii art. 146 alin. 2).
  // ?year= permite doar un an ale cărui zile au expirat deja (ex. o rulare ratată).
  const maxYear = latestExpiredYear(new Date());
  const yearParam = req.nextUrl.searchParams.get('year');
  let expiredYear = maxYear;

  if (yearParam !== null) {
    const requested = Number(yearParam);
    if (!/^\d{4}$/.test(yearParam) || requested < MIN_YEAR || requested > maxYear) {
      return NextResponse.json(
        {
          error: `Anul trebuie să fie între ${MIN_YEAR} și ${maxYear}; zilele din anii următori nu au expirat încă.`,
        },
        { status: 400 }
      );
    }
    expiredYear = requested;
  }

  const deadline = expiryDeadline(expiredYear);

  const users = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      role: 'EMPLOYEE',
    },
    select: { id: true },
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalExpired = 0;

  for (const { id } of users) {
    try {
      const expiredDays = await prisma.$transaction(async (tx) => {
        // Blocăm rândul utilizatorului: rulările concurente (retry, declanșare manuală)
        // așteaptă aici, apoi găsesc înregistrarea de audit de mai jos și sar peste.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;

        const alreadyDone = await tx.auditLog.findFirst({
          where: {
            action: YEARLY_ROLLOVER_ACTION,
            entityType: 'User',
            entityId: id,
            details: { path: ['expiredYear'], equals: expiredYear },
          },
          select: { id: true },
        });
        if (alreadyDone) {
          return null;
        }

        const user = await tx.user.findUniqueOrThrow({
          where: { id },
          select: {
            availableDays: true,
            initialLeaveDays: true,
            hireDate: true,
            createdAt: true,
          },
        });

        const accruals = await tx.leaveAccrual.findMany({
          where: { userId: id, year: { gte: expiredYear } },
          select: { year: true, days: true },
        });

        const pending = await tx.leaveRequest.aggregate({
          _sum: { workingDays: true },
          where: {
            userId: id,
            status: LeaveStatus.PENDING_ADMIN,
            startDate: { lt: deadline },
          },
        });

        const days = computeExpiringDays({
          expiringYear: expiredYear,
          availableDays: user.availableDays,
          pendingDaysBeforeDeadline: pending._sum.workingDays ?? 0,
          entitlements: [
            ...accruals,
            {
              year: openingBalanceYear(user.hireDate, user.createdAt),
              days: user.initialLeaveDays,
            },
          ],
        });

        let availableDaysAfter = user.availableDays;
        if (days > 0) {
          const updated = await tx.user.update({
            where: { id },
            data: { availableDays: { decrement: days } },
            select: { availableDays: true },
          });
          availableDaysAfter = updated.availableDays;
        }

        await tx.auditLog.create({
          data: {
            action: YEARLY_ROLLOVER_ACTION,
            entityType: 'User',
            entityId: id,
            details: {
              expiredYear,
              expiredDays: days,
              availableDaysBefore: user.availableDays,
              availableDaysAfter,
            },
          },
        });

        return days;
      });

      if (expiredDays === null) {
        skipped++;
        continue;
      }

      processed++;
      totalExpired += expiredDays;

      if (expiredDays > 0) {
        console.log(`[Rollover] User ${id}: -${expiredDays} zile expirate din ${expiredYear}`);
      }
    } catch (e) {
      failed++;
      console.error(`[Rollover] Eroare user ${id}:`, e);
    }
  }

  totalExpired = Math.round(totalExpired * 100) / 100;

  console.log(
    `[Rollover] An ${expiredYear}: ${processed} procesați, ${skipped} săriți, ${failed} erori, ${totalExpired} zile expirate`
  );

  return NextResponse.json(
    { success: failed === 0, expiredYear, processed, skipped, failed, totalExpired },
    { status: failed > 0 ? 500 : 200 }
  );
}
