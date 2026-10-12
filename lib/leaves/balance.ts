import type { Prisma, PrismaClient } from "@prisma/client";

type RawExecutor = Pick<PrismaClient, "$executeRaw"> | Pick<Prisma.TransactionClient, "$executeRaw">;

/**
 * Adaugă `delta` (negativ = scade) la soldul angajatului și rotunjește la 2 zecimale,
 * într-un singur UPDATE atomic. Coloana e double precision: un increment simplu lasă
 * zgomot (ex. 0,13 + 8 × 1,75 − 0,13 = 13,999999999999998), care ar face o cerere de
 * exact 14 zile să „depășească” soldul.
 */
export function adjustAvailableDays(db: RawExecutor, userId: string, delta: number) {
  return db.$executeRaw`
    UPDATE "User"
    SET "availableDays" = ROUND(("availableDays" + ${delta}::double precision)::numeric, 2)::double precision
    WHERE "id" = ${userId}
  `;
}
