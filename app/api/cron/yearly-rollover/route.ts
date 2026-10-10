import { NextRequest, NextResponse } from 'next/server';
import { LeaveStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyCronRequest } from '@/lib/cron-auth';
import {
  YEARLY_ROLLOVER_ACTION,
  expiryDeadline,
  latestExpiredYear,
  openingBalanceYear,
  parseRolloverDetails,
  planRollover,
  type YearlyDays,
} from '@/lib/leaves/rollover';

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) {
    return authError;
  }

  // Pe 1 iulie Y expiră zilele născute în Y - 2 (Codul Muncii art. 146 alin. 2).
  // Fiecare rulare expiră, în ordine, și anii rămași neprocesați (rulare ratată sau eșuată).
  const latestExpired = latestExpiredYear(new Date());

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
      const steps = await prisma.$transaction(async (tx) => {
        // Blocăm rândul utilizatorului: rulările concurente (retry, declanșare manuală)
        // așteaptă aici, apoi găsesc înregistrările de audit scrise de prima și nu mai au ce face.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;

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
          where: { userId: id },
          select: { year: true, days: true },
        });

        const rolloverLogs = await tx.auditLog.findMany({
          where: {
            action: YEARLY_ROLLOVER_ACTION,
            entityType: 'User',
            entityId: id,
          },
          select: { details: true },
        });

        const pendingLeaves = await tx.leaveRequest.findMany({
          where: {
            userId: id,
            status: LeaveStatus.PENDING_ADMIN,
            startDate: { lt: expiryDeadline(latestExpired) },
          },
          select: { startDate: true, workingDays: true },
        });

        const planned = planRollover({
          latestExpired,
          availableDays: user.availableDays,
          entitlements: [
            ...accruals,
            {
              year: openingBalanceYear(user.hireDate, user.createdAt),
              days: user.initialLeaveDays,
            },
          ],
          alreadyExpired: rolloverLogs
            .map((log) => parseRolloverDetails(log.details))
            .filter((entry): entry is YearlyDays => entry !== null),
          pendingLeaves,
        });

        // Un rând de audit pe an expirat, în aceeași tranzacție cu scăderea din sold.
        for (const step of planned) {
          if (step.expiredDays > 0) {
            await tx.user.update({
              where: { id },
              data: { availableDays: { decrement: step.expiredDays } },
              select: { id: true },
            });
          }

          await tx.auditLog.create({
            data: {
              action: YEARLY_ROLLOVER_ACTION,
              entityType: 'User',
              entityId: id,
              details: { ...step },
            },
          });
        }

        return planned;
      });

      if (steps.length === 0) {
        skipped++;
        continue;
      }

      processed++;

      for (const step of steps) {
        totalExpired += step.expiredDays;

        if (step.expiredDays > 0) {
          console.log(
            `[Rollover] User ${id}: -${step.expiredDays} zile expirate din ${step.expiredYear}`
          );
        }
      }
    } catch (e) {
      failed++;
      console.error(`[Rollover] Eroare user ${id}:`, e);
    }
  }

  totalExpired = Math.round(totalExpired * 100) / 100;

  console.log(
    `[Rollover] Până la anul ${latestExpired}: ${processed} procesați, ${skipped} săriți, ${failed} erori, ${totalExpired} zile expirate`
  );

  const summary = {
    expiredThroughYear: latestExpired,
    processed,
    skipped,
    failed,
    totalExpired,
  };

  if (failed > 0) {
    return NextResponse.json(
      {
        error: `Expirarea zilelor nu a reușit pentru toți angajații (erori: ${failed}).`,
        success: false,
        ...summary,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, ...summary });
}
