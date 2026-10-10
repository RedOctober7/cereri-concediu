import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCronRequest } from "@/lib/cron-auth";

const SECRET = "cron-secret-de-test-1234";

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://example.ro/api/cron/monthly-accrual", { headers });
}

async function bodyOf(response: Response | null) {
  return response ? { status: response.status, body: await response.json() } : null;
}

describe("verifyCronRequest", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["lipsește", undefined],
    ["este gol", ""],
    ["are sub 16 caractere", "prea-scurt-123"],
    ["are doar spații", "                    "],
  ])("respinge orice cerere când CRON_SECRET %s (fail closed)", async (_label, value) => {
    vi.stubEnv("CRON_SECRET", value);
    expect(await bodyOf(verifyCronRequest(request({ authorization: `Bearer ${value}` })))).toEqual({
      status: 500,
      body: { error: "Serverul nu este configurat corect." },
    });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("acceptă header-ul trimis de Vercel", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(verifyCronRequest(request({ authorization: `Bearer ${SECRET}` }))).toBeNull();
    expect(verifyCronRequest(request({ authorization: `bearer ${SECRET}` }))).toBeNull();
  });

  it("acceptă header-ul pentru declanșare manuală", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(verifyCronRequest(request({ "x-cron-secret": SECRET }))).toBeNull();
  });

  it("ignoră spațiile din jurul secretului din mediu", () => {
    vi.stubEnv("CRON_SECRET", `  ${SECRET}\n`);
    expect(verifyCronRequest(request({ authorization: `Bearer ${SECRET}` }))).toBeNull();
  });

  it.each([
    ["fără header", {}],
    ["secret greșit", { authorization: "Bearer alt-secret-de-test-123" }],
    ["prefix al secretului", { authorization: `Bearer ${SECRET.slice(0, -1)}` }],
    ["fără Bearer", { authorization: SECRET }],
    ["x-cron-secret greșit", { "x-cron-secret": `${SECRET}x` }],
    ["Bearer gol", { authorization: "Bearer " }],
  ])("întoarce 401 pentru %s", async (_label, headers) => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(await bodyOf(verifyCronRequest(request(headers)))).toEqual({
      status: 401,
      body: { error: "Neautorizat" },
    });
  });
});
