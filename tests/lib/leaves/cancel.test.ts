import { LeaveStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  leaveRequest: { findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) },
}));

import { cancelLeave } from "@/lib/leaves/cancel";

// „Azi” în România: luni, 12 octombrie 2026.
const NOW = new Date("2026-10-12T06:00:00Z");
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const ALL = [LeaveStatus.PENDING_ADMIN, LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN];
const options = { statuses: ALL, notCancellableMessage: "nu se poate" };

function leave(overrides: Record<string, unknown> = {}) {
  return {
    id: "leave_1",
    userId: "user_1",
    status: LeaveStatus.APPROVED_ADMIN,
    startDate: day("2026-10-19"),
    workingDays: 5,
    ...overrides,
  };
}

describe("cancelLeave", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    tx.leaveRequest.findFirst.mockResolvedValue(leave());
    tx.leaveRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.user.findUniqueOrThrow.mockResolvedValue({ availableDays: 3.25 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("un concediu aprobat care nu a început își returnează zilele în sold", async () => {
    const result = await cancelLeave("leave_1", { ...options, ownerId: "user_1" });
    expect(result).toEqual({
      ok: true,
      userId: "user_1",
      previousStatus: LeaveStatus.APPROVED_ADMIN,
      refundedDays: 5,
      availableDaysBefore: 3.25,
      availableDaysAfter: 8.25,
    });
    expect(tx.leaveRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "leave_1", userId: "user_1" } })
    );
    expect(tx.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "leave_1", status: LeaveStatus.APPROVED_ADMIN },
      data: { status: LeaveStatus.CANCELLED },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { availableDays: 8.25 },
      select: { id: true },
    });
  });

  it("o cerere în așteptare se anulează fără să schimbe soldul", async () => {
    tx.leaveRequest.findFirst.mockResolvedValue(leave({ status: LeaveStatus.PENDING_ADMIN }));
    const result = await cancelLeave("leave_1", options);
    expect(result).toMatchObject({ ok: true, refundedDays: 0 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("un concediu care începe azi nu mai poate fi anulat", async () => {
    tx.leaveRequest.findFirst.mockResolvedValue(leave({ startDate: day("2026-10-12") }));
    const result = await cancelLeave("leave_1", options);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(tx.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it("un status care nu poate fi anulat de cel care cere", async () => {
    const result = await cancelLeave("leave_1", {
      statuses: [LeaveStatus.PENDING_ADMIN],
      notCancellableMessage: "nu se poate",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "nu se poate" });
  });

  it("o cerere inexistentă (sau a altui angajat)", async () => {
    tx.leaveRequest.findFirst.mockResolvedValue(null);
    const result = await cancelLeave("leave_1", { ...options, ownerId: "user_2" });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("statusul schimbat între timp nu returnează zilele de două ori", async () => {
    tx.leaveRequest.updateMany.mockResolvedValue({ count: 0 });
    const result = await cancelLeave("leave_1", options);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
