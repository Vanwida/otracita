import { db } from '@/db'
import { bookings as bookingsTable, barbers as barbersTable } from '@/db/schema'
import { and, eq, gte, lte, ne } from 'drizzle-orm'
import { hoursForDate, type WeeklyHours } from '@/lib/availability'

// -----------------------------------------------------------------------------
// Detección de huecos en una ventana de fechas para "Promos contextuales".
//
// A diferencia del availability engine para reservas (que pregunta "¿cabe un
// servicio de X minutos en esta fecha y barbero?"), aquí preguntamos "¿hay
// hueco LIBRE relevante en este rango?". Devolvemos un resumen agregado:
//
//   - cuántos huecos detectamos
//   - cuántos minutos libres totales
//   - los gaps individuales (para mostrarlos en el modal si queremos)
//
// Reglas:
//   · Solo días con horario de apertura (respeta blockedDates a nivel shop).
//   · Solo gaps de >= MIN_GAP_MINUTES (no contamos huecos de 5 min).
//   · Si todos los barberos están ocupados a la vez, no hay hueco; basta
//     con que UN barbero esté libre para que el slot cuente como disponible.
//   · No miramos hoy antes de "ahora" — tiempo pasado no es hueco que llenar.
// -----------------------------------------------------------------------------

const MIN_GAP_MINUTES = 30

export interface Gap {
  date: string                                                            // YYYY-MM-DD
  start: string                                                           // HH:MM
  end: string                                                             // HH:MM
  minutes: number
}

export interface DetectGapsResult {
  gaps: Gap[]
  totalMinutes: number
  totalDays: number
}

interface DetectOptions {
  clientId: string
  shopHours: WeeklyHours | null
  shopBlockedDates: string[]
  /** YYYY-MM-DD inclusive. */
  rangeStart: string
  /** YYYY-MM-DD inclusive. */
  rangeEnd: string
}

function parseMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function* iterateDates(start: string, end: string): Generator<string> {
  const cur = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cur <= last) {
    yield cur.toISOString().slice(0, 10)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
}

/**
 * Detecta huecos libres en el rango. Cada gap es un intervalo continuo
 * en el que **al menos un barbero está libre** y el shop está abierto.
 */
