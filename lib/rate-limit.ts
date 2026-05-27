import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

function createInMemoryLimiter(limit: number, windowMs: number) {
  return {
    async limit(identifier: string): Promise<{ success: boolean; reset: number }> {
      const now = Date.now();
      const entry = inMemoryStore.get(identifier);

      if (!entry || now > entry.resetAt) {
        inMemoryStore.set(identifier, { count: 1, resetAt: now + windowMs });
        return { success: true, reset: now + windowMs };
      }

      if (entry.count >= limit) {
        return { success: false, reset: entry.resetAt };
      }

      entry.count += 1;
      return { success: true, reset: entry.resetAt };
    },
  };
}

function getKvRatelimit(limit: number, window: `${number} ${"s" | "m" | "h" | "d"}`) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null;
  }

  return new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
  });
}

const authKvLimit = getKvRatelimit(5, "15 m");
const authInMemory = createInMemoryLimiter(5, 15 * 60 * 1000);

export async function rateLimitAuth(ip: string): Promise<boolean> {
  if (authKvLimit) {
    const result = await authKvLimit.limit(`auth:${ip}`);
    return result.success;
  }

  const result = await authInMemory.limit(`auth:${ip}`);
  return result.success;
}
