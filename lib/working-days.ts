import { addDays, startOfDay } from "date-fns";
import { isWorkingDay } from "@/lib/holidays";

export function addWorkingDays(from: Date, workingDaysToAdd: number): Date {
  let current = startOfDay(from);
  let added = 0;

  while (added < workingDaysToAdd) {
    current = addDays(current, 1);
    if (isWorkingDay(current)) {
      added += 1;
    }
  }

  return current;
}
