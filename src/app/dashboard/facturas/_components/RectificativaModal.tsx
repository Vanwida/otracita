'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import Modal from '../../_components/Modal'

// -----------------------------------------------------------------------------
// Modal para emitir una factura rectificativa de una original.
//
// UX: el barbero elige motivo (R1-R5) + introduce NUEVOS importes deseados
// (la original se queda intacta; la rectificativa la sustituye legalmente).
// Tipo R3 (devolución total) → auto-rellena a 0€ para no tener que escribir.
//
// Submit → POST /api/invoices/{originalId}/rectificativa → redirige a la
// nueva factura creada.
// -----------------------------------------------------------------------------

interface Props {
  originalInvoiceId: string
  originalNumber: string
  originalSubtotalCents: number
  originalTotalCents: number
  originalIvaRate: number
  onClose: () => void
}

type Motivo = 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

const MOTIVOS: Array<{ code: Motivo; label: string; desc: string }> = [
  { code: 'R1', label: 'R1 — Datos incorrectos', desc: 'Errores en nombre, NIF o dirección del cliente/emisor' },
  { code: 'R2', label: 'R2 — Importes incorrectos', desc: 'Base, IVA o total mal calculados' },
  { code: 'R3', label: 'R3 — Devolución del servicio', desc: 'Cliente ha devuelto / pedido reembolso (abono total)' },
  { code: 'R4', label: 'R4 — Ajuste de IVA', desc: 'Tipo de IVA mal aplicado (21 vs 10 vs 4)' },
  { code: 'R5', label: 'R5 — Otro motivo', desc: 'Cualquier otra situación' },
]

// Strict (siempre 2 decimales) — es ámbito FISCAL (rectificativa AEAT), donde
// "25 €" sería ambiguo. La función global ya incluye el símbolo " €".
import { formatCents } from '@/lib/format'

export default function RectificativaModal({
  originalInvoiceId,
  originalNumber,
  originalSubtotalCents,
  originalTotalCents,
  originalIvaRate,
  onClose,
}: Props) {
  const router = useRouter()
  const [motivo, setMotivo] = useState<Motivo>('R2')
  // Importes en euros (string para control del input). Al enviar convertimos.
  const [subtotalEur, setSubtotalEur] = useState((originalSubtotalCents / 100).toFixed(2))
  const [totalEur, setTotalEur] = useState((originalTotalCents / 100).toFixed(2))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleMotivoChange = (m: Motivo) => {
    setMotivo(m)
    // R3 = devolución total → auto-rellena a 0
    if (m === 'R3') {
      setSubtotalEur('0.00')
      setTotalEur('0.00')
    }
  }

  const parseEur = (s: string): number | null => {
    const n = Number(s.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return null
    return Math.round(n * 100)
  }

  const newSubtotalCents = parseEur(subtotalEur)
  const newTotalCents = parseEur(totalEur)
  const newIvaAmountCents =
    newSubtotalCents !== null && newTotalCents !== null
      ? newTotalCents - newSubtotalCents
      : null

  const valid =
    newSubtotalCents !== null &&
    newTotalCents !== null &&
    newIvaAmountCents !== null &&
    newIvaAmountCents >= 0 &&
    newTotalCents >= newSubtotalCents

  const submit = async () => {
    if (!valid || newSubtotalCents === null || newTotalCents === null || newIvaAmountCents === null) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch(`/api/invoices/${originalInvoiceId}/rectificativa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo,
          newSubtotalCents,
          newIvaAmountCents,
          newTotalCents,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data?.error || 'No se pudo emitir la rectificativa.')
        setSubmitting(false)
        return
      }
      // Navegar a la nueva factura rectificativa
      router.push(`/dashboard/facturas/${data.invoiceId}`)
      router.refresh()
    } catch {
      setError('Error de red.')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel="Emitir rectificativa"
      size="lg"
      closeOnBackdrop={!submitting}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || submitting}
            className="btn-primary"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Emitir rectificativa
          </button>
        </div>
      }
    >
      {/* Header */}
      <div className="p-5 border-b border-line flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-ink">Emitir rectificativa</h3>
          <p className="text-xs text-ink-2 mt-0.5">
            Rectificando <span className="font-mono">{originalNumber}</span> · Original:{' '}
            {formatCents(originalTotalCents)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Cerrar"
          className="text-ink-3 hover:text-ink p-1 -m-1 disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
          {/* Motivo */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-2">
              Motivo
            </label>
            <div className="space-y-2">
              {MOTIVOS.map((m) => (
                <label
                  key={m.code}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    motivo === m.code ? 'border-brand bg-brand-softer' : 'border-line hover:border-line-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={m.code}
                    checked={motivo === m.code}
                    onChange={() => handleMotivoChange(m.code)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">{m.label}</p>
                    <p className="text-xs text-ink-2 mt-0.5">{m.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Importes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-2">
              Nuevos importes (sustituyen a los originales)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-2 mb-1">Base imponible (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={subtotalEur}
                  onChange={(e) => setSubtotalEur(e.target.value.replace(',', '.'))}
                  disabled={submitting || motivo === 'R3'}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono focus:border-brand outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-2 mb-1">Total con IVA (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalEur}
                  onChange={(e) => setTotalEur(e.target.value.replace(',', '.'))}
                  disabled={submitting || motivo === 'R3'}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono focus:border-brand outline-none"
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">
              IVA calculado: {newIvaAmountCents !== null ? formatCents(newIvaAmountCents) : '— €'} (tipo {originalIvaRate}%
              asumido).
              {motivo === 'R3' && ' Devolución total — todo a 0.'}
            </p>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-2">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              rows={2}
              disabled={submitting}
              placeholder="Ej. Cliente pidió devolución del servicio por insatisfacción."
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm resize-none focus:border-brand outline-none"
            />
          </div>

          {error && (
            <p className="text-sm rounded-lg bg-danger/10 border border-danger/25 text-danger px-3 py-2">
              {error}
            </p>
          )}

          <p className="text-[11px] text-ink-3">
            La factura original no se modifica; se marca como «rectificada» con enlace a la nueva.
            La rectificativa se envía a Hacienda con su propia huella VeriFactu.
          </p>
        </div>
    </Modal>
  )
}
