import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Limitarea încercărilor de autentificare. Se numără doar încercările eșuate:
// fiecare încercare își rezervă un loc înainte de verificarea parolei (atomic, deci
// nici cererile trimise în paralel nu trec de limită) și îl eliberează dacă
// autentificarea reușește.
//
// Cu UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN (sau vechile KV_REST_API_URL/
// KV_REST_API_TOKEN, setate de integrarea Vercel KV) limitele sunt comune tuturor
// instanțelor. Fără ele, sau cât timp Redis nu răspunde, limitele sunt ținute în
// memorie, separat pe fiecare instanță.

const WINDOW = "15 m";
const WINDOW_MS = 15 * 60 * 1000;
/** Pe utilizator + IP: oprește ghicirea parolei unui cont. */
export const USER_IP_FAILURE_LIMIT = 5;
/** Pe IP: mai larg, ca un birou cu IP comun să nu fie blocat din cauza câtorva colegi. */
export const IP_FAILURE_LIMIT = 50;

/** Răspunsul Redis așteptat cel mult atât; după aceea folosim limitele din memorie. */
const REDIS_TIMEOUT_MS = 3000;
/** Plafon pentru limitele din memorie (cheile sunt create și de încercări cu IP-uri false). */
const MAX_MEMORY_KEYS = 10_000;
const ERROR_LOG_INTERVAL_MS = 60 * 1000;

type Reservation = {
  allowed: boolean;
  /** Eliberează locul rezervat (nu face nimic dacă încercarea a fost respinsă). */
  release(): Promise<void>;
};

type Limiter = {
  reserve(key: string): Promise<Reservation>;
};

const rejected: Reservation = { allowed: false, release: async () => {} };

export function createMemoryLimiter(limit: number, windowMs: number): Limiter {
  const entries = new Map<string, { count: number; resetAt: number }>();

  function prune(now: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
    // Map păstrează ordinea inserării: dacă tot sunt prea multe, le scoatem pe cele mai vechi.
    for (const key of entries.keys()) {
      if (entries.size < MAX_MEMORY_KEYS) {
        break;
      }
      entries.delete(key);
    }
  }

  return {
    async reserve(key) {
      const now = Date.now();
      let entry = entries.get(key);
      if (!entry || entry.resetAt <= now) {
        entries.delete(key);
        if (entries.size >= MAX_MEMORY_KEYS) {
          prune(now);
        }
        entry = { count: 0, resetAt: now + windowMs };
        entries.set(key, entry);
      }

      if (entry.count >= limit) {
        return rejected;
      }

      entry.count += 1;
      const reserved = entry;
      return {
        allowed: true,
        async release() {
          // Fereastra s-a reînnoit între timp: locul rezervat a expirat deja.
          if (entries.get(key) === reserved && reserved.count > 0) {
            reserved.count -= 1;
          }
        },
      };
    },
  };
}

let lastErrorLogAt = 0;

function logRedisError(message: string, error?: unknown) {
  const now = Date.now();
  if (now - lastErrorLogAt < ERROR_LOG_INTERVAL_MS) {
    return;
  }
  lastErrorLogAt = now;
  console.error(`[RateLimit] ${message} Folosim limitele din memorie.`, error ?? "");
}

function createRedisLimiter(
  redis: Redis,
  limit: number,
  prefix: string,
  fallback: Limiter
): Limiter {
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, WINDOW),
    prefix,
    analytics: false,
    timeout: REDIS_TIMEOUT_MS,
  });

  return {
    async reserve(key) {
      try {
        const result = await ratelimit.limit(key);
        // La timeout, Ratelimit lasă cererea să treacă fără să fi verificat nimic.
        if (result.reason === "timeout") {
          logRedisError("Redis nu a răspuns la timp.");
          return fallback.reserve(key);
        }
        if (!result.success) {
          return rejected;
        }
        return {
          allowed: true,
          async release() {
            try {
              // O rată negativă dă înapoi locul în fereastra glisantă.
              await ratelimit.limit(key, { rate: -1 });
            } catch (error) {
              logRedisError("Eliberarea încercării în Redis a eșuat.", error);
            }
          },
        };
      } catch (error) {
        logRedisError("Redis nu este disponibil.", error);
        return fallback.reserve(key);
      }
    },
  };
}

