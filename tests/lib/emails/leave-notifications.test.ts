import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  findLeaveForPdf: vi.fn(),
  renderLeavePdf: vi.fn(),
  storeLeavePdf: vi.fn(),
  sendLeaveApprovedEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { leaveRequest: { update: mocks.update } },
}));

vi.mock("@/lib/pdf/leave-pdf", () => ({
  findLeaveForPdf: mocks.findLeaveForPdf,
  renderLeavePdf: mocks.renderLeavePdf,
  storeLeavePdf: mocks.storeLeavePdf,
}));

vi.mock("@/lib/emails/send", () => ({
  sendLeaveApprovedEmail: mocks.sendLeaveApprovedEmail,
}));

import { notifyLeaveApproved } from "@/lib/emails/leave-notifications";

const approvedLeave = {
  id: "r1",
  userId: "u1",
  status: "APPROVED_AUTO",
  startDate: new Date(Date.UTC(2026, 9, 19)),
  endDate: new Date(Date.UTC(2026, 9, 23)),
  workingDays: 5,
  user: {
    firstName: "Ion",
    lastName: "Popescu",
    email: "ion@example.ro",
    availableDays: 16,
  },
};

describe("notifyLeaveApproved", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findLeaveForPdf.mockResolvedValue(approvedLeave);
  });

  it("generează și stochează PDF-ul, îl atașează și marchează emailul ca trimis", async () => {
    const pdf = Buffer.from("%PDF");
    mocks.renderLeavePdf.mockResolvedValue(pdf);
    mocks.sendLeaveApprovedEmail.mockResolvedValue({ sent: true });

    await notifyLeaveApproved("r1");

    expect(mocks.storeLeavePdf).toHaveBeenCalledWith(approvedLeave, pdf);
    expect(mocks.sendLeaveApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ion@example.ro",
        approvedByAdmin: false,
        availableDaysAfter: 16,
        pdfBuffer: pdf,
      })
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { emailSentAt: expect.any(Date) },
    });
  });

  it("dacă PDF-ul nu se poate genera, emailul pleacă fără atașament", async () => {
    mocks.renderLeavePdf.mockRejectedValue(new Error("font lipsă"));
    mocks.sendLeaveApprovedEmail.mockResolvedValue({ sent: true });

    await notifyLeaveApproved("r1");

    expect(mocks.storeLeavePdf).not.toHaveBeenCalled();
    expect(mocks.sendLeaveApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ pdfBuffer: null })
    );
  });

  it("fără Resend configurat nu marchează emailul ca trimis", async () => {
    mocks.renderLeavePdf.mockResolvedValue(Buffer.from("%PDF"));
    mocks.sendLeaveApprovedEmail.mockResolvedValue({ sent: false, reason: "not_configured" });

    await notifyLeaveApproved("r1");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("nu aruncă niciodată (cererea e deja salvată)", async () => {
    mocks.renderLeavePdf.mockResolvedValue(Buffer.from("%PDF"));
    mocks.sendLeaveApprovedEmail.mockRejectedValue(new Error("Resend: API key is invalid"));

    await expect(notifyLeaveApproved("r1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();

    mocks.findLeaveForPdf.mockRejectedValue(new Error("DB indisponibilă"));
    await expect(notifyLeaveApproved("r1")).resolves.toBeUndefined();
  });

  it("nu trimite nimic pentru o cerere care nu (mai) e aprobată", async () => {
    mocks.findLeaveForPdf.mockResolvedValue({ ...approvedLeave, status: "CANCELLED" });

    await notifyLeaveApproved("r1");
    expect(mocks.renderLeavePdf).not.toHaveBeenCalled();
    expect(mocks.sendLeaveApprovedEmail).not.toHaveBeenCalled();
  });
});
