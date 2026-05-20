// -----------------------------------------------------------------------------
// format — formateadores compartidos (moneda, fechas, números) en castellano.
//
// FUENTE ÚNICA. Antes existían 9+ copias de `formatCents` / `eur` regadas por
// el dashboard, cada una con sutiles divergencias (toLocaleString vs toFixed,
// con/sin thousands separator, compact vs strict). Resultado: el mismo
// importe se renderizaba "25 €" en un sitio y "25,00 €" en otro. Eso no
// pasa review de junior; aquí se consolida.
//
// Convenciones:
//   · STRICT por defecto (siempre 2 decimales). Para fiscal / factura /
//     P&L / nóminas — donde "25 €" es ambiguo y "25,00 €" no.
//   · COMPACT opcional (`{ compact: true }`) → omite los ",00" cuando es
//     entero. Solo para UI densa donde el ahorro de píxeles importa más
//     que el rigor fiscal (KPI tiles, filas de lista).
//   · `Intl.NumberFormat` cacheado en módulo (no se reconstruye en cada
//     llamada — más rápido y respeta la locale negociada por el browser).
// -----------------------------------------------------------------------------

const EUR_STRICT = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const EUR_COMPACT = new Intl.NumberFormat('es-ES')

interface FormatOpts {
  /**
   * Si `true` y el importe es entero, omite los ",00" finales ("25 €" en
   * vez de "25,00 €"). Para UI densa (tiles/KPIs). NO usar en facturas,
   * P&L, nóminas — allí siempre dos decimales.
   *
   * Default: `false` (siempre dos decimales).
   */
  compact?: boolean
}

/**
 * Formatea un importe en céntimos como string "X,XX €" (locale es-ES).
 * Convención otracita: `bookings.price` está en EUROS — para esa columna
 * usa `formatEuros(price)`. Todo lo demás (invoices, payments, tips,
 * payroll) está en céntimos → `formatCents(cents)`.
 */
export function formatCents(cents: number, opts: FormatOpts = {}): string {
  const euros = cents / 100
  if (opts.compact && Number.isInteger(euros)) {
    return `${EUR_COMPACT.format(euros)} €`
  }
  return `${EUR_STRICT.format(euros)} €`
}

/**
 * Formatea un importe en EUROS como string "X,XX €" (locale es-ES). Útil
 * solo para la columna `bookings.price` que está en euros (foot-gun en
 * CLAUDE.md). El resto del dashboard usa céntimos.
 */
export function formatEuros(euros: number, opts: FormatOpts = {}): string {
  return formatCents(Math.round(euros * 100), opts)
}

/**
 * Formatea un porcentaje (0-100) como "X,X %" o "X %" según decimales.
 * Para conversión, tasa de ocupación, comisiones.
 */
export function formatPercent(value: number, opts: { decimals?: number } = {}): string {
  const d = opts.decimals ?? 0
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })} %`
}
