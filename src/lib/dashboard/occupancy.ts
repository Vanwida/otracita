import { db } from '@/db'
import { barbers as barbersTable, bookings, clients as clientsTable } from '@/db/schema'
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { hoursForDate, type WeeklyHours } from '@/lib/availability'

// -----------------------------------------------------------------------------
// Cálculo de % de ocupación de la barbería en un rango de fechas.
//
//   ocupación = minutos reservados (sumados sobre todos los barberos activos)
//             / minutos disponibles (sumados sobre todos los barberos activos
//                                    en sus horarios efectivos)
//
// "Minutos disponibles" usa la regla de availability:
//   - Cada barbero tiene `barbers.hours` (override) o hereda del shop
//   - Si el día está en `barbers.blockedDates` o `clients.blockedDates`, fuera
//   - Resta minutos reservados confirmados/completados (no cancelled)
//
// Devuelve null si no hay minutos disponibles en absoluto (shop cerrado todo
// el rango, o sin barberos activos) — el caller debe mostrar "—".
//
// Coste: O(días × barberos) — aceptable para periodos cortos (≤31 días).
// Para periodos largos / lifetime no tiene sentido este KPI: caller debe
// pasarlo a null antes de llamar.
// -----------------------------------------------------------------------------

interface OccupancyOptions {
  clientId: string
  /** YYYY-MM-DD inclusive. */
  rangeStart: string
  /** YYYY-MM-DD inclusive. */
  rangeEnd: string
  /** Hora actual HH:MM en zona Madrid — solo cuenta hasta now si rangeEnd >= today. */
  nowTime?: string
}

export interface OccupancyResult {
  pct: number                 // 0..100, ya redondeado al entero
  bookedMinutes: number
  availableMinutes: number
}

function parseMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function* iterateDates(start: string, end: string): Generator<string> {
  const cur = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cur <= last) {
    yield cur.toISOString().slice(0, 10)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
}

export async function computeOccupancy(opts: OccupancyOptions): Promise<OccupancyResult | null> {
  const { clientId, rangeStart, rangeEnd, nowTime } = opts

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId))
  if (!client) return null

  const shopHours = (client.chatbotHours as WeeklyHours | null) ?? null
  const shopBlockedDates = (client.blockedDates as string[] | null) ?? []

  const barbers = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, clientId), eq(barbersTable.active, true)))

  if (barbers.length === 0 || !shopHours) return null

  // Minutos disponibles: sumar para cada (día, barbero) los minutos abiertos.
  const todayMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  let availableMinutes = 0
  for (const date of iterateDates(rangeStart, rangeEnd)) {
    if (shopBlockedDates.includes(date)) continue
    for (const barber of barbers) {
      const blockedForBarber = (barber.blockedDates as string[] | null) ?? []
      if (blockedForBarber.includes(date)) continue
      const effectiveHours = (barber.hours as WeeklyHours | null) ?? shopHours
      const slot = hoursForDate(date, effectiveHours)
      if (!slot) continue
      let openMin = parseMin(slot.start)
      let closeMin = parseMin(slot.end)
      // Si el día es hoy y nos pasaron nowTime, recortar el "abierto" hasta ahora
      // para no inflar la disponibilidad con horas pasadas (cuenta como ocupación
      // desperdiciada — más realista).
      if (nowTime && date === todayMadrid) {
        const nowMin = parseMin(nowTime)
        // Si nos hemos pasado del cierre, no hay disponibilidad hoy
        if (nowMin >= closeMin) continue
        // Si todavía no abrió, openMin se queda; sino, closeMin se mueve al "ya pasado"
        // No: queremos contar lo que QUEDA disponible, no inflarlo
        // Decisión: contamos las horas YA TRANSCURRIDAS como disponibilidad
        // pasada — así el % refleja el día completo del barbero, no solo el futuro.
        // (Un % de "lo que llevas" es más útil que "lo que te queda").
        // Por tanto NO recortamos por nowTime — dejamos el día entero.
        void openMin // keep eslint happy
      }
      availableMinutes += Math.max(0, closeMin - openMin)
    }
  }

  if (availableMinutes === 0) return null

  // Minutos reservados — sumar duration de bookings no cancelados en el rango.
  // confirmed + completed cuentan como ocupación; no_show también porque el slot
  // SE OCUPÓ aunque no viniera (el barbero no pudo aceptar otra cita).
  const [bookedRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${bookings.duration}), 0)`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        ne(bookings.status, 'cancelled'),
        gte(bookings.date, rangeStart),
        lte(bookings.date, rangeEnd),
      ),
    )

  const bookedMinutes = Number(bookedRow?.total ?? 0)
  const pct = Math.min(100, Math.round((bookedMinutes / availableMinutes) * 100))

  return { pct, bookedMinutes, availableMinutes }
}
