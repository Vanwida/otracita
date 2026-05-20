import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// StatGrid — rejilla de KPI cards / stat tiles, responsive sin pelear.
//
// Sustituye al patrón repetido en finanzas, informes, caja:
//   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//
// Razón: en iPhone SE (375px) caben 2 cifras tabulares lado a lado si la
// card es compacta. Por debajo de 2 cols la pantalla queda vacía y obliga a
// scroll. Por eso el mobile NO stackea a 1 — stackea a 2.
//
// - mobile (<sm): 2 cols (StatGrid siempre 2 abajo)
// - sm (640px+): mantiene 2 (más espacio)
// - md (768px+, iPad): 3 o 4 según `cols`
// - lg (1024px+): 4 o lo que diga `cols`
//
// Server component — sin estado. Gap por --space-card.
// -----------------------------------------------------------------------------

interface Props {
  /** Cuántas columnas en desktop (lg+). Default 4. */
  cols?: 2 | 3 | 4
  /** Clases extra (margins, etc). */
  className?: string
  children: ReactNode
}

const LG_COLS: Record<NonNullable<Props['cols']>, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'sm:grid-cols-3 md:grid-cols-4',
}

export default function StatGrid({ cols = 4, className = '', children }: Props) {
  return (
    <div
      className={`grid grid-cols-2 ${LG_COLS[cols]} ${className}`}
      style={{ gap: 'var(--space-card)' }}
    >
      {children}
    </div>
  )
}
