import { addDaysUTC, startOfDayUTC } from "@/lib/dates";
import { isWorkingDay } from "@/lib/holidays";

/** Limită pentru bucla de mai jos: config-ul regulilor vine din baza de date. */
const MAX_WORKING_DAYS_TO_ADD = 366;

export function addWorkingDays(from: Date, workingDaysToAdd: number): Date {
  const target = Math.min(
    Math.max(workingDaysToAdd, 0),
    MAX_WORKING_DAYS_TO_ADD
  );
  let current = startOfDayUTC(from);
  let added = 0;

  while (added < target) {
    current = addDaysUTC(current, 1);
    if (isWorkingDay(current)) {
      added += 1;
    }
  }

  return current;
}
