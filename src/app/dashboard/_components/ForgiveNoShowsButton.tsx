'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'

interface Props {
  customerId: string
  customerName?: string | null
}

/**
 * Inline "Perdonar" button on the Clientes table. Resets the customer's
 * no-shows counter to 0 (and clears `warning` reputation). Used when the
 * barber wants to give someone a clean slate — e.g. regular client who had
 * a bad week. For blocked customers, use UnblockCustomerButton instead.
 */
export default function ForgiveNoShowsButton({ customerId, customerName }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const onClick = () => {
    const who = customerName?.trim() || 'este cliente'
    if (!confirm(`Reiniciar no-shows de ${who} a 0?`)) return

    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/dashboard/customers/${customerId}/forgive`, {
          method: 'POST',
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || 'No se pudo perdonar')
        }
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title="Reiniciar no-shows a 0"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas hover:border-line-strong px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink transition-colors disabled:opacity-60"
      >
        <Heart className="h-3 w-3" />
        {pending ? 'Perdonando...' : 'Perdonar'}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
