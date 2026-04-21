// -----------------------------------------------------------------------------
// In-memory per-key rate limiter.
//
// Simple fixed-window counter: `maxPerMinute` requests per rolling 60-second
// window, bucketed per key. The Map lives in the serverless instance's memory
// — it does NOT survive cold starts and does NOT share state across regions
// or lambda instances. That's a KNOWN LIMITATION: this is the MVP launch
// safety net, not a production-grade limiter. Swap for Upstash Redis
// (or similar) post-launch when we see real traffic patterns.
//
// Why it's still worth shipping: most abuse comes from a single client
// looping a single endpoint, which does get caught here. It also buys us
// time to react to LLM bill spikes before the bot enters a runaway state.
// -----------------------------------------------------------------------------

interface Bucket {
  count: number;
  /** Unix ms when the current window resets. */
  resetAt: number;
}

/** One minute in milliseconds — the window size. */
const WINDOW_MS = 60_000;

/** Soft cap on distinct keys tracked. Beyond this, oldest entries get pruned. */
const MAX_TRACKED_KEYS = 10_000;

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  /** Whether the caller is allowed to proceed. */
  ok: boolean;
  /** Seconds until the window resets (only when rate-limited). */
  retryAfter?: number;
  /** Remaining calls in the current window. */
  remaining: number;
}

/**
 * Atomically increment the counter for `key`. Returns whether the call is
 * allowed under the `maxPerMinute` budget.
 *
 * @param key          Stable identifier (clientId, IP, etc.)
 * @param maxPerMinute Upper bound per 60s window.
 */
export function checkRateLimit(key: string, maxPerMinute: number): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    // Opportunistic eviction — keeps the Map bounded on long-running instances.
    if (buckets.size >= MAX_TRACKED_KEYS) {
      pruneExpired(now);
    }
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: Math.max(0, maxPerMinute - 1) };
  }

  if (current.count >= maxPerMinute) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  current.count += 1;
  return { ok: true, remaining: Math.max(0, maxPerMinute - current.count) };
}

function pruneExpired(now: number): void {
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Convenience: build a standard 429 JSON response from a failed check.
 * Centralised so every endpoint emits the same shape + `Retry-After` header.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ error: 'Demasiadas peticiones. Inténtalo de nuevo en un momento.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...(result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : {}),
      },
    },
  );
}

/** Exposed for tests — resets all counters. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
