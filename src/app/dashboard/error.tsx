'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

// -----------------------------------------------------------------------------
// Error boundary del dashboard. Aísla los crashes de cualquier ruta hija
// para que el barbero no vea la pantalla blanca de Next: ve un mensaje útil
// + acciones (reintentar, volver al inicio, escribir a soporte).
// -----------------------------------------------------------------------------

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[dashboard error boundary]', error)
  }, [error])

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pt-16 md:pt-24">
      <div className="bg-surface border border-line rounded-2xl p-8 md:p-12 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-danger" />
        </div>
        <h1 className="font-semibold text-ink" style={{ fontSize: 'var(--text-page-title)' }}>Algo ha fallado</h1>
        <p className="mt-2 text-sm text-ink-2 max-w-md mx-auto">
          La pantalla no se ha podido cargar. Vuelve a intentarlo. Si sigue pasando, escríbenos.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-ink-3">ref: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
          <button type="button" onClick={reset} className="btn-primary">
            Reintentar
          </button>
          <Link href="/dashboard" className="btn-secondary">
            Volver al inicio
          </Link>
          <Link href="/dashboard/ayuda" className="btn-ghost">
            Contactar soporte
          </Link>
        </div>
      </div>
    </div>
  )
}
