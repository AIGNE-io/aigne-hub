/**
 * KV-based rate limiter for API keys.
 * Uses sliding window counters with 1-minute buckets.
 */

const DEFAULT_LIMIT = 60; // requests per minute
const WINDOW_SECONDS = 60;
const KV_PREFIX = 'ratelimit:';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // unix seconds
}

/**
 * Check and increment rate limit for an API key.
 * Returns whether the request is allowed and remaining quota.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  keyId: string,
  limit: number = DEFAULT_LIMIT
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / WINDOW_SECONDS);
  const kvKey = `${KV_PREFIX}${keyId}:${bucket}`;
  const resetAt = (bucket + 1) * WINDOW_SECONDS;

  try {
    const current = parseInt((await kv.get(kvKey)) || '0', 10);

    if (current >= limit) {
      return { allowed: false, limit, remaining: 0, resetAt };
    }

    // Increment counter with TTL (auto-expire after window)
    await kv.put(kvKey, String(current + 1), { expirationTtl: WINDOW_SECONDS * 2 });

    return { allowed: true, limit, remaining: limit - current - 1, resetAt };
  } catch {
    // KV failure should not block requests — allow by default
    return { allowed: true, limit, remaining: limit, resetAt };
  }
}
