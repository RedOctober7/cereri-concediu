import { describe, expect, it } from "vitest";
import {
  approvalStatement,
  formalName,
  formatCalendarDay,
  formatDateInBucharest,
  formatDateTimeInBucharest,
  leavePdfFileName,
  workingDaysPhrase,
} from "@/lib/pdf/content";

describe("datele din cerere", () => {
  it("o zi calendaristică rămâne aceeași în orice fus orar al serverului", () => {
    expect(formatCalendarDay(new Date(Date.UTC(2026, 0, 1)))).toBe("01.01.2026");
    expect(formatCalendarDay(new Date(Date.UTC(2026, 11, 31)))).toBe("31.12.2026");
  });

  it("data cererii este ziua din București, nu din UTC", () => {
    // 21:30 UTC în octombrie (UTC+3) este deja 12 octombrie în România.
    expect(formatDateInBucharest(new Date("2026-10-11T21:30:00Z"))).toBe("12.10.2026");
    expect(formatDateInBucharest(new Date("2026-10-11T20:59:00Z"))).toBe("11.10.2026");
  });

  it("ora aprobării este ora României (inclusiv iarna, UTC+2)", () => {
    expect(formatDateTimeInBucharest(new Date("2026-01-15T08:05:00Z"))).toBe(
      "15.01.2026, ora 10:05"
    );
    expect(formatDateTimeInBucharest(new Date("2026-07-15T08:05:00Z"))).toBe(
      "15.07.2026, ora 11:05"
    );
  });
});

describe("workingDaysPhrase", () => {
  it.each([
    [1, "1 zi lucrătoare"],
    [2, "2 zile lucrătoare"],
    [19, "19 zile lucrătoare"],
    [20, "20 de zile lucrătoare"],
    [21, "21 de zile lucrătoare"],
    [101, "101 zile lucrătoare"],
    [119, "119 zile lucrătoare"],
    [120, "120 de zile lucrătoare"],
    [200, "200 de zile lucrătoare"],
    [0, "0 zile lucrătoare"],
  ])("%i → %s", (days, phrase) => {
    expect(workingDaysPhrase(days)).toBe(phrase);
  });
});

describe("approvalStatement", () => {
  const approvedAt = new Date("2026-10-02T11:30:00Z");

  it("aprobarea automată spune că a aprobat aplicația, cu data și ora", () => {
    const { title, detail } = approvalStatement({
      status: "APPROVED_AUTO",
      approvedAt,
      approvedBy: null,
    });
    expect(title).toBe("Aprobată automat");
    expect(detail).toContain("aprobată automat de aplicație pe 02.10.2026, ora 14:30");
  });

  it("aprobarea de către admin îl numește pe administrator", () => {
    const { title, detail } = approvalStatement({
      status: "APPROVED_ADMIN",
      approvedAt,
      approvedBy: { firstName: "Mădălina", lastName: "Șerban" },
    });
    expect(title).toBe("Aprobată de administrator");
    expect(detail).toBe(
      "Cererea a fost aprobată de Mădălina Șerban (administrator) pe 02.10.2026, ora 14:30."
    );
  });

  it("fără administrator cunoscut sau fără dată, textul rămâne corect", () => {
    expect(
      approvalStatement({ status: "APPROVED_ADMIN", approvedAt: null, approvedBy: null }).detail
    ).toBe("Cererea a fost aprobată de un administrator.");
  });

  it("nu pretinde nicio semnătură electronică", () => {
    for (const status of ["APPROVED_AUTO", "APPROVED_ADMIN"] as const) {
      const { detail } = approvalStatement({ status, approvedAt, approvedBy: null });
      expect(detail.toLowerCase()).not.toContain("semn");
    }
  });
});

describe("numele", () => {
  it("formalName pune numele de familie întâi", () => {
    expect(formalName({ firstName: "Ion", lastName: "Popescu" })).toBe("Popescu Ion");
  });

  it("numele fișierului PDF nu are diacritice sau spații", () => {
    expect(
      leavePdfFileName(
        { firstName: "Ștefania Ioana", lastName: "Țăranu-Bîrsan" },
        new Date(Date.UTC(2026, 9, 19))
      )
    ).toBe("cerere-concediu-taranu-birsan-stefania-ioana-2026-10-19.pdf");
    // Și cu sedilă (ş, ţ), cum vin uneori datele importate.
    expect(
      leavePdfFileName({ firstName: "Ştefan", lastName: "Ţuţu" }, new Date(Date.UTC(2026, 0, 5)))
    ).toBe("cerere-concediu-tutu-stefan-2026-01-05.pdf");
  });
});
