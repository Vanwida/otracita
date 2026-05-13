import { db } from '@/db'
import { clients, bookings } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { createReaderCheckout, ensureValidAccessToken } from '@/lib/sumup/client'
import { getOauthEnv } from '@/lib/sumup/oauth'

// -----------------------------------------------------------------------------
// POST /api/sumup/checkout/start
//
// Body:
//   {
//     bookingId?: string,        // si el cobro está ligado a una cita
//     amountCents: number,       // importe a cobrar
//     description?: string,      // texto que aparece en el Reader
//   }
//
// Inicia un cobro en el Reader pareado del barbero. El Reader del datáfono
// pita y muestra "acerca tarjeta". El cliente paga, SumUp llama a nuestro
// `return_url` con el resultado y allí creamos el cash_movement final.
//
// Pre-requisitos:
//   - SumUp conectado (access_token + merchant_code)
//   - Reader pareado (sumup_reader_id)
//   - Caja efectivo activa (cashRegisterEnabled) + sesión abierta
//   - SUMUP_AFFILIATE_KEY env configurada (header obligatorio Cloud API)
// -----------------------------------------------------------------------------

interface Body {
  bookingId?: unknown
  amountCents?: unknown
  description?: unknown
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'sumupTapToPay')
  if (gate) return gate
  const { client } = access

  if (!client.sumupAccessToken || !client.sumupRefreshToken || !client.sumupMerchantCode) {
    return Response.json({ error: 'SumUp no conectado' }, { status: 400 })
  }
  if (!client.sumupReaderId) {
    return Response.json({ error: 'Reader no pareado' }, { status: 400 })
  }

  const affiliateKey = process.env.SUMUP_AFFILIATE_KEY
  if (!affiliateKey) {
    return Response.json({ error: 'SUMUP_AFFILIATE_KEY no configurada' }, { status: 500 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const amountCents =
    typeof body.amountCents === 'number'
      ? body.amountCents
      : Number.parseInt(String(body.amountCents ?? ''), 10)
  if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > 1_000_000) {
    return Response.json({ error: 'Importe inválido (1€ – 10.000€)' }, { status: 400 })
  }

  const bookingId = typeof body.bookingId === 'string' && body.bookingId.length > 0 ? body.bookingId : null
  const description =
    typeof body.description === 'string' && body.description.length > 0
      ? body.description.slice(0, 200)
      : null

  // Si bookingId, valida que pertenece al tenant.
  if (bookingId) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, client.id)))
    if (!booking) return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })
  }

  let env: ReturnType<typeof getOauthEnv>
  try {
    env = getOauthEnv()
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'OAuth no configurado' },
      { status: 500 },
    )
  }

  const token = await ensureValidAccessToken({
    clientId: client.id,
    accessToken: client.sumupAccessToken,
    refreshToken: client.sumupRefreshToken,
    expiresAt: client.sumupTokenExpiresAt,
    oauthClientId: env.clientId,
    oauthClientSecret: env.clientSecret,
    persist: async (next) => {
      await db
        .update(clients)
        .set({
          sumupAccessToken: next.accessToken,
          sumupRefreshToken: next.refreshToken,
          sumupTokenExpiresAt: next.expiresAt,
        })
        .where(eq(clients.id, client.id))
    },
  })

  // return_url debe ser absoluta y pública. Incluimos clientId + bookingId
  // como query params para que el callback sepa a qué tenant/booking
  // corresponde sin necesitar lookup adicional.
  const baseUrl = process.env.SUMUP_OAUTH_REDIRECT_URI?.replace(
    '/api/sumup/oauth/callback',
    '',
  )
  if (!baseUrl) {
    return Response.json({ error: 'SUMUP_OAUTH_REDIRECT_URI no configurada' }, { status: 500 })
  }
  const returnUrl = new URL('/api/sumup/checkout/return', baseUrl)
  returnUrl.searchParams.set('clientId', client.id)
  if (bookingId) returnUrl.searchParams.set('bookingId', bookingId)

  try {
    const checkout = await createReaderCheckout(
      token,
      client.sumupMerchantCode,
      client.sumupReaderId,
      {
        amountCents,
        currency: 'EUR',
        returnUrl: returnUrl.toString(),
        description: description ?? `otracita ${client.id.slice(0, 8)}`,
        affiliateKey,
      },
    )
    return Response.json({
      ok: true,
      clientTransactionId: checkout.data.client_transaction_id,
      readerName: client.sumupReaderName,
    })
  } catch (err) {
    console.error('[sumup/checkout/start] failed:', err)
    return Response.json({ error: 'No se pudo iniciar el cobro en el Reader' }, { status: 502 })
  }
}
