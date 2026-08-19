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
 * Convención otracita: TODO el dinero persistido está en céntimos enteros
 * (bookings, booking_services, invoices, payments, tips, payroll,
 * products) → `formatCents(cents)`. `formatEuros` solo para valores que
 * viven en euros por diseño (el catálogo `clients.chatbotServices`, que es
 * jsonb editable por el barbero).
 */
export function formatCents(cents: number, opts: FormatOpts = {}): string {
  const euros = cents / 100
  if (opts.compact && Number.isInteger(euros)) {
    return `${EUR_COMPACT.format(euros)} €`
  }
  return `${EUR_STRICT.format(euros)} €`
}

/**
 * Formatea un importe en EUROS como string "X,XX €" (locale es-ES). Para
 * los pocos valores que viven en euros por diseño: el catálogo de servicios
 * (`clients.chatbotServices`, jsonb) y los inputs del formulario antes de
 * normalizarse a céntimos. Lo persistido usa `formatCents`.
 */
export function formatEuros(euros: number, opts: FormatOpts = {}): string {
  return formatCents(Math.round(euros * 100), opts)
}

// -----------------------------------------------------------------------------
// Conversión euros ⇄ céntimos. FUENTE ÚNICA.
//
// Todo el dinero se PERSISTE en céntimos enteros; los euros solo existen en
// la frontera con el humano (inputs del dashboard, catálogo jsonb de
// servicios, cuerpos de API legacy). Antes había `Math.round(x * 100)`
// repartido por ~30 ficheros, cada uno con su propia idea de qué hacer con
// null, NaN o negativos — y `bookings.price` era INTEGER en euros, así que
// 12,50 € se truncaba a 13 antes de llegar aquí (L-05).
//
// El redondeo importa: `12.35 * 100` da 1234.9999999999998 en coma flotante,
// así que el `Math.round` NO es opcional.
// -----------------------------------------------------------------------------

/**
 * Euros (posible decimal) → céntimos enteros. `null`/`undefined`/no-finito
 * → `null` (ausencia de importe, distinto de 0 = gratis).
 */
export function eurosToCents(euros: number | null | undefined): number | null {
  if (euros == null || !Number.isFinite(euros)) return null
  return Math.round(euros * 100)
}

/**
 * Céntimos enteros → euros con 2 decimales exactos (1250 → 12.5). Para
 * rellenar inputs editables y para el catálogo jsonb en euros.
 * `null`/`undefined`/no-finito → `null`.
 */
export function centsToEuros(cents: number | null | undefined): number | null {
  if (cents == null || !Number.isFinite(cents)) return null
  return Math.round(cents) / 100
}

/**
 * Normaliza un importe en euros al céntimo más cercano (12.499 → 12.5).
 * Para los pocos sitios que PERSISTEN euros — hoy solo el catálogo de
 * servicios en `clients.chatbotServices` (jsonb) — para que no se guarde un
 * precio con más precisión de la que existe en la caja. `null` si no es un
 * número finito: el caller decide si eso es "sin precio" o un error.
 */
export function roundEuros(euros: unknown): number | null {
  // `Number('')` y `Number(null)` valen 0 — un campo vacío NO es "gratis",
  // es "sin valor". El caller decide qué hacer con el null.
  if (euros == null) return null
  if (typeof euros === 'string' && euros.trim() === '') return null
  const n = typeof euros === 'number' ? euros : Number(euros)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
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
