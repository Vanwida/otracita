'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import {
  Upload,
  Loader2,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  ChevronRight,
  Lock,
} from 'lucide-react'

// -----------------------------------------------------------------------------
// ImportClientesFlow — flujo en 3 pasos:
//
//   1. UPLOAD: input file → parsed rows. Dos caminos según extensión:
//        · .csv  → papaparse, aquí en el navegador.
//        · .xlsx → POST a /api/customers/import/parse. Si el Excel viene
//          cifrado, el servidor responde `password_required` y pedimos la
//          contraseña sin perder el fichero ya elegido.
//      También botón para descargar la plantilla.
//
//   2. PREVIEW: tabla con N primeras filas + badge de estado por fila
//      (OK / Duplicado / Inválido / Sin tlf). Footer con resumen
//      agregado. Botón "Importar X clientes" deshabilitado si X === 0.
//
//   3. DONE: muestra resultado (created/updated/skipped/partial) y CTA
//      para volver al listado.
//
// Por qué el .xlsx se parsea en el SERVIDOR y el CSV no: Booksy manda la
// base de clientes en Excel y la manda CIFRADA con contraseña (que llega en
// un correo aparte). Descifrar eso es ECMA-376 — cripto, no parsing. Hacerlo
// en el navegador significaría meter exceljs + una librería de cripto en el
// bundle del dashboard para una pantalla que se usa una vez. En el servidor
// ya están. El CSV sigue parseándose local: es texto, no necesita nada.
//
// La validación pesada (canonicalización phone, dedupe, update-if-empty)
// vive en `src/lib/customers/import.ts` y se ejecuta en el servidor — el
// cliente sólo hace pre-clasificación rápida con la heurística básica
// para el preview. La fuente de verdad del import final es el endpoint.
// -----------------------------------------------------------------------------

type Step = 'upload' | 'preview' | 'done'

interface ParsedRow {
  name: string
  phone: string
  email: string
  notas: string
}

interface PreviewRow extends ParsedRow {
  status: 'ok' | 'duplicate' | 'invalid' | 'no_phone'
  reason?: string
}

/** Lo que devuelve /api/customers/import/parse sobre el Excel leído. */
interface XlsxMeta {
  sheetName: string
  /** Filas del Excel descartadas por no tener un teléfono aprovechable. */
  droppedNoPhone: number
  /** Filas descartadas por repetir un teléfono dentro del mismo archivo. */
  droppedDuplicate: number
}

interface ImportResult {
  created: number
  updated: number
  skipped: number
  total: number
  partial?: boolean
}

const PREVIEW_LIMIT = 50
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB CSV — suficiente para 50k filas
// 8MB para Excel — un export de 5000 clientes ronda los 300KB, el resto es
// margen para formato y hojas de sobra. Mismo techo que el endpoint.
const MAX_XLSX_BYTES = 8 * 1024 * 1024

const asMb = (bytes: number) => Math.round(bytes / 1024 / 1024)
const MAX_ROWS = 5000

/** Extensiones que van al parser del servidor en vez de a papaparse. */
const SPREADSHEET_EXT = /\.(xlsx|xlsm|xls)$/i

// Cabeceras canónicas (las que mete la plantilla) + alias razonables que
// suele usar Booksy/Treatwell/Excel. Match case-insensitive + sin tildes.
const HEADER_ALIASES: Record<keyof ParsedRow, string[]> = {
  name: ['nombre', 'name', 'cliente', 'customer', 'full name'],
  phone: ['telefono', 'teléfono', 'tlf', 'phone', 'mobile', 'celular', 'movil', 'móvil'],
  email: ['email', 'correo', 'e-mail', 'mail'],
  notas: ['notas', 'notes', 'observaciones', 'comentarios'],
}

