import { db } from '@/db'
import { clients, customers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { canonicalPhone } from '@/lib/phone'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { ensureCustomerSetupIntent } from '@/lib/stripe/setup-intent'

// -----------------------------------------------------------------------------
// POST /api/public/bookings/setup-intent
//
// Público (sin auth) — lo llama el form de reserva /b/[slug] SOLO cuando el
// negocio tiene tarifa de no-show (`clients.no_show_fee_cents > 0`). Devuelve
// el client_secret de un SetupIntent para que el cliente guarde su tarjeta
// (Payment Element) antes de confirmar la reserva.
//
// Multi-tenant: el tenant se resuelve por slug en el servidor; el clientId
// NUNCA viene del cliente. Rate-limited por IP+teléfono igual que el create.
//
// Si la tarifa NO está activa devuelve { required:false } y el form salta el
// paso de tarjeta (cero cambios de comportamiento para esos negocios).
// -----------------------------------------------------------------------------

interface Body {
  slug?: unknown
  customerPhone?: unknown
  customerName?: unknown
  customerEmail?: unknown
}

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anon'
  )
}

export async function POST(req: Request) {
  const ipLimit = checkRateLimit(`public-setup-ip:${clientIp(req)}`, 10)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const rawPhone =
    typeof body.customerPhone === 'string' ? body.customerPhone.trim() : ''
  const customerName =
    typeof body.customerName === 'string' ? body.customerName.trim() : ''
  const customerEmail =
    typeof body.customerEmail === 'string' ? body.customerEmail.trim() : ''

  if (!slug) return Response.json({ error: 'slug requerido' }, { status: 400 })
  if (!rawPhone)
    return Response.json({ error: 'Teléfono requerido' }, { status: 400 })

  const phone = canonicalPhone(rawPhone)
  const phoneLimit = checkRateLimit(`public-setup-phone:${phone}`, 5)
  if (!phoneLimit.ok) return rateLimitResponse(phoneLimit)

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    return Response.json(
      { error: 'Pagos no configurados (falta publishable key).' },
      { status: 500 },
    )
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) {
    return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  }

  const feeCents = client.noShowFeeCents ?? 0
  // Tarifa desactivada → el form no debe pedir tarjeta. Cero cambios para
  // negocios que no han activado la feature.
  if (feeCents <= 0) {
    return Response.json({ required: false })
  }

  // Reutiliza el Stripe Customer si este cliente ya guardó tarjeta aquí.
  const [existing] = await db
    .select({ stripeCustomerId: customers.stripeCustomerId })
    .from(customers)
    .where(and(eq(customers.clientId, client.id), eq(customers.phone, phone)))

  try {
    const result = await ensureCustomerSetupIntent({
      clientId: client.id,
      customerPhone: phone,
      customerName: customerName || null,
      customerEmail: customerEmail || null,
      existingStripeCustomerId: existing?.stripeCustomerId ?? null,
    })
    return Response.json({
      required: true,
      feeCents,
      clientSecret: result.clientSecret,
      setupIntentId: result.setupIntentId,
      publishableKey,
    })
  } catch (err) {
    console.error('[public/setup-intent] failed:', err)
    return Response.json(
      { error: 'No se pudo preparar el guardado de tarjeta. Reintenta.' },
      { status: 502 },
    )
  }
}
