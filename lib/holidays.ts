import {
  addDays,
  format,
  getDay,
  isSameDay,
  isWithinInterval,
  startOfDay,
} from "date-fns";

const holidayNames = new Map<string, string>();

function registerHoliday(date: Date, name: string) {
  holidayNames.set(format(startOfDay(date), "yyyy-MM-dd"), name);
}

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

  const julianEaster = new Date(year, month - 1, day);
  return startOfDay(addDays(julianEaster, 13));
}

export function getRomanianHolidays(year: number): Date[] {
  holidayNames.clear();

  const fixed: Array<[number, number, string]> = [
    [1, 1, "Anul Nou"],
    [1, 2, "A doua zi de Anul Nou"],
    [1, 24, "Ziua Unirii Principatelor Române"],
    [5, 1, "Ziua Muncii"],
    [6, 1, "Ziua Copilului"],
    [8, 15, "Adormirea Maicii Domnului"],
    [11, 30, "Sfântul Andrei"],
    [12, 1, "Ziua Națională a României"],
    [12, 25, "Crăciunul"],
    [12, 26, "A doua zi de Crăciun"],
  ];

  const holidays: Date[] = fixed.map(([month, day, name]) => {
    const date = startOfDay(new Date(year, month - 1, day));
    registerHoliday(date, name);
    return date;
  });

  const easter = getOrthodoxEasterSunday(year);
  const goodFriday = addDays(easter, -2);
  const easterMonday = addDays(easter, 1);
  const pentecostSunday = addDays(easter, 49);
  const pentecostMonday = addDays(easter, 50);

  const movable: Array<[Date, string]> = [
    [goodFriday, "Vinerea Mare"],
    [easter, "Paștele"],
    [easterMonday, "A doua zi de Paște"],
    [pentecostSunday, "Rusalii"],
    [pentecostMonday, "A doua zi de Rusalii"],
  ];

  for (const [date, name] of movable) {
    holidays.push(date);
    registerHoliday(date, name);
  }

  return holidays;
}

export function getHolidayName(date: Date): string | undefined {
  const key = format(startOfDay(date), "yyyy-MM-dd");
  if (holidayNames.has(key)) {
    return holidayNames.get(key);
  }
  getRomanianHolidays(date.getFullYear());
  return holidayNames.get(key);
}

export function isHoliday(date: Date): boolean {
  return getHolidayName(date) !== undefined;
}

export function isWeekend(date: Date): boolean {
  const day = getDay(date);
  return day === 0 || day === 6;
}

export function isWorkingDay(date: Date): boolean {
  return !isWeekend(date) && !isHoliday(date);
}

export function calculateWorkingDays(start: Date, end: Date): number {
  const from = startOfDay(start);
  const to = startOfDay(end);
  if (from > to) {
    return 0;
  }

  let count = 0;
  let current = from;
  while (current <= to) {
    if (isWorkingDay(current)) {
      count += 1;
    }
    current = addDays(current, 1);
  }
  return count;
}

export function eachDayInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let current = startOfDay(start);
  const to = startOfDay(end);
  while (current <= to) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

export function intervalIntersectsMonth(
  start: Date,
  end: Date,
  month: number
): boolean {
  const year = start.getFullYear();
  const monthStart = startOfDay(new Date(year, month - 1, 1));
  const monthEnd = startOfDay(new Date(year, month, 0));
  return (
    isWithinInterval(monthStart, { start: startOfDay(start), end: startOfDay(end) }) ||
    isWithinInterval(monthEnd, { start: startOfDay(start), end: startOfDay(end) }) ||
    isWithinInterval(startOfDay(start), { start: monthStart, end: monthEnd }) ||
    isWithinInterval(startOfDay(end), { start: monthStart, end: monthEnd })
  );
}

export function datesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startOfDay(startA) <= startOfDay(endB) && startOfDay(endA) >= startOfDay(startB);
}

export { isSameDay };
