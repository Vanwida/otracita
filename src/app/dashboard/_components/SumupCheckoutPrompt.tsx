'use client'

import { useEffect, useRef, useState } from 'react'
import { CreditCard, Loader2, Check, X, AlertCircle } from 'lucide-react'

// -----------------------------------------------------------------------------
// SumupCheckoutPrompt — modal de cobro instantáneo con SumUp Cloud API.
//
// Reemplaza al PaymentMethodPrompt cuando el barbero tiene SumUp+Reader
// pareados. UX:
//
//   1. Modal abre con "Cobrar X € con SumUp" + botón Cobrar
//   2. Click → POST /api/sumup/checkout/start
//   3. Pantalla "Acerca la tarjeta al datáfono..." con loader
//   4. Polling local cada 2s a /api/bookings/[id]/status hasta detectar
//      sumupSettled=true Y status='completed' (= callback procesado)
//   5. Pantalla éxito → cerrar modal + refresh parent
//   6. Si timeout 90s → fallback "Hubo un problema. Cobrar manualmente?"
//      → onFallback() para que el parent abra PaymentMethodPrompt manual
//
// Polling local es UI ↔ NUESTRO backend (cero coste externo). Solo dura
// los segundos del cobro real.
// -----------------------------------------------------------------------------

interface Props {
  open: boolean
  bookingId: string
  amountCents: number
  subtitle?: string
  onClose: () => void
  /** Cobro completado con éxito — parent debe refresh. */
  onSettled: () => void
  /** Fallback si SumUp falla — parent abre PaymentMethodPrompt manual. */
  onFallback: () => void
}

type PromptState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'awaiting'; clientTransactionId: string; readerName: string | null }
  | { kind: 'success'; amountCents: number }
  | { kind: 'error'; message: string }
  | { kind: 'timeout' }

const POLL_INTERVAL_MS = 2000
const TIMEOUT_MS = 90_000

