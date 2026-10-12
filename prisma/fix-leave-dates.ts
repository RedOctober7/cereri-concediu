import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { LeaveStatus, PrismaClient, type Prisma } from "@prisma/client";
import { addDaysUTC, parseDateOnly, toDateOnlyString } from "@/lib/dates";
import { calculateWorkingDays, datesOverlap } from "@/lib/holidays";

const prisma = new PrismaClient();

// Reparație unică pentru cererile create înainte de corecția datelor:
// - startDate/endDate au fost salvate cu o zi mai devreme (clientul trimitea
//   miezul nopții din București ca timestamp UTC, deci ziua anterioară);
// - workingDays poate fi vechi (decalajul de mai sus + 6–7 ianuarie, sărbători noi).
//
// Utilizare:
//   npm run db:fix-leave-dates -- --before=<timestamp ISO al deploy-ului corecției>
//   npm run db:fix-leave-dates -- --before=<...> --apply
//
// Toate cererile create înainte de --before (orice status) sunt decalate cu +1 zi.
// La cererile active (PENDING_ADMIN, APPROVED_AUTO, APPROVED_ADMIN) se
// recalculează în plus workingDays, inclusiv la cele create după --before; la cele
// aprobate soldul (availableDays) se ajustează cu diferența. La cererile respinse
// sau anulate se corectează doar datele: workingDays și soldul rămân neschimbate.
// Cererile respinse/anulate create după --before nu sunt atinse.
//
// Fără --apply doar afișează modificările propuse. Fiecare cerere modificată
// primește un AuditLog LEAVE_DATA_REPAIR; cererile care au deja unul sunt sărite,
// deci rularea repetată nu mai decalează nimic.

const REPAIR_ACTION = "LEAVE_DATA_REPAIR";
const USAGE =
  "Utilizare: npm run db:fix-leave-dates -- --before=<timestamp ISO, ex. 2026-10-09T20:30:00Z> [--apply]";

const ACTIVE_STATUSES: LeaveStatus[] = [
  LeaveStatus.PENDING_ADMIN,
  LeaveStatus.APPROVED_AUTO,
  LeaveStatus.APPROVED_ADMIN,
];
const APPROVED_STATUSES: LeaveStatus[] = [
  LeaveStatus.APPROVED_AUTO,
  LeaveStatus.APPROVED_ADMIN,
];

const ISO_INSTANT_RE =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const LEAVE_SELECT = {
  id: true,
  userId: true,
  startDate: true,
  endDate: true,
  workingDays: true,
  status: true,
  createdAt: true,
  pdfUrl: true,
} satisfies Prisma.LeaveRequestSelect;

type LeaveRow = Prisma.LeaveRequestGetPayload<{ select: typeof LEAVE_SELECT }>;

type Change = {
  leave: LeaveRow;
  shifted: boolean;
  /** Cerere respinsă/anulată: doar datele se decalează, fără workingDays sau sold. */
  datesOnly: boolean;
  newStartDate: Date;
  newEndDate: Date;
  newWorkingDays: number;
  /** Cu cât crește User.availableDays (doar pentru cererile aprobate). */
  balanceDelta: number;
};

/** Ce folosește scriptul din client: merge și cu prisma, și cu tx din $transaction. */
type RepairDb = Pick<Prisma.TransactionClient, "leaveRequest" | "auditLog">;

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function parseArgs(argv: string[]): { before: Date; apply: boolean } {
  let before: Date | null = null;
  let apply = false;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
    } else if (arg.startsWith("--before=")) {
      const value = arg.slice("--before=".length);
      const match = ISO_INSTANT_RE.exec(value);
      const instant = new Date(value);
      if (!match || !parseDateOnly(match[1]) || Number.isNaN(instant.getTime())) {
        fail(
          `--before invalid: "${value}" (timestamp ISO cu oră și fus orar, ex. 2026-10-09T20:30:00Z sau 2026-10-09T23:30:00+03:00).`
        );
      }
      before = instant;
    } else if (arg === "--before") {
      fail("--before se scrie cu „=”, ex. --before=2026-10-09T20:30:00Z.");
    } else {
      fail(`Argument necunoscut: ${arg}`);
    }
  }

  if (!before) {
    fail("Lipsește --before (momentul deploy-ului corecției datelor).");
  }
  if (before > new Date()) {
    fail(`--before (${before.toISOString()}) este în viitor.`);
  }
  return { before, apply };
}

