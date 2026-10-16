import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn(), update: vi.fn() },
    leaveAccrual: { aggregate: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
  };
  return { tx, prisma: { $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) } };
});

vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminSession: vi.fn(async () => ({ session: { user: { id: "admin_1" } } })),
}));

import { POST } from "@/app/api/admin/users/[id]/balance/route";

// 16 octombrie 2026: se pot ajusta zilele din 2025 și 2026.
const NOW = new Date("2026-10-16T08:00:00Z");

function adjust(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/admin/users/u1/balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Corectură de test", ...body }),
    }),
    { params: Promise.resolve({ id: "u1" }) }
  );
}

describe("POST /api/admin/users/[id]/balance", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    m.tx.user.findUnique.mockResolvedValue({
      availableDays: 20,
      role: "EMPLOYEE",
      initialLeaveDays: 4,
      hireDate: new Date("2020-03-01T00:00:00Z"),
      createdAt: new Date("2025-01-15T09:00:00Z"),
    });
    // 2026: 9 luni acumulate (15,75 zile), soldul inițial aparține lui 2025.
    m.tx.leaveAccrual.aggregate.mockResolvedValue({ _sum: { days: 15.75 } });
    m.tx.auditLog.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const savedDetails = () => m.tx.auditLog.create.mock.calls[0][0].data.details;

  it("o adăugare fără an aparține anului curent", async () => {
    const response = await adjust({ delta: 3 });
    expect(response.status).toBe(200);
    expect(savedDetails()).toMatchObject({ delta: 3, year: 2026, before: 20, after: 23 });
  });

  it("o scădere fără an consumă cele mai vechi zile (year: null)", async () => {
    const response = await adjust({ delta: -10 });
    expect(response.status).toBe(200);
    expect(savedDetails()).toMatchObject({ delta: -10, year: null, after: 10 });
    expect(m.tx.leaveAccrual.aggregate).not.toHaveBeenCalled();
  });

  it("o corectură pe un an nu poate scădea mai mult decât s-a câștigat în acel an", async () => {
    const response = await adjust({ delta: -16, year: 2026 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Din 2026 angajatul are 15,75 zile câștigate până acum. Alege „Cele mai vechi zile” sau scade mai puțin.",
      field: "year",
    });
    expect(m.tx.user.update).not.toHaveBeenCalled();

    expect((await adjust({ delta: -15.75, year: 2026 })).status).toBe(200);
  });

  it("refuză un an ale cărui zile au expirat", async () => {
    const response = await adjust({ delta: 2, year: 2024 });
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("year");
  });
});
