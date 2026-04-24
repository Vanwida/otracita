// -----------------------------------------------------------------------------
// VeriFactu — helpers de formato (puros, sin dependencias de DB).
//
// Separados de chain.ts para poder testear sin necesitar DATABASE_URL.
// Cualquier cambio aquí afecta al hash → tests obligatorios.
// -----------------------------------------------------------------------------

/**
 * Formatea una fecha a DD-MM-YYYY según el campo FechaExpedicionFactura AEAT.
 * Se toma siempre en zona horaria Madrid — el negocio opera ahí y AEAT usa
 * la TZ local del emisor.
 */
export function formatFechaExpedicion(date: Date): string {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)
  const day = parts.find((p) => p.type === 'day')!.value
  const month = parts.find((p) => p.type === 'month')!.value
  const year = parts.find((p) => p.type === 'year')!.value
  return `${day}-${month}-${year}`
}

/**
 * Formatea un Date a ISO 8601 con offset Madrid (ej. 2024-01-01T19:20:30+01:00).
 * Requerido en FechaHoraHusoGenRegistro — el huso es PARTE del hash.
 *
 * Manejamos DST: en invierno +01:00 (CET), en verano +02:00 (CEST).
 */
export function formatFechaHoraHusoGen(date: Date): string {
  // Obtener offset Madrid para esta fecha concreta (maneja DST).
  const madridTime = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const utcTime = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMinutes = Math.round((madridTime.getTime() - utcTime.getTime()) / 60000)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMinutes)
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0')
  const mm = String(absMin % 60).padStart(2, '0')
  const offset = `${sign}${hh}:${mm}`

  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset}`
}

/**
 * Céntimos → string "N.DD" con exactamente 2 decimales.
 * AEAT admite 1 o 2 decimales; nosotros siempre emitimos 2 para consistencia
 * visual y evitar ambigüedad en la comparación de hashes.
 */
export function centsToDecimal(cents: number): string {
  const abs = Math.abs(cents)
  const euros = Math.floor(abs / 100)
  const rem = abs % 100
  const decimals = rem.toString().padStart(2, '0')
  return `${cents < 0 ? '-' : ''}${euros}.${decimals}`
}
