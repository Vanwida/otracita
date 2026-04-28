import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { recordCheckout, ApiError } from '../lib/api'
import { SumupTapToPay, isNativeIos } from '../lib/sumup-bridge'

// -----------------------------------------------------------------------------
// Checkout — pantalla full-screen del cobro Tap to Pay.
//
// Flow:
//   1. Recibe en location.state: amountCents, bookingId?, subtitle?
//   2. Llama al SDK nativo (SumupTapToPay.checkout)
//   3. SDK procesa Tap to Pay (UI nativa de Apple aparece)
//   4. SDK devuelve resultado → llamamos /api/app/mobile/checkout/record
//   5. Mostramos pantalla de éxito o error
//
// En web (dev sin iOS nativo) → mock que simula éxito tras 3s para
// poder probar UI sin Xcode.
// -----------------------------------------------------------------------------

interface CheckoutState {
  amountCents: number
  bookingId?: string
  subtitle?: string
}

type Phase =
  | { kind: 'awaiting' }
  | { kind: 'success'; amountCents: number }
  | { kind: 'error'; message: string }

const ACCESS_TOKEN_REQUIRED_MSG =
  'Esta versión necesita acceder al token SumUp del backend para Tap to Pay. Configura el plugin nativo y vuelve a intentar.'

export function CheckoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as CheckoutState | null
  const [phase, setPhase] = useState<Phase>({ kind: 'awaiting' })
  const startedRef = useRef(false)

  useEffect(() => {
    if (!state) {
      navigate('/', { replace: true })
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    void runCheckout(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runCheckout(s: CheckoutState) {
    try {
      // En dev web, simulamos éxito tras 3s para iterar UI sin Xcode.
      if (!isNativeIos()) {
        await new Promise((r) => setTimeout(r, 3000))
        const fakeTxId = `web-${Date.now()}`
        await recordCheckout({
          sumupTransactionId: fakeTxId,
          status: 'SUCCESSFUL',
          amountCents: s.amountCents,
          bookingId: s.bookingId,
          reference: 'Tap to Pay (dev mock)',
        })
        setPhase({ kind: 'success', amountCents: s.amountCents })
        setTimeout(() => navigate('/', { replace: true }), 2500)
        return
      }

      // En iOS nativo: el plugin necesita el access_token de SumUp + affiliate
      // key. Esos valores los expone el backend via endpoint dedicado (futuro
      // /api/app/mobile/sumup/checkout-credentials que devuelve token+affKey
      // por sesión móvil). Por ahora marcamos esto como TODO claro.
      setPhase({ kind: 'error', message: ACCESS_TOKEN_REQUIRED_MSG })

      // Pseudocódigo de la integración real (a completar cuando esté el plugin):
      //
      // const creds = await getSumupCheckoutCredentials() // backend
      // const result = await SumupTapToPay.checkout({
      //   accessToken: creds.accessToken,
      //   affiliateKey: creds.affiliateKey,
      //   amount: s.amountCents / 100,
      //   currency: 'EUR',
      //   title: s.subtitle ?? 'otracita',
      //   foreignTransactionId: crypto.randomUUID(),
      // })
      // if (!result.success) {
      //   setPhase({ kind: 'error', message: result.additionalInfo ?? 'El cobro falló' })
      //   return
      // }
      // await recordCheckout({
      //   sumupTransactionId: result.sumupTransactionId!,
      //   status: 'SUCCESSFUL',
      //   amountCents: s.amountCents,
      //   bookingId: s.bookingId,
      //   reference: result.transactionCode,
      // })
      void SumupTapToPay // silencia unused import en el dev mock
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error inesperado'
      setPhase({ kind: 'error', message: msg })
    }
  }

  if (!state) return null

  return (
    <div className="h-full flex flex-col bg-canvas" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="px-5 py-3 flex items-center justify-between">
        {phase.kind !== 'awaiting' ? (
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="text-ink-2 active:text-ink"
          >
            <span className="text-2xl">✕</span>
          </button>
        ) : (
          <span />
        )}
        <span className="text-xs text-ink-3 uppercase tracking-widest">Cobro</span>
        <span />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-sm mx-auto w-full">
        {phase.kind === 'awaiting' && <AwaitingView amountCents={state.amountCents} subtitle={state.subtitle} />}
        {phase.kind === 'success' && (
          <SuccessView amountCents={phase.amountCents} onDone={() => navigate('/', { replace: true })} />
        )}
        {phase.kind === 'error' && (
          <ErrorView
            message={phase.message}
            onRetry={() => {
              startedRef.current = false
              setPhase({ kind: 'awaiting' })
              void runCheckout(state)
            }}
            onCancel={() => navigate('/', { replace: true })}
          />
        )}
      </main>
    </div>
  )
}

function AwaitingView({ amountCents, subtitle }: { amountCents: number; subtitle?: string }) {
  return (
    <>
      <p className="text-5xl font-bold text-ink tabular-nums mb-3">
        {(amountCents / 100).toFixed(2)} €
      </p>
      {subtitle && <p className="text-sm text-ink-3 text-center mb-10">{subtitle}</p>}

      <div className="relative h-32 w-32 flex items-center justify-center mb-6">
        <div className="absolute inset-0 rounded-full bg-brand/20 animate-ping" />
        <div className="relative h-24 w-24 rounded-full bg-brand-softer border-2 border-brand/40 flex items-center justify-center">
          <span className="text-4xl">📱</span>
        </div>
      </div>

      <p className="text-base font-semibold text-ink text-center">
        Acerca la tarjeta a tu iPhone
      </p>
      <p className="text-xs text-ink-3 mt-2 text-center">
        Esperando confirmación del pago. No cierres esta pantalla.
      </p>
    </>
  )
}

function SuccessView({ amountCents, onDone }: { amountCents: number; onDone: () => void }) {
  return (
    <>
      <div className="h-20 w-20 rounded-full bg-success/15 flex items-center justify-center mb-4">
        <span className="text-4xl text-success">✓</span>
      </div>
      <p className="text-lg font-semibold text-success">¡Cobrado!</p>
      <p className="text-4xl font-bold text-ink tabular-nums mt-2 mb-3">
        {(amountCents / 100).toFixed(2)} €
      </p>
      <p className="text-sm text-ink-3 text-center mb-1">Cita cerrada</p>
      <p className="text-sm text-ink-3 text-center mb-1">Factura emitida</p>
      <p className="text-sm text-ink-3 text-center">Push de reseña enviado</p>
      <Button size="lg" className="mt-8 w-full" onClick={onDone}>
        Hecho
      </Button>
    </>
  )
}

function ErrorView({
  message,
  onRetry,
  onCancel,
}: {
  message: string
  onRetry: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="h-20 w-20 rounded-full bg-warning/15 flex items-center justify-center mb-4">
        <span className="text-4xl text-warning">⚠</span>
      </div>
      <p className="text-lg font-semibold text-ink mb-2">Cobro no completado</p>
      <p className="text-sm text-ink-3 text-center mb-8 leading-relaxed">{message}</p>
      <Button size="lg" className="w-full mb-2" onClick={onRetry}>
        Reintentar
      </Button>
      <Button variant="ghost" size="lg" className="w-full" onClick={onCancel}>
        Cancelar
      </Button>
    </>
  )
}
