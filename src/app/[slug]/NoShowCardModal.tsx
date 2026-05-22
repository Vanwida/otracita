'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { Loader2, X, ShieldCheck } from 'lucide-react'

// -----------------------------------------------------------------------------
// NoShowCardModal — guarda la tarjeta del cliente + recoge consentimiento
// para la tarifa por no presentarse. SOLO se monta cuando el negocio tiene
// `no_show_fee_cents > 0` (web/PWA). El bot WhatsApp está exento.
//
// Flujo:
//   1. El padre pide el SetupIntent (/api/public/bookings/setup-intent) y nos
//      pasa clientSecret + publishableKey + feeCents.
//   2. Payment Element recoge la tarjeta; el cliente marca el checkbox de
//      consentimiento (texto con el importe REAL de la tarifa).
//   3. confirmSetup → SCA si aplica → al éxito devolvemos el setupIntentId
//      al padre vía onSaved, que completa la reserva con ese id.
//
// El Customer + PaymentMethod viven en la cuenta PLATAFORMA (el cobro de la
// tarifa es un destination charge). Aquí solo se guarda y se consiente.
// Tematizado con las CSS vars de la PWA (var(--brand*)/var(--theme*)) — sin
// hex inline, igual que el resto del flujo de reserva.
// -----------------------------------------------------------------------------

interface Props {
  publishableKey: string
  clientSecret: string
  feeCents: number
  /** Devuelve el SetupIntent confirmado para completar la reserva. */
  onSaved: (setupIntentId: string) => void
  onClose: () => void
}

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function NoShowCardModal({
  publishableKey,
  clientSecret,
  feeCents,
  onSaved,
  onClose,
}: Props) {
  // loadStripe es estable por publishableKey — memo para no recrear el SDK.
  const stripePromise = useMemo<Promise<Stripe | null>>(
    () => loadStripe(publishableKey),
    [publishableKey],
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Guardar tarjeta"
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto"
        style={{
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-line)',
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" style={{ color: 'var(--brand-strong)' }} />
            <h3
              className="font-display text-lg font-bold"
              style={{ color: 'var(--theme-ink)' }}
            >
              Confirma con tu tarjeta
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-full"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--theme-ink-2)' }}>
          No se te cobra nada ahora. Solo guardamos tu tarjeta para aplicar la
          tarifa de <strong>{formatEuros(feeCents)}€</strong> si no te presentas
          a la cita sin avisar.
        </p>

        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: { theme: 'flat' },
          }}
        >
          <CardForm feeCents={feeCents} onSaved={onSaved} />
        </Elements>
      </div>
    </div>
  )
}

function CardForm({
  feeCents,
  onSaved,
}: {
  feeCents: number
  onSaved: (setupIntentId: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [consented, setConsented] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Evita doble-submit accidental tras éxito.
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!error) return
    const el = document.getElementById('noshow-card-error')
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  const handleConfirm = async () => {
    if (!stripe || !elements || submitting || done) return
    if (!consented) {
      setError('Marca la casilla para aceptar la tarifa por no presentarte.')
      return
    }
    setSubmitting(true)
    setError(null)

    const { error: submitErr } = await elements.submit()
    if (submitErr) {
      setError(submitErr.message ?? 'Revisa los datos de la tarjeta.')
      setSubmitting(false)
      return
    }

    const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    })

    if (confirmErr) {
      setError(
        confirmErr.message ??
          'No se pudo guardar la tarjeta. Prueba con otra.',
      )
      setSubmitting(false)
      return
    }

    if (setupIntent && setupIntent.status === 'succeeded') {
      setDone(true)
      onSaved(setupIntent.id)
      return
    }

    setError('La tarjeta no pudo confirmarse. Inténtalo de nuevo.')
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <PaymentElement onReady={() => setReady(true)} />

      <label
        className="flex items-start gap-2.5 text-xs cursor-pointer select-none"
        style={{ color: 'var(--theme-ink-2)' }}
      >
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ accentColor: 'var(--brand-strong)' }}
        />
        <span>
          Acepto que se cargue una tarifa de{' '}
          <strong>{formatEuros(feeCents)}€</strong> a esta tarjeta si no acudo
          a la cita sin cancelarla con antelación.
        </span>
      </label>

      {error && (
        <p
          id="noshow-card-error"
          className="text-xs"
          style={{ color: 'var(--theme-danger, #c0392b)' }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!stripe || !ready || submitting || done || !consented}
        className="w-full rounded-xl px-6 py-3.5 text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        style={{
          background: `linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)`,
          color: 'var(--brand-ink)',
        }}
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? 'Guardando…' : 'Guardar tarjeta y reservar'}
      </button>

      <p
        className="text-[11px] text-center"
        style={{ color: 'var(--theme-ink-3)' }}
      >
        Tarjeta protegida por Stripe. otracita no almacena el número.
      </p>
    </div>
  )
}
