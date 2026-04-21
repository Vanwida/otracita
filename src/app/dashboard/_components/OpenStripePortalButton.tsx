'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

interface Props {
  disabled?: boolean
  disabledReason?: string
}

/**
 * POSTs to `/api/stripe/portal`, reads the hosted-portal URL, and redirects.
 * Kept as its own small client component so `/dashboard/mi-plan` can stay
 * a server component for data fetching.
 */
export default function OpenStripePortalButton({ disabled = false, disabledReason }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'No se pudo abrir el portal')
      }
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-3 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60 disabled:cursor-not-allowed self-start"
      >
        <ExternalLink className="h-4 w-4" />
        {loading ? 'Abriendo portal...' : 'Gestionar suscripción'}
      </button>
      {disabled && disabledReason && <p className="text-xs text-ink-3">{disabledReason}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
