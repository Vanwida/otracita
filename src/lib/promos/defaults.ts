// Defaults compartidos por la feature "Promos contextuales".
//
// Vivien hardcoded a propósito: el barbero no configura nada, solo elige
// la ventana y el descuento al vuelo desde el modal. Si en el futuro
// vemos que un barbero siempre cambia los mismos valores, los movemos a
// columnas en `clients` (premature optimization si lo hacemos ahora).

/** Pasos sensatos para el slider de descuento. Evita 7,3% por accidente. */
export const DISCOUNT_STOPS = [5, 10, 15, 20, 25] as const

export const DEFAULT_DISCOUNT_PCT = 10

/** Cuántos días debe haber pasado desde la última promo a este cliente. */
export const RATE_LIMIT_DAYS = 7

/** Mínimo de visitas en últimos 90 días para considerar "fiel". */
export const LOYAL_VISITS_THRESHOLD = 3
export const LOYAL_VISITS_WINDOW_DAYS = 90

/** Si el cliente vino hace menos de N días, no le lanzamos promo (estaría
 *  saturado). */
export const RECENT_VISIT_COOLDOWN_DAYS = 14

/** Si el cliente tiene N+ no-shows, no le premiamos con descuento. */
export const NO_SHOW_EXCLUDE_THRESHOLD = 2

/** Default de cuántos clientes seleccionar al abrir el modal (caben todos
 *  si hay menos). El barbero puede ajustar. */
export const DEFAULT_MAX_CUSTOMERS = 15

/**
 * Genera el mensaje plantilla de la promo. Editable por el barbero antes
 * de mandar. Mantén corto — los push se truncan en ~120 chars en algunos
 * dispositivos.
 */
export function defaultPromoMessage(opts: {
  businessName: string
  discountPct: number
  windowLabel: string
}): string {
  return `Tengo huecos ${opts.windowLabel.toLowerCase()} en ${opts.businessName}. Si vienes te aplico ${opts.discountPct}% de descuento. Reserva por WhatsApp.`
}
