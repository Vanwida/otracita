// -----------------------------------------------------------------------------
// Booking snapshot math — UNA sola fuente para calcular qué se persiste en las
// columnas snapshot de `bookings` cuando una cita tiene varios servicios (R7).
//
// Modelo de datos:
//   · `bookings.service` / `bookings.duration` / `bookings.priceCents` siguen siendo
//     el snapshot del SERVICIO PRINCIPAL (compat: agenda, loyalty, followup,
//     y 4 de 5 callers de createBooking leen estas columnas tal cual).
//   · Los servicios EXTRA viven en la tabla aditiva `booking_services`.
//
// Foot-gun crítico: `bookings.duration` alimenta el chequeo de solape en
// `availability` y en `create.ts`. Si una cita multi-servicio guarda solo la
// duración del principal, el motor reserva un hueco demasiado corto y permite
// doble-booking encima de la segunda mitad de la cita. Por eso `duration`
// SNAPSHOT = suma de duraciones (principal + extras). El precio NO se suma
// aquí: `bookings.priceCents` se mantiene como el del principal y la factura emite
// una línea por servicio (ver invoicing.ts) — así loyalty/agenda no cambian.
// -----------------------------------------------------------------------------

/** Un servicio extra de una cita multi-servicio. */
export interface BookingServiceLine {
  name: string
  durationMin: number
  /** CÉNTIMOS enteros (1250 = 12,50 €). null = extra de cortesía. */
  priceCents: number | null
}

export interface BookingSnapshot {
  /** Lo que va a `bookings.duration` — suma principal + extras. */
  durationMin: number
}

/**
 * Calcula la duración snapshot de una cita.
 *
 * @param primaryDurationMin  duración del servicio principal (min, > 0)
 * @param extras              servicios adicionales (puede ser [] o undefined)
 *
 * Sin extras → devuelve exactamente `primaryDurationMin` (comportamiento
 * idéntico al de hoy, garantiza que los 4 callers sin multi-servicio no
 * cambian de comportamiento). Con extras → suma sus duraciones (ignora
 * entradas con duración <= 0 para que un extra a medio rellenar en la UI no
 * envenene el snapshot).
 */
export function computeBookingSnapshot(
  primaryDurationMin: number,
  extras?: ReadonlyArray<{ durationMin: number }> | null,
): BookingSnapshot {
  const base = Number.isFinite(primaryDurationMin) ? Math.max(0, primaryDurationMin) : 0
  if (!extras || extras.length === 0) {
    return { durationMin: base }
  }
  const extrasSum = extras.reduce((acc, s) => {
    const d = Number.isFinite(s.durationMin) ? s.durationMin : 0
    return acc + (d > 0 ? d : 0)
  }, 0)
  return { durationMin: base + extrasSum }
}

/**
 * Normaliza+valida la lista de servicios extra que llega del cliente. Devuelve
 * solo las entradas válidas (nombre no vacío, duración entera > 0). El precio
 * es opcional (null permitido — un extra de cortesía). Caller no debe confiar
 * en el shape crudo del body.
 */
export function sanitizeExtraServices(input: unknown): BookingServiceLine[] {
  if (!Array.isArray(input)) return []
  const out: BookingServiceLine[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const durationMin =
      typeof r.durationMin === 'number' && Number.isFinite(r.durationMin)
        ? Math.trunc(r.durationMin)
        : 0
    if (!name || durationMin <= 0) continue
    // `priceEuros` es el nombre LEGACY del campo (euros) que usaba el wire
    // antes de L-05. Se sigue aceptando para que una pestaña del dashboard
    // abierta desde antes del deploy no mande el extra como cortesía y se
    // pierda el dinero. Eliminable cuando el deploy esté asentado.
    const centsRaw =
      typeof r.priceCents === 'number' && Number.isFinite(r.priceCents) && r.priceCents >= 0
        ? Math.round(r.priceCents)
        : typeof r.priceEuros === 'number' && Number.isFinite(r.priceEuros) && r.priceEuros >= 0
          ? Math.round(r.priceEuros * 100)
          : null
    out.push({ name, durationMin, priceCents: centsRaw })
  }
  return out
}

// -----------------------------------------------------------------------------
// Solape de citas — predicado puro reutilizable. La lógica de clash vivía
// duplicada en create.ts y en el PATCH de reasignación; al editar la duración
// de una cita (A3) hace falta otra vez. Esta es la fuente pura testeable: dos
// minutos [start, end) solapan teniendo en cuenta el buffer del cliente, y el
// match de barbero es por id O por nombre (case-insensitive), como en
// create.ts (no infra-detecta cuando barberId es null en filas legacy).
// -----------------------------------------------------------------------------

/** Cita existente, mínima para el chequeo de solape. */
export interface OverlapBooking {
  id: string
  time: string // HH:MM
  duration: number // min (snapshot, ya incluye extras)
  barberId: string | null
  barber: string | null
  status: string
}

/** La cita que se está creando/editando. */
export interface OverlapCandidate {
  /** id de la propia cita al EDITAR (se excluye de la comparación). null al crear. */
  selfId: string | null
  startMinutes: number
  durationMin: number
  barberId: string | null
  barber: string | null
}

/** "HH:MM" 24h → minutos desde medianoche. Compartido (route + helper). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * ¿La cita candidata pisa alguna existente del MISMO barbero?
 *
 * - Ignora canceladas y la propia cita (`selfId`).
 * - Barbero igual = mismo barberId O mismo nombre (trim+lowercase) — idéntico
 *   a create.ts para no divergir.
 * - Solape de intervalos con buffer del cliente al final de la existente:
 *   `newStart < bEnd && newEnd > bStart`.
 *
 * Puro (sin I/O) → unit-testeable. El caller hace el SELECT y pasa las filas.
 */
export function hasBookingOverlap(
  candidate: OverlapCandidate,
  existing: OverlapBooking[],
  serviceBufferMinutes: number,
): boolean {
  const newStart = candidate.startMinutes
  const newEnd = newStart + candidate.durationMin
  return existing.some((b) => {
    if (b.status === 'cancelled') return false
    if (candidate.selfId && b.id === candidate.selfId) return false
    const sameBarber =
      (candidate.barberId && b.barberId && b.barberId === candidate.barberId) ||
      (!!candidate.barber &&
        !!b.barber &&
        b.barber.trim().toLowerCase() === candidate.barber.trim().toLowerCase())
    if (!sameBarber) return false
    const bStart = hhmmToMinutes(b.time)
    const bEnd = bStart + b.duration + serviceBufferMinutes
    return newStart < bEnd && newEnd > bStart
  })
}
