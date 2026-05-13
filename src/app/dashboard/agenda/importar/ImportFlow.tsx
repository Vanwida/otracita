'use client'

import { useState } from 'react'
import { Upload, Loader2, Check, Trash2, AlertCircle, ChevronRight } from 'lucide-react'

// -----------------------------------------------------------------------------
// ImportFlow — 3 steps:
//   1. Upload screenshots (drop or file picker)
//   2. Vision extracts → editable preview table
//   3. Confirm → bulk create via createBooking (shared pipeline)
//
// No surprises — the barber sees what will be imported before we touch the DB.
// -----------------------------------------------------------------------------

interface ParsedBooking {
  date: string
  time: string
  customerName?: string | null
  customerPhone?: string | null
  service: string
  barber?: string | null
  durationMinutes?: number | null
  priceEuros?: number | null
  confidence?: 'high' | 'medium' | 'low'
  notes?: string
}

interface ImportReport {
  total: number
  created: number
  failed: number
  report: Array<{
    index: number
    status: 'created' | 'skipped' | 'failed'
    message?: string
    bookingId?: string
  }>
}

type Step = 'upload' | 'review' | 'done'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function ImportFlow() {
  const [step, setStep] = useState<Step>('upload')
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<ParsedBooking[]>([])
  const [result, setResult] = useState<ImportReport | null>(null)

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    const next: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > 8 * 1024 * 1024) {
        setError('Alguna imagen supera 8 MB — redúcela antes de subirla.')
        return
      }
      next.push(await fileToDataUrl(file))
    }
    setImages((prev) => [...prev, ...next].slice(0, 10))
  }

  const extract = async () => {
    if (images.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bookings/import-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'No se pudo leer las imágenes.')
        return
      }
      const parsed = Array.isArray(data.bookings) ? (data.bookings as ParsedBooking[]) : []
      if (parsed.length === 0) {
        setError('No detectamos citas. Prueba con otra captura más clara.')
        return
      }
      setBookings(parsed)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bookings/import-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: bookings }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'No se pudo importar.')
        return
      }
      setResult(data as ImportReport)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setImages([])
    setBookings([])
    setResult(null)
    setError(null)
  }

  const updateField = (i: number, key: keyof ParsedBooking, value: string) => {
    setBookings((prev) =>
      prev.map((b, idx) =>
        idx === i
          ? {
              ...b,
              [key]:
                key === 'durationMinutes'
                  ? Number(value) || null
                  : key === 'priceEuros'
                    ? value === '' ? null : Number(value)
                    : value,
            }
          : b,
      ),
    )
  }

  const removeRow = (i: number) => {
    setBookings((prev) => prev.filter((_, idx) => idx !== i))
  }

  // ── STEP: upload ─────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="bg-surface border border-line rounded-xl p-6">
          <label className="flex flex-col items-center gap-3 border-2 border-dashed border-line rounded-xl p-8 cursor-pointer hover:border-brand transition-colors">
            <Upload className="h-8 w-8 text-ink-3" />
            <div className="text-center">
              <p className="font-medium text-ink">Suelta las capturas aquí o haz click</p>
              <p className="text-xs text-ink-3 mt-1">PNG, JPG, WEBP. Máx. 10 imágenes, 8 MB cada una.</p>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>

          {images.length > 0 && (
            <>
              <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 gap-3">
                {images.map((src, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Captura ${i + 1}`}
                      className="w-full aspect-[3/4] object-cover rounded-lg border border-line"
                    />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-[var(--color-scrim-strong)] text-brand-ink flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setImages([])}
                  disabled={loading}
                  className="text-sm text-ink-2 hover:text-ink underline underline-offset-2"
                >
                  Empezar de cero
                </button>
                <button
                  type="button"
                  onClick={extract}
                  disabled={loading || images.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {loading ? 'Leyendo…' : 'Leer capturas'}
                </button>
              </div>
            </>
          )}

          {error && (
            <p className="mt-4 text-sm text-danger flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>

        <div className="text-xs text-ink-3 leading-relaxed">
          <strong>Tip:</strong> En Booksy entra en «Appointment List», haz scroll hasta el final
          y ve capturando por secciones. Cuantas más capturas, mejor la IA ve todo.
        </div>
      </div>
    )
  }

  // ── STEP: review ─────────────────────────────────────────────────────────
  if (step === 'review') {
    const lowCount = bookings.filter((b) => b.confidence === 'low').length
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-2">
            {bookings.length} cita{bookings.length === 1 ? '' : 's'} detectada{bookings.length === 1 ? '' : 's'}.
            {lowCount > 0 && (
              <span className="text-warning ml-2">
                ({lowCount} con baja confianza — revísalas)
              </span>
            )}
          </p>
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
                  <th className="px-3 py-3 font-semibold">Fecha</th>
                  <th className="px-3 py-3 font-semibold">Hora</th>
                  <th className="px-3 py-3 font-semibold">Cliente</th>
                  <th className="px-3 py-3 font-semibold">Teléfono</th>
                  <th className="px-3 py-3 font-semibold">Servicio</th>
                  <th className="px-3 py-3 font-semibold">Barbero</th>
                  <th className="px-3 py-3 font-semibold">Min</th>
                  <th className="px-3 py-3 font-semibold">€</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bookings.map((b, i) => (
                  <tr key={i} className={b.confidence === 'low' ? 'bg-warning/5' : ''}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={b.date}
                        onChange={(e) => updateField(i, 'date', e.target.value)}
                        placeholder="YYYY-MM-DD"
                        className="w-28 bg-transparent border-b border-line focus:border-brand outline-none font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={b.time}
                        onChange={(e) => updateField(i, 'time', e.target.value)}
                        placeholder="HH:MM"
                        className="w-16 bg-transparent border-b border-line focus:border-brand outline-none font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={b.customerName ?? ''}
                        onChange={(e) => updateField(i, 'customerName', e.target.value)}
                        className="w-32 bg-transparent border-b border-line focus:border-brand outline-none text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="tel"
                        value={b.customerPhone ?? ''}
                        onChange={(e) => updateField(i, 'customerPhone', e.target.value)}
                        placeholder="+34…"
                        className="w-32 bg-transparent border-b border-line focus:border-brand outline-none text-xs font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={b.service ?? ''}
                        onChange={(e) => updateField(i, 'service', e.target.value)}
                        className="w-40 bg-transparent border-b border-line focus:border-brand outline-none text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={b.barber ?? ''}
                        onChange={(e) => updateField(i, 'barber', e.target.value)}
                        className="w-24 bg-transparent border-b border-line focus:border-brand outline-none text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={b.durationMinutes ?? ''}
                        onChange={(e) => updateField(i, 'durationMinutes', e.target.value)}
                        className="w-14 bg-transparent border-b border-line focus:border-brand outline-none text-xs font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={b.priceEuros ?? ''}
                        onChange={(e) => updateField(i, 'priceEuros', e.target.value)}
                        className="w-14 bg-transparent border-b border-line focus:border-brand outline-none text-xs font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-ink-3 hover:text-danger"
                        aria-label="Quitar fila"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-ink-3 text-sm">
                      No queda ninguna cita. Empieza de cero.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {error && <span className="text-sm text-danger">{error}</span>}
          <button
            type="button"
            onClick={confirm}
            disabled={loading || bookings.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {loading ? 'Importando…' : `Importar ${bookings.length} cita${bookings.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    )
  }

  // ── STEP: done ───────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="space-y-4">
        <div className="bg-surface border border-line rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-success/15 flex items-center justify-center">
              <Check className="h-5 w-5 text-success" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">Importación completada</h2>
              <p className="text-sm text-ink-2">
                {result.created} creada{result.created === 1 ? '' : 's'} · {result.failed} fallida
                {result.failed === 1 ? '' : 's'} · {result.total} total
              </p>
            </div>
          </div>

          {result.failed > 0 && (
            <div className="mt-3 rounded-lg bg-danger/5 border border-danger/20 p-3">
              <p className="text-xs text-ink-2 mb-2 font-semibold">Filas no importadas:</p>
              <ul className="text-xs text-ink-2 space-y-1">
                {result.report
                  .filter((r) => r.status === 'failed')
                  .map((r) => (
                    <li key={r.index}>
                      Fila {r.index + 1}: {r.message || 'error'}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <a
            href="/dashboard/agenda"
            className="text-sm text-ink-2 hover:text-ink underline underline-offset-2"
          >
            Ver agenda
          </a>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-surface border border-line hover:border-line-strong px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Importar más
          </button>
        </div>
      </div>
    )
  }

  return null
}
