'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from './ConfirmDialog'

interface Props {
  customerId: string
}

/**
 * Inline button on the Clientes table — flips a blocked customer back to
 * `good` so the bot accepts bookings from them again. Confirms before acting.
 */
export default function UnblockCustomerButton({ customerId }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const confirm = useConfirm()

  const onClick = async () => {
    const ok = await confirm({
      title: '¿Desbloquear cliente?',
      message: 'Podrá volver a reservar a través del bot.',
      confirmLabel: 'Desbloquear',
    })
    if (!ok) return

    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/dashboard/customers/${customerId}/unblock`, { method: 'POST' })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || 'No se pudo desbloquear')
        }
        toast.success('Cliente desbloqueado')
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error'
        setError(msg)
        toast.error(msg)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas hover:border-line-strong px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink transition-colors disabled:opacity-60"
      >
        <Unlock className="h-3 w-3" />
        {pending ? 'Desbloqueando...' : 'Desbloquear'}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
