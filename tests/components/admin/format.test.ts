import { describe, expect, it } from "vitest";
import { daysUnit, pluralRo } from "@/components/admin/format";

describe("pluralRo", () => {
  it.each([
    [1, "1 zi"],
    [-1, "-1 zi"],
    [2, "2 zile"],
    [-2, "-2 zile"],
    [1.5, "1,5 zile"],
    [20, "20 de zile"],
    [-20, "-20 de zile"],
    [0, "0 zile"],
  ])("%s → %s", (count, text) => {
    expect(pluralRo(count, "zi", "zile")).toBe(text);
  });
});

describe("daysUnit", () => {
  it.each([
    [1, "zi"],
    [-1, "zi"],
    [2.5, "zile"],
    [21, "de zile"],
    [-21, "de zile"],
  ])("%s → %s", (value, unit) => {
    expect(daysUnit(value)).toBe(unit);
  });
});
