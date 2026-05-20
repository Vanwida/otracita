import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// SectionHeader — etiqueta de sección dentro de FinanzasClient. Sólo se usa
// aquí porque el ritmo de uppercase tracking + paddings es propio del panel
// fiscal (más apretado que los headers genéricos del dashboard).
// -----------------------------------------------------------------------------

export default function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.14em] pt-6 pb-1 px-1">
      {children}
    </h2>
  )
}
