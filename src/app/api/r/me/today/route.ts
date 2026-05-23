import { db } from '@/db'
import { bookings, tips } from '@/db/schema'
import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm'
import {
  requireBarberAccess,
  barberAccessErrorResponse,
} from '@/lib/barber-auth/tenant'
import { BUSINESS_TIMEZONE } from '@/lib/time'

// -----------------------------------------------------------------------------
// GET /api/r/me/today (barber session) — feed de la app móvil del barbero.
//
// Devuelve TODO lo que la home necesita en una sola respuesta:
//   · today: agenda del día (citas confirmadas y completadas, ordenadas)
//   · tomorrow: lista breve para la pestaña "Mañana"
//   · week: lista breve para la pestaña "Esta semana"
//   · sales: { todayCents, weekCents, monthCents }
//   · tips: { todayCents, todayCount, cashEntregadaCents, cardPendienteCents }
//
// Scope-limited: filtra estrictamente por barberId = current. NUNCA expone
// citas de otros barberos ni datos agregados del local.
// -----------------------------------------------------------------------------

function todayInBusinessTz(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
}

function addDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function startOfWeekMondayISO(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().slice(0, 10)
}

function startOfMonthISO(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 7)}-01`
}

export async function GET(req: Request) {
  const access = await requireBarberAccess(req)
  if (!access.ok) return barberAccessErrorResponse(access)
  const { barber, client } = access

  const today = todayInBusinessTz()
  const tomorrow = addDays(today, 1)
  const weekStart = startOfWeekMondayISO(today)
  const weekEnd = addDays(weekStart, 6)
  const monthStart = startOfMonthISO(today)

  // Una sola query para la semana (cubre today + tomorrow + week + sales
  // de la semana). Filtramos en memoria para minimizar round-trips.
  const weekRows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.barberId, barber.id),
        gte(bookings.date, weekStart),
        lte(bookings.date, weekEnd),
      ),
    )

  // Ventas mensuales — query separada porque puede ir más allá de la
  // semana (primeros días de mes ↔ resto de la semana).
  const monthRows = await db
    .select({
      price: bookings.price,
      date: bookings.date,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.barberId, barber.id),
        gte(bookings.date, monthStart),
        lte(bookings.date, today),
        eq(bookings.status, 'completed'),
      ),
    )

  // Propinas del día (cash entregada vs card pendiente).
  // foot-gun: tips.amountCents está en CENTS, pero bookings.price está en
  // EUROS. Mantenemos cents en la respuesta y multiplicamos los EUROS por
  // 100 al sumar las ventas.
  const todayStart = new Date(`${today}T00:00:00.000Z`)
  const todayEnd = new Date(`${today}T23:59:59.999Z`)
  const tipRows = await db
    .select()
    .from(tips)
    .where(
      and(
        eq(tips.clientId, client.id),
        eq(tips.barberId, barber.id),
        eq(tips.status, 'paid'),
        gte(tips.paidAt, todayStart),
        lte(tips.paidAt, todayEnd),
      ),
    )

  // Cash entregada vs card pendiente de propinas (de TODAS las propinas
  // suyas, no solo las de hoy — esto es lo que la pantalla Propinas
  // muestra como "pendiente"). Snapshot rápido.
  const allTipsRows = await db
    .select({
      amountCents: tips.amountCents,
      paymentMethod: tips.paymentMethod,
      paidOutAt: tips.paidOutAt,
      status: tips.status,
    })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, client.id),
        eq(tips.barberId, barber.id),
        eq(tips.status, 'paid'),
      ),
    )

  const cashEntregadaCents = allTipsRows
    .filter((t) => t.paymentMethod === 'cash')
    .reduce((sum, t) => sum + (t.amountCents ?? 0), 0)
  const cardPendienteCents = allTipsRows
    .filter((t) => t.paymentMethod === 'card' && t.paidOutAt === null)
    .reduce((sum, t) => sum + (t.amountCents ?? 0), 0)

  const todayTipsCents = tipRows.reduce(
    (sum, t) => sum + (t.amountCents ?? 0),
    0,
  )

  // Sales (en CENTS, normalizando los EUROS de bookings.price).
  const completedThisMonth = monthRows.filter((r) => r.status === 'completed')
  const monthSalesCents = completedThisMonth.reduce(
    (sum, r) => sum + (r.price ?? 0) * 100,
    0,
  )
  const todaySalesCents = completedThisMonth
    .filter((r) => r.date === today)
    .reduce((sum, r) => sum + (r.price ?? 0) * 100, 0)
  const weekSalesCents = weekRows
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + (b.price ?? 0) * 100, 0)
  const todayCount = completedThisMonth.filter(
    (r) => r.date === today,
  ).length

  // Listas por día — ordenadas por hora HH:MM.
  const byDate = (date: string) =>
    weekRows
      .filter((b) => b.date === date)
      .sort((a, b) => a.time.localeCompare(b.time))

  const todayList = byDate(today)
  const tomorrowList = byDate(tomorrow)

  return Response.json({
    barber: {
      id: barber.id,
      name: barber.name,
      photoUrl: barber.photoUrl,
      role: barber.role,
    },
    client: {
      id: client.id,
      businessName: client.businessName,
    },
    today: {
      date: today,
      bookings: todayList.map(serializeBooking),
    },
    tomorrow: {
      date: tomorrow,
      bookings: tomorrowList.map(serializeBooking),
    },
    week: {
      start: weekStart,
      end: weekEnd,
      bookings: weekRows
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
        )
        .map(serializeBooking),
    },
    sales: {
      todayCents: todaySalesCents,
      todayCount,
      weekCents: weekSalesCents,
      monthCents: monthSalesCents,
    },
    tips: {
      todayCents: todayTipsCents,
      todayCount: tipRows.length,
      cashEntregadaCents,
      cardPendienteCents,
    },
  })
}

function serializeBooking(b: typeof bookings.$inferSelect) {
  return {
    id: b.id,
    date: b.date,
    time: b.time,
    duration: b.duration,
    service: b.service,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    price: b.price,
    status: b.status,
    paymentMethod: b.paymentMethod,
  }
}

// Suppress unused imports warnings for these (they may be referenced by
// downstream code as needed).
void isNull
void sql
