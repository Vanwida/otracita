'use client'

import { useState } from 'react'
import { Smartphone, Loader2, Check, RefreshCw, AlertCircle } from 'lucide-react'

// -----------------------------------------------------------------------------
// MobileAppConnect — card en /dashboard/caja para emparejar la app móvil
// "otracita Cobros". Genera un PIN de 6 dígitos que el barbero teclea en
// la app. PIN dura 10 min, single-use.
// -----------------------------------------------------------------------------

interface PinState {
  pin: string
  expiresAt: string
  ttlSeconds: number
}

export default function MobileAppConnect() {
  const [pin, setPin] = useState<PinState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generatePin() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/mobile/pin/generate', { method: 'POST' })
      if (!res.ok) {
        setError('No se pudo generar el PIN')
        return
      }
      const data = (await res.json()) as PinState
      setPin(data)
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
          <Smartphone className="h-5 w-5 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">
                App móvil otracita Cobros
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                Cobra con tu iPhone usando Tap to Pay, sin datáfono extra.
              </p>
            </div>
            {!pin && (
              <button
                type="button"
                onClick={generatePin}
                disabled={busy}
                className="btn-primary btn-sm"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                Conectar app móvil
              </button>
            )}
          </div>

          {pin && (
            <div className="mt-4 rounded-xl border border-brand/30 bg-brand-softer/40 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-2">
                Tu PIN de emparejamiento
              </p>
              <p
                className="font-bold text-ink tabular-nums tracking-widest text-center py-2"
                style={{ fontSize: 'var(--text-figure)' }}
              >
                {pin.pin.split('').join(' ')}
              </p>
              <p className="text-xs text-ink-3 text-center mt-2 leading-relaxed">
                Abre la app <span className="font-semibold text-ink-2">otracita Cobros</span> en tu iPhone y teclea este PIN.
                <br />
                Caduca en 10 minutos.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPin(null)
                  void generatePin()
                }}
                disabled={busy}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface hover:border-line-strong px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors disabled:opacity-60"
              >
                <RefreshCw className="h-3 w-3" />
                Generar PIN nuevo
              </button>
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-danger inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {error}
            </p>
          )}

          {!pin && !error && (
            <ul className="mt-3 text-xs text-ink-2 space-y-1 leading-relaxed">
              <li>· Necesitas iPhone XS o más reciente con iOS 16.4+</li>
              <li>· Descarga la app «otracita Cobros» desde la App Store</li>
              <li>· Genera un PIN aquí y tecléalo en la app para conectar</li>
              <li>· Una vez conectado, cobras con un toque desde tu móvil</li>
            </ul>
          )}
        </div>
      </div>
      {pin && (
        <p className="mt-3 text-[10px] text-ink-3 text-center inline-flex items-center justify-center gap-1 w-full">
          <Check className="h-3 w-3 text-success" /> PIN generado · single-use · {Math.round(pin.ttlSeconds / 60)} min
        </p>
      )}
    </section>
  )
}
