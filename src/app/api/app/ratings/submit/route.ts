import { db } from '@/db'
import { appUsers, bookings, clients } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { getAppSession } from '@/lib/app-auth/session'
import { recordRating } from '@/lib/tips'

// -----------------------------------------------------------------------------
// POST /api/app/ratings/submit
//
// Body: { bookingId: string, rating: 1..5, comment?: string }
//
// El cliente PWA (logueado vía OTP) envía su valoración para una reserva
// suya. Validamos:
//   1. Sesión PWA activa.
//   2. La reserva existe y pertenece a este customer (matching por phone).
//   3. La reserva ya terminó (no se puede valorar antes de venir).
//   4. La reserva no está cancelada.
//   5. El cliente (barbería) tiene `ratingsEnabled` — sino la reseña va al
//      vacío. Devolvemos 403 para que la PWA muestre mensaje claro.
//   6. Idempotencia: si ya valoró esta reserva, devolvemos la valoración
//      existente sin sobrescribir (UNIQUE parcial sobre booking_id en DB).
//
// Marca también `bookings.followupSentAt` para evitar que el cron mande
// otra request de WhatsApp duplicada al mismo cliente.
// -----------------------------------------------------------------------------

interface Body {
  bookingId?: string
  rating?: number
  comment?: string
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
  const rating = Number(body.rating)
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''

  if (!bookingId) return Response.json({ error: 'bookingId requerido' }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: 'Rating debe ser 1-5' }, { status: 400 })
  }
  if (comment.length > 500) {
    return Response.json({ error: 'Comentario demasiado largo (máx 500)' }, { status: 400 })
  }

  // Cargamos al usuario PWA para validar el match phone↔booking.
  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, session.userId))
  if (!user) return Response.json({ error: 'Usuario no encontrado' }, { status: 401 })

  // Booking + cliente en una sola query.
  const [row] = await db
    .select({ booking: bookings, client: clients })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(eq(bookings.id, bookingId))

  if (!row) return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })

  // Match por teléfono — sin esto cualquier sesión PWA podría valorar
  // reservas ajenas conociendo el id.
  if (digitsOnly(row.booking.customerPhone) !== digitsOnly(user.phone)) {
    return Response.json({ error: 'No autorizado para esta reserva' }, { status: 403 })
  }

  if (!row.client.ratingsEnabled) {
    return Response.json({ error: 'Esta barbería no acepta reseñas' }, { status: 403 })
  }

  if (row.booking.status === 'cancelled' || row.booking.status === 'no_show') {
    return Response.json({ error: 'La reserva no es valorable' }, { status: 400 })
  }

  // Solo se puede valorar una vez la reserva ya ha terminado (date+time+duration).
  const endsAt = bookingEndsAt(row.booking.date, row.booking.time, row.booking.duration)
  if (endsAt > new Date()) {
    return Response.json({ error: 'Espera a que termine tu cita para valorar' }, { status: 400 })
  }

  const ratingId = await recordRating({
    clientId: row.client.id,
    bookingId,
    customerPhone: user.phone,
    customerName: user.name,
    barberName: row.booking.barber,
    rating,
    comment,
    channel: 'pwa',
  })

  // Apaga el cron WhatsApp para esta reserva (idempotente; si ya estaba seteado, no pasa nada).
  if (!row.booking.followupSentAt) {
    await db
      .update(bookings)
      .set({ followupSentAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, row.client.id)))
  }

  return Response.json({ ok: true, ratingId, rating })
}

function digitsOnly(p: string | null | undefined): string {
  return (p ?? '').replace(/\D/g, '')
}

function bookingEndsAt(date: string, time: string, duration: number): Date {
  // date: YYYY-MM-DD, time: HH:MM en zona Madrid. Construimos un timestamp
  // local sin timezone para preservar el sentido "hora del barbero".
  const [h, m] = time.split(':').map(Number)
  const [y, mo, d] = date.split('-').map(Number)
  const ms = new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, m ?? 0, 0, 0).getTime()
  return new Date(ms + duration * 60_000)
}
