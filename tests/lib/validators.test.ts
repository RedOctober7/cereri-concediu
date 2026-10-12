import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leaveCreateSchema, leaveValidateQuerySchema } from "@/lib/validators";

// „Azi” în România: sâmbătă, 10 octombrie 2026 (ora 12:00).
const NOW = new Date("2026-10-10T09:00:00Z");

function issues(result: ReturnType<typeof leaveCreateSchema.safeParse>) {
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

describe.each([
  ["leaveCreateSchema", leaveCreateSchema],
  ["leaveValidateQuerySchema", leaveValidateQuerySchema],
])("%s", (_name, schema) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transformă datele în zile la miezul nopții UTC", () => {
    const result = schema.safeParse({ startDate: "2026-10-12", endDate: "2026-10-16" });
    expect(result.success).toBe(true);
    expect(result.data?.startDate.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(result.data?.endDate.toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });

  it("acceptă timestamp-uri ISO de la clienți vechi, ca zi din București", () => {
    const result = schema.safeParse({
      startDate: "2026-10-11T21:30:00.000Z",
      endDate: "2026-10-16T08:00:00.000Z",
    });
    expect(result.data?.startDate.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("acceptă o singură zi", () => {
    expect(schema.safeParse({ startDate: "2026-10-12", endDate: "2026-10-12" }).success).toBe(true);
  });

  it.each([
    [{ startDate: "2026-02-30", endDate: "2026-10-16" }, "startDate", "Data de început este invalidă."],
    [{ startDate: "2026-10-12", endDate: "16.10.2026" }, "endDate", "Data de sfârșit este invalidă."],
    [{ startDate: 20261012, endDate: "2026-10-16" }, "startDate", "Data de început este invalidă."],
    [{ endDate: "2026-10-16" }, "startDate", "Data de început este invalidă."],
  ])("respinge date invalide: %j", (input, path, message) => {
    expect(issues(schema.safeParse(input))).toContainEqual({ path, message });
  });

  it("respinge sfârșitul înaintea începutului", () => {
    expect(issues(schema.safeParse({ startDate: "2026-10-16", endDate: "2026-10-12" }))).toEqual([
      { path: "endDate", message: "Data de sfârșit nu poate fi înaintea datei de început." },
    ]);
  });

  it("acceptă exact un an, respinge mai mult", () => {
    expect(schema.safeParse({ startDate: "2026-11-02", endDate: "2027-11-02" }).success).toBe(true);
    expect(issues(schema.safeParse({ startDate: "2026-11-02", endDate: "2027-11-03" }))).toEqual([
      { path: "endDate", message: "Perioada selectată nu poate depăși un an." },
    ]);
  });

  it("respinge perioadele prea departe în trecut sau în viitor", () => {
    const tooFar = {
      path: "startDate",
      message: "Perioada selectată este prea departe în trecut sau în viitor.",
    };
    // Cel mult un an în urmă (10 octombrie 2025) și doi ani înainte (10 octombrie 2028).
    expect(schema.safeParse({ startDate: "2025-10-10", endDate: "2025-10-14" }).success).toBe(true);
    expect(issues(schema.safeParse({ startDate: "2025-10-09", endDate: "2025-10-14" }))).toEqual([
      tooFar,
    ]);
    expect(schema.safeParse({ startDate: "2028-10-02", endDate: "2028-10-10" }).success).toBe(true);
    expect(issues(schema.safeParse({ startDate: "2028-10-02", endDate: "2028-10-11" }))).toEqual([
      tooFar,
    ]);
  });

  it("„azi” se calculează după ora României", () => {
    // 10 octombrie 2026, 23:30 UTC este deja 11 octombrie în România.
    vi.setSystemTime(new Date("2026-10-10T23:30:00Z"));
    expect(issues(schema.safeParse({ startDate: "2025-10-10", endDate: "2025-10-14" }))).toHaveLength(1);
  });
});
