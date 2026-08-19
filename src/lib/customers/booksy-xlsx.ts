// -----------------------------------------------------------------------------
// Booksy .xlsx → filas de import — port de `scripts/booksy-clientes-a-csv.py`.
//
// Por qué existe: Booksy manda la base de clientes en .xlsx, y los envía
// CIFRADOS con contraseña (llega en un correo aparte). Hasta ahora la
// pantalla de importar sólo tragaba CSV, así que alguien de otracita tenía
// que descifrar el fichero a mano y convertirlo. Eso no escala: el barbero
// tiene que poder subir el Excel y su contraseña y ver el preview solo.
//
// El módulo está partido en dos mitades a propósito:
//
//   · `parseBooksyGrid` — PURA. Recibe una matriz de celdas y devuelve las
//     filas listas para el preview. Sin I/O, sin Buffer, sin DB → testeable
//     con `node --test` sin generar ficheros.
//   · `readSpreadsheet`  — impura y sólo-Node. Buffer + contraseña → matriz.
//     Descifra si hace falta (exceljs NO sabe abrir un xlsx con contraseña)
//     y aplana el workbook a `SheetGrid`.
//
// Sobre el cifrado: un .xlsx normal es un ZIP (`PK\x03\x04`). Uno protegido
// con contraseña es un OLE Compound File (`D0CF11E0`) con el paquete OOXML
// cifrado dentro (ECMA-376; Booksy usa el perfil "agile", AES + SHA-512).
// exceljs no implementa nada de eso — de ahí `officecrypto-tool`, que hace
// exactamente lo que hace `msoffcrypto-tool` en el script de Python.
//
// OJO — Booksy tiene DOS exportaciones y sólo una sirve:
//
//   ✗ Informes → "Lista de clientes"   → informe de facturación. SIN teléfonos.
//   ✓ Clientes → exportar              → la agenda de contactos. CON teléfonos.
//
// Sin teléfono no hay import posible: `customers.phone` es NOT NULL y es la
// clave con la que el bot reconoce a la persona. Por eso `no_phone_column`
// es un error de primera clase con su propio copy, no un "0 filas".
// -----------------------------------------------------------------------------

import { canonicalizePhone } from '../phone.ts'
import { normalizeEmail, IMPORT_ROW_LIMIT, type ImportRow } from './import.ts'

/** Celda tal como la escupe exceljs una vez aplanada a primitivas. */
export type SheetCell = string | number | boolean | Date | null | undefined

/** Una hoja como matriz densa de celdas — el input de la mitad pura. */
export type SheetGrid = SheetCell[][]

/**
 * Cuántas filas del principio miramos buscando la cabecera. Los exports de
 * Booksy llevan 6-7 filas de preámbulo (título del informe, dirección del
 * local, periodo), así que no vale asumir que la cabecera es la fila 0.
 */
const HEADER_SCAN_ROWS = 40

/**
 * Techo defensivo de filas leídas del workbook. El límite de negocio es
 * IMPORT_ROW_LIMIT (5000); esto sólo evita que un xlsx con un millón de
 * filas vacías nos coma la memoria del serverless antes de poder contarlas.
 */
export const MAX_SHEET_ROWS = 50_000

/**
 * Cómo llama Booksy a cada cosa, según idioma y versión del export. El
 * match es sobre la cabecera normalizada (sin tildes, minúsculas): igualdad
 * exacta o prefijo, para tragar "Teléfono móvil" o "Nombre y apellido".
 */
const COLUMN_HINTS: Record<BooksyField, string[]> = {
  phone: [
    'telefono', 'teléfono', 'movil', 'móvil', 'celular', 'numero de telefono',
    'número de teléfono', 'phone', 'mobile', 'phone number', 'contacto',
  ],
  name: [
    'nombre y apellido', 'nombre completo', 'nombre', 'cliente', 'name',
    'full name', 'client',
  ],
  last: ['apellido', 'apellidos', 'last name', 'surname'],
  email: ['email', 'correo', 'correo electronico', 'correo electrónico', 'e-mail'],
  notes: ['notas', 'nota', 'comentario', 'comentarios', 'notes', 'note'],
}

export type BooksyField = 'phone' | 'name' | 'last' | 'email' | 'notes'

/** Índice de columna (0-based) por campo detectado. */
export type BooksyColumns = Partial<Record<BooksyField, number>>

/** Contadores para que el barbero entienda qué se descartó y por qué. */
export interface BooksyStats {
  /** Filas de datos leídas (sin contar preámbulo ni cabecera ni vacías). */
  scanned: number
  /** Descartadas por no tener un teléfono aprovechable. */
  droppedNoPhone: number
  /** Descartadas por repetir un teléfono ya visto DENTRO del mismo fichero. */
  droppedDuplicate: number
  /** De las que salen, cuántas traen nombre / email. */
  withName: number
  withEmail: number
}