export default function SumupCheckoutPrompt({
  open,
  bookingId,
  amountCents,
  subtitle,
  onClose,
  onSettled,
  onFallback,
}: Props) {
  const [state, setState] = useState<PromptState>({ kind: 'idle' })
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset al abrir/cerrar.
  useEffect(() => {
    if (!open) {
      setState({ kind: 'idle' })
      stopPolling()
    }
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Cierre con ESC (solo si no estamos en cobro activo).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (state.kind === 'awaiting' || state.kind === 'starting') return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, state.kind])

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  async function startCheckout() {
    setState({ kind: 'starting' })
    try {
      const res = await fetch('/api/sumup/checkout/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amountCents }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        clientTransactionId?: string
        readerName?: string | null
        error?: string
      }
      if (!res.ok || !data.clientTransactionId) {
        setState({ kind: 'error', message: data.error || 'No se pudo iniciar el cobro' })
        return
      }
      setState({
        kind: 'awaiting',
        clientTransactionId: data.clientTransactionId,
        readerName: data.readerName ?? null,
      })
      startPolling()
    } catch {
      setState({ kind: 'error', message: 'Error de red' })
    }
  }

  function startPolling() {
    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setState({ kind: 'timeout' })
    }, TIMEOUT_MS)

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/status`)
        if (!res.ok) return
        const data = (await res.json()) as {
          status: string
          sumupSettled: boolean
          amountCents: number | null
        }
        if (data.sumupSettled && data.status === 'completed') {
          stopPolling()
          setState({
            kind: 'success',
            amountCents: data.amountCents ?? amountCents,
          })
          // Auto-cerrar tras 2s para que el barbero vea el éxito y refresque.
          setTimeout(() => {
            onSettled()
            onClose()
          }, 2000)
        }
      } catch {
        // Network error transitorio — siguiente poll lo reintentará.
      }
    }, POLL_INTERVAL_MS)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-scrim)] p-4"
      onClick={() => {
        if (state.kind === 'awaiting' || state.kind === 'starting') return
        onClose()
      }}
    >
      <div
        className="bg-surface border border-line rounded-2xl shadow-xl max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink uppercase tracking-widest">
              Cobrar con SumUp
            </h3>
            {subtitle && <p className="text-xs text-ink-3 mt-0.5 truncate">{subtitle}</p>}
          </div>
          {state.kind !== 'awaiting' && state.kind !== 'starting' && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-overlay text-ink-3 hover:text-ink-2 transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-5">
          {state.kind === 'idle' && (
            <div className="space-y-4">
              <div className="text-center py-3">
                <p className="text-4xl font-bold text-ink tabular-nums">
                  {(amountCents / 100).toFixed(2)} €
                </p>
                <p className="text-xs text-ink-3 mt-1">Importe a cobrar</p>
              </div>
              <button
                type="button"
                onClick={startCheckout}
                className="btn-primary w-full"
              >
                <CreditCard className="h-4 w-4" />
                Cobrar con SumUp
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onFallback()
                }}
                className="w-full text-xs text-ink-3 hover:text-ink-2 transition-colors py-1"
              >
                Marcar manualmente sin cobrar online
              </button>
            </div>
          )}

          {state.kind === 'starting' && (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mx-auto mb-3" />
              <p className="text-sm text-ink">Conectando con tu datáfono…</p>
            </div>
          )}

          {state.kind === 'awaiting' && (
            <div className="py-6 text-center">
              <div className="relative mx-auto mb-4 h-20 w-20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-brand/15 animate-ping" />
                <div className="relative h-16 w-16 rounded-full bg-brand-softer/40 border border-brand/30 flex items-center justify-center">
                  <CreditCard className="h-7 w-7 text-brand" />
                </div>
              </div>
              <p className="text-base font-semibold text-ink mb-1">
                Acerca la tarjeta al datáfono
              </p>
              <p className="text-xs text-ink-3">
                {state.readerName ? `Reader: ${state.readerName} · ` : ''}
                {(amountCents / 100).toFixed(2)} €
              </p>
              <p className="text-[11px] text-ink-3 mt-3 leading-relaxed">
                Esperando confirmación del pago. No cierres esta pantalla.
              </p>
            </div>
          )}

          {state.kind === 'success' && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-success/15 flex items-center justify-center">
                <Check className="h-8 w-8 text-success" />
              </div>
              <p className="text-base font-semibold text-success">Cobro completado</p>
              <p className="text-2xl font-bold text-ink mt-2 tabular-nums">
                {(state.amountCents / 100).toFixed(2)} €
              </p>
              <p className="text-xs text-ink-3 mt-1">Cita cerrada y factura emitida</p>
            </div>
          )}

          {state.kind === 'timeout' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm font-semibold text-warning inline-flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Tiempo agotado
                </p>
                <p className="text-xs text-ink-3 mt-1">
                  El cobro tardó más de lo esperado. Es posible que se haya completado igualmente: refresca la caja para ver. Si no aparece, puedes marcar manualmente o reintentar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setState({ kind: 'idle' })}
                className="w-full rounded-xl border border-line bg-surface hover:border-line-strong px-4 py-2.5 text-sm font-semibold text-ink transition-colors"
              >
                Reintentar cobro
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onFallback()
                }}
                className="w-full text-xs text-ink-3 hover:text-ink-2 transition-colors py-1"
              >
                Marcar manualmente
              </button>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-3">
                <p className="text-sm font-semibold text-danger inline-flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Error
                </p>
                <p className="text-xs text-ink-3 mt-1">{state.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setState({ kind: 'idle' })}
                className="w-full rounded-xl border border-line bg-surface hover:border-line-strong px-4 py-2.5 text-sm font-semibold text-ink transition-colors"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onFallback()
                }}
                className="w-full text-xs text-ink-3 hover:text-ink-2 transition-colors py-1"
              >
                Cobrar manualmente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
