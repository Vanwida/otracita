'use client'

import { useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

// -----------------------------------------------------------------------------
// SidebarToggle — botón para colapsar/expandir el sidebar del dashboard.
//
// Dos usos principales del barbero:
//   · Mayor espacio de trabajo en agenda (pantalla completa para ver más
//     columnas de barbero / más horas a la vez)
//   · iPad horizontal: el sidebar roba ancho útil
//
// Persistencia: localStorage para que el estado se mantenga entre
// navegaciones. Por defecto el sidebar queda expandido — solo colapsa si
// el barbero lo pide.
//
// Técnica: el toggle escribe un `data-sidebar` attribute en <html>. CSS
// global en `globals.css` esconde el `<aside data-dashboard-sidebar>`
// cuando está `collapsed`. Así no tocamos el layout server-side.
// -----------------------------------------------------------------------------

const LS_KEY = 'otracita_sidebar_collapsed'

export default function SidebarToggle() {
  // null = aún no hidratado; no renderizamos el icono hasta saber el estado
  // real (evita flash del icono incorrecto en primera pintura).
  const [collapsed, setCollapsed] = useState<boolean | null>(null)

  // Al montar: lee localStorage y sincroniza con el data-attribute del html.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    const initial = saved === '1'
    // Syncs UI to persisted localStorage state on first client paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(initial)
    if (initial) document.documentElement.setAttribute('data-sidebar', 'collapsed')
  }, [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_KEY, next ? '1' : '0')
    }
    if (next) {
      document.documentElement.setAttribute('data-sidebar', 'collapsed')
    } else {
      document.documentElement.removeAttribute('data-sidebar')
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
      aria-pressed={collapsed === true}
      title={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
      className="hidden lg:inline-flex items-center justify-center h-9 w-9 rounded-lg text-ink-3 hover:text-ink hover:bg-overlay transition-colors"
    >
      {/* Mientras no hidrata, pintamos PanelLeftClose por defecto (estado
           habitual = sidebar visible). */}
      {collapsed === true ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
    </button>
  )
}
