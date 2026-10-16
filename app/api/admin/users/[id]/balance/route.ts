import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { balanceAdjustmentSchema } from "@/lib/validators";
import { BALANCE_ADJUSTMENT_ACTION } from "@/lib/audit/actions";
import { adjustmentYears } from "@/lib/leaves/rollover";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
    const year = parsed.data.year ?? years[years.length - 1];
    if (!years.includes(year)) {
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
        select: { availableDays: true, role: true },
      });
      if (!user) {
        return null;
      }
      if (user.role !== Role.EMPLOYEE) {
        throw new Error("NOT_AN_EMPLOYEE");
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
