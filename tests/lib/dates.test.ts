import { describe, expect, it } from "vitest";
import {
  addDaysUTC,
  addYearsUTC,
  parseDateInput,
  parseDateOnly,
  startOfDayUTC,
  toDateOnlyString,
  todayInBucharest,
  utcDate,
} from "@/lib/dates";

const iso = (date: Date | null) => (date ? date.toISOString() : null);

describe("utcDate", () => {
  it("construiește ziua la miezul nopții UTC", () => {
    expect(iso(utcDate(2026, 9, 10))).toBe("2026-10-10T00:00:00.000Z");
  });

  it("normalizează depășirile de zi și lună", () => {
    expect(toDateOnlyString(utcDate(2026, 0, 32))).toBe("2026-02-01");
    expect(toDateOnlyString(utcDate(2026, 12, 1))).toBe("2027-01-01");
    expect(toDateOnlyString(utcDate(2026, 2, 0))).toBe("2026-02-28");
  });

  it("nu mută anii mici în secolul XX", () => {
    expect(utcDate(99, 0, 1).getUTCFullYear()).toBe(99);
  });
});

describe("parseDateOnly", () => {
  it("acceptă yyyy-MM-dd valid", () => {
    expect(iso(parseDateOnly("2026-10-10"))).toBe("2026-10-10T00:00:00.000Z");
    expect(iso(parseDateOnly("2024-02-29"))).toBe("2024-02-29T00:00:00.000Z");
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-1-01",
    " 2026-01-01",
    "2026-01-01T00:00:00Z",
    "01.10.2026",
    "",
  ])("respinge %j", (value) => {
    expect(parseDateOnly(value)).toBeNull();
  });
});

describe("parseDateInput", () => {
  it("acceptă yyyy-MM-dd, inclusiv cu spații în jur", () => {
    expect(iso(parseDateInput(" 2026-10-10 "))).toBe("2026-10-10T00:00:00.000Z");
  });

  it.each([
    // Iarna România este UTC+2, vara UTC+3.
    ["2026-03-28T22:30:00Z", "2026-03-29"],
    ["2026-03-28T21:59:59Z", "2026-03-28"],
    ["2026-07-01T20:59:59Z", "2026-07-01"],
    ["2026-07-01T21:00:00.000Z", "2026-07-02"],
    ["2026-12-31T22:00:00Z", "2027-01-01"],
    ["2026-10-10T23:30:00+02:00", "2026-10-11"],
    ["2026-10-10T00:30:00+03:00", "2026-10-10"],
  ])("convertește timestamp-ul %s la ziua din București %s", (value, expected) => {
    const parsed = parseDateInput(value);
    expect(parsed).not.toBeNull();
    expect(toDateOnlyString(parsed!)).toBe(expected);
    expect(parsed!.getUTCHours()).toBe(0);
  });

  it.each([
    "2026-02-30T10:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T10:60:00Z",
    "2026-01-01T10:00:00",
    "2026-01-01T10:00:00+24:00",
    "mâine",
  ])("respinge %j", (value) => {
    expect(parseDateInput(value)).toBeNull();
  });
});

describe("toDateOnlyString și startOfDayUTC", () => {
  it("folosesc câmpurile UTC", () => {
    const lateEvening = new Date("2026-10-10T23:59:59.999Z");
    expect(toDateOnlyString(lateEvening)).toBe("2026-10-10");
    expect(iso(startOfDayUTC(lateEvening))).toBe("2026-10-10T00:00:00.000Z");
  });

  it("completează anul, luna și ziua cu zerouri", () => {
    expect(toDateOnlyString(utcDate(987, 0, 5))).toBe("0987-01-05");
  });
});

describe("todayInBucharest", () => {
  it.each([
    ["2026-10-10T20:59:59Z", "2026-10-10"],
    ["2026-10-10T21:00:00Z", "2026-10-11"],
    ["2026-12-31T21:59:59Z", "2026-12-31"],
    ["2026-12-31T22:00:00Z", "2027-01-01"],
    // Trecerea la ora de iarnă: 25 octombrie 2026, 04:00 ora României = 01:00 UTC.
    ["2026-10-25T21:59:00Z", "2026-10-25"],
    ["2026-10-25T22:00:00Z", "2026-10-26"],
  ])("la %s este %s", (now, expected) => {
    const today = todayInBucharest(new Date(now));
    expect(iso(today)).toBe(`${expected}T00:00:00.000Z`);
  });
});

describe("addDaysUTC și addYearsUTC", () => {
  it("adaugă zile exacte și peste schimbările de oră", () => {
    expect(toDateOnlyString(addDaysUTC(utcDate(2026, 2, 28), 1))).toBe("2026-03-29");
    expect(toDateOnlyString(addDaysUTC(utcDate(2026, 9, 24), 2))).toBe("2026-10-26");
    expect(toDateOnlyString(addDaysUTC(utcDate(2026, 0, 1), -1))).toBe("2025-12-31");
    expect(addDaysUTC(utcDate(2026, 9, 24), 2).getUTCHours()).toBe(0);
  });

  it("29 februarie devine 28 februarie în anii nebisecți", () => {
    const leapDay = utcDate(2024, 1, 29);
    expect(toDateOnlyString(addYearsUTC(leapDay, 1))).toBe("2025-02-28");
    expect(toDateOnlyString(addYearsUTC(leapDay, -1))).toBe("2023-02-28");
    expect(toDateOnlyString(addYearsUTC(leapDay, 4))).toBe("2028-02-29");
  });

  it("păstrează ziua în rest", () => {
    expect(toDateOnlyString(addYearsUTC(utcDate(2026, 9, 10), 2))).toBe("2028-10-10");
  });
});
