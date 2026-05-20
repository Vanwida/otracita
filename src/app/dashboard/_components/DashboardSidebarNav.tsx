'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS, isNavItemActive } from './nav-config'

// -----------------------------------------------------------------------------
// Renderiza los ítems del menú principal (rail de iconos desktop/iPad) —
// icon-only, sin label visible. El label se preserva como `aria-label` +
// `title` (a11y) Y como tooltip inmediato en hover/focus (fix #8): al pasar
// de sidebar editorial a rail de iconos se perdió la etiqueta y solo
// quedaba el `title` nativo (lento ~1s, inconsistente). Ahora tooltip
// instantáneo a la derecha del icono, con el MISMO label (fuente única:
// area-config → nav-config). Activo = barra indicadora brand a la izquierda
// (Booksy 09.48.41).
//
// Variante "bottom" eliminada: la nav móvil vive 100% en el drawer del
// burger (decisión de UX — el bottom-nav apilado con el burger era doble
// menú y no cabía en 375px sin scroll horizontal).
// -----------------------------------------------------------------------------

interface Props {
  /** Marca explícita del modo. Reservado por si vuelve un layout alternativo;
   *  por ahora sólo `'sidebar'` es válido. */
  variant: 'sidebar'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function DashboardSidebarNav(_props: Props) {
  const pathname = usePathname()

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
