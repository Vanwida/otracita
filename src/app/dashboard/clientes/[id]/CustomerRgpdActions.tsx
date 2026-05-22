'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Download,
  Trash2,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// CustomerRgpdActions — sección "Datos del cliente — RGPD" en la ficha de
// /dashboard/clientes/[id]. Dos acciones derivadas del RGPD:
//
//   · EXPORTAR → GET /api/customers/[id]/export descarga un JSON con toda
//     la info del cliente que la barbería tiene (portabilidad, art. 20).
//
//   · ELIMINAR → DELETE /api/customers/[id] anonimiza la ficha (no borra
//     la fila, mantiene histórico de bookings/facturas). Requiere typebox
//     con la palabra "BORRAR" para confirmar — fricción intencional, esta
//     acción es irreversible.
//
// Sin sistema de toasts global → feedback inline (texto pequeño bajo el
// botón con timeout). Tras anonimizar redirigimos al listado.
// -----------------------------------------------------------------------------

const CONFIRM_WORD = 'BORRAR'

interface Props {
  customerId: string
  customerName: string | null
  customerPhone: string
}

export default function CustomerRgpdActions({
  customerId,
  customerName,
  customerPhone,
}: Props) {
  const router = useRouter()
  const [downloading, startDownload] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onExport = () => {
    setError(null)
    startDownload(async () => {
      try {
        const r = await fetch(`/api/customers/${customerId}/export`, {
          method: 'GET',
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setError(d?.error ?? 'No se pudo exportar')
          return
        }
        const blob = await r.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `cliente-${customerId}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        setFeedback('Descarga lista')
        setTimeout(() => setFeedback(null), FEEDBACK_MS.copied)
      } catch {
        setError('Error de red')
      }
    })
  }

  const onDelete = () => {
    setError(null)
    if (typed.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Escribe "${CONFIRM_WORD}" para confirmar.`)
      return
    }
    startDelete(async () => {
      try {
        const r = await fetch(`/api/customers/${customerId}`, {
          method: 'DELETE',
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setError(d?.error ?? 'No se pudo eliminar')
          return
        }
        // Redirección + invalidación del listado para que no aparezca con
        // los datos viejos en cache.
        router.refresh()
        router.push('/dashboard/clientes')
      } catch {
        setError('Error de red')
      }
    })
  }

  const cancel = () => {
    setConfirmOpen(false)
    setTyped('')
    setError(null)
  }

  return (
    <section className="mt-8 pt-6 border-t border-line">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-ink-3" />
        <h3 className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold">
          Datos del cliente — RGPD
        </h3>
      </div>

      <p className="text-xs text-ink-3 mb-4 leading-relaxed">
        Acciones derivadas del derecho de portabilidad y supresión.
        Exportar descarga el histórico completo en JSON. Eliminar anonimiza
        la ficha pero mantiene el histórico de citas y facturas por
        obligaciones fiscales.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-2 hover:text-ink hover:border-brand/40 transition-colors disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Exportar mis datos
        </button>

        {!confirmOpen ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-danger/30 bg-surface px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/5 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar este cliente
          </button>
        ) : null}

        {feedback && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" /> {feedback}
          </span>
        )}
      </div>

      {confirmOpen && (
        <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                Anonimizar {customerName || customerPhone}
              </p>
              <p className="text-xs text-ink-2 mt-1 leading-relaxed">
                Esta acción es irreversible. El nombre, teléfono, email y
                notas se sustituirán por valores anónimos. El histórico de
                citas y facturas queda intacto. Para confirmar, escribe{' '}
                <code className="font-mono font-bold text-danger">
                  {CONFIRM_WORD}
                </code>
                .
              </p>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="mt-3 w-full sm:w-48 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-danger transition-colors font-mono"
                autoFocus
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={
                    deleting || typed.trim().toUpperCase() !== CONFIRM_WORD
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-canvas disabled:opacity-50 transition-opacity"
                >
                  {deleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Confirmar anonimización
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={deleting}
                  className="text-xs text-ink-2 hover:text-ink px-2 py-2 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-danger flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
    </section>
  )
}
