import { describe, expect, it } from "vitest";
import {
  adjustmentYears,
  approvedDaysFrom,
  computeExpiringDays,
  expiryDeadline,
  latestExpiredYear,
  nextExpiringYear,
  projectExpiringDays,
  openingBalanceYear,
  parseAdjustmentDetails,
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

describe("nextExpiringYear", () => {
  it("este anul de după ultimul an expirat", () => {
    expect(nextExpiringYear(new Date("2026-10-12T10:00:00Z"))).toBe(2025);
    expect(nextExpiringYear(new Date("2026-06-30T12:00:00Z"))).toBe(2024);
    // 1 iulie 00:30 în România este încă 30 iunie în UTC.
    expect(nextExpiringYear(new Date("2026-06-30T21:30:00Z"))).toBe(2025);
  });
});

describe("projectExpiringDays", () => {
  const user = {
    initialLeaveDays: 0,
    hireDate: new Date("2020-01-01T00:00:00Z"),
    createdAt: new Date("2020-01-01T00:00:00Z"),
  };
  const entitlements = userEntitlements(user, [...accrue(2025), ...accrue(2026, 9)]);

  it("zilele rămase din anul care expiră, peste cele câștigate în anii următori", () => {
    // 21 din 2025 + 15,75 din 2026, din care a luat 15: rămân 6 din 2025.
    expect(
      projectExpiringDays({
        year: 2025,
        availableDays: 21.75,
        entitlements,
        alreadyExpired: [],
        pendingLeaves: [],
        approvedLeaves: [],
      })
    ).toBe(6);
  });

  it("concediul planificat înainte de termen micșorează zilele care expiră", () => {
    expect(
      projectExpiringDays({
        year: 2025,
        availableDays: 21.75 - 4,
        entitlements,
        alreadyExpired: [],
        pendingLeaves: [leave("2027-06-28", 1)],
        approvedLeaves: [leave("2027-03-01", 4)],
      })
    ).toBe(1);
  });

  it("concediul care începe după termen nu salvează zilele", () => {
    expect(
      projectExpiringDays({
        year: 2025,
        availableDays: 21.75 - 5,
        entitlements,
        alreadyExpired: [],
        pendingLeaves: [leave("2027-07-01", 2)],
        approvedLeaves: [leave("2027-07-05", 5)],
      })
    ).toBe(6);
  });

  it("0 când soldul nu depășește zilele din anii următori", () => {
    expect(
      projectExpiringDays({
        year: 2025,
        availableDays: 10,
        entitlements,
        alreadyExpired: [],
        pendingLeaves: [],
        approvedLeaves: [],
      })
    ).toBe(0);
  });
});

describe("ajustările manuale de sold", () => {
  const hireDate = new Date("2023-01-01T00:00:00.000Z");
  const user = { initialLeaveDays: 0, hireDate, createdAt: new Date("2023-01-01T09:00:00Z") };
  const accruals = [...accrue(2024), ...accrue(2025), ...accrue(2026, 6)];
  const julyFirst2026 = { latestExpired: 2024, alreadyExpired: [], pendingLeaves: [], approvedLeaves: [] };

  it("anul se citește din jurnal; ajustările vechi, fără an, aparțin anului în care au fost făcute", () => {
    const createdAt = new Date("2026-03-10T10:00:00Z");
    expect(parseAdjustmentDetails({ delta: 3, year: 2025, reason: "x" }, createdAt)).toEqual({ year: 2025, days: 3 });
    expect(parseAdjustmentDetails({ delta: -2, reason: "x" }, createdAt)).toEqual({ year: 2026, days: -2 });
    // 31 decembrie 22:30 UTC este deja 1 ianuarie în România.
    expect(parseAdjustmentDetails({ delta: 1 }, new Date("2025-12-31T22:30:00Z"))).toEqual({ year: 2026, days: 1 });
    expect(parseAdjustmentDetails({ reason: "fără zile" }, createdAt)).toBeNull();
    expect(parseAdjustmentDetails(null, createdAt)).toBeNull();
  });

  it.each([
    ["2026-10-16T10:00:00Z", [2025, 2026]],
    ["2027-03-10T10:00:00Z", [2025, 2026, 2027]],
    ["2027-06-30T21:00:00Z", [2026, 2027]], // 1 iulie 2027, ora României: zilele din 2025 au expirat
  ])("la %s se pot ajusta zilele din %j", (now, years) => {
    expect(adjustmentYears(new Date(now))).toEqual(years);
  });

  it("zilele adăugate pentru 2026 nu expiră la 1 iulie 2026 ca zile din 2024", () => {
    // 21 de zile luate în august 2025 au consumat FIFO zilele din 2024; adminul adaugă 3 zile pentru 2026.
    const availableDays = 21 + 21 + 10.5 - 21 + 3;
    const withYear = planRollover({
      ...julyFirst2026,
      availableDays,
      entitlements: userEntitlements(user, accruals, [{ year: 2026, days: 3 }]),
    });
    expect(withYear).toEqual([
      { expiredYear: 2024, expiredDays: 0, availableDaysBefore: 34.5, availableDaysAfter: 34.5 },
    ]);

    // Fără anul ajustării (comportamentul vechi), cele 3 zile ar fi expirat.
    const withoutYear = planRollover({ ...julyFirst2026, availableDays, entitlements: userEntitlements(user, accruals) });
    expect(withoutYear[0].expiredDays).toBe(3);
  });

  it("o ajustare negativă scade zilele anului ei, nu pe cele mai vechi", () => {
    // Nimic luat; adminul scade 3 zile acordate din greșeală în 2026: toate cele 21 din 2024 expiră.
    const steps = planRollover({
      ...julyFirst2026,
      availableDays: 21 + 21 + 10.5 - 3,
      entitlements: userEntitlements(user, accruals, [{ year: 2026, days: -3 }]),
    });
    expect(steps[0]).toMatchObject({ expiredYear: 2024, expiredDays: 21 });
  });

  it("avertizarea din timp (projectExpiringDays) ține cont de anul ajustării", () => {
    const input = {
      year: 2024,
      availableDays: 21 + 21 + 10.5 - 21 + 3,
      alreadyExpired: [],
      pendingLeaves: [],
      approvedLeaves: [leave("2025-08-04", 21)],
    };
    expect(projectExpiringDays({ ...input, entitlements: userEntitlements(user, accruals, [{ year: 2026, days: 3 }]) })).toBe(0);
  });
});
