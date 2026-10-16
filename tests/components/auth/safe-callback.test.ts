import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "@/components/auth/safe-callback";

const ORIGIN = "https://concedii.firma.ro";

describe("safeCallbackPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/cereri/noua", "/cereri/noua"],
    ["/admin/cereri?status=all&page=2#lista", "/admin/cereri?status=all&page=2#lista"],
    // Rămâne pe site chiar dacă arată ciudat.
    ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
    ["/../admin", "/admin"],
  ])("păstrează calea de pe același site: %s", (raw, expected) => {
    expect(safeCallbackPath(raw, ORIGIN)).toBe(expected);
  });

  it.each([
    ["absent", null],
    ["gol", ""],
    ["adresă absolută", "https://evil.com"],
    ["adresă absolută pe același site", "https://concedii.firma.ro/dashboard"],
    ["relativ la protocol", "//evil.com"],
    ["relativ la protocol, cu cale", "//evil.com/login"],
    ["backslash", "/\\evil.com"],
    ["backslash dublu", "\\\\evil.com"],
    ["tab ascuns", "/\t/evil.com"],
    ["linie nouă ascunsă", "/\n/evil.com"],
    ["javascript:", "javascript:alert(1)"],
    ["fără slash", "dashboard"],
    ["segment „..” urmat de //", "/..//evil.com/login"],
    ["segment „.” urmat de //", "/.//evil.com"],
    ["segment „.” urmat de backslash", "/./\\evil.com"],
    ["cale care urcă până la //", "/cereri/..//evil.com"],
  ])("respinge %s", (_label, raw) => {
    expect(safeCallbackPath(raw as string | null, ORIGIN)).toBeNull();
  });
});
