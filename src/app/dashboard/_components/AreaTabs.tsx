'use client'

import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { AREA_BY_KEY, isAreaTabActive } from './area-config'

// -----------------------------------------------------------------------------
// AreaTabs — barra de pestañas horizontal nivel-2 (patrón Booksy literal:
// "Panel de control · Citas · Clientes · Ingresos · Movimiento de caja …").
//
// NO es el segmented-pill control (ese es para filtros de periodo). Esto es
// la navegación primaria del área: pestañas planas, etiqueta activa en ink
// bold con SUBRAYADO terracota, hairline inferior que recorre todo el ancho.
// Copiado de los screenshots 09.46.25 / 10.17.08 — no se reinventa.
//
// El estado activo viene de `useSelectedLayoutSegment()` (Next 16): devuelve
// el segmento de la ruta hija activa, o `null` en la ruta índice del área
// (la pestaña por defecto). Navegación real vía <Link> a rutas anidadas.
// -----------------------------------------------------------------------------

interface Props {
  /** Key del área en `area-config` (ej. 'ventas', 'equipo'). */
  area: string
}

export default function AreaTabs({ area }: Props) {
  const segment = useSelectedLayoutSegment()
  const def = AREA_BY_KEY[area]
  if (!def || def.tabs.length < 2) return null

  return (
    <div
      role="tablist"
      aria-label={`Secciones de ${def.label}`}
      className="flex items-stretch gap-1 overflow-x-auto border-b border-line -mx-[var(--space-page)] px-[var(--space-page)]"
    >
      {def.tabs.map((tab) => {
        const active = isAreaTabActive(tab, segment)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            className={`relative whitespace-nowrap px-3 pb-2.5 pt-1 text-[0.8125rem] font-medium transition-colors ${
              active
                ? 'font-semibold text-ink'
                : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {tab.label}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors ${
                active ? 'bg-brand' : 'bg-transparent'
              }`}
            />
          </Link>
        )
      })}
    </div>
  )
}
