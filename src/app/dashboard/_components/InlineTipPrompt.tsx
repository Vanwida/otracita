'use client'

import { useId, useMemo, useState } from 'react'
import { Check, Heart, Loader2 } from 'lucide-react'
import NumberInput from './NumberInput'
import { formatCents } from '@/lib/format'

// -----------------------------------------------------------------------------
// InlineTipPrompt — paso "¿propina?" tras cobrar.
//
// Aparece dentro del ChargeFlow una vez el cobro queda confirmado (offline o
// post-webhook online). El barbero pulsa un preset (€1/€2/€3/€5) o "Otro"
// para escribir el importe, elige a quién atribuir si hay varios barberos y
// el booking no tenía uno asignado, y confirma.
//
// Reglas de UX:
//   · Targets de 44+ px (WCAG 2.5.5). Grid 5 cols mobile, 6 desktop.
//   · "Sin propina" SIEMPRE accesible (botón link-style); cerrar sin elegir
//     es un escape válido — no es lo principal, no es destructivo.
//   · `predominantMethod` precarga el toggle cash/card. Reni casi siempre
//     querrá el mismo método con que cobró el servicio: 1 tap menos.
//   · Si el booking lleva un barberId fijo NO mostramos selector — la
//     propina hereda. Si no, lo pedimos obligatorio (no aceptamos tips
//     huérfanos: payroll necesita atribución).
//
// Contrato con el padre:
//   · onTipResolved(cents | null) — `null` = "Sin propina"
//   · POST /api/bookings/[id]/tip lo hace ESTE componente. El padre sólo
//     decide qué hacer cuando se resuelve (mostrar splash de éxito, etc.).
// -----------------------------------------------------------------------------

const PRESET_CENTS = [100, 200, 300, 500] as const

interface Props {
  bookingId: string
  /** Total cobrado del servicio (sin propina). En céntimos. */
  chargedCents: number
  /** Método principal del cobro previo (cash si todo fue cash, card si hubo
   *  tarjeta/online/bizum). Pre-selecciona el toggle. */
  predominantMethod: 'cash' | 'card'
  /** Lista de barberos activos del tenant. */
  barbers: Array<{ id: string; displayName: string }>
  /** Si el booking ya tiene un barbero asignado, lo heredamos. */
  bookingBarberId: string | null
  /** Llamado tras resolver: cents si se registró tip, null si "Sin propina". */
  onTipResolved: (tipCents: number | null) => void
}

