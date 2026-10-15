import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  clients: [] as { $disconnect: ReturnType<typeof vi.fn> }[],
  seedDemo: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(function PrismaClient(this: { $disconnect: unknown }) {
    this.$disconnect = vi.fn();
    m.clients.push(this as { $disconnect: ReturnType<typeof vi.fn> });
  }),
}));
vi.mock("@/lib/demo/seed", () => ({ seedDemo: m.seedDemo }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/demo-reset/route";

const SECRET = "cron-secret-de-test-1234";

function call(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return GET(new NextRequest("http://localhost/api/cron/demo-reset", { headers }));
}

describe("GET /api/cron/demo-reset", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.seedDemo.mockResolvedValue({ workPoints: 3, users: 11, leaves: 13 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    m.clients.length = 0;
  });

  it("fără secretul cron-ului nu șterge nimic", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const response = await call({});
    expect(response.status).toBe(401);
    expect(m.seedDemo).not.toHaveBeenCalled();
    expect(m.clients).toHaveLength(0);
  });

  it.each([
    ["lipsește", undefined],
    ["nu e „true”", "1"],
  ])("pe o instanță fără DEMO_MODE (%s) nu atinge datele", async (_label, value) => {
    vi.stubEnv("DEMO_MODE", value);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, skipped: true });
    expect(m.seedDemo).not.toHaveBeenCalled();
    expect(m.clients).toHaveLength(0);
  });

  it("NEXT_PUBLIC_DEMO_MODE singur nu ajunge: ștergerea cere DEMO_MODE pe server", async () => {
    vi.stubEnv("DEMO_MODE", undefined);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(await (await call()).json()).toEqual({ success: true, skipped: true });
    expect(m.seedDemo).not.toHaveBeenCalled();
  });

  it("pe instanța demo reface datele", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      skipped: false,
      workPoints: 3,
      users: 11,
      leaves: 13,
    });
    expect(m.clients).toHaveLength(1);
    expect(m.seedDemo).toHaveBeenCalledExactlyOnceWith(m.clients[0]);
    expect(m.clients[0].$disconnect).toHaveBeenCalledOnce();
  });

  it("o eroare la refacere întoarce 500, ca Vercel să o arate", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    m.seedDemo.mockRejectedValue(new Error("conexiune pierdută"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Datele demo nu au putut fi refăcute.",
      success: false,
    });
    expect(console.error).toHaveBeenCalledOnce();
    expect(m.clients[0].$disconnect).toHaveBeenCalledOnce();
  });
});
