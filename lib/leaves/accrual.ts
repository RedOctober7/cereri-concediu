import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { APP_TIME_ZONE, todayInBucharest, utcDate } from "@/lib/dates";
import { nextExpiringYear } from "@/lib/leaves/rollover";

/** Zilele acumulate pentru fiecare lună lucrată (21 pe an). */
export const MONTHLY_ACCRUAL_DAYS = 1.75;

/** O lună calendaristică; `month` este 1–12, ca în LeaveAccrual. */
export type AccrualMonth = { year: number; month: number };

function monthIndex({ year, month }: AccrualMonth): number {
  return year * 12 + (month - 1);
}

function fromIndex(index: number): AccrualMonth {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Luna (ora României) în care a fost creat contul. */
function creationMonth(createdAt: Date): AccrualMonth {
  const local = toZonedTime(createdAt, APP_TIME_ZONE);
  return { year: local.getFullYear(), month: local.getMonth() + 1 };
}

/** Perioadă în care contul a fost dezactivat; `from` null: de la creare (sau necunoscut). */
export type InactivePeriod = { from: Date | null; to: Date };

/**
 * O schimbare de stare a contului, din jurnal (UPDATE_USER). `legacy`: rând vechi, cu
 * `active` direct în details (tot formularul trimis), deci arată starea, nu sigur o schimbare.
 */
export type ActiveChange = { at: Date; active: boolean; legacy?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Starea nouă a contului dintr-un rând UPDATE_USER: `changes.active.to` sau, în rândurile
 * scrise înainte de 11 octombrie 2026, `active` direct în details. Null dacă rândul nu o atinge.
 */
export function parseActiveChange(details: unknown, at: Date): ActiveChange | null {
  if (!isRecord(details)) {
    return null;
  }
  if (isRecord(details.changes)) {
    const active = details.changes.active;
    return isRecord(active) && typeof active.to === "boolean" ? { at, active: active.to } : null;
  }
  return typeof details.active === "boolean" ? { at, active: details.active, legacy: true } : null;
}

/**
 * Perioadele în care un cont acum activ a fost dezactivat, din schimbările de stare.
 * O reactivare fără dezactivare înainte (cont creat inactiv sau rând lipsă din jurnal)
 * acoperă tot de la schimbarea precedentă sau, dacă nu există, de la creare; un rând
 * vechi (`legacy`) cu active: true nu dovedește că a fost o reactivare, deci nu. O
 * dezactivare rămasă fără reactivare se ignoră: contul e activ acum, deci a fost
 * reactivat, dar fără data reactivării nu știm ce luni să sărim.
 */
export function inactivePeriods(changes: ActiveChange[]): InactivePeriod[] {
  const periods: InactivePeriod[] = [];
  let open: Date | undefined;
  let previous: Date | null = null;
  for (const change of [...changes].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!change.active) {
      open ??= change.at;
    } else if (open !== undefined || !change.legacy) {
      periods.push({ from: open ?? previous, to: change.at });
      open = undefined;
    }
    previous = change.at;
  }
  return periods;
}

/** Începutul lunii (ora României), ca moment: de atunci rulează cronul pentru luna dinainte. */
function monthStart({ year, month }: AccrualMonth): Date {
  return fromZonedTime(`${year}-${String(month).padStart(2, "0")}-01T00:00:00`, APP_TIME_ZONE);
}

/**
 * Lunile încheiate pentru care angajatul trebuie să primească acum zilele lunii.
 *
 * Fiecare rulare recuperează lunile lipsă (o rulare ratată sau eșuată nu pierde luna):
 * de la prima lună deja acumulată sau, dacă nu are niciuna, de la luna în care a fost
 * creat contul (soldul inițial acoperă lunile de dinainte), până la luna trecută.
 * O lună contează dacă angajatul a fost angajat înainte de 15 ale lunii. Lunile din ani
 * ale căror zile au expirat deja nu se mai adaugă (ar expira imediat). O lună nu se
 * acumulează dacă la începutul lunii următoare, când rulează cronul, contul era
 * dezactivat (`inactive`), ca înainte, când cronul sărea conturile inactive.
 */
export function monthsToAccrue({
  hireDate,
  createdAt,
  accrued,
  inactive = [],
  now,
}: {
  /** `@db.Date`, miezul nopții UTC. */
  hireDate: Date;
  createdAt: Date;
  /** Lunile care au deja rând LeaveAccrual. */
  accrued: AccrualMonth[];
  /** Perioadele în care contul a fost dezactivat (vezi `inactivePeriods`). */
  inactive?: InactivePeriod[];
  now: Date;
}): AccrualMonth[] {
  const today = todayInBucharest(now);
  const lastMonth = monthIndex({ year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 }) - 1;
  const done = new Set(accrued.map(monthIndex));
  const start = done.size > 0 ? Math.min(...done) : monthIndex(creationMonth(createdAt));
  const oldestYear = nextExpiringYear(now);
  const wasInactive = (moment: Date) =>
    inactive.some((period) => (period.from === null || period.from <= moment) && moment < period.to);

  const months: AccrualMonth[] = [];
  for (let index = start; index <= lastMonth; index++) {
    const month = fromIndex(index);
    if (month.year < oldestYear || done.has(index) || wasInactive(monthStart(fromIndex(index + 1)))) {
      continue;
    }
    // hireDate este `@db.Date`: comparăm cu ziua de 15 la miezul nopții UTC.
    if (hireDate < utcDate(month.year, month.month - 1, 15)) {
      months.push(month);
    }
  }
  return months;
}
