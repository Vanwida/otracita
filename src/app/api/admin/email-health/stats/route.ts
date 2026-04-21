import type { NextRequest } from 'next/server';
import { getAdminUser } from '@/lib/auth/require-admin';
import { getEmailHealthStats } from '@/lib/email-health-stats';

/** Clamp the `days` query param so callers can't scan years of history. */
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 90;
const DEFAULT_WINDOW_DAYS = 1;

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const daysParam = req.nextUrl.searchParams.get('days');
  const parsed = daysParam ? parseInt(daysParam, 10) : DEFAULT_WINDOW_DAYS;
  const days = Math.min(
    MAX_WINDOW_DAYS,
    Math.max(MIN_WINDOW_DAYS, Number.isFinite(parsed) ? parsed : DEFAULT_WINDOW_DAYS),
  );

  const stats = await getEmailHealthStats(days);
  return Response.json(stats);
}
