'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import {
  Upload,
  Loader2,
  Check,
  Trash2,
  AlertCircle,
  ChevronRight,
  FileText,
  CalendarClock,
} from 'lucide-react'
import NumberInput from '../../_components/NumberInput'

// -----------------------------------------------------------------------------
// IcalImportFlow — 3 pasos:
//   1. Sube un .ics (Booksy export, Treatwell, Google Calendar).
//   2. El servidor parsea + detecta colisiones → preview editable.
//   3. Confirmar → crea las citas vía createBooking (silent: no notifica
//      al cliente, ya tiene la cita en su sistema viejo).
//
// Idempotencia: el endpoint persiste `bookings.imported_ical_uid` con UNIQUE
// PARTIAL index — re-importar el mismo .ics no duplica.
// -----------------------------------------------------------------------------

interface ParsedIcalEvent {
  uid: string
  date: string
  time: string
  durationMinutes: number | null
  customerName: string | null
  customerPhone: string | null
  service: string
  rawSummary?: string
  notes: string | null
  location: string | null
  isPast?: boolean
}

interface IcalCollision {
  uid: string
  reason: 'duplicate_uid' | 'overlap'
  conflictingBookingId?: string
  message: string
}

interface PreviewResponse {
  events: ParsedIcalEvent[]
  collisions: Record<string, IcalCollision>
  skippedPast: number
  truncated?: boolean
  barbers: Array<{ id: string; name: string }>
  defaultDuration: number
}

interface CommitReport {
  ok: boolean
  total: number
  created: number
  skipped: number
  failed: number
  report: Array<{
    uid: string
    status: 'created' | 'skipped' | 'failed'
    bookingId?: string
    message?: string
  }>
}

type Step = 'upload' | 'review' | 'done'

