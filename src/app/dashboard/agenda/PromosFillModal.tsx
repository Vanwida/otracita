'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Calendar, Users, Tag, Check, AlertCircle } from 'lucide-react'
import Modal from '../_components/Modal'
import { DISCOUNT_STOPS, DEFAULT_DISCOUNT_PCT } from '@/lib/promos/defaults'
import type { WindowPreset } from '@/lib/promos/detect-gaps'
import { daysAgo } from '@/lib/time'

// -----------------------------------------------------------------------------
// PromosFillModal — el flujo "Llenar huecos" de una sola pantalla.
//
// 1. POST /api/promos/preview con la ventana elegida → devuelve gaps +
//    elegibles + mensaje plantilla.
// 2. Barbero ajusta descuento (slider con stops fijos), mensaje (textarea)
//    y deselecciona clientes que no quiera.
// 3. Confirm → POST /api/promos/send → muestra el resumen.
//
// Diseño: un solo scroll vertical en mobile y desktop, sin steps. Todo
// visible para que el barbero entienda lo que está mandando.
// -----------------------------------------------------------------------------

interface Props {
  isOpen: boolean
  onClose: () => void
}

interface PreviewGap {
  date: string
  start: string
  end: string
  minutes: number
}

interface PreviewCustomer {
  phone: string
  name: string | null
  recentVisits: number
  lastBookingAt: string | null
}

interface PreviewResponse {
  window: { start: string; end: string; label: string }
  gaps: { count: number; totalMinutes: number; totalDays: number; list: PreviewGap[] }
  eligibleCustomers: { total: number; list: PreviewCustomer[] }
  defaultMessage: string
}

const PRESETS: Array<{ key: WindowPreset; label: string }> = [
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
  { key: 'weekend', label: 'Este finde' },
  { key: 'next7', label: 'Próx. 7 días' },
]

function formatTotalMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatLastVisit(iso: string | null): string {
  if (!iso) return ''
  const days = daysAgo(new Date(iso))
  if (days <= 1) return 'ayer'
  if (days < 30) return `hace ${days}d`
  if (days < 60) return 'hace ~1 mes'
  return `hace ${Math.floor(days / 30)} meses`
}

