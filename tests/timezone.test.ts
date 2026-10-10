import { describe, expect, it } from "vitest";

// Verifică faptul că fiecare proiect din vitest.config.ts rulează chiar cu fusul orar
// cerut; altfel testele de date ar trece de două ori în același fus.
describe("fusul orar al procesului de test", () => {
  const expectedOffsets: Record<string, { winter: number; summer: number }> = {
    UTC: { winter: 0, summer: 0 },
    "Europe/Bucharest": { winter: -120, summer: -180 },
  };

  it("este cel setat de proiect", () => {
    const timeZone = process.env.TZ ?? "";
    expect(Object.keys(expectedOffsets)).toContain(timeZone);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(timeZone);

    const offsets = expectedOffsets[timeZone];
    expect(new Date("2026-01-15T12:00:00Z").getTimezoneOffset()).toBe(offsets.winter);
    expect(new Date("2026-07-15T12:00:00Z").getTimezoneOffset()).toBe(offsets.summer);
  });
});
