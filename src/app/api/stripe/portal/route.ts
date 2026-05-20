import { stripe } from '@/lib/stripe'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { SITE_URLS } from '@/lib/site'

/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session for the authed tenant and returns
 * the hosted URL. The client redirects there so the customer can manage card,
 * invoices, and cancel / pause the subscription.
 *
 * Multi-tenant safe: the `stripeCustomerId` comes from the authed client
 * record, never from the request body.
 */
export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  const { client } = access

  if (!client.stripeCustomerId) {
    return Response.json(
      { error: 'No tienes una cuenta de Stripe asociada. Contacta con soporte.' },
      { status: 400 }
    )
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripeCustomerId,
      return_url: SITE_URLS.miPlan(),
    })

    return Response.json({ url: session.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error creando el portal'
    console.error('[stripe/portal] failed:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