function normHeader(h: string): string {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/**
 * Pre-clasificación CLIENTE — sólo para el preview. La verdad la dice el
 * endpoint cuando hace lookup contra DB. Aquí sólo marcamos las dos
 * obvias antes de subir: sin teléfono y phone basura.
 *
 * Sin libphonenumber-js en cliente (bundle bloat): usamos heurística
 * simple — al menos 7 dígitos. El endpoint canonicaliza E.164 y rechaza
 * los que no parseen.
 */
function preClassify(row: ParsedRow): PreviewRow {
  const phone = row.phone.trim()
  if (!phone) return { ...row, status: 'no_phone', reason: 'Sin teléfono' }

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) {
    return { ...row, status: 'invalid', reason: 'Teléfono demasiado corto' }
  }
  return { ...row, status: 'ok' }
}

/**
 * Mapea las columnas del CSV parseado a nuestro shape canónico usando
 * los alias declarados. Cualquier cabecera no reconocida se ignora.
 */
function buildColumnMap(headers: string[]): Partial<Record<keyof ParsedRow, number>> {
  const map: Partial<Record<keyof ParsedRow, number>> = {}
  const normed = headers.map(normHeader)
  for (const field of Object.keys(HEADER_ALIASES) as Array<keyof ParsedRow>) {
    const aliases = HEADER_ALIASES[field]
    const idx = normed.findIndex((h) => aliases.includes(h))
    if (idx >= 0) map[field] = idx
  }
  return map
}

