import { describe, expect, it } from "vitest";
import {
  approvedDaysFrom,
  computeExpiringDays,
  expiryDeadline,
  latestExpiredYear,
  openingBalanceYear,
  parseRolloverDetails,
  pendingDaysBefore,
  planRollover,
  userEntitlements,
  yearsToExpire,
  type LeaveDays,
  type RolloverStep,
  type YearlyDays,
} from "@/lib/leaves/rollover";

const MONTHLY = 1.75; // 21 de zile pe an

/** Rânduri LeaveAccrual: câte 1,75 zile pentru fiecare lună din `months`. */
function accrue(year: number, months = 12): YearlyDays[] {
  return Array.from({ length: months }, () => ({ year, days: MONTHLY }));
}

function leave(startDate: string, workingDays: number): LeaveDays {
  return { startDate: new Date(`${startDate}T00:00:00.000Z`), workingDays };
}

/** Rândurile de audit pe care le-ar scrie cronul pentru pașii dați. */
function auditRows(steps: RolloverStep[]): YearlyDays[] {
  return steps.map((step) => ({ year: step.expiredYear, days: step.expiredDays }));
}

describe("expiryDeadline și latestExpiredYear", () => {
  it("zilele din anul N expiră la 1 iulie N + 2, miezul nopții UTC", () => {
    expect(expiryDeadline(2024).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it.each([
    ["2026-06-30T20:59:59Z", 2023], // 23:59:59 pe 30 iunie, ora României
    ["2026-06-30T21:00:00Z", 2024], // 00:00 pe 1 iulie, ora României
    ["2026-07-01T03:00:00Z", 2024], // ora cronului din vercel.json
    ["2027-01-15T10:00:00Z", 2024],
    ["2027-06-30T20:59:59Z", 2024],
    ["2027-06-30T21:00:00Z", 2025],
    ["2027-07-01T03:00:00Z", 2025],
  ])("la %s ultimul an expirat este %i", (now, expected) => {
    expect(latestExpiredYear(new Date(now))).toBe(expected);
  });
});

describe("openingBalanceYear și userEntitlements", () => {
  it("soldul inițial aparține celui mai recent an dintre angajare și crearea contului", () => {
    const hireDate = new Date("2020-03-01T00:00:00.000Z");
    expect(openingBalanceYear(hireDate, new Date("2025-06-01T10:00:00Z"))).toBe(2025);
    // 31 decembrie 22:30 UTC este deja 1 ianuarie în România.
    expect(openingBalanceYear(hireDate, new Date("2025-12-31T22:30:00Z"))).toBe(2026);
    expect(
      openingBalanceYear(new Date("2027-01-04T00:00:00.000Z"), new Date("2026-11-20T10:00:00Z"))
    ).toBe(2027);
  });

  it("adaugă soldul inițial la rândurile de acumulare", () => {
    const user = {
      initialLeaveDays: 4,
      hireDate: new Date("2023-01-01T00:00:00.000Z"),
      createdAt: new Date("2024-02-01T09:00:00Z"),
    };
    expect(userEntitlements(user, [{ year: 2025, days: 21 }])).toEqual([
      { year: 2025, days: 21 },
      { year: 2024, days: 4 },
    ]);
  });
});

describe("parseRolloverDetails", () => {
  it("citește anul și zilele expirate", () => {
    expect(
      parseRolloverDetails({ expiredYear: 2024, expiredDays: 7.5, availableDaysBefore: 30 })
    ).toEqual({ year: 2024, days: 7.5 });
  });

  it("un rând fără zile valide contează ca 0 zile", () => {
    expect(parseRolloverDetails({ expiredYear: 2024 })).toEqual({ year: 2024, days: 0 });
    expect(parseRolloverDetails({ expiredYear: 2024, expiredDays: "3" })).toEqual({
      year: 2024,
      days: 0,
    });
    expect(parseRolloverDetails({ expiredYear: 2024, expiredDays: Number.NaN })).toEqual({
      year: 2024,
      days: 0,
    });
  });

  it.each([null, undefined, "2024", 2024, [2024], {}, { expiredYear: "2024" }, { expiredYear: 2024.5 }])(
    "respinge %j",
    (details) => {
      expect(parseRolloverDetails(details)).toBeNull();
    }
  );
});

describe("yearsToExpire", () => {
  it("anii cu zile, până la ultimul an expirat, fără cei deja procesați, crescător", () => {
    const entitlements = [...accrue(2025), ...accrue(2023), ...accrue(2024), { year: 2022, days: 0 }];
    expect(yearsToExpire(entitlements, [], 2024)).toEqual([2023, 2024]);
    expect(yearsToExpire(entitlements, [2023], 2024)).toEqual([2024]);
    expect(yearsToExpire(entitlements, [2023, 2024], 2024)).toEqual([]);
    expect(yearsToExpire(entitlements, [], 2022)).toEqual([]);
  });
});

describe("pendingDaysBefore și approvedDaysFrom", () => {
  const deadline = expiryDeadline(2024); // 2026-07-01
  const leaves = [leave("2026-06-30", 3), leave("2026-07-01", 5), leave("2026-09-07", 10)];

  it("în așteptare: doar cererile care încep înainte de termen", () => {
    expect(pendingDaysBefore(leaves, deadline)).toBe(3);
  });

  it("aprobate: cererile care încep la termen sau după", () => {
    expect(approvedDaysFrom(leaves, deadline)).toBe(15);
  });
});

describe("computeExpiringDays", () => {
  it("5 zile neefectuate din anul E, 21 câștigate în E + 1, sold 26 → expiră 5", () => {
    expect(
      computeExpiringDays({
        expiringYear: 2024,
        availableDays: 26,
        pendingDaysBeforeDeadline: 0,
        approvedDaysFromDeadline: 0,
        entitlements: [...accrue(2024), ...accrue(2025)],
        alreadyExpired: [],
      })
    ).toBe(5);
  });

  it("nu expiră mai mult decât s-a câștigat în anul respectiv", () => {
    expect(
      computeExpiringDays({
        expiringYear: 2024,
        availableDays: 60,
        pendingDaysBeforeDeadline: 0,
        approvedDaysFromDeadline: 0,
        entitlements: [{ year: 2024, days: 10 }, ...accrue(2025)],
        alreadyExpired: [],
      })
    ).toBe(10);
  });

  it("cererile în așteptare dinainte de termen contează ca efectuate", () => {
    expect(
      computeExpiringDays({
        expiringYear: 2024,
        availableDays: 26,
        pendingDaysBeforeDeadline: 4,
        approvedDaysFromDeadline: 0,
        entitlements: [...accrue(2024), ...accrue(2025)],
        alreadyExpired: [],
      })
    ).toBe(1);
  });

  it("nu coboară soldul curent sub 0", () => {
    expect(
      computeExpiringDays({
        expiringYear: 2024,
        availableDays: 2,
        pendingDaysBeforeDeadline: 0,
        approvedDaysFromDeadline: 30,
        entitlements: [...accrue(2024), ...accrue(2025)],
        alreadyExpired: [],
      })
    ).toBe(2);
    expect(
      computeExpiringDays({
        expiringYear: 2024,
        availableDays: -3,
        pendingDaysBeforeDeadline: 0,
        approvedDaysFromDeadline: 0,
        entitlements: accrue(2024),
        alreadyExpired: [],
      })
    ).toBe(0);
  });
});

describe("planRollover", () => {
  it("21 de zile pe an, fără concediu: pe 1 iulie 2026 expiră toate cele 21 din 2024", () => {
    const steps = planRollover({
      latestExpired: latestExpiredYear(new Date("2026-07-01T03:00:00Z")),
      availableDays: 52.5, // 21 (2024) + 21 (2025) + 10,5 (ianuarie–iunie 2026)
      entitlements: [...accrue(2024), ...accrue(2025), ...accrue(2026, 6)],
      alreadyExpired: [],
      pendingLeaves: [],
      approvedLeaves: [],
    });
    expect(steps).toEqual([
      { expiredYear: 2024, expiredDays: 21, availableDaysBefore: 52.5, availableDaysAfter: 31.5 },
    ]);
  });

  describe("rularea din 2026 ratată, recuperată pe 1 iulie 2027", () => {
    const entitlements = [...accrue(2024), ...accrue(2025), ...accrue(2026), ...accrue(2027, 6)];
    const latestExpired = latestExpiredYear(new Date("2027-07-01T03:00:00Z"));

    it("expiră în ordine 2024 = 21 și 2025 = 21: sold 73,5 → 31,5", () => {
      const steps = planRollover({
        latestExpired,
        availableDays: 73.5,
        entitlements,
        alreadyExpired: [],
        pendingLeaves: [],
        approvedLeaves: [],
      });
      expect(steps).toEqual([
        { expiredYear: 2024, expiredDays: 21, availableDaysBefore: 73.5, availableDaysAfter: 52.5 },
        { expiredYear: 2025, expiredDays: 21, availableDaysBefore: 52.5, availableDaysAfter: 31.5 },
      ]);
    });

    it("a doua rulare nu mai face nimic", () => {
      const first = planRollover({
        latestExpired,
        availableDays: 73.5,
        entitlements,
        alreadyExpired: [],
        pendingLeaves: [],
        approvedLeaves: [],
      });
      const second = planRollover({
        latestExpired,
        availableDays: first[first.length - 1].availableDaysAfter,
        entitlements,
        alreadyExpired: auditRows(first),
        pendingLeaves: [],
        approvedLeaves: [],
      });
      expect(second).toEqual([]);
    });

    it("cu 30 de zile aprobate în septembrie 2026: 2024 expiră 21, 2025 expiră 0, rămân 22,5", () => {
      // Concediul din septembrie 2026 a început după termenul zilelor din 2024, deci a
      // consumat zilele din 2025 (și 9 din 2026), nu pe cele din 2024, care expiraseră.
      const steps = planRollover({
        latestExpired,
        availableDays: 73.5 - 30,
        entitlements,
        alreadyExpired: [],
        pendingLeaves: [],
        approvedLeaves: [leave("2026-09-07", 30)],
      });
      expect(steps.map((step) => [step.expiredYear, step.expiredDays])).toEqual([
        [2024, 21],
        [2025, 0],
      ]);
      expect(steps[steps.length - 1].availableDaysAfter).toBe(22.5);
    });
  });

  it("toate zilele vechi folosite înainte de termen: nu expiră nimic", () => {
    // 25 de zile luate în 2025, înainte de 1 iulie 2026: au consumat cele 21 din 2024.
    const steps = planRollover({
      latestExpired: 2024,
      availableDays: 52.5 - 25,
      entitlements: [...accrue(2024), ...accrue(2025), ...accrue(2026, 6)],
      alreadyExpired: [],
      pendingLeaves: [],
      approvedLeaves: [],
    });
    expect(steps).toEqual([
      { expiredYear: 2024, expiredDays: 0, availableDaysBefore: 27.5, availableDaysAfter: 27.5 },
    ]);
  });

  it("concediul în așteptare dinainte de termen nu lasă zilele să expire", () => {
    const steps = planRollover({
      latestExpired: 2024,
      availableDays: 52.5,
      entitlements: [...accrue(2024), ...accrue(2025), ...accrue(2026, 6)],
      alreadyExpired: [],
      pendingLeaves: [leave("2026-06-22", 5)],
      approvedLeaves: [],
    });
    expect(steps[0].expiredDays).toBe(16);
    expect(steps[0].availableDaysAfter).toBe(36.5);
  });

  it("soldul inițial expiră în anul atribuit lui", () => {
    const user = {
      initialLeaveDays: 8,
      hireDate: new Date("2019-05-01T00:00:00.000Z"),
      createdAt: new Date("2024-03-10T08:00:00Z"),
    };
    const entitlements = userEntitlements(user, [...accrue(2024, 9), ...accrue(2025), ...accrue(2026, 6)]);
    const steps = planRollover({
      latestExpired: 2024,
      availableDays: 8 + 15.75 + 21 + 10.5,
      entitlements,
      alreadyExpired: [],
      pendingLeaves: [],
      approvedLeaves: [],
    });
    expect(steps).toEqual([
      { expiredYear: 2024, expiredDays: 23.75, availableDaysBefore: 55.25, availableDaysAfter: 31.5 },
    ]);
  });

  it("fără zile câștigate nu este nimic de expirat", () => {
    expect(
      planRollover({
        latestExpired: 2024,
        availableDays: 0,
        entitlements: [],
        alreadyExpired: [],
        pendingLeaves: [],
        approvedLeaves: [],
      })
    ).toEqual([]);
  });
});
