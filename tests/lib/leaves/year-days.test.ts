import { describe, expect, it } from "vitest";
import { workingDaysInYear } from "@/lib/leaves/year-days";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("workingDaysInYear", () => {
  // 28 dec. 2026 – 8 ian. 2027: 4 zile în 2026; în 2027 1, 6 și 7 ianuarie sunt sărbători.
  const newYearLeave = { startDate: day("2026-12-28"), endDate: day("2027-01-08"), workingDays: 7 };

  it("împarte o cerere peste Revelion între ani", () => {
    expect(workingDaysInYear(newYearLeave, 2026)).toBe(4);
    expect(workingDaysInYear(newYearLeave, 2027)).toBe(3);
  });

  it("o cerere din același an contează cu valoarea salvată", () => {
    const leave = { startDate: day("2026-10-19"), endDate: day("2026-10-23"), workingDays: 5 };
    expect(workingDaysInYear(leave, 2026)).toBe(5);
  });

  it("0 pentru o cerere din alt an", () => {
    expect(workingDaysInYear(newYearLeave, 2025)).toBe(0);
    expect(workingDaysInYear(newYearLeave, 2028)).toBe(0);
  });
});
