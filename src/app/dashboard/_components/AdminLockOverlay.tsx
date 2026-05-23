'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// <AdminLockOverlay> — pantalla a candado cuando un área marcada como
// sensible necesita el PIN del jefe. Centrada en el viewport del slot de
// contenido del AreaShell (NO modal — el barbero entiende que está EN el
// área pero no puede entrar). Input numérico de 4-6 dígitos + botón
// "Desbloquear". Al desbloquear con éxito: router.refresh() para que el
// server-side AdminLockedArea re-evalúe y muestre el contenido real.
// -----------------------------------------------------------------------------

interface Props {
  areaKey: string
  areaLabel: string
}

export default function AdminLockOverlay({ areaLabel }: Props) {
  const router = useRouter()
  const [pin, setPin] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    // Autofocus al montar — el jefe llega aquí queriendo meter el PIN ya.
    inputRef.current?.focus()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{4,6}$/.test(pin)) {
      setError('El PIN debe ser de 4 a 6 dígitos.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/admin-lock/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        setError(d?.error ?? 'No se pudo desbloquear.')
        setSubmitting(false)
        return
      }
      // Cookie seteada en server. Refrescar fuerza re-evaluación del
      // guard server-side y muestra el contenido real.
      setPin('')
      router.refresh()
    } catch {
      setError('Error de red.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 min-h-0 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-control border border-line bg-surface p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-softer text-brand-strong">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Área bloqueada</h2>
          <p className="mt-1.5 max-w-sm text-sm text-ink-2">
            {areaLabel} requiere el PIN del jefe. Mete el PIN para entrar — se
            queda desbloqueado durante 30 minutos.
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label htmlFor="admin-lock-pin" className="sr-only">
            PIN del jefe
          </label>
          <input
            id="admin-lock-pin"
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="• • • •"
            disabled={submitting}
            className="w-full rounded-control border border-line bg-canvas px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-ink outline-none placeholder:text-ink-3 focus:border-brand disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={submitting || pin.length < 4}
            className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-brand px-4 py-3 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-strong disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Desbloquear
          </button>
          {error && (
            <p className="text-center text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-ink-3">
          Si no eres el jefe, cierra esta pantalla y sigue trabajando.
        </p>
      </div>
    </div>
  )
}