function isActive(leave: LeaveRow) {
  return ACTIVE_STATUSES.includes(leave.status);
}

/**
 * Cererile pe care scriptul le poate modifica: toate cele active (workingDays) și
 * toate cele create înainte de corecție, indiferent de status (datele).
 */
function repairScope(before: Date): Prisma.LeaveRequestWhereInput {
  return {
    OR: [{ status: { in: ACTIVE_STATUSES } }, { createdAt: { lt: before } }],
  };
}

/** Modificarea necesară pentru o cerere, sau null dacă e deja corectă. */
function planChange(leave: LeaveRow, before: Date): Change | null {
  // Doar cererile create înainte de corecție au datele decalate (orice status).
  const shifted = leave.createdAt < before;
  const newStartDate = shifted ? addDaysUTC(leave.startDate, 1) : leave.startDate;
  const newEndDate = shifted ? addDaysUTC(leave.endDate, 1) : leave.endDate;

  // Respinse/anulate: nu influențează soldul, deci se corectează doar perioada
  // afișată; workingDays rămâne cel salvat, soldul nu se atinge.
  if (!isActive(leave)) {
    if (!shifted) {
      return null;
    }
    return {
      leave,
      shifted,
      datesOnly: true,
      newStartDate,
      newEndDate,
      newWorkingDays: leave.workingDays,
      balanceDelta: 0,
    };
  }

  const newWorkingDays = calculateWorkingDays(newStartDate, newEndDate);
  if (!shifted && newWorkingDays === leave.workingDays) {
    return null;
  }

  return {
    leave,
    shifted,
    datesOnly: false,
    newStartDate,
    newEndDate,
    newWorkingDays,
    balanceDelta: APPROVED_STATUSES.includes(leave.status)
      ? leave.workingDays - newWorkingDays
      : 0,
  };
}

async function loadRepairedIds(db: RepairDb, leaveIds: string[]) {
  const rows = await db.auditLog.findMany({
    where: {
      action: REPAIR_ACTION,
      entityType: "LeaveRequest",
      entityId: { in: leaveIds },
    },
    select: { entityId: true },
  });
  return new Set(rows.map((row) => row.entityId));
}

async function planForLeaves(db: RepairDb, leaves: LeaveRow[], before: Date) {
  const repaired = await loadRepairedIds(
    db,
    leaves.map((leave) => leave.id)
  );
  const changes: Change[] = [];
  for (const leave of leaves) {
    if (repaired.has(leave.id)) {
      continue;
    }
    const change = planChange(leave, before);
    if (change) {
      changes.push(change);
    }
  }
  return { changes, skipped: repaired.size };
}

/** Cereri active ale aceluiași angajat care s-ar suprapune după reparație. */
function findOverlaps(leaves: LeaveRow[], changes: Change[]) {
  const changed = new Map(changes.map((c) => [c.leave.id, c]));
  const byUser = new Map<
    string,
    Array<{ id: string; startDate: Date; endDate: Date }>
  >();
  for (const leave of leaves) {
    const change = changed.get(leave.id);
    const list = byUser.get(leave.userId) ?? [];
    list.push({
      id: leave.id,
      startDate: change?.newStartDate ?? leave.startDate,
      endDate: change?.newEndDate ?? leave.endDate,
    });
    byUser.set(leave.userId, list);
  }

  const overlaps: Array<[string, string]> = [];
  for (const list of byUser.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (
          (changed.has(a.id) || changed.has(b.id)) &&
          datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)
        ) {
          overlaps.push([a.id, b.id]);
        }
      }
    }
  }
  return overlaps;
}

