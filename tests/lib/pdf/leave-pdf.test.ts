import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  downloadPDF: vi.fn(),
  uploadPDF: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { leaveRequest: { update: mocks.update } },
}));

// Calea versionată și eroarea tipizată rămân cele reale; doar rețeaua e înlocuită.
vi.mock("@/lib/supabase-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase-storage")>()),
  downloadPDF: mocks.downloadPDF,
  uploadPDF: mocks.uploadPDF,
}));

const generate = vi.hoisted(() => ({ approvalFor: vi.fn(), generateLeavePDF: vi.fn() }));
vi.mock("@/lib/pdf/generate", () => generate);

import { StorageNotConfiguredError, pdfStoragePath } from "@/lib/supabase-storage";
import {
  leavePdfDownloadName,
  readStoredLeavePdf,
  renderLeavePdf,
  storeLeavePdf,
  type LeaveForPdf,
} from "@/lib/pdf/leave-pdf";

function leave(pdfUrl: string | null): LeaveForPdf {
  return {
    id: "r1",
    userId: "u1",
    status: "APPROVED_AUTO",
    pdfUrl,
    startDate: new Date(Date.UTC(2026, 9, 19)),
    endDate: new Date(Date.UTC(2026, 9, 23)),
    workingDays: 5,
    createdAt: new Date("2026-10-11T09:00:00Z"),
    approvedAt: new Date("2026-10-11T09:00:00Z"),
    approvedById: null,
    employeeSnapshot: null,
    user: {
      firstName: "Ion",
      lastName: "Popescu",
      email: "ion@example.ro",
      jobTitle: "Vânzător",
      employer: "Firma SRL",
      availableDays: 16,
      workPoint: null,
    },
  };
}

describe("PDF-ul stocat", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fără pdfUrl sau cu un PDF după șablonul vechi nu citește din Storage", async () => {
    expect(await readStoredLeavePdf(leave(null))).toBeNull();
    expect(await readStoredLeavePdf(leave("cereri/u1/r1.pdf"))).toBeNull();
    expect(mocks.downloadPDF).not.toHaveBeenCalled();
  });

  it("citește PDF-ul generat cu șablonul curent", async () => {
    const pdf = Buffer.from("%PDF-1.3");
    mocks.downloadPDF.mockResolvedValue(pdf);
    const path = pdfStoragePath("u1", "r1");

    expect(await readStoredLeavePdf(leave(path))).toBe(pdf);
    expect(mocks.downloadPDF).toHaveBeenCalledWith(path);
  });

  it("dacă Storage nu răspunde, întoarce null (PDF-ul se generează pe loc)", async () => {
    mocks.downloadPDF.mockRejectedValue(new Error("fetch failed"));
    expect(await readStoredLeavePdf(leave(pdfStoragePath("u1", "r1")))).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("după încărcare salvează calea nouă în cerere", async () => {
    const path = pdfStoragePath("u1", "r1");
    mocks.uploadPDF.mockResolvedValue(path);

    expect(await storeLeavePdf(leave("cereri/u1/r1.pdf"), Buffer.from("x"))).toBe(path);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { pdfUrl: path } });
  });

  it("nu rescrie cererea când calea e deja aceeași", async () => {
    const path = pdfStoragePath("u1", "r1");
    mocks.uploadPDF.mockResolvedValue(path);

    await storeLeavePdf(leave(path), Buffer.from("x"));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("fără Storage configurat nu aruncă și nu loghează eroare", async () => {
    mocks.uploadPDF.mockRejectedValue(new StorageNotConfiguredError());

    expect(await storeLeavePdf(leave(null), Buffer.from("x"))).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("un eșec la încărcare doar se loghează", async () => {
    mocks.uploadPDF.mockRejectedValue(new Error("Upload PDF failed: 403"));

    expect(await storeLeavePdf(leave(null), Buffer.from("x"))).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("datele angajatului din PDF", () => {
  const snapshot = {
    firstName: "Ion",
    lastName: "Ionescu",
    jobTitle: "Farmacist",
    employer: "Vechea Firmă SRL",
    workPointName: "Centru",
  };

  it("folosește datele de la depunere, nu profilul curent", async () => {
    await renderLeavePdf({ ...leave(null), employeeSnapshot: snapshot });
    expect(generate.generateLeavePDF).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          firstName: "Ion",
          lastName: "Ionescu",
          jobTitle: "Farmacist",
          employer: "Vechea Firmă SRL",
          workPoint: { name: "Centru" },
          email: "ion@example.ro",
        }),
      })
    );
    expect(leavePdfDownloadName({ ...leave(null), employeeSnapshot: snapshot })).toBe(
      "cerere-concediu-ionescu-ion-2026-10-19.pdf"
    );
  });

  it("o cerere veche, fără snapshot, folosește profilul curent", async () => {
    await renderLeavePdf(leave(null));
    expect(generate.generateLeavePDF).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ lastName: "Popescu" }) })
    );
  });
});
