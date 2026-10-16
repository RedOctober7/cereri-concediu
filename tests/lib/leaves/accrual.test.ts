import { describe, expect, it } from "vitest";
import { inactivePeriods, monthsToAccrue, type AccrualMonth } from "@/lib/leaves/accrual";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function months(year: number, from: number, to: number): AccrualMonth[] {
  return Array.from({ length: to - from + 1 }, (_, index) => ({ year, month: from + index }));
}

// Angajat din 2020, cont creat în aplicație în ianuarie 2025.
const veteran = { hireDate: day("2020-03-01"), createdAt: new Date("2025-01-15T09:00:00Z") };

describe("monthsToAccrue", () => {
  it("la o rulare normală acumulează doar luna încheiată", () => {
    const now = new Date("2026-09-01T02:00:00Z"); // 1 septembrie, 05:00 în România
    expect(monthsToAccrue({ ...veteran, accrued: [...months(2025, 1, 12), ...months(2026, 1, 7)], now })).toEqual([
      { year: 2026, month: 8 },
    ]);
  });

  it("o lună ratată (cron eșuat pe 1 septembrie) se recuperează la rularea următoare", () => {
    const now = new Date("2026-10-01T02:00:00Z");
    expect(monthsToAccrue({ ...veteran, accrued: [...months(2025, 1, 12), ...months(2026, 1, 7)], now })).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });

  it("o rulare repetată nu mai are nimic de făcut", () => {
    const now = new Date("2026-10-01T02:00:00Z");
    expect(monthsToAccrue({ ...veteran, accrued: [...months(2025, 1, 12), ...months(2026, 1, 9)], now })).toEqual([]);
  });

  it("un cont nou începe cu luna în care a fost creat: soldul inițial acoperă lunile de dinainte", () => {
    const account = { hireDate: day("2020-03-01"), createdAt: new Date("2026-10-20T08:00:00Z") };
    expect(monthsToAccrue({ ...account, accrued: [], now: new Date("2026-10-25T10:00:00Z") })).toEqual([]);
    expect(monthsToAccrue({ ...account, accrued: [], now: new Date("2026-11-01T02:00:00Z") })).toEqual([
      { year: 2026, month: 10 },
    ]);
  });

  it("o lună contează doar dacă angajatul lucra înainte de 15", () => {
    const hiredLate = { hireDate: day("2026-10-20"), createdAt: new Date("2026-10-20T08:00:00Z") };
    expect(monthsToAccrue({ ...hiredLate, accrued: [], now: new Date("2026-11-01T02:00:00Z") })).toEqual([]);
    expect(monthsToAccrue({ ...hiredLate, accrued: [], now: new Date("2026-12-01T02:00:00Z") })).toEqual([
      { year: 2026, month: 11 },
    ]);
  });

  it("trece corect peste Revelion, după ora României", () => {
    // 31 decembrie 22:30 UTC este deja 1 ianuarie 2027 în România.
    const now = new Date("2026-12-31T22:30:00Z");
    expect(monthsToAccrue({ ...veteran, accrued: [...months(2025, 1, 12), ...months(2026, 1, 11)], now })).toEqual([
      { year: 2026, month: 12 },
    ]);
  });

  it("nu inventează istoric înaintea primei luni acumulate (ex. datele demo)", () => {
    const now = new Date("2026-10-16T10:00:00Z");
    // Cont creat în ianuarie 2025, dar acumulat doar din ianuarie 2026: 2025 nu se completează.
    expect(monthsToAccrue({ ...veteran, accrued: months(2026, 1, 9), now })).toEqual([]);
  });

  it("nu adaugă luni din ani ale căror zile au expirat deja", () => {
    const old = { hireDate: day("2020-03-01"), createdAt: new Date("2023-01-10T09:00:00Z") };
    const accrued = [...months(2023, 1, 4), ...months(2023, 6, 12), ...months(2024, 1, 12), ...months(2025, 1, 12), ...months(2026, 1, 9)];
    // În octombrie 2026 au expirat zilele din 2024 și dinainte: golul din mai 2023 rămâne.
    expect(monthsToAccrue({ ...old, accrued, now: new Date("2026-10-16T10:00:00Z") })).toEqual([]);
  });

  it("un cont reactivat nu primește lunile în care a fost dezactivat", () => {
    // Acumulat ianuarie–februarie, dezactivat pe 10 martie, reactivat pe 20 septembrie.
    const inactive = inactivePeriods([
      { at: new Date("2026-03-10T09:00:00Z"), active: false },
      { at: new Date("2026-09-20T09:00:00Z"), active: true },
    ]);
    expect(
      monthsToAccrue({ ...veteran, accrued: months(2026, 1, 2), inactive, now: new Date("2026-10-01T02:00:00Z") })
    ).toEqual([{ year: 2026, month: 9 }]);
    // Cont creat inactiv în 2025, niciodată acumulat, activat în octombrie 2026.
    const old = { hireDate: day("2020-03-01"), createdAt: new Date("2025-02-20T09:00:00Z") };
    expect(
      monthsToAccrue({
        ...old,
        accrued: [],
        inactive: inactivePeriods([{ at: new Date("2026-10-05T09:00:00Z"), active: true }]),
        now: new Date("2026-11-01T02:00:00Z"),
      })
    ).toEqual([{ year: 2026, month: 10 }]);
  });

  it("o lună ratată înainte de dezactivare se recuperează după reactivare", () => {
    // August ratat (cron eșuat pe 1 septembrie), apoi dezactivat 10–20 septembrie.
    const inactive = inactivePeriods([
      { at: new Date("2026-09-10T09:00:00Z"), active: false },
      { at: new Date("2026-09-20T09:00:00Z"), active: true },
    ]);
    expect(
      monthsToAccrue({ ...veteran, accrued: [...months(2025, 1, 12), ...months(2026, 1, 7)], inactive, now: new Date("2026-10-01T02:00:00Z") })
    ).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });

  it("sare doar lunile la a căror încheiere contul era dezactivat", () => {
    // Iunie ratat; dezactivat pe 15 iulie, reactivat pe 20 septembrie.
    const inactive = inactivePeriods([
      { at: new Date("2026-07-15T09:00:00Z"), active: false },
      { at: new Date("2026-09-20T09:00:00Z"), active: true },
    ]);
    expect(
      monthsToAccrue({ ...veteran, accrued: [...months(2025, 1, 12), ...months(2026, 1, 5)], inactive, now: new Date("2026-10-01T02:00:00Z") })
    ).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 9 },
    ]);
    // Dezactivat pe 31 august la 23:30 în România (20:30 UTC): pe 1 septembrie contul era inactiv.
    const lateAugust = inactivePeriods([
      { at: new Date("2026-08-31T20:30:00Z"), active: false },
      { at: new Date("2026-09-02T09:00:00Z"), active: true },
    ]);
    expect(
      monthsToAccrue({ ...veteran, accrued: [...months(2025, 1, 12), ...months(2026, 1, 7)], inactive: lateAugust, now: new Date("2026-10-01T02:00:00Z") })
    ).toEqual([{ year: 2026, month: 9 }]);
  });
});