function redisCredentials(): { url: string; token: string } | null {
  const pairs: Array<[string, string]> = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ];
  for (const [urlName, tokenName] of pairs) {
    const url = process.env[urlName]?.trim();
    const token = process.env[tokenName]?.trim();
    if (url && token) {
      return { url, token };
    }
    if (url || token) {
      console.warn(
        `[RateLimit] ${url ? tokenName : urlName} lipsește, deci ${url ? urlName : tokenName} este ignorat.`
      );
    }
  }
  return null;
}

type AuthLimiters = { ip: Limiter; userIp: Limiter };

let limiters: AuthLimiters | null = null;

function getLimiters(): AuthLimiters {
  if (limiters) {
    return limiters;
  }

  const memory: AuthLimiters = {
    ip: createMemoryLimiter(IP_FAILURE_LIMIT, WINDOW_MS),
    userIp: createMemoryLimiter(USER_IP_FAILURE_LIMIT, WINDOW_MS),
  };
  const credentials = redisCredentials();

  if (credentials) {
    // Puține reîncercări, ca la o pană Redis login-ul să treacă repede pe limitele din memorie.
    const redis = new Redis({
      ...credentials,
      retry: { retries: 2, backoff: (retryCount) => 100 * 2 ** retryCount },
    });
    limiters = {
      ip: createRedisLimiter(redis, IP_FAILURE_LIMIT, "cereri-concediu:auth:ip", memory.ip),
      userIp: createRedisLimiter(
        redis,
        USER_IP_FAILURE_LIMIT,
        "cereri-concediu:auth:user-ip",
        memory.userIp
      ),
    };
    console.info(
      "[RateLimit] Limitarea autentificărilor folosește Upstash Redis (comună tuturor instanțelor)."
    );
  } else {
    limiters = memory;
    console.info(
      "[RateLimit] Limitarea autentificărilor rulează în memorie, separat pe fiecare instanță " +
        "(setează UPSTASH_REDIS_REST_URL și UPSTASH_REDIS_REST_TOKEN pentru limite comune)."
    );
  }

  return limiters;
}

/** Pentru teste: reface limitele (și recitește variabilele de mediu) la următoarea încercare. */
export function resetAuthRateLimitForTests() {
  limiters = null;
  lastErrorLogAt = 0;
}

// Cheile din Redis nu conțin numele de utilizator sau IP-ul: un HMAC cu secretul
// aplicației, ca nici IP-urile (puține, deci ușor de ghicit) să nu poată fi recuperate.
function digest(value: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "")
    .update(value, "utf8")
    .digest("base64url");
}

export type AuthAttempt = {
  /** false: prea multe încercări eșuate recent; autentificarea trebuie refuzată. */
  allowed: boolean;
  /** Autentificarea a reușit: încercarea nu se mai numără la limite. */
  succeeded(): Promise<void>;
};

const blockedAttempt: AuthAttempt = { allowed: false, succeeded: async () => {} };

/**
 * Începe o încercare de autentificare pentru `username` de la `ip`. Încercarea este
 * refuzată după 5 eșecuri pentru același utilizator de la același IP sau după 50 de
 * eșecuri de la același IP, în ultimele 15 minute. O încercare refuzată nu se numără.
 */
export async function startAuthAttempt(username: string, ip: string): Promise<AuthAttempt> {
  const { ip: ipLimiter, userIp } = getLimiters();
  const user = username.trim().toLowerCase();

  const ipReservation = await ipLimiter.reserve(digest(ip));
  if (!ipReservation.allowed) {
    return blockedAttempt;
  }

  const userReservation = await userIp.reserve(digest(`${user}\n${ip}`));
  if (!userReservation.allowed) {
    await ipReservation.release();
    return blockedAttempt;
  }

  return {
    allowed: true,
    async succeeded() {
      await Promise.all([ipReservation.release(), userReservation.release()]);
    },
  };
}
