'use client'

import { useState } from 'react'
import { Smartphone, Copy, RotateCw, Trash2, Check, Loader2 } from 'lucide-react'
import { useConfirm } from './ConfirmDialog'

// -----------------------------------------------------------------------------
// BarberPersonalAccessCard — UI dentro del editor de cada barbero para
// generar/revocar el enlace personal del barbero (#71).
//
// Flujo:
//   · Sin acceso → botón "Generar enlace personal".
//   · Con acceso → muestra desde cuándo, + botones Copiar / Regenerar /
//     Revocar. El TOKEN plano solo se ve UNA vez (al pulsar Generar o
//     Regenerar). Si el jefe pierde la URL, regenera (el viejo deja de
//     funcionar al instante).
// -----------------------------------------------------------------------------

interface Props {
  barberId: string
  barberName: string
  hasAccess: boolean
  generatedAt: string | null
  onChanged: () => void
}

export default function BarberPersonalAccessCard({
  barberId,
  barberName,
  hasAccess,
  generatedAt,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const confirm = useConfirm()

  const generate = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await fetch(`/api/barbers/${barberId}/personal-token`, {
        method: 'POST',
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error || 'No se pudo generar.')
        return
      }
      setGeneratedUrl(body.url)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async () => {
    const ok = await confirm({
      title: '¿Regenerar enlace?',
      message:
        'El enlace anterior dejará de funcionar al instante. Tendrás que mandar el nuevo a ' +
        barberName +
        ' por WhatsApp.',
      confirmLabel: 'Regenerar',
      variant: 'danger',
    })
    if (!ok) return
    await generate()
  }

  const revoke = async () => {
    const ok = await confirm({
      title: '¿Revocar acceso?',
      message:
        'El enlace personal de ' +
        barberName +
        ' dejará de funcionar. Su sesión activa seguirá viva hasta que cierre la app (o desactives al barbero).',
      confirmLabel: 'Revocar',
      variant: 'danger',
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/barbers/${barberId}/personal-token`, {
        method: 'DELETE',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || 'No se pudo revocar.')
        return
      }
      setGeneratedUrl(null)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback silencioso — algunos navegadores rechazan sin gesto.
    }
  }

  const formattedGeneratedAt = generatedAt
    ? new Date(generatedAt).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
        <Smartphone className="h-4 w-4 text-ink-2" />
        Acceso móvil personal
      </div>
      <p className="mb-3 text-xs text-ink-3">
        Genera un enlace para que {barberName.split(' ')[0]} vea SU agenda,
        ventas y propinas en su móvil. Mándaselo por WhatsApp. El enlace
        es la llave — quien lo tenga, entra.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Enlace recién generado — se muestra UNA vez. */}
      {generatedUrl && (
        <div className="mb-3 rounded-control border border-brand/30 bg-brand-softer p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
            Copia este enlace antes de cerrar
          </p>
          <div className="mb-2 break-all rounded-lg border border-line bg-surface px-2.5 py-2 text-[11px] text-ink">
            {generatedUrl}
          </div>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-espresso)] px-3 py-1.5 text-xs font-semibold text-[var(--color-cream-high)] transition-colors hover:bg-[var(--color-espresso-2)]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copiar enlace
              </>
            )}
          </button>
        </div>
      )}

      {hasAccess && !generatedUrl && (
        <div className="mb-3 rounded-control border border-line bg-overlay/40 p-3">
          <p className="text-xs text-ink-2">
            Enlace activo
            {formattedGeneratedAt && (
              <>
                {' '}desde el <strong>{formattedGeneratedAt}</strong>
              </>
            )}
            .
          </p>
          <p className="mt-1 text-[11px] text-ink-3">
            El enlace original ya no es visible. Si {barberName.split(' ')[0]}{' '}
            lo perdió, regenéralo.
          </p>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        {!hasAccess && !generatedUrl && (
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-espresso)] px-3 py-2 text-sm font-semibold text-[var(--color-cream-high)] transition-colors hover:bg-[var(--color-espresso-2)] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            Generar enlace personal
          </button>
        )}
        {hasAccess && (
          <>
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-60"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Regenerar
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-surface px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Revocar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