describe("inactivePeriods", () => {
  const at = (iso: string) => new Date(iso);

  it("perechi dezactivare → reactivare, în ordinea din timp", () => {
    expect(
      inactivePeriods([
        { at: at("2026-09-20T09:00:00Z"), active: true },
        { at: at("2026-03-10T09:00:00Z"), active: false },
        { at: at("2026-05-01T09:00:00Z"), active: true },
        { at: at("2026-07-01T09:00:00Z"), active: false },
      ])
    ).toEqual([
      { from: at("2026-03-10T09:00:00Z"), to: at("2026-05-01T09:00:00Z") },
      { from: at("2026-07-01T09:00:00Z"), to: at("2026-09-20T09:00:00Z") },
    ]);
  });

  it("lipsește dezactivarea dintre două reactivări: perioada începe de la reactivarea precedentă", () => {
    expect(
      inactivePeriods([
        { at: at("2026-03-10T09:00:00Z"), active: false },
        { at: at("2026-05-01T09:00:00Z"), active: true },
        { at: at("2026-09-20T09:00:00Z"), active: true },
      ])
    ).toEqual([
      { from: at("2026-03-10T09:00:00Z"), to: at("2026-05-01T09:00:00Z") },
      { from: at("2026-05-01T09:00:00Z"), to: at("2026-09-20T09:00:00Z") },
    ]);
  });

  it("o reactivare fără dezactivare înainte acoperă tot de la creare", () => {
    expect(inactivePeriods([{ at: at("2026-10-05T09:00:00Z"), active: true }])).toEqual([
      { from: null, to: at("2026-10-05T09:00:00Z") },
    ]);
  });

  it("o dezactivare fără reactivare se ignoră (contul e activ acum)", () => {
    expect(inactivePeriods([{ at: at("2026-03-10T09:00:00Z"), active: false }])).toEqual([]);
    expect(inactivePeriods([])).toEqual([]);
  });
});
