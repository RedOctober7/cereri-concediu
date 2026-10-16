import { describe, expect, it } from "vitest";
import {
  blackoutMonthMessage,
  daysText,
  uninterruptedVacationMessage,
  workingDaysText,
} from "@/lib/constraints/messages";

describe("textele atenționărilor", () => {
  it.each([
    [1, "1 zi"],
    [2.5, "2,5 zile"],
    [19, "19 zile"],
    [20, "20 de zile"],
    [21, "21 de zile"],
    [101, "101 zile"],
    [0, "0 zile"],
  ])("%s → %s", (value, text) => {
    expect(daysText(value)).toBe(text);
  });

  it("acordă și „lucrătoare”", () => {
    expect(workingDaysText(1)).toBe("1 zi lucrătoare");
    expect(workingDaysText(10)).toBe("10 zile lucrătoare");
    expect(workingDaysText(20)).toBe("20 de zile lucrătoare");
  });

  it("luna restricționată e scrisă cu literă mică în propoziție", () => {
    expect(blackoutMonthMessage(12)).toBe("Luna decembrie este perioadă restricționată");
  });

  it("art. 148: „1 zi disponibilă”, „9 zile disponibile”", () => {
    expect(uninterruptedVacationMessage(2026, 10, 1)).toContain("ar rămâne 1 zi disponibilă (Codul muncii, art. 148)");
    expect(uninterruptedVacationMessage(2026, 10, 9)).toContain("ar rămâne 9 zile disponibile");
    expect(uninterruptedVacationMessage(2026, 10, 9.25)).toContain("ar rămâne 9,25 zile disponibile");
  });
});
