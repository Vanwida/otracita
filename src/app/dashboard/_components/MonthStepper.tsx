'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

// -----------------------------------------------------------------------------
// MonthStepper — control de mes con el MISMO lenguaje visual que
// StatsPeriodTabs (contenedor chip: `bg-overlay border border-line
// rounded-lg p-1`), para que el barbero que viene de Booksy NO vea dos
// selectores distintos al moverse entre pestañas de Informes.
//
// PRESENTACIÓN PURA. No conoce P&L ni payroll: recibe la etiqueta ya
// formateada y dos callbacks (anterior / siguiente). La semántica fiscal
// (mes discreto para IVA trimestral y nómina mensual) vive INTACTA en
// quien lo usa — este componente solo pinta. Esto era requisito duro:
// romper la semántica de meses sería un bug del producto, no una mejora.
//
// Por qué meses y no las chips day/week/month/year/lifetime de
// StatsPeriodTabs: el P&L y las nóminas son fiscales — un trimestre de IVA
// o una nómina no son un rango rolling. Mismo CONTENEDOR visual, distinta
// unidad: consistencia sin falsear la semántica.
// -----------------------------------------------------------------------------

interface Props {
  /** Etiqueta del mes ya formateada (ej. "mayo de 2026"). */
  label: string
  /** Ir al mes anterior. */
  onPrev: () => void
  /** Ir al mes siguiente. */
  onNext: () => void
  /** Deshabilita los pasos mientras carga (evita doble navegación). */
  disabled?: boolean
}

export default function MonthStepper({
  label,
  onPrev,
  onNext,
  disabled = false,
}: Props) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-overlay p-1">
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled}
        aria-label="Mes anterior"
        className="rounded-md p-1.5 text-ink-3 transition-colors hover:text-ink-2 disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="min-w-[8rem] rounded-md bg-surface px-3 py-1.5 text-center text-xs font-medium capitalize text-ink shadow-sm tabular-nums">
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        aria-label="Mes siguiente"
        className="rounded-md p-1.5 text-ink-3 transition-colors hover:text-ink-2 disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
