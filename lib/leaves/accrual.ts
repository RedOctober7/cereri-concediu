import { toZonedTime } from "date-fns-tz";
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

/**
 * Lunile încheiate pentru care angajatul trebuie să primească acum zilele lunii.
 *
 * Fiecare rulare recuperează lunile lipsă (o rulare ratată sau eșuată nu pierde luna):
 * de la prima lună deja acumulată sau, dacă nu are niciuna, de la luna în care a fost
 * creat contul (soldul inițial acoperă lunile de dinainte), până la luna trecută.
 * O lună contează dacă angajatul a fost angajat înainte de 15 ale lunii. Lunile din ani
 * ale căror zile au expirat deja nu se mai adaugă (ar expira imediat).
 */
export function monthsToAccrue({
  hireDate,
  createdAt,
  accrued,
  now,
}: {
  /** `@db.Date`, miezul nopții UTC. */
  hireDate: Date;
  createdAt: Date;
  /** Lunile care au deja rând LeaveAccrual. */
  accrued: AccrualMonth[];
  now: Date;
}): AccrualMonth[] {
  const today = todayInBucharest(now);
  const lastMonth = monthIndex({ year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 }) - 1;
  const done = new Set(accrued.map(monthIndex));
  const start = done.size > 0 ? Math.min(...done) : monthIndex(creationMonth(createdAt));
  const oldestYear = nextExpiringYear(now);

  const months: AccrualMonth[] = [];
  for (let index = start; index <= lastMonth; index++) {
    const month = fromIndex(index);
    if (month.year < oldestYear || done.has(index)) {
      continue;
    }
    // hireDate este `@db.Date`: comparăm cu ziua de 15 la miezul nopții UTC.
    if (hireDate < utcDate(month.year, month.month - 1, 15)) {
      months.push(month);
    }
  }
  return months;
}
