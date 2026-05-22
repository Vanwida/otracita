'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { KeyRound } from 'lucide-react'

interface Props {
  slug: string
}

export default function TeamLoginForm({ slug }: Props) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{4,6}$/.test(pin)) {
      setError('El PIN tiene de 4 a 6 dígitos.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const r = await fetch('/api/team-access/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, pin }),
        })
        if (!r.ok) {
          if (r.status === 429) {
            setError('Demasiados intentos. Espera un momento.')
          } else {
            const d = (await r.json().catch(() => ({}))) as { error?: string }
            setError(d?.error ?? 'PIN incorrecto')
          }
          setPin('')
          return
        }
        router.push(`/equipo/${slug}/agenda`)
        router.refresh()
      } catch {
        setError('Error de red')
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-ink">PIN del equipo</span>
        <div className="mt-2 flex items-center gap-2 rounded-control border border-line bg-canvas px-3 py-2 focus-within:border-brand">
          <KeyRound className="h-4 w-4 shrink-0 text-ink-3" />
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••"
            className="w-full bg-transparent font-mono text-lg tracking-[0.4em] text-ink outline-none placeholder:text-ink-3"
            aria-label="PIN del equipo"
            aria-invalid={!!error}
          />
        </div>
      </label>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || pin.length < 4}
        className="w-full rounded-control bg-ink px-4 py-3 text-sm font-medium text-canvas transition-opacity disabled:opacity-50"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