export type BooksyParseError =
  /** Ninguna fila de las primeras HEADER_SCAN_ROWS parece una cabecera. */
  | 'no_header'
  /** Hay cabecera, pero no hay columna de teléfono → export equivocado. */
  | 'no_phone_column'
  /** Cabecera y columna de teléfono, pero ni una fila con teléfono válido. */
  | 'no_rows'
  /** Más de IMPORT_ROW_LIMIT filas aprovechables. */
  | 'too_many_rows'

export type BooksyParseResult =
  | {
      ok: true
      headerRowIndex: number
      columns: BooksyColumns
      /** Cabeceras crudas de las columnas detectadas, para enseñarlas en el preview. */
      headerLabels: Partial<Record<BooksyField, string>>
      rows: ImportRow[]
      stats: BooksyStats
    }
  | { ok: false; code: BooksyParseError; stats?: BooksyStats }

// ── Helpers de texto ────────────────────────────────────────────────────────

/** Quita diacríticos: "Teléfono" → "Telefono". */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Normaliza una cabecera para comparar contra COLUMN_HINTS. */
function normHeader(cell: SheetCell): string {
  return stripAccents(cellToString(cell)).trim().toLowerCase()
}

/**
 * Celda → string. exceljs devuelve primitivas la mayoría de las veces, pero
 * también fechas y (si el export las trae) objetos richText/hyperlink; esos
 * los aplana `flattenCellValue` antes de llegar aquí.
 */
function cellToString(cell: SheetCell): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Date) return cell.toISOString()
  return String(cell)
}

// ── Mitad pura: matriz → filas ──────────────────────────────────────────────

/**
 * Localiza la fila de cabeceras puntuando cada candidata: +2 por acertar
 * `phone` o `name` (las que de verdad importan) y +1 por el resto. Gana la
 * de mayor puntuación; en empate, la primera.
 *
 * Devuelve `null` si ninguna candidata trae al menos la columna de nombre —
 * sin eso no estamos mirando una tabla de clientes.
 */
export function findHeaderRow(
  grid: SheetGrid,
): { index: number; columns: BooksyColumns } | null {
  let best: { index: number; columns: BooksyColumns; score: number } | null = null

  const limit = Math.min(grid.length, HEADER_SCAN_ROWS)
  for (let idx = 0; idx < limit; idx++) {
    const headers = (grid[idx] ?? []).map(normHeader)
    const columns: BooksyColumns = {}
    let score = 0

    for (const field of Object.keys(COLUMN_HINTS) as BooksyField[]) {
      const hints = COLUMN_HINTS[field]
      for (let col = 0; col < headers.length; col++) {
        const h = headers[col]
        if (!h) continue
        if (hints.includes(h) || hints.some((hint) => h.startsWith(hint))) {
          columns[field] = col
          score += field === 'phone' || field === 'name' ? 2 : 1
          break
        }
      }
    }

    if (best === null || score > best.score) best = { index: idx, columns, score }
  }

  if (!best || best.columns.name === undefined) return null
  return { index: best.index, columns: best.columns }
}

/**
 * Matriz de celdas → filas listas para el preview. Pura y determinista.
 *
 * Reglas heredadas del script de Python, todas con motivo:
 *   · Filas completamente vacías → fuera (los exports vienen espaciados).
 *   · Fila cuyo nombre es "Total"/"Totales" → fuera (pie de los informes).
 *   · Teléfono no canonicalizable a E.164 → fuera + contador (no podemos
 *     hacer match ni mandar nada a esa persona).
 *   · Teléfono repetido dentro del mismo fichero → fuera + contador. El
 *     dedupe contra la DB lo hace el endpoint; esto es sólo intra-fichero.
 *   · Booksy mete el teléfono en el campo nombre cuando el cliente no tiene
 *     nombre → si nombre y teléfono son el mismo número, el nombre se vacía.
 *
 * El teléfono NO se re-normaliza a mano: usamos `canonicalizePhone`, la
 * fuente única del repo. Devolvemos el E.164 ya canonicalizado, así el
 * preview enseña exactamente lo que se va a guardar.
 */
