'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

// -----------------------------------------------------------------------------
// CollapsibleBlock — fila colapsable del panel Finanzas. Cabecera clicable
// con label + sub + valor a la derecha + chevron giratorio. Cuerpo plegable.
//
// Doble modo:
//   · CONTROLADO: el caller pasa `isOpen` + `onToggle` (típico cuando el
//     panel carga datos lazy — el estado del open vive en el padre).
//   · AUTÓNOMO:  ningún prop → usa `useState` interno (estado local).
//
// `rightTone='warning'` resalta la cifra derecha en ámbar — útil para
// reservas fiscales o totales que el barbero "debe ojo".
// -----------------------------------------------------------------------------

interface Props {
  label: string
  sub?: string
  right?: string
  rightTone?: 'default' | 'warning'
  /** Si se pasa, el componente es controlado por el padre. */
  isOpen?: boolean
  onToggle?: () => void
  /** Slot entre el sub y el chevron, p. ej. un selector inline. */
  extraHeader?: ReactNode
  children: ReactNode
}

export default function CollapsibleBlock({
  label,
  sub,
  right,
  rightTone = 'default',
  isOpen,
  onToggle,
  extraHeader,
  children,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isOpen !== undefined ? isOpen : internalOpen
  const toggle = onToggle ?? (() => setInternalOpen(!internalOpen))
  const rightClass = rightTone === 'warning' ? 'text-warning font-bold' : 'text-ink font-semibold'
  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-overlay/30 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          {sub && <p className="text-xs text-ink-3 mt-0.5 truncate">{sub}</p>}
        </div>
        {extraHeader}
        {right && <span className={`tabular-nums text-sm shrink-0 ${rightClass}`}>{right}</span>}
        <ChevronDown
          className={`h-4 w-4 text-ink-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </div>
  )
}
