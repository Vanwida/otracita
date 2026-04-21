'use client'

import { useEffect, useState, useTransition } from 'react'
import { CreditCard, CheckCircle2, AlertTriangle, Loader2, ExternalLink } from 'lucide-react'

// -----------------------------------------------------------------------------
// Connect settings panel — lives under the "Cobros online" tab in the
// NegocioForm. Shows one of four states based on the tenant's Stripe Connect
// account resolution:
//
//   'none'       -> CTA to kick off onboarding.
//   'pending'    -> "we are waiting for Stripe / you to finish KYC" + resume.
//   'restricted' -> Stripe flagged requirements — show them + resume link.
//   'active'     -> success card + link to Stripe Express Dashboard.
//
// All state transitions go through API routes (no server action), because we
// must redirect to Stripe for onboarding.
// -----------------------------------------------------------------------------

export interface ConnectInitial {
  status: 'none' | 'pending' | 'active' | 'restricted' | string
  accountId: string | null
  activatedAt: string | null
}

interface Props {
  initial: ConnectInitial
}

interface StatusResponse {
  status: 'none' | 'pending' | 'active' | 'restricted' | string
  accountId: string | null
  requirements: {
    currently_due?: string[] | null
    past_due?: string[] | null
    disabled_reason?: string | null
  } | null
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
}

export default function ConnectSettings({ initial }: Props) {
  const [status, setStatus] = useState<ConnectInitial['status']>(initial.status)
  const [accountId, setAccountId] = useState<string | null>(initial.accountId)
  const [requirements, setRequirements] = useState<StatusResponse['requirements']>(null)
  const [loading, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Start truthy so the first render already indicates we're pulling fresh
  // data — the effect below switches it off once the fetch settles.
  const [refreshing, setRefreshing] = useState(true)

  // Pull fresh status on mount so the UI matches reality even if the barber
  // navigated here right after finishing Stripe onboarding (DB may still be
  // 'pending' until the webhook lands).
  useEffect(() => {
    let cancelled = false
    fetch('/api/stripe/connect/status')
      .then(async (res) => (res.ok ? (res.json() as Promise<StatusResponse>) : null))
      .then((data) => {
        if (!data || cancelled) return
        setStatus(data.status)
        setAccountId(data.accountId)
        setRequirements(data.requirements)
      })
      .catch(() => {
        /* non-fatal — initial server state will show */
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const startOnboarding = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/connect/onboard', { method: 'POST' })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setError(data.error || 'No se pudo iniciar la activación')
          return
        }
        window.location.href = data.url
      } catch {
        setError('Error de red')
      }
    })
  }

  const openLoginLink = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/connect/login-link', { method: 'POST' })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setError(data.error || 'No se pudo abrir el panel de Stripe')
          return
        }
        window.open(data.url, '_blank', 'noopener,noreferrer')
      } catch {
        setError('Error de red')
      }
    })
  }

  const maskedAccountId = accountId
    ? `${accountId.slice(0, 8)}…${accountId.slice(-4)}`
    : null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Cobros online</h2>
        <p className="text-sm text-ink-2 mt-1">
          Activa los cobros para que tus clientes paguen con tarjeta. Stripe gestiona la seguridad
          y el dinero va directamente a tu banco en 1–2 días laborables.
        </p>
      </div>

      {status === 'active' ? (
        <div className="rounded-xl border border-success/30 bg-success/10 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-success mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">Cobros online activos</p>
              <p className="text-xs text-ink-2 mt-1">
                Ya puedes generar enlaces de pago desde la agenda. Stripe envía los fondos a tu
                cuenta bancaria automáticamente.
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-ink-2">
                {maskedAccountId && (
                  <div>
                    <span className="text-ink-3">Cuenta Stripe:</span>{' '}
                    <code className="font-mono text-ink">{maskedAccountId}</code>
                  </div>
                )}
                {initial.activatedAt && (
                  <div>
                    <span className="text-ink-3">Activada:</span>{' '}
                    {new Date(initial.activatedAt).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={openLoginLink}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface hover:bg-overlay px-4 py-2.5 text-sm font-semibold text-ink transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Gestionar cuenta en Stripe
          </button>
        </div>
      ) : status === 'pending' ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Loader2 className="h-5 w-5 text-warning mt-0.5 shrink-0 animate-spin" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Activación en curso</p>
              <p className="text-xs text-ink-2 mt-1">
                Completa tu verificación en Stripe (datos personales + cuenta bancaria).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startOnboarding}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Continuar verificación
          </button>
        </div>
      ) : status === 'restricted' ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-danger mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">
                Stripe necesita más información
              </p>
              <p className="text-xs text-ink-2 mt-1">
                Hasta que resuelvas esto, no podemos procesar cobros online para tu negocio.
              </p>
              {requirements?.currently_due && requirements.currently_due.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-ink-2 list-disc list-inside">
                  {requirements.currently_due.slice(0, 6).map((req) => (
                    <li key={req} className="font-mono">{req}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={startOnboarding}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Completar verificación
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-overlay p-5 space-y-3">
          <p className="text-sm text-ink leading-relaxed">
            Activa los cobros online con Stripe. Tus clientes podrán pagar con tarjeta, Apple Pay
            o Google Pay escaneando un QR desde la agenda. El dinero se ingresa directamente en
            tu cuenta bancaria.
          </p>
          <ul className="text-xs text-ink-2 space-y-1 list-disc list-inside">
            <li>Activación en 5 minutos (Stripe guía todo el proceso)</li>
            <li>Sin cuotas fijas: solo las comisiones por transacción</li>
            <li>Payout automático a tu banco cada 1–2 días</li>
          </ul>
          <button
            type="button"
            onClick={startOnboarding}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Activar cobros online
          </button>
        </div>
      )}

      {refreshing && status === 'none' && (
        <p className="text-xs text-ink-3">Comprobando estado en Stripe…</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
