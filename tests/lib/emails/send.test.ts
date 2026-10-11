import { beforeEach, describe, expect, it, vi } from "vitest";

// Resend este înlocuit: testele nu ies în rețea și văd ce s-ar fi trimis.
const resend = vi.hoisted(() => ({
  constructed: [] as string[],
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.send };
    constructor(key: string) {
      resend.constructed.push(key);
    }
  },
}));

const rejected = {
  to: "ion@example.ro",
  firstName: "Ion",
  lastName: "Popescu",
  startDate: new Date(Date.UTC(2026, 9, 15)),
  endDate: new Date(Date.UTC(2026, 9, 16)),
  workingDays: 2,
  rejectionReason: "Perioadă aglomerată în magazin.",
};

/** Modulul ține clientul în memorie: fiecare test îl importă din nou. */
async function loadSend() {
  vi.resetModules();
  return import("@/lib/emails/send");
}

describe("trimiterea emailurilor", () => {
  beforeEach(() => {
    resend.constructed.length = 0;
    resend.send.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("fără RESEND_API_KEY importul nu aruncă, iar emailul este sărit", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendLeaveRejectedEmail } = await loadSend();

    await expect(sendLeaveRejectedEmail(rejected)).resolves.toEqual({
      sent: false,
      reason: "not_configured",
    });
    expect(resend.constructed).toEqual([]);
    expect(resend.send).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("creează clientul la primul email și îl refolosește", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "concedii@firma.ro");
    resend.send.mockResolvedValue({ data: { id: "e1" }, error: null });
    const { sendLeaveRejectedEmail } = await loadSend();

    expect(resend.constructed).toEqual([]);
    await expect(sendLeaveRejectedEmail(rejected)).resolves.toEqual({ sent: true });
    await sendLeaveRejectedEmail(rejected);

    expect(resend.constructed).toEqual(["re_test"]);
    expect(resend.send).toHaveBeenCalledTimes(2);
    const payload = resend.send.mock.calls[0][0];
    expect(payload).toMatchObject({
      from: "concedii@firma.ro",
      to: "ion@example.ro",
      subject: "Cerere de concediu respinsă",
    });
    // Ziua este cea calendaristică, indiferent de fusul orar al serverului.
    expect(payload.html).toContain("15.10.2026");
  });

  it("emailul către admini trimite la lista de cereri (pagina există)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("NEXTAUTH_URL", "https://concedii.firma.ro/");
    resend.send.mockResolvedValue({ data: { id: "e2" }, error: null });
    const { sendLeavePendingAdminEmail } = await loadSend();

    await sendLeavePendingAdminEmail({
      adminEmails: ["a@firma.ro", "b@firma.ro"],
      employeeFirstName: "Ion",
      employeeLastName: "Popescu",
      startDate: rejected.startDate,
      endDate: rejected.endDate,
      workingDays: 2,
      violationReasons: ["Preaviz minim 2 zile lucrătoare"],
    });

    const payload = resend.send.mock.calls[0][0];
    expect(payload.to).toEqual(["a@firma.ro", "b@firma.ro"]);
    expect(payload.html).toContain('href="https://concedii.firma.ro/admin/cereri"');
    expect(payload.html).toContain("Preaviz minim 2 zile lucrătoare");
  });

  it("o eroare întoarsă de Resend devine EmailSendError", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    resend.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "API key is invalid" },
    });
    const { sendLeaveRejectedEmail, EmailSendError } = await loadSend();

    const result = sendLeaveRejectedEmail(rejected);
    await expect(result).rejects.toBeInstanceOf(EmailSendError);
    await expect(result).rejects.toThrow("API key is invalid");
  });
});
