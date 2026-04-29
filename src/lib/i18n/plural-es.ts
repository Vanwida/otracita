// -----------------------------------------------------------------------------
// Pluralización en castellano. Pequeño y previsible: si n === 1, singular;
// si no, plural. Quien quiera "ninguno/a" para n === 0 que lo gestione fuera
// (semánticamente "0 citas" es válido y la traducción típica).
//
// Por qué no Intl.PluralRules: pesa más, hace más, y aquí solo necesitamos
// dos formas. Mantenemos la dependencia plana.
// -----------------------------------------------------------------------------

export function pluralizeEs(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Formatea minutos en castellano informal: 5 → "5 min", 60 → "1 hora",
 * 90 → "1 h 30 min", 480 → "8 horas".
 */
export function formatDurationEs(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return pluralizeEs(h, 'hora', 'horas')
  return `${h} h ${m} min`
}

/**
 * Formatea un importe en euros sin decimales si es entero, con coma si no.
 * 245 → "245 €". 24.5 → "24,50 €". Sigue convención castellana (coma decimal,
 * espacio antes del símbolo).
 */
export function formatEuros(amount: number): string {
  const isInteger = Number.isInteger(amount)
  if (isInteger) return `${amount} €`
  return `${amount.toFixed(2).replace('.', ',')} €`
}
