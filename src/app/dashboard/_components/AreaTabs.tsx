'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AREA_BY_KEY, type AreaTab } from './area-config'

// -----------------------------------------------------------------------------
// AreaTabs — barra de pestañas horizontal nivel-2 (patrón Booksy literal:
// "Panel de control · Citas · Clientes · Ingresos · Movimiento de caja …").
//
// NO es el segmented-pill control (ese es para filtros de periodo). Esto es
// la navegación primaria del área: pestañas planas, etiqueta activa en ink
// bold con SUBRAYADO terracota, hairline inferior que recorre todo el ancho.
// Copiado de los screenshots 09.46.25 / 10.17.08 — no se reinventa.
//
// Estado activo por `usePathname()` + match de href (no por
// useSelectedLayoutSegment): así funciona tanto si las pestañas son rutas
// ANIDADAS (ej. Ventas: /ventas, /ventas/caja) como si son rutas HERMANAS
// legacy aún sin migrar (ej. Clientes: /clientes, /fidelidad, /resenas).
// La pestaña activa = el tab cuyo href hace mejor prefix-match del pathname
// (el más específico gana, p.ej. /ventas/caja no activa "Resumen" /ventas).
// -----------------------------------------------------------------------------

interface Props {
  /** Key del área en `area-config` (ej. 'ventas', 'equipo'). */
  area: string
}

/** Tab cuyo href hace el match más específico (largo) con el pathname. */
function activeTab(tabs: AreaTab[], pathname: string): AreaTab | null {
  let best: AreaTab | null = null
  for (const t of tabs) {
    if (pathname === t.href || pathname.startsWith(`${t.href}/`)) {
      if (!best || t.href.length > best.href.length) best = t
    }
  }
  return best
}

export default function AreaTabs({ area }: Props) {
  const pathname = usePathname()
  const def = AREA_BY_KEY[area]
  if (!def || def.tabs.length < 2) return null

  const current = activeTab(def.tabs, pathname)

  return (
    <div
      role="tablist"
      aria-label={`Secciones de ${def.label}`}
      className="flex items-stretch gap-1 overflow-x-auto border-b border-line -mx-[var(--space-page)] px-[var(--space-page)]"
    >
      {def.tabs.map((tab) => {
        const active = current?.href === tab.href
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
