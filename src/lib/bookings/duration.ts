// -----------------------------------------------------------------------------
// Booking snapshot math — UNA sola fuente para calcular qué se persiste en las
// columnas snapshot de `bookings` cuando una cita tiene varios servicios (R7).
//
// Modelo de datos:
//   · `bookings.service` / `bookings.duration` / `bookings.price` siguen siendo
//     el snapshot del SERVICIO PRINCIPAL (compat: agenda, loyalty, followup,
//     y 4 de 5 callers de createBooking leen estas columnas tal cual).
//   · Los servicios EXTRA viven en la tabla aditiva `booking_services`.
//
// Foot-gun crítico: `bookings.duration` alimenta el chequeo de solape en
// `availability` y en `create.ts`. Si una cita multi-servicio guarda solo la
// duración del principal, el motor reserva un hueco demasiado corto y permite
// doble-booking encima de la segunda mitad de la cita. Por eso `duration`
// SNAPSHOT = suma de duraciones (principal + extras). El precio NO se suma
// aquí: `bookings.price` se mantiene como el del principal y la factura emite
// una línea por servicio (ver invoicing.ts) — así loyalty/agenda no cambian.
// -----------------------------------------------------------------------------

/** Un servicio extra de una cita multi-servicio. */
export interface BookingServiceLine {
  name: string
  durationMin: number
  priceEuros: number | null
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
  extras?: BookingServiceLine[] | null,
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
    const priceEuros =
      typeof r.priceEuros === 'number' && Number.isFinite(r.priceEuros) && r.priceEuros >= 0
        ? r.priceEuros
        : null
    out.push({ name, durationMin, priceEuros })
  }
  return out
}