function period(start: Date, end: Date) {
  return `${toDateOnlyString(start)} – ${toDateOnlyString(end)}`;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function printTable(changes: Change[], usernames: Map<string, string>) {
  const header = [
    "Cerere",
    "Utilizator",
    "Status",
    "Reparație",
    "Creată (UTC)",
    "Perioadă veche",
    "Perioadă nouă",
    "Zile",
    "Sold",
  ];
  const rows = changes.map((c) => [
    c.leave.id,
    usernames.get(c.leave.userId) ?? c.leave.userId,
    c.leave.status,
    c.datesOnly
      ? "doar date"
      : !c.shifted
        ? "doar zile"
        : c.newWorkingDays !== c.leave.workingDays
          ? "date + zile"
          : "date",
    c.leave.createdAt.toISOString().slice(0, 16).replace("T", " "),
    period(c.leave.startDate, c.leave.endDate),
    c.shifted ? period(c.newStartDate, c.newEndDate) : "(neschimbată)",
    c.newWorkingDays === c.leave.workingDays
      ? String(c.leave.workingDays)
      : `${c.leave.workingDays} → ${c.newWorkingDays}`,
    c.balanceDelta === 0 ? "" : signed(c.balanceDelta),
  ]);
  const widths = header.map((title, i) =>
    Math.max(title.length, ...rows.map((row) => row[i].length))
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]))
      .join(" | ")
      .trimEnd();

  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("-|-"));
  for (const row of rows) {
    console.log(line(row));
  }
  if (changes.some((c) => c.datesOnly)) {
    console.log("");
    console.log(
      "„doar date” = cerere respinsă/anulată: se decalează doar perioada; zilele lucrătoare și soldul rămân neschimbate."
    );
  }
}

async function applyForUser(userId: string, before: Date) {
  return prisma.$transaction(
    async (tx) => {
      // Ca la crearea/aprobarea cererilor: serializează cu operațiile aplicației
      // pe același angajat și cu o eventuală a doua rulare simultană a scriptului.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;

      const leaves = await tx.leaveRequest.findMany({
        where: { userId, ...repairScope(before) },
        select: LEAVE_SELECT,
      });
      const { changes } = await planForLeaves(tx, leaves, before);

      let balanceDelta = 0;
      for (const change of changes) {
        const { leave } = change;
        // Condiționat de valorile citite: nu suprascriem o modificare făcută între timp.
        const { count } = await tx.leaveRequest.updateMany({
          where: {
            id: leave.id,
            status: leave.status,
            startDate: leave.startDate,
            endDate: leave.endDate,
            workingDays: leave.workingDays,
          },
          data: {
            startDate: change.newStartDate,
            endDate: change.newEndDate,
            workingDays: change.newWorkingDays,
          },
        });
        if (count !== 1) {
          throw new Error(`Cererea ${leave.id} s-a modificat între timp.`);
        }

        await tx.auditLog.create({
          data: {
            action: REPAIR_ACTION,
            entityType: "LeaveRequest",
            entityId: leave.id,
            details: {
              userId,
              status: leave.status,
              before: before.toISOString(),
              shifted: change.shifted,
              old: {
                startDate: toDateOnlyString(leave.startDate),
                endDate: toDateOnlyString(leave.endDate),
                workingDays: leave.workingDays,
              },
              new: {
                startDate: toDateOnlyString(change.newStartDate),
                endDate: toDateOnlyString(change.newEndDate),
                workingDays: change.newWorkingDays,
              },
              availableDaysDelta: change.balanceDelta,
            },
          },
        });
        balanceDelta += change.balanceDelta;
      }

      if (balanceDelta !== 0) {
        await tx.user.update({
          where: { id: userId },
          data: { availableDays: { increment: balanceDelta } },
        });
      }

      return { changed: changes.length, balanceDelta };
    },
    { maxWait: 10_000, timeout: 60_000 }
  );
}

function recordedBefore(details: Prisma.JsonValue): string | null {
  if (
    details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    typeof details.before === "string"
  ) {
    return details.before;
  }
  return null;
}

