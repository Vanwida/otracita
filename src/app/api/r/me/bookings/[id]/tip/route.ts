import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/db'
import { tips } from '@/db/schema'
import {
  requireBarberAccess,
  barberAccessErrorResponse,
} from '@/lib/barber-auth/tenant'
import { loadOwnedBooking } from '@/lib/barber-auth/booking-scope'
import { recordTipSequential } from '@/lib/payments/record-tip'

// POST /api/r/me/bookings/[id]/tip — registra una propina al barbero sobre
// SU cita (independiente del cobro principal). Scope-limited a citas
// asignadas al barbero current. Idempotencia ligera (mismo patrón que
// /api/bookings/[id]/tip): si hay un tip reciente (<5 min) al mismo
// barbero por el mismo booking, devolvemos el existente.

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000

interface Body {
  amountCents?: unknown
  method?: unknown
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireBarberAccess(req)
  if (!access.ok) return barberAccessErrorResponse(access)
  const { barber, client } = access
  const { id: bookingId } = await params

  const booking = await loadOwnedBooking(barber, client, bookingId)
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  if (
    typeof body.amountCents !== 'number' ||
    !Number.isInteger(body.amountCents) ||
    body.amountCents <= 0
  ) {
    return Response.json(
      { error: 'amountCents debe ser un entero positivo en céntimos.' },
      { status: 400 },
    )
  }
  if (body.method !== 'cash' && body.method !== 'card') {
    return Response.json(
      { error: "method debe ser 'cash' o 'card'." },
      { status: 400 },
    )
  }

  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS)
  const [existing] = await db
    .select({ id: tips.id, amountCents: tips.amountCents })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, client.id),
        eq(tips.bookingId, bookingId),
        eq(tips.barberId, barber.id),
        eq(tips.status, 'paid'),
        gte(tips.paidAt, since),
      ),
    )
  if (existing) {
    return Response.json({
      tipId: existing.id,
      amountCents: existing.amountCents,
      deduped: true,
    })
  }

  const result = await recordTipSequential(db, {
    clientId: client.id,
    bookingId,
    customerPhone: booking.customerPhone ?? '—',
    amountCents: body.amountCents as number,
    method: body.method as 'cash' | 'card',
    barberId: barber.id,
    barberName: barber.name,
    cashRegisterEnabled: Boolean(client.cashRegisterEnabled),
    createdByEmail: null,
  })

  return Response.json(
    {
      tipId: result.tipId,
      cashMovementId: result.cashMovementId,
      deduped: false,
    },
    { status: 201 },
  )
}
