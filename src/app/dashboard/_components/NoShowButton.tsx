'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type State = 'idle' | 'confirm' | 'loading' | 'done' | 'undoing'

export default function NoShowButton({ bookingId, initiallyMarked = false }: { bookingId: string; initiallyMarked?: boolean }) {
  const router = useRouter()
  const [state, setState] = useState<State>(initiallyMarked ? 'done' : 'idle')

  const markNoShow = async () => {
    setState('loading')
    try {
      await fetch('/api/bookings/no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      setState('done')
      router.refresh()
    } catch {
      setState('idle')
    }
  }

  const undo = async () => {
    setState('undoing')
    try {
      await fetch('/api/bookings/undo-no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      setState('idle')
      router.refresh()
    } catch {
      setState('done')
    }
  }

  if (state === 'idle') {
    return (
      <button
        onClick={() => setState('confirm')}
        className="text-xs font-medium text-ink-2 hover:text-danger border border-line hover:border-danger/30 rounded-lg px-3 py-1.5 transition-colors"
      >
        No vino
      </button>
    )
  }

  if (state === 'confirm') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-ink-3 hidden sm:inline">¿Seguro?</span>
        <button
          onClick={markNoShow}
          className="text-xs font-medium text-danger border border-danger/30 rounded-lg px-3 py-1.5 transition-colors hover:bg-danger/10"
        >
          Sí
        </button>
        <button
          onClick={() => setState('idle')}
          className="text-xs font-medium text-ink-3 hover:text-ink-2 border border-line rounded-lg px-3 py-1.5 transition-colors"
        >
          No
        </button>
      </div>
    )
  }

  if (state === 'loading' || state === 'undoing') {
    return <span className="text-xs text-ink-3">...</span>
  }

  // done — show undo
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-danger">No Show</span>
      <button
        onClick={undo}
        className="text-xs font-medium text-ink-3 hover:text-ink underline transition-colors"
      >
        Deshacer
      </button>
    </div>
  )
}
