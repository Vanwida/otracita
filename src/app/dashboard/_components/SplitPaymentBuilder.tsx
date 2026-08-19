'use client'

import { useId, useMemo, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import NumberInput from './NumberInput'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from '@/lib/payments/methods'
import type { ChargePaymentLine } from '@/lib/payments/charge-contract'
import { formatCents } from '@/lib/format'

// -----------------------------------------------------------------------------
// SplitPaymentBuilder — sub-componente de ChargeFlow para pago fraccionado.
//
// Pinta N filas (importe + método) con un live counter del pendiente/sobra
// y un único CTA "Cobrar X €" que sólo se habilita cuando la suma cuadra
// exacta con el total de la reserva. Ningún hex hardcoded — sólo tokens.
//
// Decisiones UX:
//   · 2 filas iniciales por defecto (cash + card_physical). El barbero no
//     necesita "añadir" para entender qué es esto.
//   · Botón trash deshabilitado cuando solo quedan 2 filas (UX mínima).
//   · El select oculta `card_online` si el tenant no tiene Stripe Connect.
//   · "Cobrando…" muestra spinner inline + lock de inputs/CTA. Si el padre
//     vuelve a llamar (error), el barbero re-edita sin perder estado.
// -----------------------------------------------------------------------------

interface SplitLine {
  key: string
  method: PaymentMethod
  amountEuros: number | null
}

interface Props {
  /** Total de la cita en CÉNTIMOS enteros. */
  bookingTotalCents: number
  /** Si false, ocultamos `card_online` del select. */
  stripeConnectActive: boolean
  /** Envía las líneas al padre; devuelve cuando termina (resolved o error). */
  onSubmit: (lines: ChargePaymentLine[]) => Promise<void>
  onCancel: () => void
}

function genKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

export default function SplitPaymentBuilder({
  bookingTotalCents,
  stripeConnectActive,
  onSubmit,
  onCancel,
}: Props) {
  const headingId = useId()

  // 2 filas vacías de partida (cash + card_physical). El barbero ajusta
  // importes; añade más si necesita 3-4 métodos. PAYMENT_METHODS canónico:
  // si en el futuro cambia el orden, esto sigue siendo el primer + segundo.
  const [lines, setLines] = useState<SplitLine[]>(() => [
    { key: genKey(), method: 'cash', amountEuros: null },
    { key: genKey(), method: 'card_physical', amountEuros: null },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalCents = bookingTotalCents
  const sumCents = useMemo(
    () =>
      lines.reduce(
        (acc, l) => acc + (l.amountEuros !== null ? Math.round(l.amountEuros * 100) : 0),
        0,
      ),
    [lines],
  )
  const remainingCents = totalCents - sumCents
  const isMatch = remainingCents === 0 && lines.every((l) => (l.amountEuros ?? 0) > 0)
  const hasOnlineLine =
    lines.filter((l) => l.method === 'card_online').length > 0
  const tooManyOnline =
    lines.filter((l) => l.method === 'card_online').length > 1

  // Whitelist visible — descarta card_online si no hay Stripe Connect.
  const visibleMethods: PaymentMethod[] = stripeConnectActive
    ? [...PAYMENT_METHODS]
    : PAYMENT_METHODS.filter((m) => m !== 'card_online')

  function updateLine(idx: number, patch: Partial<SplitLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: genKey(), method: 'cash', amountEuros: null },
    ])
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  async function submit() {
    if (!isMatch || tooManyOnline) return
    setError(null)
    setSubmitting(true)
    try {
      const payload: ChargePaymentLine[] = lines.map((l) => ({
        method: l.method,
        amountCents: Math.round((l.amountEuros ?? 0) * 100),
      }))
      await onSubmit(payload)
      // El padre cierra/cambia el step. Si el padre nos devuelve y seguimos
      // montados, asumimos error → desbloqueamos para reintentar.
      setSubmitting(false)
    } catch (e) {
      setSubmitting(false)
      const msg = e instanceof Error ? e.message : 'No se pudo cobrar. Inténtalo otra vez.'
      setError(msg)
      toast.error(msg)
    }
  }

  // Mensaje del live counter — verde si cuadra, danger si pasa, ink-2 si falta.
  const counterClass = isMatch
    ? 'text-success'
    : remainingCents < 0
      ? 'text-danger'
      : 'text-ink-2'
  const counterText = isMatch
    ? `Listo · ${formatCents(totalCents)}`
    : remainingCents < 0
      ? `Sobra ${formatCents(Math.abs(remainingCents))}`
      : `Pendiente ${formatCents(remainingCents)}`

  return (
    <div className="flex flex-col gap-4 p-5">
      <header className="space-y-1">
        <h3
          id={headingId}
          className="text-sm font-semibold text-ink uppercase tracking-widest"
        >
          Pago fraccionado
        </h3>
        <p className="text-xs text-ink-2">
          Total a cobrar:{' '}
          <span className="font-semibold text-ink tabular-nums">
            {formatCents(totalCents)}
          </span>
        </p>
      </header>

      <ul className="space-y-2" aria-labelledby={headingId}>
        {lines.map((line, idx) => {
          const inputId = `split-amount-${line.key}`
          const selectId = `split-method-${line.key}`
          const canRemove = lines.length > 2
          return (
            <li
              key={line.key}
              className="rounded-xl border border-line bg-canvas p-3 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2"
            >
              <div className="flex-1 min-w-0">
                <label
                  htmlFor={inputId}
                  className="block text-[11px] font-medium text-ink-2 mb-1"
                >
                  Importe (€)
                </label>
                <NumberInput
                  id={inputId}
                  value={line.amountEuros}
                  onValueChange={(n) => updateLine(idx, { amountEuros: n })}
                  min={0}
                  max={5000}
                  decimals={2}
                  step="0.01"
                  disabled={submitting}
                  aria-label={`Importe del tramo ${idx + 1}`}
                  className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors disabled:opacity-60 min-h-[44px]"
                />
              </div>
              <div className="flex-1 min-w-0">
                <label
                  htmlFor={selectId}
                  className="block text-[11px] font-medium text-ink-2 mb-1"
                >
                  Método
                </label>
                <select
                  id={selectId}
                  value={line.method}
                  onChange={(e) =>
                    updateLine(idx, { method: e.target.value as PaymentMethod })
                  }
                  disabled={submitting}
                  className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors disabled:opacity-60 min-h-[44px]"
                >
                  {visibleMethods.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end sm:items-stretch sm:pt-[18px]">
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  disabled={!canRemove || submitting}
                  aria-label={`Quitar tramo ${idx + 1}`}
                  className="inline-flex items-center justify-center h-11 w-11 rounded-lg border border-line bg-surface hover:border-danger hover:text-danger text-ink-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={addLine}
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-canvas hover:border-brand hover:text-brand px-3 py-2.5 text-sm font-semibold text-ink-2 transition-colors disabled:opacity-60 min-h-[44px]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Añadir método
      </button>

      <p
        className={`text-sm font-semibold tabular-nums ${counterClass}`}
        aria-live="polite"
      >
        {counterText}
      </p>

      {tooManyOnline && hasOnlineLine && (
        <p className="text-xs text-danger leading-relaxed">
          Sólo puedes incluir un tramo Online por cobro.
        </p>
      )}

      {error && (
        <p className="text-sm rounded-lg bg-danger/10 border border-danger/30 text-danger px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-60 min-h-[44px]"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!isMatch || tooManyOnline || submitting}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50 transition-colors min-h-[44px]"
        >
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {submitting ? 'Cobrando…' : `Cobrar ${formatCents(totalCents)}`}
        </button>
      </div>
    </div>
  )
}
