import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// AreaContent — región de contenido de una pestaña dentro de AreaShell.
//
// Dos modos, ambos respetan la regla "la página no scrollea":
//
//   scroll="region" (default) — el bloque ENTERO de la pestaña scrollea
//     internamente si desborda (overflow-y-auto + padding). Para pestañas
//     con KPI strip + una o varias tablas largas (Booksy "Citas",
//     "Ingresos"): la barra de pestañas y el header quedan fijos, solo
//     este interior se mueve.
//
//   scroll="fixed" — NADA scrollea; el contenido se reparte en la altura
//     disponible (flex column). Para paneles tipo dashboard que caben en
//     pantalla por diseño (Booksy "Panel de control": gráficas + KPIs que
//     encajan). Si un hijo necesita scroll, que lo gestione él (una tabla
//     con su propio overflow), no la pestaña.
//
// En ambos casos el ancho se acota con maxWidth centrado (paneles de
// control no usan medidas de columna de revista; 7xl/none para tablas
// anchas, 6xl para densidad media).
// -----------------------------------------------------------------------------

interface Props {
  /** 'region' = scroll interno del bloque · 'fixed' = sin scroll, flex-fill. */
  scroll?: 'region' | 'fixed'
  maxWidth?: 'full' | '5xl' | '6xl' | '7xl'
  /** Quita el padding (para layouts master-detail que controlan su gutter). */
  bleed?: boolean
  children: ReactNode
}

const MAX_W: Record<NonNullable<Props['maxWidth']>, string> = {
  full: 'max-w-none',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
}

export default function AreaContent({
  scroll = 'region',
  maxWidth = '7xl',
  bleed = false,
  children,
}: Props) {
  const pad = bleed ? '' : 'p-[var(--space-page)]'

  if (scroll === 'fixed') {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={`mx-auto flex min-h-0 w-full flex-1 flex-col ${MAX_W[maxWidth]} ${pad}`}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto w-full ${MAX_W[maxWidth]} ${pad}`}>{children}</div>
    </div>
  )
}
