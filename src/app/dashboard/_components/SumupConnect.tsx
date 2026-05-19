'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CreditCard, Check, Loader2, Unlink, AlertCircle, Smartphone } from 'lucide-react'
import { useConfirm } from './ConfirmDialog'

// -----------------------------------------------------------------------------
// SumupConnect — card en /dashboard/caja para conectar/desconectar el
// datáfono SumUp del barbero. Cuando está conectado y con Reader pareado,
// los cobros se inician desde otracita y SumUp hace push del resultado
// instantáneo via return_url (sin polling).
//
// Estados:
//   · No conectado → CTA "Conectar SumUp" (redirect a OAuth)
//   · Conectado sin Reader → lista de Readers para escoger
//   · Conectado con Reader → confirmación + botón Desconectar
//   · ?sumup=connected en URL tras callback exitoso → flash de éxito
//   · ?sumup=error&reason=... → flash de error con causa
// -----------------------------------------------------------------------------

interface Reader {
  id: string
  name: string
  status: string
  deviceModel: string | null
}

interface Props {
  initialConnected: boolean
  initialMerchantCode: string | null
  initialReaderId: string | null
  initialReaderName: string | null
}

export default function SumupConnect({
  initialConnected,
  initialMerchantCode,
  initialReaderId,
  initialReaderName,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readers, setReaders] = useState<Reader[] | null>(null)
  const [loadingReaders, setLoadingReaders] = useState(false)
  const confirm = useConfirm()

  const flashSuccess = searchParams.get('sumup') === 'connected'
  const flashError = searchParams.get('sumup') === 'error'
  const flashReason = searchParams.get('reason')

  // Cuando estamos conectados pero sin Reader pareado, cargar la lista.
  useEffect(() => {
    if (!initialConnected || initialReaderId) return
    setLoadingReaders(true)
    fetch('/api/sumup/readers')
      .then(async (r) => {
        if (r.status === 409) {
          // Token tiene scopes obsoletos — el barbero conectó antes de que
          // añadiéramos los scopes nuevos. Mensaje específico.
          const body = (await r.json().catch(() => ({}))) as { detail?: string }
          setError(
            body.detail ??
              'Tu conexión SumUp necesita refrescarse. Pulsa "Desconectar" y conecta de nuevo.',
          )
          return null
        }
        if (!r.ok) {
          setError('No se pudo cargar la lista de Readers')
          return null
        }
        return r.json() as Promise<{ readers: Reader[] }>
      })
      .then((data) => {
        if (data) setReaders(data.readers)
      })
      .catch(() => setError('Error de red al cargar Readers'))
      .finally(() => setLoadingReaders(false))
  }, [initialConnected, initialReaderId])

  async function selectReader(r: Reader) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/sumup/readers/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readerId: r.id, readerName: r.name }),
      })
      if (!res.ok) {
        setError('No se pudo guardar el Reader')
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError('Error de red')
    } finally {
      setBusy(false)
    }
  }

  function connect() {
    // El endpoint hace 302 a la URL de SumUp. Navegamos.
    window.location.href = '/api/sumup/oauth/start'
  }

  async function disconnect() {
    const ok = await confirm({
      title: '¿Desconectar SumUp?',
      message:
        'Dejaremos de importar tus cobros con datáfono al cuadre del día.',
      confirmLabel: 'Desconectar',
      variant: 'danger',
    })
    if (!ok) return
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
                  ? 'Conectado. Cobras desde otracita y el datáfono procesa al instante.'
                  : 'Conecta tu SumUp para cobrar con tu datáfono directamente desde otracita.'}
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
                className="btn-primary btn-sm"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Conectar SumUp
              </button>
            )}
          </div>

          {initialConnected && initialMerchantCode && (
            <p className="mt-3 text-[11px] text-ink-3 font-mono">
              Merchant: {initialMerchantCode}
              {initialReaderName ? ` · Reader: ${initialReaderName}` : ''}
            </p>
          )}

          {/* Conectado pero sin Reader pareado → mostrar lista para escoger */}
          {initialConnected && !initialReaderId && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-2">
                Empareja tu datáfono
              </p>
              {loadingReaders ? (
                <p className="text-xs text-ink-3 inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Cargando Readers…
                </p>
              ) : !readers || readers.length === 0 ? (
                <p className="text-xs text-ink-3">
                  No se encontró ningún Reader en tu cuenta SumUp. Asegúrate de tener uno emparejado en la app de SumUp y recarga.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {readers.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => selectReader(r)}
                        disabled={busy}
                        className="w-full flex items-center gap-2 rounded-lg border border-line bg-surface hover:border-brand px-3 py-2 text-left text-xs transition-colors disabled:opacity-60"
                      >
                        <Smartphone className="h-3.5 w-3.5 text-brand shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-ink truncate">{r.name}</p>
                          <p className="text-[11px] text-ink-3 truncate">
                            {r.deviceModel ?? '—'} · {r.status}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {flashSuccess && (
            <p className="mt-3 text-xs text-success inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> SumUp conectado correctamente
            </p>
          )}
          {flashError && (
            <p className="mt-3 text-xs text-danger inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Error al conectar{flashReason ? `: ${flashReason}` : ''}
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
