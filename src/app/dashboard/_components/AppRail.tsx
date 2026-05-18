import Link from 'next/link'
import { Shield } from 'lucide-react'
import { Monogram } from '@/components/brand'
import DashboardSidebarNav from './DashboardSidebarNav'
import RailUserMenu from './RailUserMenu'

// -----------------------------------------------------------------------------
// AppRail — nivel-1 nav: rail de iconos a la izquierda (desktop lg+).
//
// Sustituye al `<aside w-60>` editorial por un rail estrecho de iconos
// (--rail-width = 64px) al estilo Booksy: logo arriba, iconos de sección
// (DashboardSidebarNav variant="sidebar", ahora icon-only con aria-label),
// y el menú de cuenta abajo como popover (RailUserMenu).
//
// El cálculo de "active" sigue centralizado en nav-config (isNavItemActive)
// — este componente solo cambia el chrome, no el modelo de 5 tabs.
//
// Extraído de layout.tsx para que el rail sea testeable y el layout quede
// como puro ensamblador (server). No consume datos: recibe lo que el
// layout ya resuelve de la sesión.
// -----------------------------------------------------------------------------

interface Props {
  email: string
  isAdmin: boolean
  needsSetup: boolean
}

export default function AppRail({ email, isAdmin, needsSetup }: Props) {
  return (
    <aside
      className="hidden lg:flex lg:flex-col items-center shrink-0 border-r border-sidebar-line bg-sidebar py-4"
      style={{ width: 'var(--rail-width)' }}
      aria-label="Navegación principal"
    >
      <Link
        href="/dashboard"
        className="flex items-center justify-center text-ink mb-6"
        aria-label="Inicio · otracita"
        title="Inicio"
      >
        <Monogram height={28} />
      </Link>

      <nav className="flex-1 flex flex-col items-center gap-1" aria-label="Secciones">
        <DashboardSidebarNav variant="sidebar" />

        {isAdmin && (
          <Link
            href="/admin"
            aria-label="Panel admin"
            title="Panel admin"
            className="mt-2 flex h-10 w-10 items-center justify-center rounded-control text-sidebar-text hover:text-ink hover:bg-sidebar-hover transition-colors"
          >
            <Shield className="h-5 w-5" />
          </Link>
        )}
      </nav>

      {needsSetup && (
        <Link
          href="/dashboard/setup"
          aria-label="Configuración pendiente — continuar"
          title="Configuración pendiente"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-softer border border-brand/30 text-brand hover:border-brand transition-colors"
        >
          {/* Punto-aviso: la tarjeta de setup del sidebar no cabe en el
              rail; se reduce a un indicador con tooltip. */}
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
        </Link>
      )}

      <div className="mt-2">
        <RailUserMenu email={email} isAdmin={isAdmin} />
      </div>
    </aside>
  )
}
