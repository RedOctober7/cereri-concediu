import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/api-auth";
import { userUpdateSchema } from "@/lib/validators";
import { createAuditLog } from "@/lib/audit/log";
import { DEMO_PROTECTED_MESSAGE, isProtectedDemoAccount } from "@/lib/demo/accounts";
import { toDateOnlyString } from "@/lib/dates";
import {
  YEARLY_ROLLOVER_ACTION,
  openingBalanceYear,
  parseRolloverDetails,
} from "@/lib/leaves/rollover";
import { findDuplicateAccount } from "../duplicates";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Câmpurile de profil a căror schimbare se notează în jurnal ca { from, to }. */
const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "username",
  "jobTitle",
  "employer",
  "workPointId",
  "hireDate",
  "initialLeaveDays",
  "active",
] as const;

type ProfileField = (typeof PROFILE_FIELDS)[number];
type AuditValue = string | number | boolean | null;

function auditValue(value: unknown): AuditValue {
  if (value instanceof Date) {
    return toDateOnlyString(value);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function fieldError(error: string, field: string, status: number) {
  return NextResponse.json({ error, field }, { status });
}

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
      const issue = parsed.error.issues[0];
      const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
      return NextResponse.json(
        { error: issue?.message ?? "Date invalide.", ...(field ? { field } : {}) },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Utilizatorul nu a fost găsit." },
        { status: 404 }
      );
    }

    if (
      isProtectedDemoAccount(existing.username) &&
      (parsed.data.password !== undefined ||
        parsed.data.active !== undefined ||
        parsed.data.forcePasswordReset !== undefined ||
        (parsed.data.username !== undefined &&
          parsed.data.username.toLowerCase() !== existing.username))
    ) {
      return NextResponse.json({ error: DEMO_PROTECTED_MESSAGE }, { status: 403 });
    }

    if (parsed.data.active === false && id === auth.session.user.id) {
      return NextResponse.json(
        { error: "Nu îți poți dezactiva propriul cont." },
        { status: 400 }
      );
    }

    const email = parsed.data.email?.toLowerCase();
    const username = parsed.data.username?.toLowerCase();
    const duplicate = await findDuplicateAccount(
      {
        email: email !== undefined && email !== existing.email ? email : undefined,
        username:
          username !== undefined && username !== existing.username ? username : undefined,
      },
      id
    );
    if (duplicate) {
      return NextResponse.json(duplicate, { status: 409 });
    }

    // Un punct de lucru nou trebuie să existe și să fie activ; cel deja atribuit
    // (chiar dacă între timp a fost dezactivat) poate rămâne.
    const workPointId =
      parsed.data.workPointId === undefined ? undefined : parsed.data.workPointId || null;
    if (workPointId && workPointId !== existing.workPointId) {
      const workPoint = await prisma.workPoint.findUnique({
        where: { id: workPointId },
        select: { active: true },
      });
      if (!workPoint?.active) {
        return fieldError(
          "Punctul de lucru selectat nu există sau este inactiv.",
          "workPointId",
          400
        );
      }
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
          ...(email ? { email } : {}),
          ...(username ? { username } : {}),
          ...(parsed.data.jobTitle ? { jobTitle: parsed.data.jobTitle } : {}),
          ...(parsed.data.employer ? { employer: parsed.data.employer } : {}),
          ...(workPointId !== undefined ? { workPointId } : {}),
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

    // Doar câmpurile care chiar s-au schimbat, ca { from, to }: jurnalul arată
    // diferența, nu tot formularul. Parola nu ajunge niciodată în jurnal.
    const changes: Partial<Record<ProfileField, { from: AuditValue; to: AuditValue }>> = {};
    for (const field of PROFILE_FIELDS) {
      const from = auditValue(existing[field]);
      const to = auditValue(updated[field]);
      if (parsed.data[field] !== undefined && from !== to) {
        changes[field] = { from, to };
      }
    }

    const hasChanges = Object.keys(changes).length > 0;
    if (hasChanges || passwordHash || parsed.data.forcePasswordReset !== undefined) {
      await createAuditLog({
        userId: auth.session.user.id,
        action: "UPDATE_USER",
        entityType: "User",
        entityId: updated.id,
        details: {
          ...(hasChanges ? { changes } : {}),
          ...(passwordHash ? { passwordReset: true } : {}),
          ...(parsed.data.forcePasswordReset !== undefined
            ? { forcePasswordReset: parsed.data.forcePasswordReset }
            : {}),
          ...(balanceChange ?? {}),
        },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "OPENING_BALANCE_ALREADY_ROLLED_OVER"
    ) {
      return fieldError(
        "Soldul inițial nu mai poate fi modificat: zilele din anul respectiv au fost deja procesate la reportarea anuală. Folosește „Ajustare sold” pentru corecturi.",
        "initialLeaveDays",
        409
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Același username sau email salvat în paralel de altă cerere.
      return NextResponse.json(
        { error: "Există deja un utilizator cu acest email sau nume de utilizator." },
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
