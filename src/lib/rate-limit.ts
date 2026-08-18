// -----------------------------------------------------------------------------
// In-memory per-key rate limiter.
//
// Simple fixed-window counter: `max` requests per `windowMs` window, bucketed
// per key. The Map lives in the serverless instance's memory — it does NOT
// survive cold starts and does NOT share state across regions or lambda
// instances. That's a KNOWN LIMITATION: this is the MVP launch safety net,
// not a production-grade limiter. Swap for Upstash Redis (or similar)
// post-launch when we see real traffic patterns.
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

/** One minute in milliseconds — the default window size. */
export const WINDOW_MINUTE_MS = 60_000;

/** One hour in milliseconds — for budgets the user perceives as hourly (OTP). */
export const WINDOW_HOUR_MS = 3_600_000;

/** Soft cap on distinct keys tracked. Beyond this, oldest entries get pruned. */
const MAX_TRACKED_KEYS = 10_000;

/** Above this wait we phrase the 429 in minutes instead of "un momento". */
const LONG_WAIT_SECONDS = 60;

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
 * allowed under the `max` budget for the current window.
 *
 * Each key carries its own window, so an hourly budget (OTP) and a per-minute
 * budget (availability grid) can coexist — the keys are namespaced per
 * endpoint and never collide.
 *
 * @param key      Stable identifier (clientId, IP, phone, etc.)
 * @param max      Upper bound of calls per window.
 * @param windowMs Window size in ms. Defaults to one minute.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number = WINDOW_MINUTE_MS,
): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    // Opportunistic eviction — keeps the Map bounded on long-running instances.
    if (buckets.size >= MAX_TRACKED_KEYS) {
      pruneExpired(now);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(0, max - 1) };
  }

  if (current.count >= max) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  current.count += 1;
  return { ok: true, remaining: Math.max(0, max - current.count) };
}

function pruneExpired(now: number): void {
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Spanish wait phrasing. With hourly windows "en un momento" would be a lie —
 * the caller may be locked out for the best part of an hour.
 */
function waitPhrase(retryAfter?: number): string {
  if (!retryAfter || retryAfter < LONG_WAIT_SECONDS) return 'en un momento';
  const minutes = Math.ceil(retryAfter / 60);
  return minutes === 1 ? 'en 1 minuto' : `en ${minutes} minutos`;
}

/**
 * Convenience: build a standard 429 JSON response from a failed check.
 * Centralised so every endpoint emits the same shape + `Retry-After` header.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: `Demasiadas peticiones. Inténtalo de nuevo ${waitPhrase(result.retryAfter)}.`,
    }),
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
