'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CreditCard, Check, Loader2, Unlink, AlertCircle } from 'lucide-react'

// -----------------------------------------------------------------------------
// SumupConnect — card en /dashboard/caja para conectar/desconectar el
// datáfono SumUp del barbero. Cuando está conectado, el cron de polling
// importa cada cobro físico al cuadre del día automáticamente.
//
// Estados:
//   · No conectado → CTA "Conectar SumUp" (redirect a OAuth)
//   · Conectado → muestra merchant code + botón "Desconectar"
//   · ?sumup=connected en URL tras callback exitoso → flash de éxito
//   · ?sumup=error&reason=... → flash de error con causa
// -----------------------------------------------------------------------------

interface Props {
  initialConnected: boolean
  initialMerchantCode: string | null
}

export default function SumupConnect({ initialConnected, initialMerchantCode }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const flashSuccess = searchParams.get('sumup') === 'connected'
  const flashError = searchParams.get('sumup') === 'error'
  const flashReason = searchParams.get('reason')

  function connect() {
    // El endpoint hace 302 a la URL de SumUp. Navegamos.
    window.location.href = '/api/sumup/oauth/start'
  }

  async function disconnect() {
    if (!confirm('¿Desconectar SumUp? Dejaremos de importar tus cobros con datáfono al cuadre del día.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/sumup/oauth/disconnect', { method: 'POST' })
      if (!res.ok) {
        setError('No se pudo desconectar')
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError('Error de red')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-softer/40 border border-line flex items-center justify-center shrink-0">
          <CreditCard className="h-5 w-5 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">
                Datáfono SumUp
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                {initialConnected
                  ? 'Conectado — los cobros con tarjeta se importan al cuadre cada 10 min.'
                  : 'Conecta tu SumUp para que cada cobro con datáfono entre solo en tu caja.'}
              </p>
            </div>
            {initialConnected ? (
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:border-danger hover:text-danger px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                Desconectar
              </button>
            ) : (
              <button
                type="button"
                onClick={connect}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand-strong px-3 py-1.5 text-xs font-semibold text-brand-ink transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Conectar SumUp
              </button>
            )}
          </div>

          {initialConnected && initialMerchantCode && (
            <p className="mt-3 text-[11px] text-ink-3 font-mono">
              Merchant: {initialMerchantCode}
            </p>
          )}

          {flashSuccess && (
            <p className="mt-3 text-xs text-success inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> SumUp conectado correctamente
            </p>
          )}
          {flashError && (
            <p className="mt-3 text-xs text-danger inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Error al conectar{flashReason ? ` — ${flashReason}` : ''}
            </p>
          )}
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}

          {!initialConnected && (
            <ul className="mt-3 text-xs text-ink-2 space-y-1 leading-relaxed">
              <li>· Cada vez que cobras con tu Reader SumUp, otracita lo registra solo</li>
              <li>· Cuadre del día automático sin teclear nada</li>
              <li>· Si se añade propina al cobro, se ajusta el importe automáticamente</li>
              <li>· Te puedes desconectar cuando quieras</li>
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
