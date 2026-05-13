'use client'

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// Botón de upgrade in-dashboard. Lanza /api/checkout (mismo endpoint que la
// landing) y redirige a Stripe Checkout. NO sale al marketing site.
//
// El antiguo CTA "Ver Pro" linkaba a `/#precios` — perdía la sesión, mandaba
// al barbero a una página pública y rompía la conversión.
// -----------------------------------------------------------------------------

interface Props {
  /** Tier de destino (los gratis no pasan por este botón). */
  tier: 'pro' | 'estudio'
  /** Mensual o anual. Default mensual. */
  billingInterval?: 'monthly' | 'annual'
  /** Texto del botón. */
  label: string
}

export default function UpgradeToProButton({ tier, billingInterval = 'monthly', label }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, billingInterval }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'No se pudo abrir el pago.')
        setLoading(false)
      }
    } catch {
      setError('Error de red. Inténtalo otra vez.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="btn-primary mt-4"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
