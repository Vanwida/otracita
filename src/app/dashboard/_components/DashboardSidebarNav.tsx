'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS, isNavItemActive } from './nav-config'

// -----------------------------------------------------------------------------
// Renderiza los ítems del menú principal (definidos en nav-config) con el
// estado "active" calculado desde el pathname. Usado en dos sitios (rail de
// iconos desktop + bottom nav móvil) — el modo cambia el layout/spacing pero
// la lógica de active es la misma, así que extraer el cálculo a
// `isNavItemActive` (en nav-config) mantiene DRY.
//
// variant="sidebar" → rail de iconos (UI0): icon-only, sin label visible.
// El label se preserva como `aria-label` + `title` (a11y) Y como tooltip
// real en hover/focus (fix #8): al pasar de sidebar editorial a rail de
// iconos se perdió la etiqueta y solo quedaba el `title` nativo (lento,
// ~1s, inconsistente). Ahora hay un tooltip inmediato a la derecha del
// icono, con el MISMO label (fuente única: area-config → nav-config).
// Activo = barra indicadora brand a la izquierda (Booksy 09.48.41).
// -----------------------------------------------------------------------------

interface Props {
  variant: 'sidebar' | 'bottom'
}

export default function DashboardSidebarNav({ variant }: Props) {
  const pathname = usePathname()

  if (variant === 'sidebar') {
    return (
      <>
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = isNavItemActive(href, pathname)
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              title={label}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-control transition-colors ${
                active
                  ? 'bg-sidebar-hover text-ink'
                  : 'text-sidebar-text hover:text-ink hover:bg-sidebar-hover'
              }`}
            >
              {/* Barra indicadora brand a la izquierda del rail cuando
                  el tab está activo (sustituye al label que ya no se ve). */}
              {active && (
                <span
                  className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-brand"
                  aria-hidden="true"
                />
              )}
              <Icon className="h-5 w-5" />
              {/* Tooltip inmediato (fix #8): mismo label que el aria/title,
                  visible en hover Y en focus por teclado. Sin JS, sin
                  retardo del title nativo. pointer-events-none para no
                  robar el clic al Link. */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-[calc(100%+0.625rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {label}
              </span>
            </Link>
          )
        })}
      </>
    )
  }

  // variant === 'bottom'
  return (
    <>
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = isNavItemActive(href, pathname)
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center gap-1 min-h-[48px] px-3 py-1.5 transition-colors ${
              active ? 'text-ink' : 'text-ink-2 hover:text-ink'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-medium leading-none">{label}</span>
          </Link>
        )
      })}
    </>
  )
}