export default function InlineTipPrompt({
  bookingId,
  chargedCents,
  predominantMethod,
  barbers,
  bookingBarberId,
  onTipResolved,
}: Props) {
  const headingId = useId()
  const barberSelectId = useId()

  const [selectedAmountCents, setSelectedAmountCents] = useState<number | null>(
    null,
  )
  const [customMode, setCustomMode] = useState(false)
  const [customEuros, setCustomEuros] = useState<number | null>(null)
  const [tipMethod, setTipMethod] = useState<'cash' | 'card'>(predominantMethod)
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(
    bookingBarberId ?? (barbers.length === 1 ? barbers[0].id : null),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsBarberPick = !bookingBarberId && barbers.length > 1

  // Importe efectivo: si está en custom mode usa el input; si no, el preset.
  const effectiveTipCents = useMemo<number | null>(() => {
    if (customMode) {
      if (customEuros === null || customEuros <= 0) return null
      return Math.round(customEuros * 100)
    }
    return selectedAmountCents
  }, [customMode, customEuros, selectedAmountCents])

  const canSubmit =
    effectiveTipCents !== null &&
    effectiveTipCents > 0 &&
    (!needsBarberPick || selectedBarberId !== null) &&
    !submitting

  async function submitTip() {
    if (!canSubmit || effectiveTipCents === null) return
    const barberId = selectedBarberId ?? bookingBarberId
    if (!barberId) {
      setError('Falta elegir el barbero al que va la propina.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: effectiveTipCents,
          method: tipMethod,
          barberId,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error || 'No se pudo registrar la propina.')
        setSubmitting(false)
        return
      }
      onTipResolved(effectiveTipCents)
    } catch {
      setError('Sin conexión. La propina no se registró.')
      setSubmitting(false)
    }
  }

  function skip() {
    if (submitting) return
    onTipResolved(null)
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Confirmación del cobro previo — visualmente cierra el primer beat
          del flow antes de pedir el segundo (propina). */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-success/15 flex items-center justify-center shrink-0">
          <Check className="h-5 w-5 text-success" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
            Cobrado
          </p>
          <p className="text-base font-semibold text-ink tabular-nums">
            {formatCents(chargedCents)}
          </p>
        </div>
      </div>

      <header className="space-y-1">
        <h3
          id={headingId}
          className="text-base font-semibold text-ink inline-flex items-center gap-1.5"
        >
          <Heart className="h-4 w-4 text-brand" aria-hidden="true" />
          ¿Propina?
        </h3>
        <p className="text-xs text-ink-2">Opcional. El cliente o tú elegís el importe.</p>
      </header>

      {/* Grid de presets + "Otro". Todos los targets ≥44px (h-12). */}
      <div
        className="grid grid-cols-5 md:grid-cols-6 gap-2"
        role="group"
        aria-labelledby={headingId}
      >
        {PRESET_CENTS.map((cents) => {
          const isActive = !customMode && selectedAmountCents === cents
          return (
            <button
              key={cents}
              type="button"
              onClick={() => {
                setCustomMode(false)
                setSelectedAmountCents(cents)
              }}
              disabled={submitting}
              aria-pressed={isActive}
              className={
                'inline-flex items-center justify-center h-12 rounded-xl border text-sm font-semibold tabular-nums transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
                (isActive
                  ? 'bg-brand border-brand text-brand-ink'
                  : 'bg-surface border-line text-ink hover:border-brand hover:text-brand')
              }
            >
              {formatCents(cents, { compact: true })}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setCustomMode(true)
            setSelectedAmountCents(null)
          }}
          disabled={submitting}
          aria-pressed={customMode}
          className={
            'inline-flex items-center justify-center h-12 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
            (customMode
              ? 'bg-brand border-brand text-brand-ink'
              : 'bg-surface border-line text-ink hover:border-brand hover:text-brand')
          }
        >
          Otro
        </button>
      </div>

      {customMode && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tip-custom" className="text-[11px] font-medium text-ink-2">
            Importe (€)
          </label>
          <NumberInput
            id="tip-custom"
            value={customEuros}
            onValueChange={setCustomEuros}
            min={0.5}
            max={500}
            decimals={2}
            step="0.5"
            placeholder="2,50"
            disabled={submitting}
            aria-label="Importe de la propina en euros"
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors disabled:opacity-60 min-h-[44px]"
          />
        </div>
      )}

      {/* Selector de barbero — sólo si la cita no tenía uno asignado y hay
          ambigüedad (más de uno en el equipo). */}
      {needsBarberPick && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={barberSelectId}
            className="text-[11px] font-medium text-ink-2"
          >
            ¿Para qué barbero?
          </label>
          <select
            id={barberSelectId}
            value={selectedBarberId ?? ''}
            onChange={(e) =>
              setSelectedBarberId(e.target.value === '' ? null : e.target.value)
            }
            disabled={submitting}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors disabled:opacity-60 min-h-[44px]"
          >
            <option value="">— Elegir barbero —</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Toggle método propina (cash/card). Default = predominantMethod. */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-ink-2">¿Cómo se entrega?</p>
        <div className="inline-flex rounded-xl border border-line bg-canvas p-1 w-full" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tipMethod === 'cash'}
            onClick={() => setTipMethod('cash')}
            disabled={submitting}
            className={
              'flex-1 inline-flex items-center justify-center h-10 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ' +
              (tipMethod === 'cash'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-2 hover:text-ink')
            }
          >
            Efectivo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tipMethod === 'card'}
            onClick={() => setTipMethod('card')}
            disabled={submitting}
            className={
              'flex-1 inline-flex items-center justify-center h-10 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ' +
              (tipMethod === 'card'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-2 hover:text-ink')
            }
          >
            Tarjeta
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm rounded-lg bg-danger/10 border border-danger/30 text-danger px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={submitTip}
          disabled={!canSubmit}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand hover:bg-brand-strong px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-50 transition-colors min-h-[48px]"
        >
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {submitting
            ? 'Registrando…'
            : effectiveTipCents
              ? `Añadir propina · ${formatCents(effectiveTipCents)}`
              : 'Añadir propina'}
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-60 min-h-[44px]"
        >
          Sin propina
        </button>
      </div>
    </div>
  )
}
