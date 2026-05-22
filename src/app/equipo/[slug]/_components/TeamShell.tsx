'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Calendar, LogOut, ShieldCheck } from 'lucide-react'
import { Monogram } from '@/components/brand'
import { TEAM_AREA_LABELS, type TeamAreaKey } from '@/lib/team-auth/areas'

// -----------------------------------------------------------------------------
// TeamShell — chrome del MODO EQUIPO. Versión simplificada del dashboard:
// rail estrecho con SOLO los enlaces de áreas permitidas + badge "Modo
// equipo" en topbar + botón logout.
//
// Por qué no reusar AppRail/DashboardSidebarNav: aquellos linkean a
// /dashboard/* (hardcoded en nav-config), mientras que el modo equipo vive
// bajo /equipo/[slug]/*. Mantener un shell separado es más barato que
// parametrizar todo el árbol de nav del admin para dos consumidores.
//
// Para MVP solo agenda está cableada. Otras áreas se irán añadiendo a
// `TEAM_AREA_ROUTES` cuando estén listas; las áreas habilitadas que NO
// tienen ruta cableada se renderizan disabled con tooltip "Próximamente".
// -----------------------------------------------------------------------------

interface Props {
  slug: string
  businessName: string
  allowedAreas: TeamAreaKey[]
  children: React.ReactNode
}

interface AreaRoute {
  area: TeamAreaKey
  href: (slug: string) => string
  icon: typeof Calendar
  cabled: boolean
}

const TEAM_AREA_ROUTES: AreaRoute[] = [
  {
    area: 'agenda',
    href: (slug) => `/equipo/${slug}/agenda`,
    icon: Calendar,
    cabled: true,
  },
  // Próximas iteraciones: clientes, ventas… se cablearán aquí.
]

export default function TeamShell({ slug, businessName, allowedAreas, children }: Props) {
  const pathname = usePathname()
  const [loggingOut, startLogout] = useTransition()
  const allowedSet = new Set(allowedAreas)

  function logout() {
    startLogout(async () => {
      try {
        await fetch('/api/team-access/logout', { method: 'POST' })
      } finally {
        window.location.href = `/equipo/${slug}/login`
      }
    })
  }

  const visibleRoutes = TEAM_AREA_ROUTES.filter((r) => allowedSet.has(r.area))

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-ink">
      {/* Rail estrecho (desktop md+) */}
      <aside
        className="hidden shrink-0 flex-col items-center border-r border-line bg-overlay py-4 md:flex"
        style={{ width: 'var(--rail-width)' }}
        aria-label="Navegación modo equipo"
      >
        <Link
          href={`/equipo/${slug}/agenda`}
          className="mb-6 flex items-center justify-center text-ink"
          aria-label={businessName}
          title={businessName}
        >
          <Monogram height={28} />
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1" aria-label="Áreas">
          {visibleRoutes.map((r) => {
            const Icon = r.icon
            const active = pathname?.startsWith(r.href(slug))
            const cls = active
              ? 'bg-brand-softer text-brand-strong'
              : 'text-ink-2 hover:bg-canvas hover:text-ink'
            return r.cabled ? (
              <Link
                key={r.area}
                href={r.href(slug)}
                className={`flex h-10 w-10 items-center justify-center rounded-control transition-colors ${cls}`}
                title={TEAM_AREA_LABELS[r.area]}
                aria-label={TEAM_AREA_LABELS[r.area]}
              >
                <Icon className="h-5 w-5" />
              </Link>
            ) : (
              <span
                key={r.area}
                aria-disabled
                title={`${TEAM_AREA_LABELS[r.area]} · próximamente`}
                className="flex h-10 w-10 items-center justify-center rounded-control text-ink-3 opacity-50"
              >
                <Icon className="h-5 w-5" />
              </span>
            )
          })}
        </nav>
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="flex h-10 w-10 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-canvas hover:text-ink disabled:opacity-50"
          aria-label="Cerrar sesión del modo equipo"
          title="Cerrar sesión"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </aside>

      {/* Main area + topbar */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex shrink-0 items-center justify-between border-b border-line bg-canvas px-4 py-2"
          style={{ paddingTop: 'var(--safe-top, 0.5rem)' }}
        >
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <ShieldCheck className="h-4 w-4 text-brand-strong" />
            <span className="font-medium text-ink">Modo equipo</span>
            <span className="hidden text-ink-3 sm:inline">· {businessName}</span>
          </div>
          {/* Mobile-only logout (rail oculto <md) */}
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="rounded-control border border-line bg-surface px-3 py-1 text-xs text-ink-2 md:hidden"
          >
            Salir
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  )
}
