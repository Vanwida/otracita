import { db } from '@/db'
import { cashSessions, cashMovements, sumupPendingTransactions, bookings } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// POST /api/sumup/checkout/return  (también GET por si SumUp pega una redirección)
//
// Webhook al que SumUp llama tras finalizar (éxito o fallo) un checkout
// que iniciamos via /api/sumup/checkout/start. Crea cash_movement al
// instante en la sesión activa, o en sumup_pending_transactions si no
// la hay.
//
// Query params (los puso /checkout/start):
//   · clientId   (uuid del tenant)
//   · bookingId  (opcional, si el cobro corresponde a una cita)
//
// Body (formato SumUp):
//   {
//     "id": "...",
//     "transaction_code": "...",
//     "status": "SUCCESSFUL" | "FAILED" | "CANCELLED" | "REFUNDED",
//     "amount": 25.0,
//     "currency": "EUR",
//     "timestamp": "2026-04-28T10:00:00Z"
//   }
//
// Idempotencia: cash_movements.sumup_transaction_id UNIQUE.
// SumUp puede reenviar el callback si no recibe 2xx — devolvemos 200 OK
// incluso en errores nuestros, así no hay reintentos infinitos.
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
  const bookingId = url.searchParams.get('bookingId')

  if (!clientId) {
    console.error('[sumup/return] missing clientId in query')
    return Response.json({ ok: true })
  }

  let body: CallbackBody = {}
  try {
    body = (await req.json()) as CallbackBody
  } catch {
    // SumUp puede llamar con form-encoded o redirección sin body — degradamos
    body = {}
  }

  const txId = typeof body.id === 'string' ? body.id : null
  const status = typeof body.status === 'string' ? body.status : null
  const amount = typeof body.amount === 'number' ? body.amount : null
  const currency = typeof body.currency === 'string' ? body.currency : 'EUR'
  const timestamp =
    typeof body.timestamp === 'string' ? new Date(body.timestamp) : new Date()

  if (!txId || !status || amount == null || amount <= 0) {
    console.error('[sumup/return] payload incompleto', body)
    return Response.json({ ok: true })
  }

  // Solo procesamos SUCCESSFUL y REFUNDED. CANCELLED/FAILED ignoramos
  // (el cobro no llegó a cerrarse, no entra en caja).
  if (status !== 'SUCCESSFUL' && status !== 'REFUNDED') {
    return Response.json({ ok: true, ignored: status })
  }

  const amountCents = Math.round(amount * 100)

  // Idempotencia: si ya existe un movement con este txId, no duplicar.
  const [exists] = await db
    .select({ id: cashMovements.id })
    .from(cashMovements)
    .where(eq(cashMovements.sumupTransactionId, txId))
  if (exists) return Response.json({ ok: true, duplicate: true })

  const [existsPending] = await db
    .select({ id: sumupPendingTransactions.id })
    .from(sumupPendingTransactions)
    .where(eq(sumupPendingTransactions.sumupTransactionId, txId))
  if (existsPending) return Response.json({ ok: true, duplicate: true })

  const [openSession] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.clientId, clientId), isNull(cashSessions.closedAt)))

  // Sin sesión abierta → buffer pending. Se importa al abrir caja siguiente.
  if (!openSession) {
    await db.insert(sumupPendingTransactions).values({
      clientId,
      sumupTransactionId: txId,
      amountCents,
      currency,
      status,
      paymentType: 'POS',
      transactionTimestamp: timestamp,
      rawPayload: body as unknown as Record<string, unknown>,
    })
    return Response.json({ ok: true, buffered: true })
  }

  // Hay sesión abierta — insertar directo.
  // Si bookingId está en query, vinculamos. Validamos pertenencia primero.
  let validatedBookingId: string | null = null
  if (bookingId) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, clientId)))
    if (booking) validatedBookingId = booking.id
  }

  await db.insert(cashMovements).values({
    clientId,
    sessionId: openSession.id,
    kind: status === 'REFUNDED' ? 'refund' : 'booking',
    method: 'card',
    amountCents,
    sumupTransactionId: txId,
    referenceType: validatedBookingId ? 'booking' : null,
    referenceId: validatedBookingId,
    notes: `SumUp ${typeof body.transaction_code === 'string' ? body.transaction_code : txId}`,
  })

  return Response.json({ ok: true })
}

export async function POST(req: Request) {
  return handle(req)
}
export async function GET(req: Request) {
  return handle(req)
}
