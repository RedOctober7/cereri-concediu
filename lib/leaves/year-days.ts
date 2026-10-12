import { utcDate } from "@/lib/dates";
import { calculateWorkingDays } from "@/lib/holidays";

type Leave = { startDate: Date; endDate: Date; workingDays: number };

/** Condiția Prisma pentru cererile care ating anul `year` (inclusiv peste Revelion). */
export function overlapsYear(year: number) {
  return { startDate: { lte: utcDate(year, 11, 31) }, endDate: { gte: utcDate(year, 0, 1) } };
}

/**
 * Zilele lucrătoare ale unei cereri care cad în anul `year`. O cerere care nu trece
 * peste Revelion contează cu valoarea salvată (cea scăzută din sold); una care trece
 * se împarte între ani după zilele lucrătoare din fiecare.
 */
export function workingDaysInYear(leave: Leave, year: number): number {
  const yearStart = utcDate(year, 0, 1);
  const yearEnd = utcDate(year, 11, 31);
  if (leave.endDate < yearStart || leave.startDate > yearEnd) {
    return 0;
  }
  if (leave.startDate >= yearStart && leave.endDate <= yearEnd) {
    return leave.workingDays;
  }
  const from = leave.startDate > yearStart ? leave.startDate : yearStart;
  const to = leave.endDate < yearEnd ? leave.endDate : yearEnd;
  return calculateWorkingDays(from, to);
}
