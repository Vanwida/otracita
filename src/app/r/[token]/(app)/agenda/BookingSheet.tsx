'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Phone, Sparkles, X } from 'lucide-react'
import type { BarberBooking } from '../_lib/types'
import { formatEurosFromEuros, statusLabel } from '../_lib/format'

// Slide-over para detalle + acciones sobre una cita. Sustituye a un modal
// porque en móvil queda mejor pegado al borde inferior con safe-area
// inset, estilo iOS Sheet.
interface Props {
  token: string
  booking: BarberBooking | null
  onClose: () => void
  onChanged: () => void
}

type Phase = 'idle' | 'charge' | 'tip' | 'success'

const TIP_PRESETS = [0, 100, 200, 300, 500] // cents

export default function BookingSheet({ booking, onClose, onChanged }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [tipCents, setTipCents] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset el flow cada vez que se abre/cierra la cita.
  useEffect(() => {
    if (booking) {
      setPhase('idle')
      setMethod('cash')
      setTipCents(0)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id])

  const open = booking !== null
  if (!open || !booking) return null

  const isConfirmed = booking.status === 'confirmed'

  const close = () => {
    if (submitting) return
    onClose()
  }

  const submitComplete = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/r/me/bookings/${booking.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: method,
          tipCents,
          tipMethod: tipCents > 0 ? 'cash' : undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error || 'No se pudo cobrar.')
        return
      }
      setPhase('success')
      // Pequeña pausa visual antes de cerrar (animación checkmark).
      setTimeout(() => {
        onChanged()
        onClose()
      }, 1100)
    } catch {
      setError('Error de conexión.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitNoShow = async () => {
    if (!confirm('¿Marcar como no-show?')) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/r/me/bookings/${booking.id}/no-show`, {
        method: 'POST',
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error || 'No se pudo marcar.')
        return
      }
      onChanged()
      onClose()
    } catch {
      setError('Error de conexión.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div
        role="presentation"
        onClick={close}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 mx-auto max-w-[480px] rounded-t-3xl bg-surface shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-ink">
              {booking.customerName || 'Cliente sin nombre'}
            </p>
            <p className="mt-0.5 text-xs text-ink-2">
              {booking.service} · {booking.duration} min ·{' '}
              <span className="font-semibold text-ink">
                {formatEurosFromEuros(booking.price)}
              </span>
            </p>
            <div className="mt-1 flex items-center gap-3 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {booking.time}
              </span>
              {booking.customerPhone && booking.customerPhone !== '—' && (
                <a
                  href={`tel:${booking.customerPhone}`}
                  className="inline-flex items-center gap-1 text-ink-2 hover:text-brand"
                >
                  <Phone className="h-3 w-3" />
                  Llamar
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            disabled={submitting}
            className="rounded-full p-2 text-ink-3 hover:bg-overlay/60 hover:text-ink disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-6">
          {error && (
            <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          {phase === 'success' ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 animate-success-pop items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-10 w-10 text-success" />
              </div>
              <p className="text-base font-semibold text-ink">¡Cobrada!</p>
              {tipCents > 0 && (
                <p className="mt-1 text-sm text-ink-2">
                  Propina registrada
                </p>
              )}
            </div>
          ) : !isConfirmed ? (
            <div className="rounded-lg border border-line bg-overlay/40 px-3 py-2 text-center text-sm text-ink-2">
              Estado: {statusLabel(booking.status)}
            </div>
          ) : phase === 'idle' ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setPhase('charge')}
                className="w-full rounded-control bg-[var(--color-espresso)] py-3 text-base font-semibold text-[var(--color-cream-high)] shadow-sm transition-colors hover:bg-[var(--color-espresso-2)]"
              >
                Completar y cobrar
              </button>
              <button
                type="button"
                onClick={submitNoShow}
                disabled={submitting}
                className="w-full rounded-control border border-line bg-surface py-3 text-sm font-medium text-ink-2 transition-colors hover:bg-overlay/40 disabled:opacity-50"
              >
                Marcar no-show
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Método de cobro
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <MethodBtn
                    active={method === 'cash'}
                    onClick={() => setMethod('cash')}
                    label="Efectivo"
                  />
                  <MethodBtn
                    active={method === 'card'}
                    onClick={() => setMethod('card')}
                    label="Tarjeta"
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                  <Sparkles className="h-3 w-3" />
                  Propina (opcional)
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {TIP_PRESETS.map((cents) => (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => setTipCents(cents)}
                      className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                        tipCents === cents
                          ? 'bg-brand text-[var(--color-cream-high)]'
                          : 'border border-line bg-canvas text-ink-2 hover:bg-overlay/40'
                      }`}
                    >
                      {cents === 0 ? 'No' : `${cents / 100}€`}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={submitComplete}
                disabled={submitting}
                className="w-full rounded-control bg-[var(--color-espresso)] py-3 text-base font-semibold text-[var(--color-cream-high)] shadow-sm transition-colors hover:bg-[var(--color-espresso-2)] disabled:opacity-60"
              >
                {submitting ? 'Cobrando…' : 'Confirmar cobro'}
              </button>
              <button
                type="button"
                onClick={() => setPhase('idle')}
                disabled={submitting}
                className="w-full text-center text-xs text-ink-3 hover:text-ink-2 disabled:opacity-50"
              >
                Volver
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes success-pop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-success-pop { animation: success-pop 600ms ease-out; }
      `}</style>
    </div>
  )
}

function MethodBtn({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border py-3 text-sm font-semibold transition-colors ${
        active
          ? 'border-brand bg-brand-softer text-brand'
          : 'border-line bg-canvas text-ink-2'
      }`}
    >
      {label}
    </button>
  )
}
