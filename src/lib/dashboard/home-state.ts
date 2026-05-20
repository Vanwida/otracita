import { hoursForDate, type WeeklyHours } from '@/lib/availability'
import { MS_IN_DAY } from '@/lib/time'

// -----------------------------------------------------------------------------
// Home state machine — qué titular muestra /dashboard según hora del día,
// estado del shop, citas pendientes y activación. La home es una superficie
// de un solo titular: el state machine decide cuál.
//
// 6 estados (brief shape dashboard-home):
//   1. preOpening      — abres más tarde, aún no
//   2. nextImminent    — abierto, próxima cita en ≤ 30min
//   3. midShiftGap     — abierto, próxima cita > 30min, o sin más citas hoy
//   4. closingPending  — cerrado + citas por cerrar
//   5. done            — cerrado + nada pendiente (o día cerrado entero)
//   6. pendingActivation — la cuenta aún no está activa (status='pending')
//
// La lógica vive aquí (pura, testeable). El render del titular vive en
// dashboard/page.tsx — separación deliberada: el copy y los tokens visuales
// son del componente, los hechos son de aquí.
// -----------------------------------------------------------------------------

export interface BookingForHero {
  id: string
  time: string // HH:MM
  customerName: string | null
  service: string
  barber: string | null
  status: string
}

export type HomeState =
  | { kind: 'pendingActivation' }
  | {
      kind: 'preOpening'
      openTime: string
      firstBookingTime: string | null
      firstBookingCustomer: string | null
      totalToday: number
    }
  | {
      kind: 'nextImminent'
      minutesUntil: number
      booking: BookingForHero
      followUps: BookingForHero[]
    }
  | {
      kind: 'midShiftGap'
      nextBookingTime: string | null
      restOfDay: BookingForHero[]
    }
  | {
      kind: 'closingPending'
      pendingCount: number
      closedCount: number
      totalToday: number
    }
  | {
      kind: 'done'
      revenueToday: number
      bookingsToday: number
      tipsToday: number
      nextOpen: { weekday: string; time: string } | null
      shopClosedAllDay: boolean
    }

export interface HomeStateInput {
  clientStatus: string
  /** Lookup semanal del shop. null = sin horario configurado. */
  shopHours: WeeklyHours | null
  /** Días bloqueados a nivel shop (ISO YYYY-MM-DD). */
  blockedDates: string[]
  /** YYYY-MM-DD en zona Madrid. */
  todayStr: string
  /** HH:MM en zona Madrid. */
  nowTime: string
  /** Citas de hoy (todas, ya filtradas por client). Se filtran aquí por status. */
  todayBookings: BookingForHero[]
  /** Resumen diario para state 'done'. */
  revenueToday: number
  tipsToday: number
  /** Citas pendientes de cerrar (de ayer + anteayer en confirmed). */
  pendingClosuresCount: number
}

const IMMINENT_THRESHOLD_MIN = 30

function parseMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

const WEEKDAY_LABELS_ES: Record<(typeof WEEKDAY_KEYS)[number], string> = {
  sunday: 'el domingo',
  monday: 'el lunes',
  tuesday: 'el martes',
  wednesday: 'el miércoles',
  thursday: 'el jueves',
  friday: 'el viernes',
  saturday: 'el sábado',
}

/**
 * Encuentra el próximo día abierto buscando hasta 7 días adelante.
 * Devuelve null si no hay ninguno (shop sin horarios o todo bloqueado).
 */
function findNextOpenDay(
  todayStr: string,
  shopHours: WeeklyHours | null,
  blockedDates: string[],
): { weekday: string; time: string } | null {
  if (!shopHours) return null
  const today = new Date(`${todayStr}T00:00:00`)
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(today.getTime() + offset * MS_IN_DAY)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (blockedDates.includes(iso)) continue
    const slot = hoursForDate(iso, shopHours)
    if (!slot) continue
    const dayKey = WEEKDAY_KEYS[d.getDay()]
    return { weekday: WEEKDAY_LABELS_ES[dayKey], time: slot.start }
  }
  return null
}

export function computeHomeState(input: HomeStateInput): HomeState {
  if (input.clientStatus === 'pending') {
    return { kind: 'pendingActivation' }
  }

  const todayBlocked = input.blockedDates.includes(input.todayStr)
  const slot = todayBlocked ? null : hoursForDate(input.todayStr, input.shopHours)
  const nowMin = parseMin(input.nowTime)

  // Filtramos las citas relevantes: confirmed/completed, ordenadas por hora.
  const activeBookings = input.todayBookings
    .filter((b) => b.status === 'confirmed' || b.status === 'completed')
    .sort((a, b) => a.time.localeCompare(b.time))

  const totalToday = activeBookings.length

  // Cierres pendientes ganan después de la hora de cierre.
  const closeMin = slot ? parseMin(slot.end) : -Infinity
  const isAfterClose = !slot || nowMin >= closeMin

  if (isAfterClose) {
    if (input.pendingClosuresCount > 0) {
      return {
        kind: 'closingPending',
        pendingCount: input.pendingClosuresCount,
        closedCount: activeBookings.filter((b) => b.status === 'completed').length,
        totalToday,
      }
    }
    return {
      kind: 'done',
      revenueToday: input.revenueToday,
      bookingsToday: totalToday,
      tipsToday: input.tipsToday,
      nextOpen: findNextOpenDay(input.todayStr, input.shopHours, input.blockedDates),
      shopClosedAllDay: !slot,
    }
  }

  // Estamos en horas: o pre-opening (slot no abrió aún) o mid-shift.
  if (slot) {
    const openMin = parseMin(slot.start)
    if (nowMin < openMin) {
      const first = activeBookings.find((b) => b.status === 'confirmed') ?? null
      return {
        kind: 'preOpening',
        openTime: slot.start,
        firstBookingTime: first?.time ?? null,
        firstBookingCustomer: first?.customerName ?? null,
        totalToday,
      }
    }
  }

  // Mid-shift. Buscamos la próxima cita confirmada futura.
  const upcoming = activeBookings.filter(
    (b) => b.status === 'confirmed' && parseMin(b.time) >= nowMin,
  )
  const next = upcoming[0] ?? null

  if (next) {
    const minutesUntil = parseMin(next.time) - nowMin
    if (minutesUntil <= IMMINENT_THRESHOLD_MIN) {
      return {
        kind: 'nextImminent',
        minutesUntil,
        booking: next,
        followUps: upcoming.slice(1, 3),
      }
    }
    return {
      kind: 'midShiftGap',
      nextBookingTime: next.time,
      restOfDay: upcoming.slice(0, 4),
    }
  }

  // En horas, sin más citas hoy → mid-shift gap con nextBookingTime null
  return {
    kind: 'midShiftGap',
    nextBookingTime: null,
    restOfDay: [],
  }
}
