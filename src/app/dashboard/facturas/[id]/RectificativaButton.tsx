'use client'

import { useState } from 'react'
import { FileEdit } from 'lucide-react'
import RectificativaModal from '../_components/RectificativaModal'

// -----------------------------------------------------------------------------
// Botón (client) que abre el modal de rectificativa. Se coloca en la barra de
// acciones de la vista individual de factura.
//
// Oculto si la original ya fue rectificada (el server pasa
// `alreadyRectified`), porque una misma factura solo puede tener UNA
// rectificativa (a su vez, la rectificativa sí puede ser rectificada, pero
// eso cae en otra vista).
// -----------------------------------------------------------------------------

interface Props {
  originalInvoiceId: string
  originalNumber: string
  originalSubtotalCents: number
  originalTotalCents: number
  originalIvaRate: number
  alreadyRectified: boolean
}

export default function RectificativaButton(props: Props) {
  const [open, setOpen] = useState(false)

  if (props.alreadyRectified) {
    return (
      <span className="text-xs text-ink-3 italic">Esta factura ya ha sido rectificada</span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-surface border border-line hover:border-warning hover:text-warning px-4 py-2 text-sm font-semibold text-ink-2 transition-colors"
      >
        <FileEdit className="h-4 w-4" />
        Emitir rectificativa
      </button>
      {open && (
        <RectificativaModal
          originalInvoiceId={props.originalInvoiceId}
          originalNumber={props.originalNumber}
          originalSubtotalCents={props.originalSubtotalCents}
          originalTotalCents={props.originalTotalCents}
          originalIvaRate={props.originalIvaRate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
