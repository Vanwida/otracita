'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from './ConfirmDialog'

interface Props {
  customerId: string
}

/**
 * Bloqueo manual de un cliente (pedido por Reni). Marca su reputation como
 * `blocked`: deja de poder AUTO-reservar por bot/PWA, pero el barbero aún
 * puede agendarlo a mano. Espejo de UnblockCustomerButton. Confirma antes.
 */
export default function BlockCustomerButton({ customerId }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const confirm = useConfirm()

  const onClick = async () => {
    const ok = await confirm({
      title: '¿Bloquear cliente?',
      message: 'No podrá reservar solo (bot de WhatsApp ni web). Tú sí podrás seguir agendándolo a mano.',
      confirmLabel: 'Bloquear',
    })
    if (!ok) return

    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/dashboard/customers/${customerId}/block`, { method: 'POST' })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || 'No se pudo bloquear')
        }
        toast.success('Cliente bloqueado')
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
        <Ban className="h-3 w-3" />
        {pending ? 'Bloqueando...' : 'Bloquear'}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
