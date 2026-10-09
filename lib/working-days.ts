import { addDaysUTC, startOfDayUTC } from "@/lib/dates";
import { isWorkingDay } from "@/lib/holidays";

export function addWorkingDays(from: Date, workingDaysToAdd: number): Date {
  let current = startOfDayUTC(from);
  let added = 0;

  while (added < workingDaysToAdd) {
    current = addDaysUTC(current, 1);
    if (isWorkingDay(current)) {
      added += 1;
    }
  }

  return current;
}
