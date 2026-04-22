import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import {
  CONNECT_REFRESH_URL,
  CONNECT_RETURN_URL,
} from '@/lib/payments';

// -----------------------------------------------------------------------------
// POST /api/stripe/connect/onboard
//
// Starts (or resumes) Stripe Connect Express onboarding for the authed tenant.
// Returns `{ url }` — the hosted Stripe onboarding page where the barber does
// KYC, adds their bank, and accepts the Connected Account Agreement.
//
// If a Connect account already exists for this client we re-use it and just
// generate a fresh AccountLink so the barber can complete / update info. We
// never overwrite the accountId: the account belongs to the barber, we only
// hold the reference.
// -----------------------------------------------------------------------------
export async function POST(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client } = access;

  try {
    let accountId = client.stripeConnectAccountId;

    if (!accountId) {
      // Create a new Express account. `business_type: 'individual'` fits most
      // freelance barbers; Stripe lets the user flip to `company` during
      // onboarding if they register a SL later. Capabilities requested match
      // what we need for the destination-charge flow (card_payments +
      // transfers).
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'ES',
        email: client.email,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          otracita_client_id: client.id,
        },
      });

      accountId = account.id;

      await db
        .update(clients)
        .set({
          stripeConnectAccountId: accountId,
          stripeConnectStatus: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(clients.id, client.id));
    }

    // AccountLink: single-use URL that expires after ~5 min — always create
    // a fresh one on every call so the user can't share/cache a stale link.
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: CONNECT_REFRESH_URL,
      return_url: CONNECT_RETURN_URL,
      type: 'account_onboarding',
    });

    return Response.json({ url: link.url });
  } catch (error) {
    // Surface the real Stripe error to the client so the admin panel / dev
    // console can see what's actually wrong — the generic Stripe SDK message
    // ("An error occurred with our connection to Stripe") hides the root cause.
    const err = error as {
      message?: string;
      type?: string;
      code?: string;
      statusCode?: number;
      raw?: { message?: string };
    };
    const detail = err?.raw?.message || err?.message || 'Stripe error';
    const kind = err?.type || err?.code || 'unknown';
    console.error('[stripe/connect/onboard] failed:', {
      type: err?.type,
      code: err?.code,
      statusCode: err?.statusCode,
      message: detail,
    });
    return Response.json(
      { error: detail, kind, statusCode: err?.statusCode ?? null },
      { status: 500 },
    );
  }
}
