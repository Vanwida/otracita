'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt, Loader2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// InvoiceCell — estado fiscal por fila del libro de Transacciones.
//
// Cada venta es por defecto un TICKET interno (registrada para caja/BI, no
// declarada a Hacienda). El barbero declara cuando quiere, igual que en el
// recibo del TPV: botón "Generar factura" → POST /api/invoices/from-booking
// (on-demand, idempotente, reusa generateInvoiceFromBooking).
//
//   · facturada → badge "FAC-..." (no hay acción, ya está)
//   · ticket + bookingId + invoicing activo → botón "Generar factura"
//   · ticket sin bookingId (p.ej. venta de producto suelta) → solo badge
//     "Ticket" (no hay cita que facturar individualmente aquí)
// -----------------------------------------------------------------------------

interface Props {
  bookingId: string | null
  invoiceNumber: string | null
  invoicingEnabled: boolean
}

export default function InvoiceCell({
  bookingId,
  invoiceNumber,
  invoicingEnabled,
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'done'; number: string }
    | { kind: 'error'; message: string }
  >(invoiceNumber ? { kind: 'done', number: invoiceNumber } : { kind: 'idle' })

  if (state.kind === 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-softer px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-widest text-brand-strong">
        <Receipt className="h-3 w-3" aria-hidden="true" />
        {state.number}
      </span>
    )
  }

  if (!invoicingEnabled || !bookingId) {
    return (
      <span className="inline-flex items-center rounded-full bg-overlay px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-widest text-ink-3">
        Ticket
      </span>
    )
  }

  async function generar() {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/invoices/from-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        number?: string
        error?: string
      }
      if (!res.ok || !data.number) {
        setState({
          kind: 'error',
          message: data.error ?? 'No se pudo emitir.',
        })
        return
      }
      setState({ kind: 'done', number: data.number })
      router.refresh()
    } catch {
      setState({ kind: 'error', message: 'Sin conexión.' })
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void generar()}
        disabled={state.kind === 'loading'}
        className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1 text-[0.75rem] font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
      >
        {state.kind === 'loading' ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <Receipt className="h-3 w-3" aria-hidden="true" />
        )}
        Generar factura
      </button>
      {state.kind === 'error' && (
        <span className="text-[0.6875rem] text-danger">{state.message}</span>
      )}
    </span>
  )
}
