import { describe, expect, it } from "vitest";
import { parseDateOnly, toDateOnlyString } from "@/lib/dates";
import { addWorkingDays } from "@/lib/working-days";

function day(value: string): Date {
  const date = parseDateOnly(value);
  if (!date) {
    throw new Error(`Dată invalidă în test: ${value}`);
  }
  return date;
}

describe("addWorkingDays", () => {
  it.each([
    ["vineri + 1 = luni", "2026-10-09", 1, "2026-10-12"],
    ["luni + 5 = luni următoare", "2026-10-12", 5, "2026-10-19"],
    ["peste Crăciun și weekend", "2026-12-24", 1, "2026-12-28"],
    ["peste Vinerea Mare și a doua zi de Paște", "2026-04-09", 1, "2026-04-14"],
    ["peste Anul Nou, Bobotează și Sf. Ioan", "2026-12-31", 3, "2027-01-08"],
    ["pornind dintr-o zi de weekend", "2026-10-10", 1, "2026-10-12"],
  ])("%s", (_label, from, days, expected) => {
    expect(toDateOnlyString(addWorkingDays(day(from), days))).toBe(expected);
  });

  it("0 sau un număr negativ întoarce aceeași zi", () => {
    expect(toDateOnlyString(addWorkingDays(day("2026-10-14"), 0))).toBe("2026-10-14");
    expect(toDateOnlyString(addWorkingDays(day("2026-10-14"), -3))).toBe("2026-10-14");
  });

  it("ignoră ora din data de pornire", () => {
    const result = addWorkingDays(new Date("2026-10-09T18:45:00Z"), 1);
    expect(result.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("limitează valorile foarte mari la 366 de zile lucrătoare", () => {
    const from = day("2026-01-05");
    expect(addWorkingDays(from, 100_000).getTime()).toBe(addWorkingDays(from, 366).getTime());
    expect(addWorkingDays(from, 366).getTime()).toBeGreaterThan(addWorkingDays(from, 365).getTime());
  });
});
