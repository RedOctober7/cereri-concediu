import { formatInTimeZone } from "date-fns-tz";
import { ro } from "date-fns/locale";
import { APP_TIME_ZONE } from "@/lib/dates";

// Formatări folosite de paginile de admin (panou și cereri). Zilele calendaristice
// sunt Date la miezul nopții UTC (lib/dates.ts), deci se formatează în UTC; momentele
// (createdAt, approvedAt) se formatează în ora României.

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

/** Număr de zile (sold) în format românesc: „12,5”, „-2”. */
export function formatDays(value: number): string {
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(value);
}

/** „1 zi”, „5 zile”, „20 de zile” (în română „de” apare de la 20 în sus). */
export function pluralRo(count: number, one: string, many: string): string {
  if (count === 1) {
    return `1 ${one}`;
  }
  const lastTwo = Math.abs(count) % 100;
  const needsDe = count !== 0 && (lastTwo === 0 || lastTwo >= 20);
  return `${count} ${needsDe ? "de " : ""}${many}`;
}
