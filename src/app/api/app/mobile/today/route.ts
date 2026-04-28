import { db } from '@/db'
import { bookings } from '@/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { requireMobileAuth, mobileAuthErrorResponse } from '@/lib/auth/mobile-session'

// -----------------------------------------------------------------------------
// GET /api/app/mobile/today
//
// Lista de bookings que la app móvil muestra en home:
//   · Citas de HOY confirmed o no_show con price > 0 (para cobrar)
//   · Citas de los últimos 2 días en confirmed (pendientes de cerrar) con price > 0
//
// Ordenadas por fecha+hora ascendente.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await requireMobileAuth(req)
  if (!auth.ok) return mobileAuthErrorResponse(auth)
  const { client } = auth

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const dayBeforeYesterdayStr = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Europe/Madrid',
  })

  const rows = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      time: bookings.time,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      service: bookings.service,
      barber: bookings.barber,
      price: bookings.price,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        gte(bookings.date, dayBeforeYesterdayStr),
        lt(bookings.date, sql`(${todayStr}::date + interval '1 day')::text`),
      ),
    )

  const today = rows
    .filter((b) => b.date === todayStr && (b.status === 'confirmed' || b.status === 'no_show'))
    .sort((a, b) => a.time.localeCompare(b.time))

  const pendingClosure = rows
    .filter((b) => b.date < todayStr && b.status === 'confirmed' && b.price && b.price > 0)
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))

  return Response.json({ today, pendingClosure, todayDateIso: todayStr })
}
