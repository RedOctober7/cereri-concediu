import { formatInTimeZone } from "date-fns-tz";

/**
 * Convenție pentru date calendaristice (fără oră), ex. startDate/endDate:
 * o zi este reprezentată ca `Date` la miezul nopții UTC a acelei zile —
 * exact ce citește/scrie Prisma pentru coloanele `@db.Date`.
 *
 * Funcțiile de aici folosesc doar câmpurile UTC, deci rezultatul este același
 * indiferent de fusul orar al serverului (UTC pe Vercel, Europe/Bucharest local).
 */

export const APP_TIME_ZONE = "Europe/Bucharest";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

/** Ziua (an, lună 0-11, zi) la miezul nopții UTC; depășirile se normalizează. */
export function utcDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}

/** Parsează strict 'yyyy-MM-dd'; întoarce null pentru format sau zi invalidă. */
export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = utcDate(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Acceptă 'yyyy-MM-dd' sau (compatibilitate cu clienți vechi) un timestamp ISO
 * cu fus explicit, convertit la ziua calendaristică din Europe/Bucharest.
 */
export function parseDateInput(value: string): Date | null {
  const trimmed = value.trim();
  const dateOnly = parseDateOnly(trimmed);
  if (dateOnly) {
    return dateOnly;
  }
  const match = ISO_TIMESTAMP_RE.exec(trimmed);
  if (!match) {
    return null;
  }
  // Date() normalizează depășirile ('2026-02-30T10:00:00Z' devine 2 martie),
  // așa că validăm strict ziua și ora înainte de conversie.
  const [
    ,
    datePart,
    hours,
    minutes,
    seconds = "00",
    offsetHours = "00",
    offsetMinutes = "00",
  ] = match;
  if (
    !parseDateOnly(datePart) ||
    Number(hours) > 23 ||
    Number(minutes) > 59 ||
    Number(seconds) > 59 ||
    Number(offsetHours) > 23 ||
    Number(offsetMinutes) > 59
  ) {
    return null;
  }
  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return parseDateOnly(formatInTimeZone(instant, APP_TIME_ZONE, "yyyy-MM-dd"));
}

/** 'yyyy-MM-dd' din câmpurile UTC ale datei. */
export function toDateOnlyString(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Ziua (UTC) a datei, la miezul nopții UTC. */
export function startOfDayUTC(date: Date): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Data de azi din Europe/Bucharest, la miezul nopții UTC. */
export function todayInBucharest(now: Date = new Date()): Date {
  const [year, month, day] = formatInTimeZone(now, APP_TIME_ZONE, "yyyy-MM-dd")
    .split("-")
    .map(Number);
  return utcDate(year, month - 1, day);
}

export function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Adaugă ani; 29 februarie devine 28 februarie în anii nebisecți. */
export function addYearsUTC(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const lastDayOfMonth = utcDate(year, month + 1, 0).getUTCDate();
  return utcDate(year, month, Math.min(date.getUTCDate(), lastDayOfMonth));
}
