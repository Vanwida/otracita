import { stripe } from '@/lib/stripe';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// POST /api/stripe/connect/login-link
//
// Generates a single-use URL to the Stripe Express Dashboard so the barber
// can view balances, payouts, and their account. Stripe Express accounts
// don't have a permanent login URL — every visit must be a freshly minted
// link (also keeps the session scoped to the tenant we authenticated).
// -----------------------------------------------------------------------------
export async function POST(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client } = access;

  if (!client.stripeConnectAccountId) {
    return Response.json(
      { error: 'Aún no has conectado tu cuenta de cobros.' },
      { status: 400 },
    );
  }

  try {
    const link = await stripe.accounts.createLoginLink(client.stripeConnectAccountId);
    return Response.json({ url: link.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe error';
    console.error('[stripe/connect/login-link] failed:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