export default function IcalImportFlow() {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [icsText, setIcsText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [events, setEvents] = useState<ParsedIcalEvent[]>([])
  const [assignments, setAssignments] = useState<Record<string, string | null>>({})
  const [keep, setKeep] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<CommitReport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onPick = async (file: File | null) => {
    if (!file) return
    setError(null)
    if (file.size > 2 * 1024 * 1024) {
      setError('Archivo demasiado grande (máx 2 MB).')
      return
    }
    // Aceptamos .ics y text/calendar; algunos exports vienen como text/plain.
    const looksOk =
      file.name.toLowerCase().endsWith('.ics') ||
      file.type === 'text/calendar' ||
      file.type === '' || // macOS Finder a veces no rellena type
      file.type === 'text/plain'
    if (!looksOk) {
      setError('El archivo debe ser un .ics (formato iCalendar).')
      return
    }
    const txt = await file.text()
    setIcsText(txt)
    setFileName(file.name)
  }

  const requestPreview = async () => {
    if (!icsText) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/imports/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'preview', ics: icsText }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'No pudimos leer el archivo.')
        return
      }
      const p = data as PreviewResponse
      if (p.events.length === 0) {
        setError(
          p.skippedPast > 0
            ? `Solo había ${p.skippedPast} eventos pasados — no se importan citas pasadas.`
            : 'No detectamos citas en el archivo.',
        )
        return
      }
      setPreview(p)
      setEvents(p.events)
      // Por defecto incluimos todos menos los duplicate_uid (ya importados).
      const initialKeep = new Set<string>()
      for (const ev of p.events) {
        if (p.collisions[ev.uid]?.reason !== 'duplicate_uid') initialKeep.add(ev.uid)
      }
      setKeep(initialKeep)
      setAssignments({})
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }

  const commit = async () => {
    if (!preview) return
    setLoading(true)
    setError(null)
    try {
      const items = events
        .filter((e) => keep.has(e.uid))
        .map((e) => ({
          uid: e.uid,
          date: e.date,
          time: e.time,
          durationMinutes: e.durationMinutes,
          customerName: e.customerName,
          customerPhone: e.customerPhone,
          service: e.service,
          notes: e.notes,
        }))
      const res = await fetch('/api/imports/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'commit', items, assignments }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'No pudimos importar.')
        return
      }
      setResult(data as CommitReport)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setFileName(null)
    setIcsText(null)
    setPreview(null)
    setEvents([])
    setAssignments({})
    setKeep(new Set())
    setResult(null)
    setError(null)
  }

  // ── STEP: upload ──────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="bg-surface border border-line rounded-xl p-6">
          <label
            className="flex flex-col items-center gap-3 border-2 border-dashed border-line rounded-xl p-8 cursor-pointer hover:border-brand transition-colors"
            onDragOver={(e) => {
              e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) void onPick(f)
            }}
          >
            <Upload className="h-8 w-8 text-ink-3" />
            <div className="text-center">
              <p className="font-medium text-ink">Suelta tu archivo .ics aquí o haz click</p>
              <p className="text-xs text-ink-3 mt-1">
                Formato iCalendar — Booksy «Export Calendar», Treatwell, Google Calendar. Máx 2 MB.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,text/calendar,text/plain"
              onChange={(e) => {
                void onPick(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>

          {fileName && (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-line bg-overlay px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-ink">
                <FileText className="h-4 w-4 text-ink-3" />
                <span className="truncate">{fileName}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFileName(null)
                  setIcsText(null)
                }}
                className="text-ink-3 hover:text-danger"
                aria-label="Quitar archivo"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {fileName && (
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={requestPreview}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {loading ? 'Leyendo…' : 'Ver citas detectadas'}
              </button>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-danger flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>

        <div className="text-xs text-ink-3 leading-relaxed">
          <strong>Cómo exportar desde Booksy:</strong> abre Booksy en el navegador →
          <em> Calendar settings</em> → <em>Export to iCal</em> → descarga el archivo y súbelo aquí.
          Solo se importarán citas futuras.
        </div>
      </div>
    )
  }

  // ── STEP: review ──────────────────────────────────────────────────────────
  if (step === 'review' && preview) {
    const collisions = preview.collisions
    const barbersList = preview.barbers
    const dupCount = events.filter((e) => collisions[e.uid]?.reason === 'duplicate_uid').length
    const overlapCount = events.filter((e) => collisions[e.uid]?.reason === 'overlap').length
    const willCreate = events.filter((e) => keep.has(e.uid)).length

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-ink-2">
            {events.length} cita{events.length === 1 ? '' : 's'} futura{events.length === 1 ? '' : 's'} detectada{events.length === 1 ? '' : 's'}.
            {preview.skippedPast > 0 && (
              <span className="text-ink-3 ml-2">
                ({preview.skippedPast} pasadas omitidas)
              </span>
            )}
            {dupCount > 0 && (
              <span className="text-ink-3 ml-2">
                · {dupCount} ya importadas (desmarcadas)
              </span>
            )}
            {overlapCount > 0 && (
              <span className="text-warning ml-2">· {overlapCount} con choque de horario</span>
            )}
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-ink-2 hover:text-ink underline underline-offset-2"
          >
            Empezar de cero
          </button>
        </div>

        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-overlay border-b border-line">
                <tr className="text-left text-ink-2 uppercase text-xs tracking-wider">
                  <th className="px-3 py-3 font-semibold w-8"></th>
                  <th className="px-3 py-3 font-semibold">Fecha</th>
                  <th className="px-3 py-3 font-semibold">Hora</th>
                  <th className="px-3 py-3 font-semibold">Cliente</th>
                  <th className="px-3 py-3 font-semibold">Teléfono</th>
                  <th className="px-3 py-3 font-semibold">Servicio</th>
                  <th className="px-3 py-3 font-semibold">Min</th>
                  {barbersList.length > 1 && (
                    <th className="px-3 py-3 font-semibold">Profesional</th>
                  )}
                  <th className="px-3 py-3 font-semibold">Aviso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {events.map((ev, i) => {
                  const col = collisions[ev.uid]
                  const isDup = col?.reason === 'duplicate_uid'
                  const rowClass = isDup
                    ? 'opacity-50'
                    : col?.reason === 'overlap'
                      ? 'bg-warning/5'
                      : ''
                  return (
                    <tr key={ev.uid} className={rowClass}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={keep.has(ev.uid)}
                          disabled={isDup}
                          onChange={(e) => {
                            setKeep((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(ev.uid)
                              else next.delete(ev.uid)
                              return next
                            })
                          }}
                          aria-label="Incluir en la importación"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ev.date}
                          onChange={(e) => updateField(i, 'date', e.target.value)}
                          placeholder="YYYY-MM-DD"
                          className="w-28 bg-transparent border-b border-line focus:border-brand outline-none font-mono text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ev.time}
                          onChange={(e) => updateField(i, 'time', e.target.value)}
                          placeholder="HH:MM"
                          className="w-16 bg-transparent border-b border-line focus:border-brand outline-none font-mono text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ev.customerName ?? ''}
                          onChange={(e) => updateField(i, 'customerName', e.target.value)}
                          className="w-32 bg-transparent border-b border-line focus:border-brand outline-none text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="tel"
                          value={ev.customerPhone ?? ''}
                          onChange={(e) => updateField(i, 'customerPhone', e.target.value)}
                          placeholder="+34…"
                          className="w-32 bg-transparent border-b border-line focus:border-brand outline-none text-xs font-mono"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ev.service}
                          onChange={(e) => updateField(i, 'service', e.target.value)}
                          className="w-40 bg-transparent border-b border-line focus:border-brand outline-none text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          value={ev.durationMinutes}
                          onValueChange={(n) => updateDuration(i, n)}
                          decimals={0}
                          min={0}
                          aria-label="Duración en minutos"
                          className="w-14 bg-transparent border-b border-line focus:border-brand outline-none text-xs font-mono"
                        />
                      </td>
                      {barbersList.length > 1 && (
                        <td className="px-3 py-2">
                          <select
                            value={assignments[ev.uid] ?? ''}
                            onChange={(e) =>
                              setAssignments((prev) => ({
                                ...prev,
                                [ev.uid]: e.target.value || null,
                              }))
                            }
                            className="bg-transparent border-b border-line focus:border-brand outline-none text-xs"
                          >
                            <option value="">Auto</option>
                            {barbersList.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="px-3 py-2 text-xs">
                        {col ? (
                          <span
                            className={
                              col.reason === 'duplicate_uid'
                                ? 'text-ink-3'
                                : 'text-warning'
                            }
                          >
                            {col.message}
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {preview.truncated && (
          <p className="text-xs text-warning">
            Se mostraron las primeras 500 citas — repite la importación con el resto si tienes
            más.
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          {error && <span className="text-sm text-danger">{error}</span>}
          <button
            type="button"
            onClick={commit}
            disabled={loading || willCreate === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {loading
              ? 'Importando…'
              : `Importar ${willCreate} cita${willCreate === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    )
  }

  // ── STEP: done ────────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="space-y-4">
        <div className="bg-surface border border-line rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-success/15 flex items-center justify-center">
              <CalendarClock className="h-5 w-5 text-success" />
            </div>
            <div>
              <h2
                className="font-semibold text-ink"
                style={{ fontSize: 'var(--text-section-title)' }}
              >
                Importación completada
              </h2>
              <p className="text-sm text-ink-2">
                {result.created} creada{result.created === 1 ? '' : 's'} ·{' '}
                {result.skipped} omitida{result.skipped === 1 ? '' : 's'} ·{' '}
                {result.failed} fallida{result.failed === 1 ? '' : 's'} · {result.total} total
              </p>
            </div>
          </div>

          {result.failed > 0 && (
            <div className="mt-3 rounded-lg bg-danger/5 border border-danger/20 p-3">
              <p className="text-xs text-ink-2 mb-2 font-semibold">No importadas:</p>
              <ul className="text-xs text-ink-2 space-y-1">
                {result.report
                  .filter((r) => r.status === 'failed')
                  .map((r) => (
                    <li key={r.uid}>{r.message || 'error'}</li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/dashboard/agenda"
            className="text-sm text-ink-2 hover:text-ink underline underline-offset-2"
          >
            Ver agenda
          </Link>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-surface border border-line hover:border-line-strong px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Importar otro archivo
          </button>
        </div>
      </div>
    )
  }

  return null

  // ── Edit helpers (inline para no pasar callbacks por todo el árbol) ───────
  function updateField(i: number, key: keyof ParsedIcalEvent, value: string) {
    setEvents((prev) =>
      prev.map((ev, idx) => (idx === i ? { ...ev, [key]: value } : ev)),
    )
  }
  function updateDuration(i: number, n: number | null) {
    setEvents((prev) =>
      prev.map((ev, idx) => (idx === i ? { ...ev, durationMinutes: n || null } : ev)),
    )
  }
}
