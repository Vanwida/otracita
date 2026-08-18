// -----------------------------------------------------------------------------
// service-price — regla única del precio de un servicio (U-12).
//
// El bug: el input de precio venía vacío, el alta sólo exigía nombre, y un
// servicio en blanco se guardaba a 0 €. Caja a cero sin que nadie se entere.
//
// La regla: el precio debe ser > 0, SALVO que el barbero marque
// explícitamente «Cortesía» — ahí el 0 es intencional (invitación, retoque
// gratis, servicio de fidelización). `courtesy` se persiste en el jsonb
// `clients.chatbotServices` junto al resto de campos del servicio; sin ese
// flag el servidor NO acepta un 0.
//
// Precio en EUROS (igual que `bookings.price`), no en céntimos.
//
// Un único módulo compartido por las cuatro puertas de escritura:
//   · wizard de alta            → /dashboard/setup + POST /api/setup
//   · ServicesManager (ajustes) → NegocioSettings + saveBusiness
// -----------------------------------------------------------------------------

/** Mensaje único de error — la UI y el servidor dicen exactamente lo mismo. */
export const SERVICE_PRICE_ERROR =
  'Pon un precio mayor que 0 €, o marca el servicio como cortesía si es gratis.'

/** Tope de cordura: un servicio de barbería nunca cuesta más que esto.
 *  Ataja el typo de teclado (2500 en vez de 25) antes de que llegue a caja. */
export const MAX_SERVICE_PRICE = 10_000

export const MAX_SERVICE_PRICE_ERROR = `El precio no puede superar los ${MAX_SERVICE_PRICE} €.`

/** Precio que se persiste cuando el servicio es cortesía. */
export const COURTESY_PRICE = 0

/**
 * Parsea el valor crudo del precio. Llega como `string` desde los inputs del
 * form y como `number` desde el jsonb ya guardado. Acepta coma decimal
 * (teclado español). Devuelve `null` si está vacío o no es un número finito
 * — ese `null` es precisamente el «lo dejé en blanco» que causaba el bug.
 */
export function parseServicePrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/**
 * Valida el precio de un servicio. Devuelve el mensaje de error, o `null` si
 * es válido. Con `courtesy` activo el precio se ignora: vale 0 a propósito.
 */
export function servicePriceError(
  raw: unknown,
  courtesy?: boolean,
): string | null {
  if (courtesy) return null
  const price = parseServicePrice(raw)
  if (price === null || price <= 0) return SERVICE_PRICE_ERROR
  if (price > MAX_SERVICE_PRICE) return MAX_SERVICE_PRICE_ERROR
  return null
}

/**
 * Precio final a persistir, en euros y como `number` (no string: consumidores
 * como `resolveServiceConfig` en bookings/create.ts exigen `typeof === 'number'`).
 * Cortesía ⇒ 0. Redondea a céntimos para no arrastrar floats sucios.
 */
export function normalizeServicePrice(raw: unknown, courtesy?: boolean): number {
  if (courtesy) return COURTESY_PRICE
  const price = parseServicePrice(raw)
  if (price === null) return COURTESY_PRICE
  return Math.round(price * 100) / 100
}

/**
 * Un servicio ya guardado a 0 € sin flag es dato legacy (anterior a U-12) o
 * viene de una puerta que no conoce el flag (`PATCH /api/yo/services` sólo
 * persiste name/duration/price). Lo tratamos como cortesía para que el
 * barbero pueda seguir editándolo: si no, quedaría atrapado en un form que
 * no deja guardar hasta tocar un campo que él no cambió.
 */
export function inferCourtesy(rawPrice: unknown, courtesy?: unknown): boolean {
  if (typeof courtesy === 'boolean') return courtesy
  return parseServicePrice(rawPrice) === 0
}

/** Etiqueta de precio para listados del dashboard. Cortesía ⇒ «Gratis». */
export function formatServicePrice(raw: unknown, courtesy?: boolean): string {
  if (courtesy) return 'Gratis'
  const price = parseServicePrice(raw)
  if (price === null) return '—'
  return `${price}€`
}
