export type RateLimitConfig = { windowMs: number; max: number };

type RateLimitEntry = { count: number; resetAt: number };
const memoryStore = new Map<string, RateLimitEntry>();

// Periodic cleanup of stale in-memory counters
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
      if (entry.resetAt <= now) memoryStore.delete(key);
    }
  }, 60_000);
  timer.unref?.();
}

/**
 * In-memory sliding window rate limiter suitable for Edge Runtime and single-process servers.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count++;
  if (entry.count > config.max) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Rate limit tiers for different endpoint categories */
export const RATE_LIMITS = {
  auth:         { windowMs: 15 * 60 * 1000, max: 10 }, // 10 per 15 min
  registration: { windowMs: 60 * 60 * 1000, max: 10 }, // 10 per hour
  payment:      { windowMs: 60 * 1000, max: 10 },      // 10 per minute
  admin:        { windowMs: 60 * 1000, max: 60 },      // 60 per minute
  general:      { windowMs: 60 * 1000, max: 30 },      // 30 per minute
} as const;
