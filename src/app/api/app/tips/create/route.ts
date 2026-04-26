import { db } from '@/db'
import { appUsers, bookings, clients, tips } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getAppSession } from '@/lib/app-auth/session'
import { createTipSession, validateTipAmount } from '@/lib/tips'

// -----------------------------------------------------------------------------
// POST /api/app/tips/create
//
// Body: { bookingId: string, amountCents: number }
//
// Genera una sesión de Stripe Checkout para que el cliente PWA pague una
// propina al barbero. Devuelve { url } para que el front redirija.
//
// Validaciones (todas server-side, nunca confiar en el client):
//   1. Sesión PWA activa.
//   2. La reserva existe y pertenece al phone del usuario logueado.
//   3. La barbería tiene `tipsEnabled` y `stripeConnectAccountId`.
//   4. El importe está dentro de [MIN_TIP_CENTS, MAX_TIP_CENTS].
//   5. No hay ya una tip `paid` o `pending` para este booking — evita
//      doble cobro si el cliente clickea dos veces.
//
// El webhook de Stripe (checkout.session.completed) flippea el status del
// tip a 'paid' cuando el pago se completa. Aquí solo devolvemos la URL.
// -----------------------------------------------------------------------------

interface Body {
  bookingId?: string
  amountCents?: number
}

export async function POST(req: Request) {
  const session = await getAppSession()
  if (!session) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const bookingId = body.bookingId?.trim()
  const amountCents = Number(body.amountCents)
  if (!bookingId) return Response.json({ error: 'bookingId requerido' }, { status: 400 })

  const validationError = validateTipAmount(amountCents)
  if (validationError) return Response.json({ error: validationError }, { status: 400 })

  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, session.userId))
  if (!user) return Response.json({ error: 'Usuario no encontrado' }, { status: 401 })

  const [row] = await db
    .select({ booking: bookings, client: clients })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(bookings.id, bookingId))

  if (!row) return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })

  if (digitsOnly(row.booking.customerPhone) !== digitsOnly(user.phone)) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  if (!row.client.tipsEnabled || !row.client.stripeConnectAccountId) {
    return Response.json({ error: 'Esta barbería no acepta propinas online' }, { status: 403 })
  }

  // Anti-doble-cobro: si ya hay una propina paid o pending, no creamos otra.
  const existing = await db
    .select({ id: tips.id, status: tips.status, paymentLinkUrl: tips.paymentLinkUrl })
    .from(tips)
    .where(eq(tips.bookingId, bookingId))

  const alreadyPaid = existing.find((t) => t.status === 'paid')
  if (alreadyPaid) {
    return Response.json({ error: 'Ya pagaste una propina para esta reserva' }, { status: 409 })
  }
  const pending = existing.find((t) => t.status === 'pending' && t.paymentLinkUrl)
  if (pending) {
    // Reusar la URL pendiente — el cliente probablemente refrescó la página
    // o cerró el checkout sin pagar. Mejor que crear sesión Stripe nueva.
    return Response.json({ url: pending.paymentLinkUrl, reused: true })
  }

  try {
    const { url } = await createTipSession({
      client: row.client,
      bookingId,
      customerPhone: user.phone,
      barberName: row.booking.barber,
      amountCents,
    })
    return Response.json({ url })
  } catch (err) {
    console.error('[tips/create] failed:', err)
    return Response.json({ error: 'No se pudo generar el pago' }, { status: 500 })
  }
}

function digitsOnly(p: string | null | undefined): string {
  return (p ?? '').replace(/\D/g, '')
}
