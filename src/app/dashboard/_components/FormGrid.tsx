import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// FormGrid — rejilla responsive con stack mobile + N-cols en breakpoint.
//
// Sustituye al patrón repetido en el dashboard:
//   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//
// API mínima — `cols` (2-4), `at` (sm/md/lg, dónde activar), `gap`
// (tight/card/section). El stack <breakpoint es siempre 1 columna.
//
// Razón: en mobile (375px) dos campos lado a lado caben a 160px cada uno,
// sin sitio para labels + inputs. Stack vertical bajo el breakpoint,
// columnas a partir del breakpoint indicado. `gap` usa tokens semánticos
// (no px hardcoded).
//
// Server component — sin estado.
//
// Uso:
//   <FormGrid cols={2}>…</FormGrid>                          // 1 col → md+ 2 col
//   <FormGrid cols={3} at="md">…</FormGrid>                  // 1 col → md+ 3 col
//   <FormGrid cols={2} at="sm" gap="tight">…</FormGrid>     // grid pequeño, gap 8px
//   <FormGrid cols={2} gap="section">…</FormGrid>            // gap responsive 16→24
// -----------------------------------------------------------------------------

interface Props {
  /** Columnas a partir del breakpoint `at`. En mobile siempre 1. Default 2. */
  cols?: 2 | 3 | 4
  /** Breakpoint Tailwind donde activa cols. Default `'md'` (768px). */
  at?: 'sm' | 'md' | 'lg'
  /**
   * Tamaño del gap entre celdas:
   *   · `tight`   → 8px, para grids compactos (texto, badges)
   *   · `card`    → 16px (default), para forms estándar
   *   · `section` → clamp 16-24px responsive, para layouts amplios
   */
  gap?: 'tight' | 'card' | 'section'
  /** Clases extra del wrapper (margins, alineación). */
  className?: string
  children: ReactNode
}

// Lookup table — Tailwind necesita las clases LITERALES en el código fuente
// (su escáner JIT no resuelve template strings). Por eso cada combinación
// breakpoint+cols se mapea explícitamente.
const COLS: Record<NonNullable<Props['at']>, Record<NonNullable<Props['cols']>, string>> = {
  sm: { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' },
  md: { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' },
  lg: { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' },
}

const GAP: Record<NonNullable<Props['gap']>, string> = {
  tight: '0.5rem',                // 8px
  card: 'var(--space-card)',      // 16px
  section: 'var(--space-section)', // clamp(1rem, 3.2vw, 1.5rem)
}

export default function FormGrid({
  cols = 2,
  at = 'md',
  gap = 'card',
  className = '',
  children,
}: Props) {
  return (
    <div
      className={`grid grid-cols-1 ${COLS[at][cols]} ${className}`}
      style={{ gap: GAP[gap] }}
    >
      {children}
    </div>
  )
}
