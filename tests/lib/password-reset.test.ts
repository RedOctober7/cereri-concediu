import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userUpdateMany: vi.fn(),
  resetFindUnique: vi.fn(),
  resetUpdateMany: vi.fn(),
  resetCreate: vi.fn(),
  audit: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const prisma = {
    user: { findFirst: db.userFindFirst, updateMany: db.userUpdateMany },
    passwordReset: {
      findUnique: db.resetFindUnique,
      updateMany: db.resetUpdateMany,
      create: db.resetCreate,
    },
    // Forma cu callback primește același client; forma cu listă așteaptă promisiunile.
    $transaction: (arg: unknown) =>
      typeof arg === "function" ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
  };
  return { prisma };
});

vi.mock("@/lib/audit/log", () => ({ createAuditLog: db.audit }));

vi.mock("@/lib/emails/send", () => ({
  appBaseUrl: () => "https://concedii.firma.ro",
  sendPasswordResetEmail: db.sendEmail,
}));

// bcrypt cu 12 runde e lent; aici contează doar că parola ajunge hash-uită.
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async (value: string) => `hash(${value})`) },
}));

import {
  RESET_TOKEN_TTL_MS,
  allowResetConfirm,
  allowResetRequest,
  canLogResetLinks,
  clientIp,
  confirmPasswordReset,
  createResetToken,
  hashResetToken,
  isResetTokenUsable,
  isWellFormedResetToken,
  processResetRequest,
  resetConfirmSchema,
} from "@/lib/password-reset";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

