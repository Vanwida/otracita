'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS, isNavItemActive } from './nav-config'

// -----------------------------------------------------------------------------
// Renderiza los ítems del menú principal (definidos en nav-config) con el
// estado "active" calculado desde el pathname. Usado en dos sitios (sidebar
// desktop + bottom nav móvil) — el modo cambia el layout/spacing pero la
// lógica de active es la misma, así que extraer el cálculo a `isNavItemActive`
// (en nav-config) mantiene DRY.
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
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-sidebar-hover text-ink'
                  : 'text-sidebar-text hover:text-ink hover:bg-sidebar-hover'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
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
