// -----------------------------------------------------------------------------
// time — constantes y helpers de tiempo (milisegundos, días, ventanas).
//
// FUENTE ÚNICA de los factores `1000 * 60 * 60 * 24`. Antes existían 26+
// ocurrencias de la misma expresión regadas por admin, dashboard y lib —
// cada una con su variante (`86400000`, `24 * 60 * 60 * 1000`, `1000 * 60 * 60 * 24`).
// El mismo valor escrito tres formas distintas no es un bug pero sí ruido
// que cuesta procesar cuando lees código frío. Aquí, un nombre.
//
// Convenciones:
//   · Usar `MS_IN_*` cuando construyes / restas Date (`new Date(now - 7 * MS_IN_DAY)`).
//   · Usar `daysBetween()` cuando calculas la diferencia en días entre dos
//     fechas — encapsula el `Math.floor((a - b) / MS_IN_DAY)` que se repite
//     en 5+ sitios (formatLastVisit, computeStatus, helpers de promos…).
//   · NO usar para fechas en SQL (PostgreSQL ya tiene `NOW() - INTERVAL '7 days'`).
//     Estos helpers son SOLO para aritmética en JS.
// -----------------------------------------------------------------------------

/** Milisegundos en un segundo. */
export const MS_IN_SECOND = 1000

/** Milisegundos en un minuto. */
export const MS_IN_MINUTE = 60 * MS_IN_SECOND

/** Milisegundos en una hora. */
export const MS_IN_HOUR = 60 * MS_IN_MINUTE

/** Milisegundos en un día (24h). NO ajusta por DST — el cliente lo asume
 *  porque las ventanas que usamos (7 días, 30 días, 90 días) son aproximadas
 *  por naturaleza ("hace ~1 mes"), no fiscales. Para cálculos fiscales con
 *  zonas horarias usa `availability-hours.ts`. */
export const MS_IN_DAY = 24 * MS_IN_HOUR

/**
 * Días enteros transcurridos entre dos timestamps (a − b, redondeado hacia
 * abajo). Encapsula el patrón `Math.floor((a - b) / MS_IN_DAY)` que se
 * repetía en clientes/page, PromosFillModal, informes, billing, admin.
 *
 * Acepta `Date` o `number` (epoch ms). Si recibes ISO strings, convierte
 * antes con `new Date(iso).getTime()`.
 */
export function daysBetween(a: Date | number, b: Date | number): number {
  const aMs = typeof a === 'number' ? a : a.getTime()
  const bMs = typeof b === 'number' ? b : b.getTime()
  return Math.floor((aMs - bMs) / MS_IN_DAY)
}

/**
 * Días enteros transcurridos desde una fecha hasta `Date.now()`. Atajo
 * para el patrón más común: "hace cuántos días pasó X".
 */
export function daysAgo(d: Date | number): number {
  return daysBetween(Date.now(), d)
}

/**
 * Zona horaria operativa del producto. ÚNICA FUENTE de `'Europe/Madrid'`
 * — antes existían 60+ literales regados por availability, bookings, crons,
 * informes, verifactu, agenda, promos…
 *
 * El producto opera en España (peninsular). Toda la lógica de wall-clock
 * (recordatorios "mañana 10:00", agenda mostrada al barbero, IDs de factura
 * por día fiscal) usa este TZ — el servidor vive en UTC, esta string es lo
 * que traduce entre ambos.
 *
 * Si algún día se vende fuera de la península (Canarias, Portugal, México),
 * este TZ pasa a ser per-tenant en `clients.timezone` y este export
 * se mantiene como FALLBACK. Hasta entonces, hardcode pragmático.
 */
export const BUSINESS_TIMEZONE = 'Europe/Madrid'
