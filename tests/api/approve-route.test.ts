import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    leaveRequest: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
  };
  return {
    tx,
    prisma: {
      leaveRequest: { findUnique: vi.fn() },
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminSession: vi.fn(async () => ({ session: { user: { id: "admin_1" } } })),
}));
vi.mock("@/lib/emails/leave-notifications", () => ({ notifyLeaveApproved: vi.fn() }));
vi.mock("@/lib/audit/log", () => ({ createAuditLog: vi.fn() }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/leaves/[id]/approve/route";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
// Luni–vineri, 19–23 oct. 2026: 5 zile lucrătoare.
const pending = { status: "PENDING_ADMIN", startDate: day("2026-10-19"), endDate: day("2026-10-23"), workingDays: 5 };

function call(body?: string) {
  const req = new NextRequest("http://localhost/api/admin/leaves/l1/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return POST(req, { params: Promise.resolve({ id: "l1" }) });
}

describe("POST /api/admin/leaves/[id]/approve: aprobarea peste sold", () => {
  beforeEach(() => {
    m.prisma.leaveRequest.findUnique.mockResolvedValue({ id: "l1", userId: "u1", ...pending });
    m.tx.leaveRequest.findUnique.mockResolvedValue(pending);
    m.tx.leaveRequest.findFirst.mockResolvedValue(null);
    m.tx.leaveRequest.updateMany.mockResolvedValue({ count: 1 });
    m.tx.leaveRequest.findUniqueOrThrow.mockResolvedValue({ id: "l1", workingDays: 5 });
  });
  afterEach(() => vi.clearAllMocks());

  it("fără confirmare, un sold insuficient dă 409 și nu schimbă nimic", async () => {
    m.tx.user.findUniqueOrThrow.mockResolvedValue({ availableDays: 3 });
    const res = await call(JSON.stringify({ allowNegativeBalance: false }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NEGATIVE_BALANCE" });
    expect(m.tx.leaveRequest.updateMany).not.toHaveBeenCalled();
    expect(m.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("un corp lipsă sau invalid contează ca fără confirmare", async () => {
    m.tx.user.findUniqueOrThrow.mockResolvedValue({ availableDays: 3 });
    expect((await call("{nu e json")).status).toBe(409);
    expect((await call()).status).toBe(409);
  });

  it("cu confirmare, aprobarea trece și scade zilele", async () => {
    m.tx.user.findUniqueOrThrow.mockResolvedValue({ availableDays: 3 });
    const res = await call(JSON.stringify({ allowNegativeBalance: true }));
    expect(res.status).toBe(200);
    expect(m.tx.leaveRequest.updateMany).toHaveBeenCalledOnce();
    expect(m.tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("cu sold suficient, nu e nevoie de confirmare", async () => {
    m.tx.user.findUniqueOrThrow.mockResolvedValue({ availableDays: 5 });
    expect((await call(JSON.stringify({}))).status).toBe(200);
  });
});
