import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ratelimit-ul Upstash este înlocuit cu unul controlat din test; Redis nu este contactat.
const upstash = vi.hoisted(() => ({
  limit: vi.fn(),
  redisOptions: [] as unknown[],
  ratelimitOptions: [] as Array<{ prefix: string }>,
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: unknown) {
      upstash.redisOptions.push(options);
    }
  },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow(tokens: number, window: string) {
      return { tokens, window };
    }
    readonly prefix: string;
    constructor(options: { prefix: string }) {
      this.prefix = options.prefix;
      upstash.ratelimitOptions.push(options);
    }
    limit(identifier: string, options?: { rate?: number }) {
      return upstash.limit(this.prefix, identifier, options);
    }
  },
}));

import {
  IP_FAILURE_LIMIT,
  USER_IP_FAILURE_LIMIT,
  createMemoryLimiter,
  resetAuthRateLimitForTests,
  startAuthAttempt,
} from "@/lib/rate-limit";

const REDIS_ENV = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;

/** `count` încercări eșuate (rezervate și neeliberate); întoarce câte au fost permise. */
async function fail(username: string, ip: string, count: number): Promise<number> {
  let allowed = 0;
  for (let i = 0; i < count; i++) {
    if ((await startAuthAttempt(username, ip)).allowed) {
      allowed++;
    }
  }
  return allowed;
}

beforeEach(() => {
  for (const name of REDIS_ENV) {
    vi.stubEnv(name, "");
  }
  resetAuthRateLimitForTests();
  upstash.limit.mockReset();
  upstash.redisOptions.length = 0;
  upstash.ratelimitOptions.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createMemoryLimiter", () => {
  it("permite `limit` rezervări în fereastră, apoi refuză", async () => {
    const limiter = createMemoryLimiter(2, 1000);
    expect((await limiter.reserve("k")).allowed).toBe(true);
    expect((await limiter.reserve("k")).allowed).toBe(true);
    expect((await limiter.reserve("k")).allowed).toBe(false);
    expect((await limiter.reserve("alta")).allowed).toBe(true);
  });

  it("eliberarea dă locul înapoi", async () => {
    const limiter = createMemoryLimiter(1, 1000);
    const first = await limiter.reserve("k");
    expect((await limiter.reserve("k")).allowed).toBe(false);
    await first.release();
    expect((await limiter.reserve("k")).allowed).toBe(true);
  });

  it("fereastra expiră", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const limiter = createMemoryLimiter(1, 15 * 60 * 1000);
    const first = await limiter.reserve("k");
    expect((await limiter.reserve("k")).allowed).toBe(false);
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect((await limiter.reserve("k")).allowed).toBe(true);
    // O rezervare din fereastra veche nu mai eliberează nimic în cea nouă.
    await first.release();
    expect((await limiter.reserve("k")).allowed).toBe(false);
  });
});

describe("startAuthAttempt (în memorie)", () => {
  it("anunță o singură dată că limitele sunt în memorie", async () => {
    await startAuthAttempt("ion", "10.0.0.1");
    await startAuthAttempt("ion", "10.0.0.1");
    expect(console.info).toHaveBeenCalledOnce();
    expect(vi.mocked(console.info).mock.calls[0][0]).toContain("în memorie");
  });

  it(`după ${USER_IP_FAILURE_LIMIT} eșecuri pentru același utilizator și IP refuză`, async () => {
    expect(await fail("ion", "10.0.0.1", USER_IP_FAILURE_LIMIT)).toBe(USER_IP_FAILURE_LIMIT);
    expect((await startAuthAttempt("ion", "10.0.0.1")).allowed).toBe(false);
    // Numele se compară fără majuscule și spații, ca la autentificare.
    expect((await startAuthAttempt(" ION ", "10.0.0.1")).allowed).toBe(false);
  });

  it("nu blochează colegii de pe același IP sau același utilizator de pe alt IP", async () => {
    await fail("ion", "10.0.0.1", USER_IP_FAILURE_LIMIT);
    expect((await startAuthAttempt("maria", "10.0.0.1")).allowed).toBe(true);
    expect((await startAuthAttempt("ion", "10.0.0.2")).allowed).toBe(true);
  });

  it("autentificările reușite nu se numără", async () => {
    for (let i = 0; i < USER_IP_FAILURE_LIMIT * 3; i++) {
      const attempt = await startAuthAttempt("ion", "10.0.0.1");
      expect(attempt.allowed).toBe(true);
      await attempt.succeeded();
    }
    expect(await fail("ion", "10.0.0.1", USER_IP_FAILURE_LIMIT)).toBe(USER_IP_FAILURE_LIMIT);
  });

  it(`după ${IP_FAILURE_LIMIT} eșecuri de pe același IP refuză pe oricine de acolo`, async () => {
    for (let i = 0; i < IP_FAILURE_LIMIT / USER_IP_FAILURE_LIMIT; i++) {
      expect(await fail(`necunoscut${i}`, "10.0.0.3", USER_IP_FAILURE_LIMIT)).toBe(USER_IP_FAILURE_LIMIT);
    }
    expect((await startAuthAttempt("maria", "10.0.0.3")).allowed).toBe(false);
    expect((await startAuthAttempt("maria", "10.0.0.4")).allowed).toBe(true);
  });

  it("încercările refuzate pe utilizator nu consumă din limita IP-ului", async () => {
    await fail("ion", "10.0.0.5", USER_IP_FAILURE_LIMIT);
    // Încă 100 de încercări refuzate pentru ion nu ating limita de 50 a IP-ului.
    expect(await fail("ion", "10.0.0.5", 100)).toBe(0);
    expect(await fail("maria", "10.0.0.5", USER_IP_FAILURE_LIMIT)).toBe(USER_IP_FAILURE_LIMIT);
  });

  it("cererile în paralel nu trec de limită", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 20 }, () => startAuthAttempt("ion", "10.0.0.6"))
    );
    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(USER_IP_FAILURE_LIMIT);
  });
});