export async function detectGaps(opts: DetectOptions): Promise<DetectGapsResult> {
  const { clientId, shopHours, shopBlockedDates, rangeStart, rangeEnd } = opts

  // Cargamos todos los barberos activos para saber con quién comparar.
  const barberRows = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, clientId), eq(barbersTable.active, true)))
  if (barberRows.length === 0) {
    // Sin equipo configurado consideramos solo el horario shop como un único
    // canal. Si todo el día está libre, lo sumamos.
  }

  // Cargamos todas las reservas del rango (no canceladas). Una sola query.
  const bookingRows = await db
    .select({
      date: bookingsTable.date,
      time: bookingsTable.time,
      duration: bookingsTable.duration,
      barberId: bookingsTable.barberId,
      barber: bookingsTable.barber,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.clientId, clientId),
        ne(bookingsTable.status, 'cancelled'),
        gte(bookingsTable.date, rangeStart),
        lte(bookingsTable.date, rangeEnd),
      ),
    )

  // Bucket de reservas por fecha y barbero (id o nombre).
  type Interval = { start: number; end: number; barberId: string | null; barberName: string | null }
  const byDate = new Map<string, Interval[]>()
  for (const b of bookingRows) {
    const start = parseMin(b.time)
    const end = start + b.duration
    const list = byDate.get(b.date) ?? []
    list.push({
      start,
      end,
      barberId: b.barberId ?? null,
      barberName: b.barber?.trim().toLowerCase() ?? null,
    })
    byDate.set(b.date, list)
  }

  // Cutoff de hoy: no contamos minutos pasados.
  const todayMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  let nowMinutes = 0
  if (rangeStart <= todayMadrid && todayMadrid <= rangeEnd) {
    const t = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const [h, m] = t.split(':').map(Number)
    nowMinutes = h * 60 + m
  }

  const gaps: Gap[] = []
  let totalMinutes = 0
  const daysWithGaps = new Set<string>()

  for (const date of iterateDates(rangeStart, rangeEnd)) {
    if (date < todayMadrid) continue
    if (shopBlockedDates.includes(date)) continue
    const hours = hoursForDate(date, shopHours)
    if (!hours) continue

    let openMin = parseMin(hours.start)
    const closeMin = parseMin(hours.end)
    if (date === todayMadrid) openMin = Math.max(openMin, nowMinutes)
    if (openMin >= closeMin) continue

    const dayBookings = byDate.get(date) ?? []

    // Estrategia: para cada minuto del día (en step 15) preguntamos "¿hay
    // al menos un barbero libre?". Si sí → libre. Compactamos minutos
    // contiguos libres en intervalos. O(D × B) por día — D es pequeño y
    // B también, no hace falta optimizar.
    const STEP = 15

    // Si no hay equipo configurado tratamos el shop como un único canal.
    const barberCount = barberRows.length || 1

    interface Slot {
      start: number
      free: boolean
    }
    const slots: Slot[] = []
    for (let t = openMin; t + STEP <= closeMin; t += STEP) {
      const slotEnd = t + STEP
      let busyChannels = 0
      if (barberRows.length === 0) {
        // Sin equipo: contamos cualquier reserva como ocupando "el" canal.
        const occupied = dayBookings.some((b) => b.start < slotEnd && b.end > t)
        busyChannels = occupied ? 1 : 0
      } else {
        for (const barber of barberRows) {
          const lname = barber.name.trim().toLowerCase()
          const occupied = dayBookings.some((b) => {
            if (b.start >= slotEnd || b.end <= t) return false
            if (b.barberId && b.barberId === barber.id) return true
            if (!b.barberId && b.barberName && b.barberName === lname) return true
            return false
          })
          if (occupied) busyChannels++
        }
      }
      slots.push({ start: t, free: busyChannels < barberCount })
    }

    // Compactar runs de free=true en gaps.
    let runStart: number | null = null
    for (let i = 0; i <= slots.length; i++) {
      const s = slots[i]
      const isFree = s?.free === true
      if (isFree && runStart === null) runStart = s.start
      if ((!isFree || i === slots.length) && runStart !== null) {
        const runEnd = s ? s.start : closeMin
        const minutes = runEnd - runStart
        if (minutes >= MIN_GAP_MINUTES) {
          gaps.push({
            date,
            start: fmtMin(runStart),
            end: fmtMin(runEnd),
            minutes,
          })
          totalMinutes += minutes
          daysWithGaps.add(date)
        }
        runStart = null
      }
    }
  }

  return { gaps, totalMinutes, totalDays: daysWithGaps.size }
}

// -----------------------------------------------------------------------------
// Helpers de ventanas predefinidas. El modal expone "Hoy", "Mañana",
// "Este finde" como presets — esta función los traduce a (rangeStart, rangeEnd).
// -----------------------------------------------------------------------------

export type WindowPreset = 'today' | 'tomorrow' | 'weekend' | 'next7'

export function resolveWindow(preset: WindowPreset): { start: string; end: string; label: string } {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const t = new Date(`${today}T00:00:00Z`)

  switch (preset) {
    case 'today':
      return { start: today, end: today, label: 'Hoy' }
    case 'tomorrow': {
      t.setUTCDate(t.getUTCDate() + 1)
      const d = t.toISOString().slice(0, 10)
      return { start: d, end: d, label: 'Mañana' }
    }
    case 'weekend': {
      // Próximo viernes-domingo en Europe/Madrid. Si hoy es viernes/sábado,
      // empieza hoy; si es domingo, empieza hoy también; si es entresemana,
      // empieza el viernes próximo.
      const day = t.getUTCDay() // 0 dom, 5 vie, 6 sab
      let offsetStart = 0
      if (day < 5 && day > 0) offsetStart = 5 - day
      // Fin = domingo (6 sería sábado, 0 sería domingo)
      const offsetEnd = day === 0 ? 0 : 7 - day // hasta domingo incluido
      const startD = new Date(t)
      startD.setUTCDate(startD.getUTCDate() + offsetStart)
      const endD = new Date(t)
      endD.setUTCDate(endD.getUTCDate() + offsetEnd)
      return { start: startD.toISOString().slice(0, 10), end: endD.toISOString().slice(0, 10), label: 'Este finde' }
    }
    case 'next7': {
      const endD = new Date(t)
      endD.setUTCDate(endD.getUTCDate() + 6)
      return { start: today, end: endD.toISOString().slice(0, 10), label: 'Próximos 7 días' }
    }
  }
}
