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

// -----------------------------------------------------------------------------
// Entrada de números editables (es-ES). En España la coma es el separador
// decimal (12,50 €) y el teclado decimal de iOS muestra "," en locale es-ES.
// Estos helpers viven aquí (fuente única de números es-ES) para que cualquier
// input numérico parsee coma Y punto de forma consistente. Reusados por
// `NumberInput` (task #112).
// -----------------------------------------------------------------------------

/**
 * Parsea lo que el usuario teclea en un input numérico es-ES a `number | null`.
 *
 * Acepta coma O punto como separador decimal. Tolera el punto como separador
 * de miles SOLO cuando es inequívoco (la coma decide los decimales): "1.234,5"
 * → 1234.5. Si solo hay un separador, se trata como decimal: "12,5"/"12.5" →
 * 12.5. Devuelve `null` para "", "-", "," y demás estados intermedios de
 * escritura (no rompe el input mientras se teclea).
 *
 * @param decimals 0 = entero (sellos/stock/cantidad); 2 = euros; etc.
 */
export function parseDecimalInput(raw: string, decimals: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  // Solo dígitos, separadores y un signo inicial. Cualquier otra cosa = inválido.
  if (!/^-?[\d.,]*$/.test(trimmed)) return null

  const sign = trimmed.startsWith('-') ? '-' : ''
  let body = sign ? trimmed.slice(1) : trimmed

  const hasComma = body.includes(',')
  const hasDot = body.includes('.')

  if (hasComma && hasDot) {
    // Ambos presentes → el ÚLTIMO que aparece es el separador decimal; el otro
    // son miles y se elimina. "1.234,56" → 1234.56 ; "1,234.56" → 1234.56.
    const decimalSep = body.lastIndexOf(',') > body.lastIndexOf('.') ? ',' : '.'
    const thousandsSep = decimalSep === ',' ? '.' : ','
    body = body.split(thousandsSep).join('').replace(decimalSep, '.')
  } else if (hasComma) {
    // Solo coma → separador decimal es-ES. Más de una coma ("1,2,3") = inválido.
    if ((body.match(/,/g) ?? []).length > 1) return null
    body = body.replace(',', '.')
  } else if (hasDot) {
    // Solo punto → decimal (también cubre `step="0.01"` y valores ya en punto).
    if ((body.match(/\./g) ?? []).length > 1) return null
  }

  const n = Number(sign + body)
  if (!Number.isFinite(n)) return null
  if (decimals <= 0) return Math.trunc(n)
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

/**
 * Formatea un `number` para mostrarlo en un input editable es-ES: coma como
 * separador decimal, SIN separador de miles (los miles romperían la reedición)
 * y sin decimales forzados (no rellena ",00" — el usuario verá lo que tecleó).
 */
export function formatDecimalInput(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return ''
  const maxDigits = decimals <= 0 ? 0 : decimals
  return n.toLocaleString('es-ES', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  })
}
