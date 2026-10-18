import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: m.findUnique, update: m.update } } }));

import { POST } from "@/app/api/profile/password/route";
import { resetAuthRateLimitForTests } from "@/lib/rate-limit";

const CURRENT = "Parola-Veche-1";
const hash = bcrypt.hashSync(CURRENT, 4);

function change(currentPassword: string, newPassword = "Parola-Noua-22") {
  return POST(
    new Request("http://localhost/api/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.7" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword: newPassword }),
    })
  );
}

describe("POST /api/profile/password", () => {
  beforeEach(() => {
    resetAuthRateLimitForTests();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    m.findUnique.mockResolvedValue({
      id: "u1",
      username: "ion.pop",
      active: true,
      deletedAt: null,
      passwordHash: hash,
    });
    m.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("schimbă parola cu parola curentă corectă", async () => {
    const response = await change(CURRENT);
    expect(response.status).toBe(200);
    expect(m.update).toHaveBeenCalledOnce();
  });

  it("refuză o parolă nouă identică cu cea curentă (ex. parola temporară)", async () => {
    const response = await change(CURRENT, CURRENT);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Parola nouă trebuie să fie diferită de cea curentă" });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("după 5 parole curente greșite blochează încercările 15 minute, ca login-ul", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await change(`Gresita-${attempt}A`)).status).toBe(400);
    }
    const blocked = await change(CURRENT);
    expect(blocked.status).toBe(429);
    expect(m.update).not.toHaveBeenCalled();
  });
});
