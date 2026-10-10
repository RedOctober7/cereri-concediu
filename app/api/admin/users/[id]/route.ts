import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { userUpdateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";
import {
  YEARLY_ROLLOVER_ACTION,
  openingBalanceYear,
  parseRolloverDetails,
} from "@/lib/leaves/rollover";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdminSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body: unknown = await request.json();
    const parsed = userUpdateSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Utilizatorul nu a fost găsit." },
        { status: 404 }
      );
    }

    let passwordHash: string | undefined;
    if (parsed.data.password) {
      passwordHash = await bcrypt.hash(parsed.data.password, 12);
    }

    const newInitialLeaveDays = parsed.data.initialLeaveDays;

    const { updated, balanceChange } = await prisma.$transaction(async (tx) => {
      // Soldul inițial face parte din availableDays (la creare availableDays =
      // initialLeaveDays), deci o corectură se aplică și soldului, ca diferență.
      // Blocăm rândul (ca la crearea cererilor și la rollover-ul anual) ca
      // diferența să fie calculată din valorile curente, nu dintr-o citire veche.
      let before: { initialLeaveDays: number; availableDays: number } | null =
        null;
      let availableDaysDelta = 0;
      if (newInitialLeaveDays !== undefined) {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id },
          select: {
            initialLeaveDays: true,
            availableDays: true,
            hireDate: true,
            createdAt: true,
          },
        });
        before = current;
        // Rotunjit la 2 zecimale, ca în rollover: soldurile sunt fracționare
        // (acumulare lunară), iar diferența brută lasă zgomot de virgulă mobilă.
        availableDaysDelta =
          Math.round((newInitialLeaveDays - current.initialLeaveDays) * 100) / 100;

        if (availableDaysDelta !== 0) {
          // Soldul inițial e atribuit anului de deschidere. Dacă rollover-ul anual a
          // procesat deja acel an, zilele adăugate acum nu ar mai expira niciodată
          // (anul e marcat ca procesat), iar cele scoase ar fi scăzute de două ori.
          const openingYear = openingBalanceYear(current.hireDate, current.createdAt);
          const rollovers = await tx.auditLog.findMany({
            where: {
              action: YEARLY_ROLLOVER_ACTION,
              entityType: "User",
              entityId: id,
            },
            select: { details: true },
          });
          const alreadyProcessed = rollovers.some((row) => {
            const parsedRow = parseRolloverDetails(row.details);
            return parsedRow !== null && parsedRow.year >= openingYear;
          });
          if (alreadyProcessed) {
            throw new Error("OPENING_BALANCE_ALREADY_ROLLED_OVER");
          }
        }
      }

      const updated = await tx.user.update({
        where: { id },
        // tx nu are tipul cu omit-ul global, deci îl cerem explicit.
        omit: { passwordHash: true },
        data: {
          ...(parsed.data.firstName ? { firstName: parsed.data.firstName } : {}),
          ...(parsed.data.lastName ? { lastName: parsed.data.lastName } : {}),
          ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}),
          ...(parsed.data.username
            ? { username: parsed.data.username.toLowerCase() }
            : {}),
          ...(parsed.data.jobTitle ? { jobTitle: parsed.data.jobTitle } : {}),
          ...(parsed.data.employer ? { employer: parsed.data.employer } : {}),
          ...(parsed.data.workPointId !== undefined
            ? { workPointId: parsed.data.workPointId || null }
            : {}),
          ...(parsed.data.hireDate ? { hireDate: parsed.data.hireDate } : {}),
          ...(newInitialLeaveDays !== undefined
            ? { initialLeaveDays: newInitialLeaveDays }
            : {}),
          // Rândul e blocat (FOR UPDATE), deci putem scrie direct soldul nou,
          // rotunjit: un increment ar lăsa zgomot (7.3 + 0.1 = 7.3999999999999995).
          ...(before && availableDaysDelta !== 0
            ? {
                availableDays:
                  Math.round((before.availableDays + availableDaysDelta) * 100) / 100,
              }
            : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          ...(parsed.data.forcePasswordReset !== undefined
            ? { mustChangePassword: parsed.data.forcePasswordReset }
            : {}),
          // Dezactivarea e un soft-delete; la reactivare trebuie șters și deletedAt,
          // altfel login-ul și cron-urile (care filtrează deletedAt: null) îl ignoră.
          ...(parsed.data.active === false ? { deletedAt: new Date() } : {}),
          ...(parsed.data.active === true ? { deletedAt: null } : {}),
        },
      });

      return {
        updated,
        balanceChange:
          before && availableDaysDelta !== 0
            ? {
                initialLeaveDaysBefore: before.initialLeaveDays,
                initialLeaveDaysAfter: updated.initialLeaveDays,
                availableDaysBefore: before.availableDays,
                availableDaysAfter: updated.availableDays,
              }
            : null,
      };
    });

    // Parola în clar nu ajunge niciodată în audit log; notăm doar că a fost resetată.
    const { password, ...auditDetails } = parsed.data;
    await createAuditLog({
      userId: auth.session.user.id,
      action: "UPDATE_USER",
      entityType: "User",
      entityId: updated.id,
      details: {
        ...auditDetails,
        ...(password ? { passwordReset: true } : {}),
        ...(balanceChange ?? {}),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "OPENING_BALANCE_ALREADY_ROLLED_OVER"
    ) {
      return NextResponse.json(
        {
          error:
            "Soldul inițial nu mai poate fi modificat: zilele din anul respectiv au fost deja procesate la reportarea anuală.",
        },
        { status: 409 }
      );
    }
    console.error("[Users] Eroare actualizare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
