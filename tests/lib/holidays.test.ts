import { describe, expect, it } from "vitest";
import { parseDateOnly, toDateOnlyString } from "@/lib/dates";
import {
  calculateWorkingDays,
  datesOverlap,
  eachDayInRange,
  getHolidayName,
  getOrthodoxEasterSunday,
  getRomanianHolidays,
  intervalIntersectsMonth,
  isHoliday,
  isSameDay,
  isWeekend,
  isWorkingDay,
} from "@/lib/holidays";

/** Zi calendaristică din 'yyyy-MM-dd' (miezul nopții UTC). */
function day(value: string): Date {
  const date = parseDateOnly(value);
  if (!date) {
    throw new Error(`Dată invalidă în test: ${value}`);
  }
  return date;
}

describe("getOrthodoxEasterSunday", () => {
  it.each([
    [2024, "2024-05-05"],
    [2025, "2025-04-20"],
    [2026, "2026-04-12"],
    [2027, "2027-05-02"],
  ])("Paștele ortodox %i este %s", (year, expected) => {
    const easter = getOrthodoxEasterSunday(year);
    expect(toDateOnlyString(easter)).toBe(expected);
    expect(easter.getUTCDay()).toBe(0);
    expect(easter.getUTCHours()).toBe(0);
  });
});

describe("sărbătorile mobile", () => {
  it.each([
    // [an, Vinerea Mare, Paștele, a doua zi de Paște, Rusalii, a doua zi de Rusalii]
    [2024, "2024-05-03", "2024-05-05", "2024-05-06", "2024-06-23", "2024-06-24"],
    [2025, "2025-04-18", "2025-04-20", "2025-04-21", "2025-06-08", "2025-06-09"],
    [2026, "2026-04-10", "2026-04-12", "2026-04-13", "2026-05-31", "2026-06-01"],
    [2027, "2027-04-30", "2027-05-02", "2027-05-03", "2027-06-20", "2027-06-21"],
  ])("%i", (_year, goodFriday, easter, easterMonday, pentecost, pentecostMonday) => {
    expect(getHolidayName(day(goodFriday))).toBe("Vinerea Mare");
    expect(getHolidayName(day(easter))).toBe("Paștele");
    expect(getHolidayName(day(easterMonday))).toContain("A doua zi de Paște");
    expect(getHolidayName(day(pentecost))).toBe("Rusalii");
    expect(getHolidayName(day(pentecostMonday))).toContain("A doua zi de Rusalii");
  });

  it("combină numele când două sărbători cad în aceeași zi", () => {
    // 1 iunie 2026: Ziua Copilului și a doua zi de Rusalii.
    expect(getHolidayName(day("2026-06-01"))).toBe("Ziua Copilului / A doua zi de Rusalii");
    expect(getRomanianHolidays(2026)).toHaveLength(16);
  });
});

describe("sărbătorile fixe", () => {
  it("6 și 7 ianuarie sunt libere doar din 2024", () => {
    expect(isHoliday(day("2023-01-06"))).toBe(false);
    expect(isHoliday(day("2023-01-07"))).toBe(false);
    expect(getHolidayName(day("2024-01-06"))).toBe("Boboteaza");
    expect(getHolidayName(day("2024-01-07"))).toBe("Sfântul Ioan Botezătorul");
    expect(isHoliday(day("2027-01-06"))).toBe(true);
  });

  it.each([
    ["2026-01-01", "Anul Nou"],
    ["2026-01-02", "A doua zi de Anul Nou"],
    ["2026-01-24", "Ziua Unirii Principatelor Române"],
    ["2026-05-01", "Ziua Muncii"],
    ["2026-08-15", "Adormirea Maicii Domnului"],
    ["2026-11-30", "Sfântul Andrei"],
    ["2026-12-01", "Ziua Națională a României"],
    ["2026-12-25", "Crăciunul"],
    ["2026-12-26", "A doua zi de Crăciun"],
  ])("%s este %s", (date, name) => {
    expect(getHolidayName(day(date))).toBe(name);
  });

  it("numără sărbătorile pe an", () => {
    // 10 fixe + 5 mobile înainte de 2024; 12 fixe + 5 mobile după.
    expect(getRomanianHolidays(2023)).toHaveLength(15);
    expect(getRomanianHolidays(2024)).toHaveLength(17);
    expect(getRomanianHolidays(2025)).toHaveLength(17);
  });

  it("întoarce copii, nu datele din cache", () => {
    const [first] = getRomanianHolidays(2026);
    first.setUTCFullYear(1999);
    expect(isHoliday(day("2026-01-01"))).toBe(true);
    expect(getRomanianHolidays(2026).every((date) => date.getUTCFullYear() === 2026)).toBe(true);
  });

  it("o zi obișnuită nu este sărbătoare", () => {
    expect(getHolidayName(day("2026-10-14"))).toBeUndefined();
  });
});

