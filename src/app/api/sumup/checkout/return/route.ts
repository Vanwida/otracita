import { db } from '@/db'
import { bookings } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { recordSumupCheckoutResult } from '@/lib/sumup/record-checkout'

// -----------------------------------------------------------------------------
// POST/GET /api/sumup/checkout/return
//
// Callback que SumUp llama tras finalizar un checkout iniciado via Cloud API
// (Reader físico). Query params puestos por /checkout/start:
//   · clientId   (uuid del tenant)
//   · bookingId  (opcional)
//
// Body típico de SumUp:
//   { id, transaction_code, status, amount, currency, timestamp }
//
// Toda la lógica de inserción + idempotencia + cierre de booking vive en
// `recordSumupCheckoutResult`. Aquí solo extraemos params y validamos
// pertenencia del booking. Devolvemos siempre 200 OK para que SumUp no
// reintente en bucle ante errores nuestros.
// -----------------------------------------------------------------------------

interface CallbackBody {
  id?: unknown
  transaction_code?: unknown
  status?: unknown
  amount?: unknown
  currency?: unknown
  timestamp?: unknown
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  const bookingIdParam = url.searchParams.get('bookingId')

  if (!clientId) {
    console.error('[sumup/return] missing clientId in query')
    return Response.json({ ok: true })
  }

  let body: CallbackBody = {}
  try {
    body = (await req.json()) as CallbackBody
  } catch {
    body = {}
  }

  const txId = typeof body.id === 'string' ? body.id : null
  const status = typeof body.status === 'string' ? body.status : null
  const amount = typeof body.amount === 'number' ? body.amount : null
  const currency = typeof body.currency === 'string' ? body.currency : 'EUR'
  const timestampIso = typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString()
  const reference =
    typeof body.transaction_code === 'string' ? `SumUp ${body.transaction_code}` : null

  if (!txId || !status || amount == null || amount <= 0) {
    console.error('[sumup/return] payload incompleto', body)
    return Response.json({ ok: true })
  }

  // Validar bookingId pertenece al client (nunca confiar en query params).
  let validatedBookingId: string | null = null
  if (bookingIdParam) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bookingIdParam), eq(bookings.clientId, clientId)))
    if (booking) validatedBookingId = booking.id
  }

  const result = await recordSumupCheckoutResult({
    clientId,
    sumupTransactionId: txId,
    status,
    amountCents: Math.round(amount * 100),
    currency,
    timestampIso,
    bookingId: validatedBookingId,
    reference,
    paymentType: 'POS',
    rawPayload: body as unknown as Record<string, unknown>,
  })

  return Response.json({ ok: true, outcome: result.outcome })
}

export async function POST(req: Request) {
  return handle(req)
}
export async function GET(req: Request) {
  return handle(req)
}
