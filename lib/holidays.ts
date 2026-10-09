import {
  addDaysUTC,
  startOfDayUTC,
  toDateOnlyString,
  utcDate,
} from "@/lib/dates";

// Toate datele de aici sunt zile la miezul nopții UTC (vezi lib/dates.ts).

type HolidayEntry = { date: Date; name: string };

const MAX_CACHED_YEARS = 16;
/** 6 și 7 ianuarie sunt sărbători legale (art. 139 Codul muncii) din 2024. */
const FIRST_YEAR_WITH_JANUARY_6_7 = 2024;
const holidayCache = new Map<number, Map<string, HolidayEntry>>();

/** Paște Ortodox (duminică) — algoritm Gauss, convertit la calendar gregorian. */
export function getOrthodoxEasterSunday(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b + 6 * d + 6) % 7;
  const julianDay = 22 + d + e;

  let month = 3;
  let day = julianDay;
  if (julianDay > 31) {
    month = 4;
    day = julianDay - 31;
  }

  // Data iuliană + 13 zile = data gregoriană (valabil pentru 1900–2099).
  return utcDate(year, month - 1, day + 13);
}

function buildHolidays(year: number): Map<string, HolidayEntry> {
  const entries = new Map<string, HolidayEntry>();
  const register = (date: Date, name: string) => {
    const key = toDateOnlyString(date);
    const existing = entries.get(key);
    // Ex.: 1 iunie 2026 este și Ziua Copilului, și a doua zi de Rusalii.
    entries.set(key, {
      date,
      name: existing ? `${existing.name} / ${name}` : name,
    });
  };

  const januaryHolidays: Array<[number, number, string]> =
    year >= FIRST_YEAR_WITH_JANUARY_6_7
      ? [
          [1, 6, "Boboteaza"],
          [1, 7, "Sfântul Ioan Botezătorul"],
        ]
      : [];

  const fixed: Array<[number, number, string]> = [
    [1, 1, "Anul Nou"],
    [1, 2, "A doua zi de Anul Nou"],
    ...januaryHolidays,
    [1, 24, "Ziua Unirii Principatelor Române"],
    [5, 1, "Ziua Muncii"],
    [6, 1, "Ziua Copilului"],
    [8, 15, "Adormirea Maicii Domnului"],
    [11, 30, "Sfântul Andrei"],
    [12, 1, "Ziua Națională a României"],
    [12, 25, "Crăciunul"],
    [12, 26, "A doua zi de Crăciun"],
  ];

  for (const [month, day, name] of fixed) {
    register(utcDate(year, month - 1, day), name);
  }

  const easter = getOrthodoxEasterSunday(year);
  const movable: Array<[Date, string]> = [
    [addDaysUTC(easter, -2), "Vinerea Mare"],
    [easter, "Paștele"],
    [addDaysUTC(easter, 1), "A doua zi de Paște"],
    [addDaysUTC(easter, 49), "Rusalii"],
    [addDaysUTC(easter, 50), "A doua zi de Rusalii"],
  ];

  for (const [date, name] of movable) {
    register(date, name);
  }

  return entries;
}

function getHolidayEntries(year: number): Map<string, HolidayEntry> {
  let entries = holidayCache.get(year);
  if (!entries) {
    entries = buildHolidays(year);
    if (holidayCache.size >= MAX_CACHED_YEARS) {
      const oldestYear = holidayCache.keys().next().value;
      if (oldestYear !== undefined) {
        holidayCache.delete(oldestYear);
      }
    }
    holidayCache.set(year, entries);
  }
  return entries;
}

export function getRomanianHolidays(year: number): Date[] {
  return Array.from(
    getHolidayEntries(year).values(),
    (entry) => new Date(entry.date.getTime())
  );
}

export function getHolidayName(date: Date): string | undefined {
  return getHolidayEntries(date.getUTCFullYear()).get(toDateOnlyString(date))
    ?.name;
}

export function isHoliday(date: Date): boolean {
  return getHolidayName(date) !== undefined;
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isWorkingDay(date: Date): boolean {
  return !isWeekend(date) && !isHoliday(date);
}

export function calculateWorkingDays(start: Date, end: Date): number {
  const from = startOfDayUTC(start);
  const to = startOfDayUTC(end);
  if (from > to) {
    return 0;
  }

  let count = 0;
  let current = from;
  while (current <= to) {
    if (isWorkingDay(current)) {
      count += 1;
    }
    current = addDaysUTC(current, 1);
  }
  return count;
}

export function eachDayInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let current = startOfDayUTC(start);
  const to = startOfDayUTC(end);
  while (current <= to) {
    days.push(current);
    current = addDaysUTC(current, 1);
  }
  return days;
}

export function intervalIntersectsMonth(
  start: Date,
  end: Date,
  month: number
): boolean {
  const year = start.getUTCFullYear();
  const monthStart = utcDate(year, month - 1, 1);
  const monthEnd = utcDate(year, month, 0);
  return datesOverlap(start, end, monthStart, monthEnd);
}

export function datesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return (
    startOfDayUTC(startA) <= startOfDayUTC(endB) &&
    startOfDayUTC(endA) >= startOfDayUTC(startB)
  );
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateOnlyString(a) === toDateOnlyString(b);
}