export function parseBooksyGrid(grid: SheetGrid): BooksyParseResult {
  const header = findHeaderRow(grid)
  if (!header) return { ok: false, code: 'no_header' }

  const { index: headerRowIndex, columns } = header
  if (columns.phone === undefined) return { ok: false, code: 'no_phone_column' }

  const headerLabels: Partial<Record<BooksyField, string>> = {}
  for (const [field, col] of Object.entries(columns) as Array<[BooksyField, number]>) {
    headerLabels[field] = cellToString(grid[headerRowIndex]?.[col]).trim()
  }

  const cell = (row: SheetCell[], field: BooksyField): string => {
    const col = columns[field]
    if (col === undefined) return ''
    return cellToString(row[col]).trim()
  }

  const rows: ImportRow[] = []
  const seenPhones = new Set<string>()
  const stats: BooksyStats = {
    scanned: 0,
    droppedNoPhone: 0,
    droppedDuplicate: 0,
    withName: 0,
    withEmail: 0,
  }

  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const row = grid[i] ?? []
    if (row.every((c) => cellToString(c).trim() === '')) continue
    // Pie de los informes de Booksy.
    if (['total', 'totales'].includes(normHeader(cell(row, 'name')))) continue

    stats.scanned++

    const canon = canonicalizePhone(cell(row, 'phone'))
    if (!canon.valid) {
      stats.droppedNoPhone++
      continue
    }
    if (seenPhones.has(canon.value)) {
      stats.droppedDuplicate++
      continue
    }
    seenPhones.add(canon.value)

    let name = [cell(row, 'name'), cell(row, 'last')].filter(Boolean).join(' ').trim()
    // Booksy rellena el nombre con el teléfono cuando el contacto es anónimo.
    if (name && canonicalizePhone(name).value === canon.value) name = ''

    const email = normalizeEmail(cell(row, 'email'))
    const notas = cell(row, 'notes')

    if (name) stats.withName++
    if (email) stats.withEmail++

    rows.push({
      name: name || null,
      phone: canon.value,
      email,
      notas: notas || null,
    })
  }

  if (rows.length === 0) return { ok: false, code: 'no_rows', stats }
  if (rows.length > IMPORT_ROW_LIMIT) return { ok: false, code: 'too_many_rows', stats }

  return { ok: true, headerRowIndex, columns, headerLabels, rows, stats }
}

// ── Mitad impura (sólo Node): Buffer + contraseña → matriz ──────────────────

/** Cabecera de un ZIP: un .xlsx normal (OOXML). */
const MAGIC_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04])
/** Cabecera de un OLE Compound File: .xlsx cifrado, o un .xls de los viejos. */
const MAGIC_CFB = Buffer.from([0xd0, 0xcf, 0x11, 0xe0])

/**
 * Contrato mínimo de `officecrypto-tool`. Declaramos el nuestro en vez de
 * usar sus tipos publicados: su `.d.ts` tipa los buffers con un `Buffer` que
 * no cuadra con el de este repo, y es un paquete 0.0.x — mejor depender de
 * la superficie que usamos y no de su fichero de tipos.
 */
interface OfficeCryptoModule {
  decrypt(input: Uint8Array, options: { password: string }): Promise<Uint8Array>
  isEncrypted(input: Uint8Array): boolean
}

export type SpreadsheetReadError =
  /** Viene cifrado y no nos han dado contraseña. */
  | 'password_required'
  /** Viene cifrado y la contraseña no abre. */
  | 'password_wrong'
  /** Es un .xls binario de los antiguos — exceljs no los lee. */
  | 'legacy_xls'
  /** Ni ZIP ni CFB, o exceljs no consigue abrirlo. */
  | 'unreadable'

export interface SpreadsheetSheet {
  name: string
  grid: SheetGrid
}

export type SpreadsheetReadResult =
  | { ok: true; sheets: SpreadsheetSheet[] }
  | { ok: false; code: SpreadsheetReadError }

/**
 * `true` si el buffer es un OLE Compound File. Eso significa "xlsx cifrado"
 * O ".xls de los antiguos" — quién es cada cual lo decide `isEncrypted`.
 */
export function looksCompoundFile(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(MAGIC_CFB)
}

/**
 * Aplana el valor de una celda de exceljs a primitiva. exceljs no siempre
 * devuelve escalares: las celdas con formato enriquecido llegan como
 * `{ richText: [...] }`, los enlaces como `{ text, hyperlink }` y las
 * fórmulas como `{ formula, result }`. Si no aplanamos, `String(cell)` daría
 * "[object Object]" y la detección de cabeceras fallaría en silencio.
 */
function flattenCellValue(value: unknown): SheetCell {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: unknown }>)
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
    }
    if ('result' in v) return flattenCellValue(v.result)
    if (typeof v.text === 'string') return v.text
    if (v.error !== undefined) return null
  }
  return null
}

/**
 * Buffer (+ contraseña si viene cifrado) → hojas como matrices densas.
 *
 * Descifra ANTES de tocar exceljs: un xlsx protegido con contraseña no es un
 * ZIP, es un OLE Compound File con el paquete OOXML cifrado dentro, y exceljs
 * no implementa ECMA-376. `officecrypto-tool` hace el mismo trabajo que
 * `msoffcrypto-tool` en el script de Python del que viene esto.
 */