async function main() {
  const { before, apply } = parseArgs(process.argv.slice(2));

  // Cu alt --before (mai târziu), cererile create corect după deploy ar fi decalate.
  const previousRuns = await prisma.auditLog.findMany({
    where: { action: REPAIR_ACTION },
    select: { details: true },
  });
  const otherBefore = [
    ...new Set(previousRuns.map((row) => recordedBefore(row.details))),
  ].filter((value) => value !== null && value !== before.toISOString());
  if (otherBefore.length > 0) {
    console.error(
      `Reparația a fost deja aplicată cu --before=${otherBefore.join(", ")}. Folosește aceeași valoare.`
    );
    process.exitCode = 1;
    return;
  }

  const leaves = await prisma.leaveRequest.findMany({
    where: repairScope(before),
    select: LEAVE_SELECT,
    orderBy: [{ userId: "asc" }, { startDate: "asc" }],
  });
  const activeLeaves = leaves.filter(isActive);
  const { changes, skipped } = await planForLeaves(prisma, leaves, before);
  const users = await prisma.user.findMany({
    select: { id: true, username: true, availableDays: true },
  });
  const usernames = new Map(users.map((user) => [user.id, user.username]));

  console.log(
    `[Reparație] ${apply ? "APLICARE" : "RULARE DE PROBĂ (fără --apply nu se modifică nimic)"}`
  );
  console.log(
    `[Reparație] Decalare +1 zi pentru toate cererile create înainte de ${before.toISOString()} (la cele respinse/anulate doar datele).`
  );
  console.log("");

  if (changes.length > 0) {
    printTable(changes, usernames);
    console.log("");
  }

  const userIds = [...new Set(changes.map((c) => c.leave.userId))];
  const shifted = changes.filter((c) => c.shifted).length;
  const datesOnly = changes.filter((c) => c.datesOnly).length;
  const recomputed = changes.filter(
    (c) => c.newWorkingDays !== c.leave.workingDays
  ).length;
  const totalDelta = changes.reduce((sum, c) => sum + c.balanceDelta, 0);
  const zeroDays = changes.filter(
    (c) => !c.datesOnly && c.newWorkingDays < 1
  );
  const stalePdfs = changes.filter(
    (c) => APPROVED_STATUSES.includes(c.leave.status) && c.leave.pdfUrl
  );
  const overlaps = findOverlaps(activeLeaves, changes);
  const negativeBalances = users.flatMap((user) => {
    const delta = changes
      .filter((c) => c.leave.userId === user.id)
      .reduce((sum, c) => sum + c.balanceDelta, 0);
    const round = (value: number) => Math.round(value * 100) / 100;
    const after = round(user.availableDays + delta);
    return delta !== 0 && after < 0
      ? [`${user.username} (${round(user.availableDays)} → ${after})`]
      : [];
  });

  console.log(`Cereri active în baza de date: ${activeLeaves.length}`);
  console.log(
    `Cereri respinse/anulate create înainte de --before: ${leaves.length - activeLeaves.length}`
  );
  console.log(`Deja reparate (sărite): ${skipped}`);
  console.log(`De modificat: ${changes.length} (utilizatori: ${userIds.length})`);
  console.log(`  - decalate cu +1 zi: ${shifted}`);
  console.log(`    din care respinse/anulate (doar datele): ${datesOnly}`);
  console.log(`  - cu zile lucrătoare recalculate: ${recomputed}`);
  console.log(`  - ajustare totală a soldurilor: ${signed(totalDelta)} zile`);
  if (zeroDays.length > 0) {
    console.log(
      `Atenție: cereri active fără nicio zi lucrătoare după reparație (${zeroDays.length}): ${zeroDays.map((c) => c.leave.id).join(", ")}`
    );
  }
  if (stalePdfs.length > 0) {
    console.log(
      `Atenție: cereri aprobate cu PDF generat pe datele vechi (${stalePdfs.length}): ${stalePdfs.map((c) => c.leave.id).join(", ")}`
    );
  }
  if (overlaps.length > 0) {
    console.log(
      `Atenție: cereri active care se suprapun după reparație: ${overlaps.map(([a, b]) => `${a} ↔ ${b}`).join(", ")}`
    );
  }
  if (negativeBalances.length > 0) {
    console.log(
      `Atenție: sold negativ după reparație: ${negativeBalances.join(", ")}`
    );
  }

  if (!apply) {
    console.log("");
    console.log(
      changes.length > 0
        ? "Rulează din nou cu --apply pentru a aplica modificările."
        : "Nimic de modificat."
    );
    return;
  }

  let changedTotal = 0;
  let appliedDelta = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      const result = await applyForUser(userId, before);
      changedTotal += result.changed;
      appliedDelta += result.balanceDelta;
      console.log(
        `[Reparație] ${usernames.get(userId) ?? userId}: cereri modificate ${result.changed}, sold ${signed(result.balanceDelta)}`
      );
    } catch (error) {
      failed++;
      console.error(`[Reparație] Eroare la ${usernames.get(userId) ?? userId}:`, error);
    }
  }

  console.log("");
  console.log(
    `[Reparație] Gata: cereri modificate ${changedTotal}, utilizatori procesați ${userIds.length - failed}, erori ${failed}; sold ajustat în total cu ${signed(appliedDelta)} zile.`
  );
  if (failed > 0) {
    console.log(
      "[Reparație] Utilizatorii cu erori nu au fost modificați; rulează din nou scriptul (cererile reparate sunt sărite)."
    );
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("Eroare:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