describe("startAuthAttempt (Upstash Redis)", () => {
  function configureUpstash() {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://exemplu.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-upstash");
  }

  it("folosește UPSTASH_REDIS_REST_* și cheile nu conțin utilizatorul sau IP-ul", async () => {
    configureUpstash();
    upstash.limit.mockResolvedValue({ success: true });

    const attempt = await startAuthAttempt("ion", "10.0.0.1");
    expect(attempt.allowed).toBe(true);
    expect(upstash.redisOptions).toEqual([
      expect.objectContaining({ url: "https://exemplu.upstash.io", token: "token-upstash" }),
    ]);
    expect(upstash.ratelimitOptions.map((options) => options.prefix)).toEqual([
      "cereri-concediu:auth:ip",
      "cereri-concediu:auth:user-ip",
    ]);
    const keys = upstash.limit.mock.calls.map(([, identifier]) => identifier as string);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).not.toContain("ion");
      expect(key).not.toContain("10.0.0.1");
    }
    expect(vi.mocked(console.info).mock.calls[0][0]).toContain("Upstash Redis");

    // La succes, ambele locuri sunt date înapoi cu o rată negativă.
    await attempt.succeeded();
    expect(upstash.limit).toHaveBeenCalledTimes(4);
    expect(upstash.limit.mock.calls.slice(2).map(([prefix, , options]) => [prefix, options])).toEqual([
      ["cereri-concediu:auth:ip", { rate: -1 }],
      ["cereri-concediu:auth:user-ip", { rate: -1 }],
    ]);
  });

  it("acceptă și vechile KV_REST_API_* (Vercel KV)", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "token-kv");
    upstash.limit.mockResolvedValue({ success: true });
    await startAuthAttempt("ion", "10.0.0.1");
    expect(upstash.redisOptions).toEqual([
      expect.objectContaining({ url: "https://kv.upstash.io", token: "token-kv" }),
    ]);
  });

  it("o pereche incompletă este ignorată, cu avertisment", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://exemplu.upstash.io");
    await startAuthAttempt("ion", "10.0.0.1");
    expect(upstash.redisOptions).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("UPSTASH_REDIS_REST_TOKEN lipsește")
    );
  });

  it("refuză când Redis spune că limita este atinsă, fără să consume din limita IP-ului", async () => {
    configureUpstash();
    upstash.limit.mockImplementation(async (prefix: string) => ({
      success: prefix === "cereri-concediu:auth:ip",
    }));
    const attempt = await startAuthAttempt("ion", "10.0.0.1");
    expect(attempt.allowed).toBe(false);
    expect(upstash.limit).toHaveBeenLastCalledWith("cereri-concediu:auth:ip", expect.any(String), {
      rate: -1,
    });
  });

  it.each([
    ["eroare de rețea", () => Promise.reject(new Error("fetch failed"))],
    ["timeout", () => Promise.resolve({ success: true, reason: "timeout" })],
  ])("la %s trece pe limitele din memorie", async (_label, behaviour) => {
    configureUpstash();
    upstash.limit.mockImplementation(behaviour);

    expect(await fail("ion", "10.0.0.1", USER_IP_FAILURE_LIMIT)).toBe(USER_IP_FAILURE_LIMIT);
    expect((await startAuthAttempt("ion", "10.0.0.1")).allowed).toBe(false);
    expect((await startAuthAttempt("maria", "10.0.0.1")).allowed).toBe(true);
    // Eroarea este scrisă în log, dar nu la fiecare încercare.
    expect(console.error).toHaveBeenCalledOnce();
  });
});
