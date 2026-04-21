'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-semibold text-brand-ink transition-colors"
    >
      <Printer className="h-4 w-4" />
      Imprimir / Guardar PDF
    </button>
  )
}
