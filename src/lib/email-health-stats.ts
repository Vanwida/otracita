import { db } from '@/db';
import { emailParseLog } from '@/db/schema';
import { sql, gte } from 'drizzle-orm';

/** Shape of the stats payload returned by the API and consumed by the dashboard. */
export interface EmailHealthStats {
  windowDays: number;
  total: number;
  full: number;
  partial: number;
  failed: number;
  llm_assisted: number;
  unmatched_client: number;
  /** full + llm_assisted divided by total. 1.0 when total === 0 so the UI doesn't scream on an empty DB. */
  success_rate: number;
}

const STATUS_KEYS = ['full', 'partial', 'failed', 'llm_assisted', 'unmatched_client'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

/**
 * Aggregate email_parse_log entries in the last N days by status.
 * Used by both /api/admin/email-health/stats and the /admin/email-health page.
 * Kept as a single SQL round-trip for dashboard latency.
 */
export async function getEmailHealthStats(days: number): Promise<EmailHealthStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      status: emailParseLog.status,
      n: sql<number>`cast(count(*) as integer)`,
    })
    .from(emailParseLog)
    .where(gte(emailParseLog.receivedAt, since))
    .groupBy(emailParseLog.status);

  const counts: Record<StatusKey, number> = {
    full: 0,
    partial: 0,
    failed: 0,
    llm_assisted: 0,
    unmatched_client: 0,
  };

  for (const row of rows) {
    if ((STATUS_KEYS as readonly string[]).includes(row.status)) {
      counts[row.status as StatusKey] = Number(row.n);
    }
  }

  const total =
    counts.full + counts.partial + counts.failed + counts.llm_assisted + counts.unmatched_client;

  // full + llm_assisted = bookings that made it into the DB safely.
  // 'unmatched_client' is deliberately excluded from the denominator: those
  // emails are not for us, so they shouldn't drag the rate down.
  const parseableTotal = total - counts.unmatched_client;
  const successful = counts.full + counts.llm_assisted;
  const success_rate = parseableTotal === 0 ? 1 : successful / parseableTotal;

  return {
    windowDays: days,
    total,
    full: counts.full,
    partial: counts.partial,
    failed: counts.failed,
    llm_assisted: counts.llm_assisted,
    unmatched_client: counts.unmatched_client,
    success_rate,
  };
}
