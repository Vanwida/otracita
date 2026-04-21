import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import type { ConnectStatus } from '@/lib/payments';

// -----------------------------------------------------------------------------
// GET /api/stripe/connect/status
//
// Returns the Stripe Connect status for the authed tenant. Pulls fresh data
// from Stripe (so we never serve a stale cached status after the barber has
// just completed onboarding), and mirrors the resolved status onto the
// client row so dashboards that read directly from the DB stay consistent.
// -----------------------------------------------------------------------------
export async function GET(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client } = access;

  if (!client.stripeConnectAccountId) {
    return Response.json({
      status: 'none' satisfies ConnectStatus,
      accountId: null,
      requirements: null,
    });
  }

  try {
    const account = await stripe.accounts.retrieve(client.stripeConnectAccountId);

    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;
    const detailsSubmitted = account.details_submitted === true;
    const disabledReason = account.requirements?.disabled_reason ?? null;

    let status: ConnectStatus;
    if (chargesEnabled && payoutsEnabled && detailsSubmitted) {
      status = 'active';
    } else if (disabledReason) {
      status = 'restricted';
    } else {
      status = 'pending';
    }

    // Mirror to DB. Only flip activatedAt the first time we see 'active'.
    const now = new Date();
    const nextActivatedAt =
      status === 'active' && !client.stripeConnectActivatedAt ? now : client.stripeConnectActivatedAt;

    if (
      client.stripeConnectStatus !== status ||
      nextActivatedAt !== client.stripeConnectActivatedAt
    ) {
      await db
        .update(clients)
        .set({
          stripeConnectStatus: status,
          stripeConnectActivatedAt: nextActivatedAt,
          updatedAt: now,
        })
        .where(eq(clients.id, client.id));
    }

    return Response.json({
      status,
      accountId: account.id,
      requirements: account.requirements ?? null,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe error';
    console.error('[stripe/connect/status] failed:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
