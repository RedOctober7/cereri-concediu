import { formatInTimeZone } from "date-fns-tz";
import { ro } from "date-fns/locale";
import { APP_TIME_ZONE } from "@/lib/dates";

// Formatări pentru paginile de administrare (utilizatori, puncte de lucru, reguli,
// jurnal). Zilele calendaristice sunt Date la miezul nopții UTC (lib/dates.ts), deci
// se formatează în UTC; momentele (createdAt) se formatează în ora României.

const daysFormatter = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 });

/** Număr de zile (sold) în format românesc, cel mult 2 zecimale: „12,5”, „-2,25”. */
export function formatDays(value: number): string {
  // -0 ar apărea ca „-0”.
  return daysFormatter.format(value === 0 ? 0 : value);
}

/** Zi calendaristică → „14.10.2026”. */
export function formatDay(date: Date): string {
  return formatInTimeZone(date, "UTC", "dd.MM.yyyy");
}

/** Interval compact: „14–17 oct 2026”, „28 oct – 3 nov 2026”, „29 dec 2026 – 2 ian 2027”. */
export function formatPeriod(start: Date, end: Date): string {
  const fmt = (date: Date, pattern: string) =>
    formatInTimeZone(date, "UTC", pattern, { locale: ro });
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (start.getTime() === end.getTime()) {
    return fmt(start, "d MMM yyyy");
  }
  if (sameMonth) {
    return `${fmt(start, "d")}–${fmt(end, "d MMM yyyy")}`;
  }
  if (sameYear) {
    return `${fmt(start, "d MMM")} – ${fmt(end, "d MMM yyyy")}`;
  }
  return `${fmt(start, "d MMM yyyy")} – ${fmt(end, "d MMM yyyy")}`;
}

/** Moment în ora României → „10.10.2026, 14:05”. */
export function formatTimestamp(date: Date): string {
  return formatInTimeZone(date, APP_TIME_ZONE, "dd.MM.yyyy, HH:mm");
}

/** Luna și anul unei acumulări → „octombrie 2026”. */
export function formatMonthYear(month: number, year: number): string {
  return formatInTimeZone(new Date(Date.UTC(year, month - 1, 1)), "UTC", "LLLL yyyy", {
    locale: ro,
  });
}

/** „1 zi”, „5 zile”, „20 de zile” (în română „de” apare de la 20 în sus). */
export function pluralRo(count: number, one: string, many: string): string {
  if (count === 1) {
    return `1 ${one}`;
  }
  const lastTwo = Math.abs(count) % 100;
  const needsDe = Number.isInteger(count) && count !== 0 && (lastTwo === 0 || lastTwo >= 20);
  return `${formatDays(count)} ${needsDe ? "de " : ""}${many}`;
}

/**
 * Unitatea scrisă după un număr de zile afișat separat (ex. într-un element cu stil
 * propriu): „zi”, „zile” sau „de zile” („21 de zile”, dar „2,5 zile”).
 */
export function daysUnit(value: number): string {
  if (Math.abs(value) === 1) {
    return "zi";
  }
  const lastTwo = Math.abs(value) % 100;
  return Number.isInteger(value) && value !== 0 && (lastTwo === 0 || lastTwo >= 20) ? "de zile" : "zile";
}

/** Elimină diacriticele și majusculele, pentru căutare („Ștefan” găsește „stefan”). */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
