/**
 * Counters that drive the red number badges in the admin sidebar.
 *
 * Each badge means "this section has N things that need your attention
 * right now". Numbers stay small and load fast — they run on every admin
 * page render via the shared layout.
 *
 * Rules:
 *  - Only count things that actually need ACTION (rejected, pending review,
 *    expired). Never count things that are healthy (issued, accepted).
 *  - Each counter is a single COUNT() so the layout query cost is bounded.
 */

import { and, eq, gte, lte, or, sql, inArray, isNotNull } from 'drizzle-orm';
// Note: nav-badges runs on every admin page load — keep each counter to a
// single COUNT(*) and run them in parallel via Promise.all below.
import { db } from '@/db';
import {
  clients,
  leads,
  invoices,
  emailParseLog,
} from '@/db/schema';
import type { AdminNavBadges } from '@/app/admin/_components/AdminSidebarNav';

/**
 * Token expiry window — clients whose Meta access token expires inside the
 * next 7 days. Below this they get into "you need to act" territory.
 */
const TOKEN_EXPIRY_DAYS = 7;

/** Inbound parser failures inside this window count toward the parser badge. */
const PARSER_WINDOW_DAYS = 1;

export async function getAdminNavBadges(): Promise<AdminNavBadges> {
  const now = new Date();
  const expirySoon = new Date(now);
  expirySoon.setDate(expirySoon.getDate() + TOKEN_EXPIRY_DAYS);

  const parserSince = new Date(now);
  parserSince.setDate(parserSince.getDate() - PARSER_WINDOW_DAYS);

  const [
    onboardingPending,
    leadsNew,
    verifactuFailing,
    botTokensExpiring,
    parserFailures,
  ] = await Promise.all([
    // Onboarding — clients still in `pending` status
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.status, 'pending'))
      .then((r) => r[0]?.c ?? 0),

    // Leads — sum of: status=new + leads with overdue/today next_action.
    // Either condition means Alex has something to do with this lead today.
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        or(
          eq(leads.status, 'new'),
          and(isNotNull(leads.nextActionAt), lte(leads.nextActionAt, now)),
        ),
      )
      .then((r) => r[0]?.c ?? 0),

    // VeriFactu — invoices in a non-terminal failing state. Pending + rejected
    // + accepted_with_errors all need a manual retry.
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(invoices)
      .where(inArray(invoices.verifactuStatus, ['pending', 'rejected', 'accepted_with_errors', 'error']))
      .then((r) => r[0]?.c ?? 0),

    // Bot — active clients with Meta token expiring soon (or already expired).
    // Only count tenants that ARE using WhatsApp (token actually set).
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.status, 'active'),
          isNotNull(clients.whatsappAccessToken),
          isNotNull(clients.metaTokenExpiresAt),
          or(
            lte(clients.metaTokenExpiresAt, now),
            and(
              gte(clients.metaTokenExpiresAt, now),
              lte(clients.metaTokenExpiresAt, expirySoon),
            ),
          ),
        ),
      )
      .then((r) => r[0]?.c ?? 0),

    // Parser — failures in last 24h (full = healthy, anything else = needs eyes)
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(emailParseLog)
      .where(
        and(
          gte(emailParseLog.receivedAt, parserSince),
          inArray(emailParseLog.status, ['partial', 'failed', 'unmatched_client']),
        ),
      )
      .then((r) => r[0]?.c ?? 0),
  ]);

  return {
    onboarding: onboardingPending,
    leads: leadsNew,
    verifactu: verifactuFailing,
    bot: botTokensExpiring,
    parser: parserFailures,
  };
}
