import { db } from '@/db'
import { bookings } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireMobileAuth, mobileAuthErrorResponse } from '@/lib/auth/mobile-session'
import { recordSumupCheckoutResult } from '@/lib/sumup/record-checkout'

// -----------------------------------------------------------------------------
// POST /api/app/mobile/checkout/record
//
// Body:
//   {
//     sumupTransactionId: string,    // del SumUp iOS SDK tras Tap to Pay
//     status: 'SUCCESSFUL' | 'CANCELLED' | 'FAILED' | 'REFUNDED',
//     amountCents: number,
//     bookingId?: string,            // si el cobro está atado a una cita
//     reference?: string,            // texto humano (opcional)
//     timestampIso?: string,         // si no se manda, usamos now()
//   }
//
// La app móvil llama esto tras procesar un Tap to Pay con el SDK iOS de
// SumUp. El SDK devuelve resultado a la app; la app nos lo manda con la
// session token móvil para que registremos en cash_movements.
//
// Auth: token móvil (Bearer) en header.
//
// Reusa toda la lógica de `recordSumupCheckoutResult` (idempotencia,
// match con sesión activa, refunds, cierre de booking encadenado).
// -----------------------------------------------------------------------------

interface Body {
  sumupTransactionId?: unknown
  status?: unknown
  amountCents?: unknown
  bookingId?: unknown
  reference?: unknown
  timestampIso?: unknown
}

export async function POST(req: Request) {
  const auth = await requireMobileAuth(req)
  if (!auth.ok) return mobileAuthErrorResponse(auth)
  const { client } = auth

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const txId = typeof body.sumupTransactionId === 'string' ? body.sumupTransactionId.trim() : ''
  if (!txId) return Response.json({ error: 'sumupTransactionId requerido' }, { status: 400 })

  const status = typeof body.status === 'string' ? body.status : ''
  if (!['SUCCESSFUL', 'CANCELLED', 'FAILED', 'REFUNDED'].includes(status)) {
    return Response.json({ error: 'status inválido' }, { status: 400 })
  }

  const amountCents =
    typeof body.amountCents === 'number'
      ? body.amountCents
      : Number.parseInt(String(body.amountCents ?? ''), 10)
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return Response.json({ error: 'amountCents inválido' }, { status: 400 })
  }

  const bookingIdRaw = typeof body.bookingId === 'string' && body.bookingId.length > 0 ? body.bookingId : null
  const reference =
    typeof body.reference === 'string' && body.reference.length > 0 ? body.reference.slice(0, 200) : null
  const timestampIso =
    typeof body.timestampIso === 'string' ? body.timestampIso : new Date().toISOString()

  // Si bookingId, validamos pertenencia al tenant.
  let validatedBookingId: string | null = null
  if (bookingIdRaw) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bookingIdRaw), eq(bookings.clientId, client.id)))
    if (!booking) return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })
    validatedBookingId = booking.id
  }

  const result = await recordSumupCheckoutResult({
    clientId: client.id,
    sumupTransactionId: txId,
    status,
    amountCents,
    currency: 'EUR',
    timestampIso,
    bookingId: validatedBookingId,
    reference: reference ?? `Tap to Pay ${txId}`,
    paymentType: 'TAP_TO_PAY',
  })

  return Response.json({ ok: true, ...result })
}
