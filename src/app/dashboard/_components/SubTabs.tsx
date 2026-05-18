'use client'

import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { SUB_TABS, isSubTabActive, type SubTabHub } from './sub-tabs-config'

// -----------------------------------------------------------------------------
// SubTabs — nivel-2 nav: pestañas horizontales del hub.
//
// Renderiza la barra de pestañas declarada en `sub-tabs-config` para el hub
// dado. El estado activo viene de `useSelectedLayoutSegment()` (Next 16):
// devuelve el segmento de la ruta hija activa, o `null` cuando estamos en
// la ruta índice del hub (la pestaña por defecto).
//
// Estilo = segmented control (mismo lenguaje visual que `StatsPeriodTabs`):
// pill sobre fondo overlay, pestaña activa elevada con `bg-surface` +
// sombra. Control-panel, no menú editorial.
//
// Navegación real vía <Link> a rutas anidadas → deep-link y botón atrás
// del navegador funcionan sin estado extra.
// -----------------------------------------------------------------------------

interface Props {
  hub: SubTabHub
}

export default function SubTabs({ hub }: Props) {
  const segment = useSelectedLayoutSegment()
  const tabs = SUB_TABS[hub]

  return (
    <div
      role="tablist"
      aria-label="Sub-secciones"
      className="inline-flex items-center gap-1 bg-overlay border border-line rounded-control p-1"
    >
      {tabs.map((tab) => {
        const active = isSubTabActive(tab, segment)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              active
                ? 'bg-surface shadow-sm text-ink'
                : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
