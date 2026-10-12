import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({ startAuthAttempt: vi.fn() }));

import type { JWT } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";

type JwtCallback = (params: { token: JWT; trigger?: "update" }) => Promise<JWT>;
const jwt = authOptions.callbacks!.jwt as unknown as JwtCallback;

function dbUser(sessionVersion: number) {
  return { role: "EMPLOYEE", mustChangePassword: false, active: true, deletedAt: null, sessionVersion };
}

// Token vechi de peste 5 minute: revalidarea rulează.
const stale = (overrides: Partial<JWT> = {}): JWT =>
  ({ id: "u1", role: "EMPLOYEE", mustChangePassword: false, checkedAt: 0, ...overrides }) as JWT;

describe("revalidarea sesiunii după schimbarea parolei (sessionVersion)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("aceeași versiune: sesiunea rămâne validă", async () => {
    db.user.findUnique.mockResolvedValue(dbUser(2));
    await expect(jwt({ token: stale({ sessionVersion: 2 }) })).resolves.toMatchObject({ id: "u1" });
  });

  it("parola schimbată după emiterea tokenului: sesiunea se închide", async () => {
    db.user.findUnique.mockResolvedValue(dbUser(3));
    await expect(jwt({ token: stale({ sessionVersion: 2 }) })).rejects.toThrow(
      "Parola contului a fost schimbată."
    );
  });

  it("un token emis înainte de sessionVersion contează ca versiunea 0", async () => {
    db.user.findUnique.mockResolvedValue(dbUser(0));
    await expect(jwt({ token: stale() })).resolves.toMatchObject({ id: "u1" });

    db.user.findUnique.mockResolvedValue(dbUser(1));
    await expect(jwt({ token: stale() })).rejects.toThrow();
  });

  it("și update() verifică versiunea, chiar cu un token proaspăt", async () => {
    db.user.findUnique.mockResolvedValue(dbUser(1));
    await expect(
      jwt({ token: stale({ sessionVersion: 0, checkedAt: Date.now() }), trigger: "update" })
    ).rejects.toThrow();
  });
});