export async function readSpreadsheet(
  buffer: Buffer,
  password?: string | null,
): Promise<SpreadsheetReadResult> {
  let payload = buffer

  if (looksCompoundFile(buffer)) {
    const officeCrypto = (await import('officecrypto-tool'))
      .default as unknown as OfficeCryptoModule

    // Un OLE Compound File puede ser un xlsx cifrado O un .xls binario de
    // los antiguos, que exceljs no lee. Distinguirlos importa: si no,
    // pediríamos contraseña por un fichero que no tiene ninguna.
    let encrypted: boolean
    try {
      encrypted = officeCrypto.isEncrypted(buffer)
    } catch {
      return { ok: false, code: 'unreadable' }
    }
    if (!encrypted) return { ok: false, code: 'legacy_xls' }

    if (!password) return { ok: false, code: 'password_required' }
    try {
      payload = Buffer.from(await officeCrypto.decrypt(buffer, { password }))
    } catch {
      // officecrypto-tool tira "The password is incorrect" para clave mala,
      // pero también puede tirar por un CFB que no es un OOXML cifrado. En
      // ambos casos lo accionable para el barbero es revisar la contraseña.
      return { ok: false, code: 'password_wrong' }
    }
    // Un .xls antiguo descifrado sigue siendo CFB — exceljs no lo lee.
    if (!payload.subarray(0, 4).equals(MAGIC_ZIP)) return { ok: false, code: 'legacy_xls' }
  } else if (!buffer.subarray(0, 4).equals(MAGIC_ZIP)) {
    return { ok: false, code: 'unreadable' }
  }

  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  try {
    // exceljs declara un `Buffer` global propio (`interface Buffer extends
    // ArrayBuffer`) en su index.d.ts, que no cuadra con el de @types/node.
    // En runtime `load` traga cualquier Buffer/Uint8Array — es sólo tipos.
    await workbook.xlsx.load(payload as unknown as Parameters<typeof workbook.xlsx.load>[0])
  } catch {
    return { ok: false, code: 'unreadable' }
  }

  const sheets: SpreadsheetSheet[] = workbook.worksheets.map((ws) => {
    const grid: SheetGrid = []
    const lastRow = Math.min(ws.rowCount, MAX_SHEET_ROWS)
    for (let r = 1; r <= lastRow; r++) {
      // `row.values` es 1-indexado con un hueco en la posición 0; slice(1)
      // lo devuelve a base 0 para que los índices de columna cuadren con
      // los que devuelve findHeaderRow.
      const values = ws.getRow(r).values as unknown[]
      const cells = Array.isArray(values) ? values.slice(1) : []
      grid.push(cells.map(flattenCellValue))
    }
    return { name: ws.name, grid }
  })

  if (sheets.length === 0) return { ok: false, code: 'unreadable' }
  return { ok: true, sheets }
}

export type BooksyWorkbookResult =
  | ({ ok: true; sheetName: string } & Extract<BooksyParseResult, { ok: true }>)
  | { ok: false; code: SpreadsheetReadError | BooksyParseError; stats?: BooksyStats }

/**
 * Punto de entrada del endpoint: fichero + contraseña → filas del preview.
 *
 * Prueba TODAS las hojas y se queda con la primera que parsee bien —  algún
 * export mete una portada delante de la tabla buena. Si ninguna vale,
 * devuelve el error más accionable: `no_phone_column` antes que `no_header`,
 * porque significa que el barbero exportó el informe equivocado y hay copy
 * específico para decírselo.
 */
export async function parseBooksyWorkbook(
  buffer: Buffer,
  password?: string | null,
): Promise<BooksyWorkbookResult> {
  const read = await readSpreadsheet(buffer, password)
  if (!read.ok) return { ok: false, code: read.code }

  // Orden de preferencia al reportar el fallo, de más a menos accionable.
  const ERROR_PRIORITY: BooksyParseError[] = [
    'no_phone_column',
    'too_many_rows',
    'no_rows',
    'no_header',
  ]
  let worst: { code: BooksyParseError; stats?: BooksyStats } | null = null

  for (const sheet of read.sheets) {
    const parsed = parseBooksyGrid(sheet.grid)
    if (parsed.ok) return { ...parsed, sheetName: sheet.name }
    const rank = ERROR_PRIORITY.indexOf(parsed.code)
    if (worst === null || rank < ERROR_PRIORITY.indexOf(worst.code)) {
      worst = { code: parsed.code, stats: parsed.stats }
    }
  }

  return { ok: false, code: worst?.code ?? 'no_header', stats: worst?.stats }
}