describe("isWeekend și isWorkingDay", () => {
  it("după ziua UTC", () => {
    expect(isWeekend(day("2026-10-10"))).toBe(true); // sâmbătă
    expect(isWeekend(day("2026-10-11"))).toBe(true); // duminică
    expect(isWeekend(day("2026-10-12"))).toBe(false); // luni
    expect(isWorkingDay(day("2026-10-12"))).toBe(true);
    expect(isWorkingDay(day("2026-12-01"))).toBe(false); // marți, sărbătoare
    expect(isWorkingDay(day("2026-10-10"))).toBe(false);
  });
});

describe("calculateWorkingDays", () => {
  it.each([
    ["o săptămână obișnuită", "2026-10-12", "2026-10-16", 5],
    ["vineri–luni peste weekend", "2026-10-09", "2026-10-12", 2],
    ["doar weekend", "2026-10-10", "2026-10-11", 0],
    ["o singură zi lucrătoare", "2026-10-14", "2026-10-14", 1],
    ["săptămâna Paștelui 2026 (Vinerea Mare, a doua zi de Paște)", "2026-04-06", "2026-04-17", 8],
    ["Sfântul Andrei și Ziua Națională", "2026-11-30", "2026-12-04", 3],
    ["Crăciunul 2026", "2026-12-21", "2026-12-31", 8],
    ["peste Anul Nou și Bobotează", "2026-12-28", "2027-01-08", 7],
    ["Rusalii și Ziua Copilului 2026", "2026-05-25", "2026-06-05", 9],
  ])("%s: %s – %s = %i", (_label, start, end, expected) => {
    expect(calculateWorkingDays(day(start), day(end))).toBe(expected);
  });

  it("întoarce 0 când începutul este după sfârșit", () => {
    expect(calculateWorkingDays(day("2026-10-16"), day("2026-10-12"))).toBe(0);
  });

  it("ignoră ora din datele primite", () => {
    expect(
      calculateWorkingDays(new Date("2026-10-12T15:00:00Z"), new Date("2026-10-13T01:00:00Z"))
    ).toBe(2);
  });
});

describe("eachDayInRange, intervalIntersectsMonth, datesOverlap, isSameDay", () => {
  it("eachDayInRange include capetele", () => {
    expect(eachDayInRange(day("2026-02-27"), day("2026-03-02")).map(toDateOnlyString)).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
    expect(eachDayInRange(day("2026-03-02"), day("2026-03-01"))).toEqual([]);
  });

  it("intervalIntersectsMonth vede și intervalele peste an", () => {
    const start = day("2026-12-28");
    const end = day("2027-01-03");
    expect(intervalIntersectsMonth(start, end, 12)).toBe(true);
    expect(intervalIntersectsMonth(start, end, 1)).toBe(true);
    expect(intervalIntersectsMonth(start, end, 2)).toBe(false);
    expect(intervalIntersectsMonth(day("2026-07-31"), day("2026-08-01"), 8)).toBe(true);
    expect(intervalIntersectsMonth(day("2026-07-01"), day("2026-07-31"), 8)).toBe(false);
  });

  it("datesOverlap include capetele comune", () => {
    expect(
      datesOverlap(day("2026-10-12"), day("2026-10-16"), day("2026-10-16"), day("2026-10-20"))
    ).toBe(true);
    expect(
      datesOverlap(day("2026-10-12"), day("2026-10-15"), day("2026-10-16"), day("2026-10-20"))
    ).toBe(false);
  });

  it("isSameDay compară ziua UTC", () => {
    expect(isSameDay(new Date("2026-10-10T00:00:00Z"), new Date("2026-10-10T23:59:59Z"))).toBe(
      true
    );
    expect(isSameDay(day("2026-10-10"), day("2026-10-11"))).toBe(false);
  });
});
