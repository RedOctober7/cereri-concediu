import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { balanceAdjustmentSchema } from "@/lib/validators";
import { BALANCE_ADJUSTMENT_ACTION } from "@/lib/audit/actions";
import {
  adjustmentYears,
  openingBalanceYear,
  parseAdjustmentDetails,
} from "@/lib/leaves/rollover";
import { daysText } from "@/lib/constraints/messages";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** O scădere pe un an anume nu poate lua mai multe zile decât s-au câștigat în acel an. */
class YearOverdrawn extends Error {
  constructor(readonly year: number, readonly earned: number) {
    super("YEAR_OVERDRAWN");
  }
}

/**
 * Ajustare manuală a soldului (zile cu semn + anul lor + motiv). Soldul și rândul din
 * jurnal se scriu în aceeași tranzacție, cu rândul utilizatorului blocat, ca la crearea
 * cererilor și la rollover: o cerere aprobată în paralel nu poate pierde sau dubla
 * ajustarea. Anul din jurnal este cel după care expiră zilele (vezi parseAdjustmentDetails).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Datele trimise nu sunt valide." }, { status: 400 });
    }
    const parsed = balanceAdjustmentSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
      return NextResponse.json(
        { error: issue?.message ?? "Date invalide.", ...(field ? { field } : {}) },
        { status: 400 }
      );
    }

    const { delta, reason } = parsed.data;
    const years = adjustmentYears(new Date());
    // Adăugare: anul ales sau anul curent. Scădere: anul ales (corectură) sau null, adică
    // cele mai vechi zile, ca un concediu (vezi parseAdjustmentDetails).
    const year = delta > 0 ? (parsed.data.year ?? years[years.length - 1]) : (parsed.data.year ?? null);
    if (year !== null && !years.includes(year)) {
      return NextResponse.json(
        {
          error: `Alege un an ale cărui zile nu au expirat încă: ${years.slice(0, -1).join(", ")}${years.length > 1 ? " sau " : ""}${years[years.length - 1]}.`,
          field: "year",
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id },
        select: { availableDays: true, role: true, initialLeaveDays: true, hireDate: true, createdAt: true },
      });
      if (!user) {
        return null;
      }
      if (user.role !== Role.EMPLOYEE) {
        throw new Error("NOT_AN_EMPLOYEE");
      }

      if (year !== null && delta < 0) {
        const [accrued, adjustmentLogs] = await Promise.all([
          tx.leaveAccrual.aggregate({ where: { userId: id, year }, _sum: { days: true } }),
          tx.auditLog.findMany({
            where: { action: BALANCE_ADJUSTMENT_ACTION, entityType: "User", entityId: id },
            select: { details: true, createdAt: true },
          }),
        ]);
        const adjusted = adjustmentLogs
          .map((log) => parseAdjustmentDetails(log.details, log.createdAt))
          .filter((entry) => entry?.year === year)
          .reduce((sum, entry) => sum + (entry?.days ?? 0), 0);
        const opening =
          openingBalanceYear(user.hireDate, user.createdAt) === year ? user.initialLeaveDays : 0;
        const earned = round2((accrued._sum.days ?? 0) + opening + adjusted);
        if (round2(earned + delta) < 0) {
          throw new YearOverdrawn(year, earned);
        }
      }

      const before = user.availableDays;
      // Rândul e blocat, deci scriem direct valoarea rotunjită (un increment ar lăsa
      // zgomot de virgulă mobilă: 7.3 + 0.1 = 7.3999999999999995).
      const after = round2(before + delta);

      await tx.user.update({
        where: { id },
        data: { availableDays: after },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.user.id,
          action: BALANCE_ADJUSTMENT_ACTION,
          entityType: "User",
          entityId: id,
          details: { delta, year, reason, before, after },
        },
      });

      return { before, after, delta, year };
    });

    if (!result) {
      return NextResponse.json(
        { error: "Utilizatorul nu a fost găsit." },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof YearOverdrawn) {
      return NextResponse.json(
        {
          error: `Din ${error.year} angajatul are ${daysText(Math.max(error.earned, 0))} câștigate până acum. Alege „Cele mai vechi zile” sau scade mai puțin.`,
          field: "year",
        },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "NOT_AN_EMPLOYEE") {
      return NextResponse.json(
        { error: "Soldul se poate ajusta doar pentru conturile de angajat." },
        { status: 400 }
      );
    }
    console.error("[Users] Eroare ajustare sold:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