export default function ImportClientesFlow() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  // Excel elegido que espera contraseña. Lo guardamos para no obligar al
  // barbero a volver a buscar el fichero después de escribirla.
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [xlsxMeta, setXlsxMeta] = useState<XlsxMeta | null>(null)
  // Consentimiento RGPD del barbero — afirmación nueva en CADA import
  // (sin persistir): el barbero debe declarar que tiene base legal para
  // tratar los contactos del archivo. Sin persistencia deliberada: forzamos
  // recordatorio en cada subida.
  const [consentChecked, setConsentChecked] = useState(false)

  const summary = useMemo(() => {
    let ok = 0
    let duplicates = 0
    let invalid = 0
    let noPhone = 0
    for (const r of rows) {
      if (r.status === 'ok') ok++
      else if (r.status === 'duplicate') duplicates++
      else if (r.status === 'invalid') invalid++
      else noPhone++
    }
    return { ok, duplicates, invalid, noPhone, total: rows.length }
  }, [rows])

  const reset = () => {
    setStep('upload')
    setFileName(null)
    setRows([])
    setResult(null)
    setError(null)
    setPendingFile(null)
    setPassword('')
    setXlsxMeta(null)
    setConsentChecked(false)
  }

  const downloadTemplate = () => {
    // Misma ruta GET — descarga directa.
    window.location.assign('/api/customers/import/template')
  }

  /**
   * Sube el Excel al servidor y monta el preview con lo que devuelva. Si
   * está cifrado, la primera llamada va sin contraseña a propósito: la
   * mayoría de barberos no sabe si su fichero la lleva, y así sólo se la
   * pedimos a quien de verdad la necesita.
   */
  const handleSpreadsheet = async (file: File, pw: string | null) => {
    setLoading(true)
    setError(null)
    setFileName(file.name)

    const form = new FormData()
    form.append('file', file)
    if (pw) form.append('password', pw)

    try {
      const res = await fetch('/api/customers/import/parse', { method: 'POST', body: form })
      const data = (await res.json()) as {
        rows?: Array<{
          name: string | null
          phone: string
          email: string | null
          notas: string | null
        }>
        meta?: XlsxMeta
        error?: string
        code?: string
      }

      if (!res.ok || !data.rows || !data.meta) {
        setError(data.error || 'No hemos podido leer el archivo.')
        // Sólo conservamos el fichero si lo que falta es la contraseña.
        // Para cualquier otro fallo el archivo es el equivocado y hay que
        // elegir otro.
        const needsPassword = data.code === 'password_required' || data.code === 'password_wrong'
        setPendingFile(needsPassword ? file : null)
        if (!needsPassword) setPassword('')
        setLoading(false)
        return
      }

      setRows(
        data.rows.map((r) =>
          preClassify({
            name: r.name ?? '',
            phone: r.phone,
            email: r.email ?? '',
            notas: r.notas ?? '',
          }),
        ),
      )
      setXlsxMeta(data.meta)
      setPendingFile(null)
      setPassword('')
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red.')
    } finally {
      setLoading(false)
    }
  }

  const handleFile = (file: File) => {
    setError(null)
    setXlsxMeta(null)
    setPendingFile(null)
    setPassword('')

    if (SPREADSHEET_EXT.test(file.name)) {
      if (file.size > MAX_XLSX_BYTES) {
        setError(`El archivo pesa más de ${asMb(MAX_XLSX_BYTES)} MB. Eso no es una lista de clientes.`)
        return
      }
      void handleSpreadsheet(file, null)
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      setError(`Archivo demasiado grande (máx. ${asMb(MAX_FILE_BYTES)} MB). Divide el CSV.`)
      return
    }
    setLoading(true)
    setFileName(file.name)
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        try {
          const data = res.data
          if (data.length === 0) {
            setError('El CSV está vacío.')
            setLoading(false)
            return
          }
          // Heurística: si la primera fila contiene alguna cabecera
          // reconocida, la tratamos como header. Si no, asumimos que
          // el CSV no tiene cabecera y mapeamos por orden (nombre,
          // telefono, email, notas).
          const headers = data[0]
          const colMap = buildColumnMap(headers)
          const hasHeader = Object.keys(colMap).length > 0

          let dataRows: string[][]
          let map: Partial<Record<keyof ParsedRow, number>>

          if (hasHeader) {
            dataRows = data.slice(1)
            map = colMap
          } else {
            dataRows = data
            map = { name: 0, phone: 1, email: 2, notas: 3 }
          }

          if (map.phone === undefined) {
            setError(
              'No encontramos la columna de teléfono. Renombra la cabecera a "telefono" o descarga la plantilla.',
            )
            setLoading(false)
            return
          }

          if (dataRows.length > MAX_ROWS) {
            setError(`Máximo ${MAX_ROWS} filas por import. Divide el CSV en lotes.`)
            setLoading(false)
            return
          }

          const parsed: ParsedRow[] = dataRows.map((row) => ({
            name: map.name !== undefined ? (row[map.name] ?? '').trim() : '',
            phone: map.phone !== undefined ? (row[map.phone] ?? '').trim() : '',
            email: map.email !== undefined ? (row[map.email] ?? '').trim() : '',
            notas: map.notas !== undefined ? (row[map.notas] ?? '').trim() : '',
          }))

          const classified = parsed.map(preClassify)
          setRows(classified)
          setStep('preview')
          setLoading(false)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Error al procesar el CSV.')
          setLoading(false)
        }
      },
      error: (err) => {
        setError(`Error al leer el CSV: ${err.message}`)
        setLoading(false)
      },
    })
  }

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  const doImport = async () => {
    // Sólo mandamos las filas OK al servidor — el endpoint también
    // descarta inválidas y dedupe contra DB, pero ahorramos payload.
    const payload = rows
      .filter((r) => r.status === 'ok')
      .map((r) => ({
        name: r.name || null,
        phone: r.phone,
        email: r.email || null,
        notas: r.notas || null,
      }))

    if (payload.length === 0) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload, source: xlsxMeta ? 'xlsx' : 'csv' }),
      })
      const data = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) {
        setError(data?.error || 'No se pudo importar.')
        setLoading(false)
        return
      }
      setResult(data)
      setStep('done')
      // Refresca la lista en background — cuando el barbero vuelva ya
      // está actualizada (router.refresh invalida el server component).
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red.')
    } finally {
      setLoading(false)
    }
  }

  // ── STEP: UPLOAD ────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="bg-surface border border-line rounded-xl p-6">
          <label className="flex flex-col items-center gap-3 border-2 border-dashed border-line rounded-xl p-8 cursor-pointer hover:border-brand transition-colors">
            <Upload className="h-8 w-8 text-ink-3" />
            <div className="text-center">
              <p className="font-medium text-ink">Suelta aquí tu archivo o haz click</p>
              <p className="text-xs text-ink-3 mt-1">
                El Excel de Booksy (.xlsx), aunque venga con contraseña. O un CSV con
                cabeceras nombre, telefono, email, notas. Máx. {MAX_ROWS} clientes.
              </p>
            </div>
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand-strong"
            >
              <Download className="h-4 w-4" />
              Descargar plantilla CSV
            </button>
            <p className="text-xs text-ink-3">
              En Booksy: Clientes → exportar. El informe de Informes no trae teléfonos.
            </p>
          </div>

          {loading && (
            <p className="mt-4 text-sm text-ink-2 flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              Leyendo {fileName}…
            </p>
          )}

          {error && (
            <p role="alert" className="mt-4 text-sm text-danger flex items-start gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          {/* Excel cifrado: pedimos la contraseña sin perder el fichero ya
              elegido. Booksy la manda en un correo aparte del adjunto. */}
          {pendingFile && !loading && (
            <form
              className="mt-4 rounded-xl border border-line bg-canvas p-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (password.trim()) void handleSpreadsheet(pendingFile, password)
              }}
            >
              <label
                htmlFor="xlsx-password"
                className="flex items-center gap-1.5 text-sm font-medium text-ink"
              >
                <Lock className="h-4 w-4 text-ink-3" />
                Contraseña de {pendingFile.name}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="xlsx-password"
                  type="password"
                  value={password}
                  autoFocus
                  autoComplete="off"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="La que te mandó Booksy por correo"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!password.trim()}
                  className="shrink-0 rounded-lg bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-60"
                >
                  Abrir
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-3">
                No la guardamos. Sólo sirve para abrir este archivo.
              </p>
            </form>
          )}
        </div>

        <div className="bg-surface border border-line rounded-xl p-5">
          <h3 className="text-sm font-semibold text-ink mb-2">Qué pasa después</h3>
          <ol className="text-sm text-ink-2 space-y-1.5 list-decimal pl-4">
            <li>Revisas el preview con tus clientes detectados.</li>
            <li>Confirmas — los duplicados (mismo teléfono) se ignoran automáticamente.</li>
            <li>Quedan en tu cartera. Pueden reservar contigo igual que antes.</li>
          </ol>
        </div>
      </div>
    )
  }

  // ── STEP: PREVIEW ───────────────────────────────────────────────────────
  if (step === 'preview') {
    const visibleRows = rows.slice(0, PREVIEW_LIMIT)
    const hidden = rows.length - visibleRows.length

    return (
      <div className="space-y-4">
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">
                {fileName || 'archivo'}
              </p>
              <p className="text-xs text-ink-3">
                {summary.total} filas detectadas · mostrando las primeras{' '}
                {Math.min(PREVIEW_LIMIT, summary.total)}
                {xlsxMeta && ` · hoja «${xlsxMeta.sheetName}»`}
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-ink-2 hover:text-ink underline underline-offset-2"
            >
              Cambiar archivo
            </button>
          </div>

          {xlsxMeta && (xlsxMeta.droppedNoPhone > 0 || xlsxMeta.droppedDuplicate > 0) && (
            <p className="px-4 py-2 border-b border-line bg-canvas text-xs text-ink-2">
              Del Excel se han quedado fuera{' '}
              {xlsxMeta.droppedNoPhone > 0 && (
                <>
                  <strong className="font-semibold">{xlsxMeta.droppedNoPhone}</strong> sin
                  teléfono válido
                </>
              )}
              {xlsxMeta.droppedNoPhone > 0 && xlsxMeta.droppedDuplicate > 0 && ' y '}
              {xlsxMeta.droppedDuplicate > 0 && (
                <>
                  <strong className="font-semibold">{xlsxMeta.droppedDuplicate}</strong>{' '}
                  repetidos
                </>
              )}
              . Sin teléfono no podemos reconocer a nadie.
            </p>
          )}

          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-canvas border-b border-line">
                <tr className="text-left text-ink-2">
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Teléfono</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Notas</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-b-0">
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} reason={r.reason} />
                    </td>
                    <td className="px-3 py-2 text-ink truncate max-w-[180px]">
                      {r.name || <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-3 py-2 text-ink font-mono text-xs">
                      {r.phone || <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-2 text-xs truncate max-w-[180px]">
                      {r.email || <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-2 text-xs truncate max-w-[200px]">
                      {r.notas || <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-ink-3 hover:text-danger transition-colors"
                        aria-label="Quitar fila"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hidden > 0 && (
            <div className="px-4 py-2 border-t border-line text-xs text-ink-3 bg-canvas">
              + {hidden} filas más, sin mostrar. Se importarán igual.
            </div>
          )}

          {/* Consentimiento RGPD — el barbero declara base legal para
              tratar los contactos. Sin persistencia: recordatorio en
              cada import. */}
          <div className="px-4 py-3 border-t border-line bg-canvas">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
                required
                aria-required="true"
              />
              <span className="text-xs leading-snug text-ink-2">
                Garantizo tener consentimiento previo de estos contactos
                para tratamiento comercial (RGPD / LOPDGDD). otracita actúa
                como encargado de tratamiento por cuenta de mi negocio.
              </span>
            </label>
          </div>

          <div className="px-4 py-3 border-t border-line flex flex-wrap items-center justify-between gap-3 bg-canvas">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <SummaryStat label="Listos" count={summary.ok} tone="success" />
              <SummaryStat label="Sin teléfono" count={summary.noPhone} tone="muted" />
              <SummaryStat label="Inválidos" count={summary.invalid} tone="danger" />
              <span className="text-ink-3">Total: {summary.total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={loading}
                className="text-sm text-ink-2 hover:text-ink underline underline-offset-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={doImport}
                disabled={loading || summary.ok === 0 || !consentChecked}
                title={
                  !consentChecked
                    ? 'Marca el consentimiento RGPD para continuar'
                    : undefined
                }
                className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {loading
                  ? 'Importando…'
                  : summary.ok === 0
                    ? 'Nada que importar'
                    : !consentChecked
                      ? 'Marca el consentimiento'
                      : `Importar ${summary.ok} ${summary.ok === 1 ? 'cliente' : 'clientes'}`}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}
      </div>
    )
  }

  // ── STEP: DONE ──────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="bg-surface border border-line rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">
              {result.partial ? 'Importación parcial' : 'Importación completada'}
            </h2>
            <p className="text-sm text-ink-2 mt-1">
              {result.created} {result.created === 1 ? 'cliente añadido' : 'clientes añadidos'}
              {result.updated > 0 && (
                <>
                  {' · '}
                  {result.updated} actualizado{result.updated === 1 ? '' : 's'}
                </>
              )}
              {result.skipped > 0 && (
                <>
                  {' · '}
                  {result.skipped} duplicado{result.skipped === 1 ? '' : 's'} ignorado
                  {result.skipped === 1 ? '' : 's'}
                </>
              )}
              .
            </p>
            {result.partial && (
              <p className="text-xs text-ink-3 mt-2">
                Algo falló a mitad del proceso. Vuelve a subir el CSV — los que ya
                están no se duplicarán.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard/clientes')}
            className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-semibold text-brand-ink"
          >
            Ver mis clientes
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-ink-2 hover:text-ink underline underline-offset-2"
          >
            Importar otro archivo
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ── Subcomponentes ────────────────────────────────────────────────────────

function StatusBadge({
  status,
  reason,
}: {
  status: PreviewRow['status']
  reason?: string
}) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2 py-0.5 text-xs font-medium">
        <CheckCircle2 className="h-3 w-3" />
        OK
      </span>
    )
  }
  if (status === 'duplicate') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-softer text-brand-strong px-2 py-0.5 text-xs font-medium">
        Duplicado
      </span>
    )
  }
  if (status === 'no_phone') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-ink-2/10 text-ink-2 px-2 py-0.5 text-xs font-medium"
        title={reason}
      >
        Sin tlf
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-danger/10 text-danger px-2 py-0.5 text-xs font-medium"
      title={reason}
    >
      <XCircle className="h-3 w-3" />
      Inválido
    </span>
  )
}

function SummaryStat({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: 'success' | 'danger' | 'muted'
}) {
  const cls =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-danger'
        : 'text-ink-3'
  return (
    <span className={`font-medium ${cls}`}>
      {count} {label.toLowerCase()}
    </span>
  )
}