beforeEach(() => {
  Object.values(db).forEach((mock) => mock.mockReset());
  db.resetUpdateMany.mockResolvedValue({ count: 1 });
  db.userUpdateMany.mockResolvedValue({ count: 1 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("tokenul de resetare", () => {
  it("are 32 de octeți aleatori (base64url) și se stochează doar hash-ul SHA-256", () => {
    const a = createResetToken();
    const b = createResetToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a.token, "base64url")).toHaveLength(32);
    expect(a.tokenHash).toBe(sha256(a.token));
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.token).not.toBe(b.token);
    expect(hashResetToken(a.token)).toBe(a.tokenHash);
  });

  it("acceptă doar forma exactă a tokenului", () => {
    expect(isWellFormedResetToken(createResetToken().token)).toBe(true);
    expect(isWellFormedResetToken("")).toBe(false);
    expect(isWellFormedResetToken("abc")).toBe(false);
    expect(isWellFormedResetToken("a".repeat(43) + "=")).toBe(false);
    expect(isWellFormedResetToken("a".repeat(42) + "/")).toBe(false);
  });
});

describe("validarea parolei noi", () => {
  const token = "t".repeat(43);

  it("aplică aceleași reguli ca la schimbarea parolei", () => {
    const issues = (newPassword: string, confirmPassword = newPassword) => {
      const parsed = resetConfirmSchema.safeParse({ token, newPassword, confirmPassword });
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    };
    expect(issues("ParolaBuna1")).toEqual([]);
    expect(issues("Scurta1")).toContain("Parola trebuie să aibă minim 10 caractere");
    expect(issues("faramajuscula1")).toContain(
      "Parola trebuie să conțină cel puțin o literă mare"
    );
    expect(issues("FaraCifreDeloc")).toContain("Parola trebuie să conțină cel puțin o cifră");
    expect(issues("ParolaBuna1", "ParolaBuna2")).toContain("Parolele nu coincid");
  });
});

describe("cine poate vedea linkul în log", () => {
  it.each([
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "production", EMAIL_LOG_LINKS: "true" }, true],
    [{ NODE_ENV: "production", EMAIL_LOG_LINKS: "1" }, false],
    [{ NODE_ENV: "production", EMAIL_LOG_LINKS: "true", VERCEL_ENV: "production" }, false],
    [{ NODE_ENV: "development", VERCEL_ENV: "production" }, false],
  ])("%o → %s", (env, expected) => {
    expect(canLogResetLinks(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe("limitarea cererilor", () => {
  it("IP-ul vine din x-forwarded-for, apoi x-real-ip", () => {
    const req = (headers: Record<string, string>) =>
      new Request("https://x.ro/api/password-reset/request", { headers });
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("3 cereri / 15 minute pentru același IP și cont (fără diferență de majuscule)", async () => {
    const ip = "192.0.2.10";
    expect(await allowResetRequest(ip, "ion")).toBe(true);
    expect(await allowResetRequest(ip, "ION ")).toBe(true);
    expect(await allowResetRequest(ip, "Ion")).toBe(true);
    expect(await allowResetRequest(ip, "ion")).toBe(false);
    // Alt cont de pe același IP, sau același cont de pe alt IP, merg în continuare.
    expect(await allowResetRequest(ip, "ana")).toBe(true);
    expect(await allowResetRequest("192.0.2.11", "ion")).toBe(true);
  });

  it("20 de cereri / 15 minute de pe același IP, pentru orice conturi", async () => {
    const ip = "192.0.2.20";
    for (let i = 0; i < 20; i += 1) {
      expect(await allowResetRequest(ip, `cont${i}`)).toBe(true);
    }
    expect(await allowResetRequest(ip, "altcineva")).toBe(false);
  });

  it("10 confirmări / 15 minute de pe același IP", async () => {
    const ip = "192.0.2.30";
    for (let i = 0; i < 10; i += 1) {
      expect(await allowResetConfirm(ip)).toBe(true);
    }
    expect(await allowResetConfirm(ip)).toBe(false);
  });
});

describe("processResetRequest", () => {
  const user = { id: "u1", email: "ion@firma.ro", firstName: "Ion", username: "ion" };

  it("pentru un cont inexistent, inactiv sau șters nu face nimic", async () => {
    db.userFindFirst.mockResolvedValue(null);
    await processResetRequest("nimeni@firma.ro", "192.0.2.1");

    expect(db.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true, deletedAt: null }),
      })
    );
    expect(db.resetCreate).not.toHaveBeenCalled();
    expect(db.sendEmail).not.toHaveBeenCalled();
  });

  it("caută după utilizator (litere mici) sau email (fără diferență de majuscule)", async () => {
    db.userFindFirst.mockResolvedValue(null);
    await processResetRequest("  Ion@Firma.ro ", "192.0.2.1");
    expect(db.userFindFirst.mock.calls[0][0].where.OR).toEqual([
      { username: "ion@firma.ro" },
      { email: { equals: "Ion@Firma.ro", mode: "insensitive" } },
    ]);
  });

  it("invalidează tokenurile vechi, stochează hash-ul și trimite linkul cu tokenul", async () => {
    db.userFindFirst.mockResolvedValue(user);
    db.sendEmail.mockResolvedValue({ sent: true });
    const before = Date.now();

    await processResetRequest("ion", "192.0.2.1");

    expect(db.resetUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", used: false },
      data: { used: true },
    });
    const created = db.resetCreate.mock.calls[0][0].data;
    const email = db.sendEmail.mock.calls[0][0];
    const token = new URL(email.resetUrl).searchParams.get("token")!;
    expect(email.resetUrl).toBe(`https://concedii.firma.ro/reset-parola?token=${token}`);
    expect(email).toMatchObject({ to: "ion@firma.ro", username: "ion", validMinutes: 60 });
    expect(created.token).toBe(sha256(token));
    expect(created.userId).toBe("u1");
    expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(before + RESET_TOKEN_TTL_MS);
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + RESET_TOKEN_TTL_MS);
    expect(db.audit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", action: "PASSWORD_RESET_REQUESTED", ipAddress: "192.0.2.1" })
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("fără email trimis, linkul apare în log doar în afara producției", async () => {
    db.userFindFirst.mockResolvedValue(user);
    db.sendEmail.mockResolvedValue({ sent: false, reason: "not_configured" });

    vi.stubEnv("NODE_ENV", "development");
    await processResetRequest("ion", "192.0.2.1");
    expect(String(vi.mocked(console.warn).mock.calls.at(-1)?.[0])).toContain(
      "https://concedii.firma.ro/reset-parola?token="
    );

    vi.stubEnv("NODE_ENV", "production");
    db.sendEmail.mockRejectedValue(new Error("Resend: API key is invalid"));
    await processResetRequest("ion", "192.0.2.1");
    expect(String(vi.mocked(console.warn).mock.calls.at(-1)?.[0])).not.toContain("token=");
  });
});

describe("confirmPasswordReset", () => {
  const token = createResetToken().token;
  const usable = () => ({
    id: "pr1",
    userId: "u1",
    used: false,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    user: { active: true, deletedAt: null },
  });

  it("un token cu altă formă e respins fără să atingă baza de date", async () => {
    expect(await confirmPasswordReset("abc", "ParolaBuna1")).toEqual({ ok: false });
    expect(db.resetFindUnique).not.toHaveBeenCalled();
  });

  it("caută tokenul după hash", async () => {
    db.resetFindUnique.mockResolvedValue(null);
    expect(await confirmPasswordReset(token, "ParolaBuna1")).toEqual({ ok: false });
    expect(db.resetFindUnique.mock.calls[0][0].where).toEqual({ token: sha256(token) });
  });

  it.each([
    ["folosit", { used: true }],
    ["expirat", { expiresAt: new Date(Date.now() - 1000) }],
    ["cont inactiv", { user: { active: false, deletedAt: null } }],
    ["cont șters", { user: { active: true, deletedAt: new Date() } }],
  ])("respinge un token %s", async (_label, patch) => {
    db.resetFindUnique.mockResolvedValue({ ...usable(), ...patch });
    expect(await confirmPasswordReset(token, "ParolaBuna1")).toEqual({ ok: false });
    expect(db.userUpdateMany).not.toHaveBeenCalled();
    expect(await isResetTokenUsable(token)).toBe(false);
  });

  it("setează parola, ridică mustChangePassword și consumă toate tokenurile", async () => {
    db.resetFindUnique.mockResolvedValue(usable());
    expect(await isResetTokenUsable(token)).toBe(true);

    expect(await confirmPasswordReset(token, "ParolaBuna1")).toEqual({ ok: true, userId: "u1" });

    expect(db.resetUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "pr1", used: false, expiresAt: { gt: expect.any(Date) } },
      data: { used: true },
    });
    expect(db.userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u1", active: true, deletedAt: null },
      data: { passwordHash: "hash(ParolaBuna1)", mustChangePassword: false },
    });
    expect(db.resetUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { userId: "u1", used: false },
      data: { used: true },
    });
  });

  it("din două confirmări simultane reușește una singură", async () => {
    db.resetFindUnique.mockResolvedValue(usable());
    db.resetUpdateMany.mockResolvedValueOnce({ count: 0 });

    expect(await confirmPasswordReset(token, "ParolaBuna1")).toEqual({ ok: false });
    expect(db.userUpdateMany).not.toHaveBeenCalled();
  });

  it("un cont dezactivat între timp nu primește parola", async () => {
    db.resetFindUnique.mockResolvedValue(usable());
    db.userUpdateMany.mockResolvedValue({ count: 0 });

    expect(await confirmPasswordReset(token, "ParolaBuna1")).toEqual({ ok: false });
  });
});