export default function PromosFillModal({ isOpen, onClose }: Props) {
  const [preset, setPreset] = useState<WindowPreset>('today')
  const [discount, setDiscount] = useState<number>(DEFAULT_DISCOUNT_PCT)
  const [message, setMessage] = useState<string>('')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneSummary, setDoneSummary] = useState<{ sent: number; sentPush: number; sentWhatsapp: number; skipped: number } | null>(null)

  // Cargar preview al abrir o al cambiar preset.
  const loadPreview = useCallback(async (p: WindowPreset) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/promos/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ window: p }),
      })
      const d = (await r.json()) as PreviewResponse | { error?: string }
      if (!r.ok) {
        setError((d as { error?: string }).error || 'No se pudo cargar')
        return
      }
      const previewData = d as PreviewResponse
      setPreview(previewData)
      setMessage(previewData.defaultMessage)
      setSelectedPhones(new Set(previewData.eligibleCustomers.list.map((c) => c.phone)))
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setDoneSummary(null)
    loadPreview(preset)
  }, [isOpen, preset, loadPreview])

  // Cuando el barbero cambia el descuento, regeneramos el mensaje plantilla
  // SOLO si no lo ha tocado (lo detectamos comparando con la plantilla por
  // defecto de la ventana actual).
  useEffect(() => {
    if (!preview) return
    // Si message está vacío o coincide con la plantilla previa, regenera.
    const currentTemplate = preview.defaultMessage
    if (message === '' || message === currentTemplate) {
      // Reemplaza el porcentaje en el mensaje plantilla.
      const updated = currentTemplate.replace(/\d{1,2}%/, `${discount}%`)
      setMessage(updated)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discount])

  if (!isOpen) return null

  const togglePhone = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev)
      if (next.has(phone)) next.delete(phone)
      else next.add(phone)
      return next
    })
  }

  const toggleAll = () => {
    if (!preview) return
    if (selectedPhones.size === preview.eligibleCustomers.list.length) {
      setSelectedPhones(new Set())
    } else {
      setSelectedPhones(new Set(preview.eligibleCustomers.list.map((c) => c.phone)))
    }
  }

  const send = async () => {
    if (!preview || selectedPhones.size === 0) return
    setSending(true)
    setError(null)
    try {
      const r = await fetch('/api/promos/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          window: preset,
          discountPct: discount,
          message: message.trim(),
          customerPhones: Array.from(selectedPhones),
        }),
      })
      const d = (await r.json()) as { sent?: number; sentPush?: number; sentWhatsapp?: number; skipped?: number; error?: string }
      if (!r.ok) {
        setError(d?.error || 'No se pudo enviar')
        return
      }
      setDoneSummary({
        sent: d.sent || 0,
        sentPush: d.sentPush || 0,
        sentWhatsapp: d.sentWhatsapp || 0,
        skipped: d.skipped || 0,
      })
    } catch {
      setError('Error de red')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Llenar huecos"
      subtitle="Avisa a tus clientes habituales con un descuento."
      size="lg"
    >
        {/* Done summary */}
        {doneSummary ? (
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-success-soft border border-success/30 p-4 text-center">
              <Check className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-base font-semibold text-ink">Promo enviada</p>
              <p className="text-sm text-ink-2 mt-1">
                {doneSummary.sent} cliente{doneSummary.sent === 1 ? '' : 's'} recibirá la oferta.
              </p>
              <div className="mt-3 flex justify-center gap-4 text-xs text-ink-3">
                {doneSummary.sentPush > 0 && <span>{doneSummary.sentPush} por push</span>}
                {doneSummary.sentWhatsapp > 0 && <span>{doneSummary.sentWhatsapp} por WhatsApp</span>}
                {doneSummary.skipped > 0 && <span>{doneSummary.skipped} saltado{doneSummary.skipped === 1 ? '' : 's'}</span>}
              </div>
            </div>
            <p className="text-xs text-ink-3 text-center">
              Recuerda aplicar el {discount}% de descuento manualmente al cobrar.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-brand hover:bg-brand-strong text-brand-ink font-semibold py-3 text-sm transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Window preset */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                ¿Cuándo?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPreset(p.key)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      preset === p.key
                        ? 'border-brand bg-brand-softer text-ink'
                        : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
              </div>
            ) : preview ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-overlay/40 border border-line p-3">
                  <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">Huecos</p>
                  <p className="text-lg font-bold text-ink mt-1">{preview.gaps.count}</p>
                  <p className="text-xs text-ink-3">{formatTotalMinutes(preview.gaps.totalMinutes)} libres</p>
                </div>
                <div className="rounded-xl bg-overlay/40 border border-line p-3">
                  <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">Clientes elegibles</p>
                  <p className="text-lg font-bold text-ink mt-1">{preview.eligibleCustomers.total}</p>
                  <p className="text-xs text-ink-3">≥3 visitas en 90 días</p>
                </div>
              </div>
            ) : null}

            {preview && preview.gaps.count === 0 && (
              <div className="rounded-xl bg-overlay/60 border border-line p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
                <p className="text-xs text-ink-2">
                  No hay huecos detectados en esta ventana. Prueba otra fecha o espera a que tu agenda baje.
                </p>
              </div>
            )}

            {preview && preview.eligibleCustomers.total === 0 && preview.gaps.count > 0 && (
              <div className="rounded-xl bg-overlay/60 border border-line p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
                <p className="text-xs text-ink-2">
                  No hay clientes elegibles ahora mismo (todos vinieron muy recientes o ya tienen reserva).
                </p>
              </div>
            )}

            {/* Discount slider with fixed stops */}
            {preview && preview.eligibleCustomers.total > 0 && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-2 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  ¿Qué descuento?
                </label>
                <div className="grid grid-cols-5 gap-1">
                  {DISCOUNT_STOPS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDiscount(d)}
                      className={`rounded-lg border py-2.5 text-sm font-bold transition-colors ${
                        discount === d
                          ? 'border-brand bg-brand text-brand-ink'
                          : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                      }`}
                    >
                      {d}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message editor */}
            {preview && preview.eligibleCustomers.total > 0 && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-2 block">
                  Mensaje
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink resize-none focus:border-brand outline-none transition-colors"
                />
                <p className="text-[10px] text-ink-3 mt-1">{message.length}/500 chars</p>
              </div>
            )}

            {/* Customer list */}
            {preview && preview.eligibleCustomers.list.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-ink-3 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    A quién mandar ({selectedPhones.size}/{preview.eligibleCustomers.list.length})
                  </label>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-brand hover:underline"
                  >
                    {selectedPhones.size === preview.eligibleCustomers.list.length ? 'Deseleccionar' : 'Seleccionar todos'}
                  </button>
                </div>
                <div className="rounded-xl border border-line max-h-64 overflow-y-auto divide-y divide-line">
                  {preview.eligibleCustomers.list.map((c) => {
                    const checked = selectedPhones.has(c.phone)
                    return (
                      <button
                        key={c.phone}
                        type="button"
                        onClick={() => togglePhone(c.phone)}
                        className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
                          checked ? 'bg-brand-softer/40' : 'hover:bg-overlay/40'
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            checked
                              ? 'bg-brand border-brand text-brand-ink'
                              : 'bg-surface border-line'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink truncate">
                            {c.name || c.phone}
                          </p>
                          <p className="text-[11px] text-ink-3">
                            {c.recentVisits} visitas · {formatLastVisit(c.lastBookingAt)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {preview.eligibleCustomers.total > preview.eligibleCustomers.list.length && (
                  <p className="text-[11px] text-ink-3 mt-2">
                    Mostrando los {preview.eligibleCustomers.list.length} más recientes de {preview.eligibleCustomers.total} elegibles.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-danger-soft border border-danger/30 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            {/* Send button */}
            {preview && preview.eligibleCustomers.total > 0 && (
              <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-4 bg-surface border-t border-line">
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || selectedPhones.size === 0 || message.trim().length < 10}
                  className="w-full rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 disabled:cursor-not-allowed text-brand-ink font-semibold py-3.5 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando…
                    </>
                  ) : (
                    `Mandar a ${selectedPhones.size} cliente${selectedPhones.size === 1 ? '' : 's'}`
                  )}
                </button>
              </div>
            )}
          </div>
        )}
    </Modal>
  )
}
