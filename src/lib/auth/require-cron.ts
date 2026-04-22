import { timingSafeEqual } from 'node:crypto';

/**
 * Auth helper for Vercel Cron routes. Vercel automatically adds
 * `Authorization: Bearer $CRON_SECRET` to every scheduled cron invocation
 * when CRON_SECRET is set as an env var at the project level. We compare
 * with timingSafeEqual so auth can't be probed via response timing.
 *
 * Returns null if the request is authorized; otherwise returns a Response
 * the caller should return directly.
 */
export function requireCron(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[require-cron] CRON_SECRET not configured — rejecting cron');
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!provided || provided.length !== expected.length) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
