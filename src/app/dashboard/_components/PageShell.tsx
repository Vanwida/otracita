import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// PageShell — contenedor estándar de pantalla del dashboard.
//
// Sustituye al patrón editorial repetido en ~13 páginas:
//
//   <div className="p-4 md:p-8 max-w-5xl mx-auto">
//     <HubBreadcrumb current="..." />
//     <header className="mb-8">
//       <h1 className="font-display text-3xl md:text-4xl ...">Título</h1>
//       <p className="text-ink-2 max-w-2xl">Párrafo largo...</p>
//     </header>
//     ...
//
// ...por un header compacto de panel de control (UI0): título pequeño en
// sans (NUNCA Fraunces), back-affordance integrado (absorbe HubBreadcrumb),
// slot de sub-tabs y slot de acción primaria sticky. Densidad vía tokens
// (--space-page, --text-page-title).
//
// Server component — sin interactividad. Las acciones (botones, sub-tabs)
// se pasan como nodos ya renderizados por la página.
// -----------------------------------------------------------------------------

interface Props {
  /** Título de la pantalla (sans, compacto — no titular de revista). */
  title: string
  /** Subtítulo corto opcional. NO párrafos largos — esto es un panel. */
  subtitle?: string
  /** Back-affordance: absorbe HubBreadcrumb. Vuelve al hub padre. */
  back?: { label: string; href: string }
  /** Barra de sub-tabs (nivel-2). Normalmente <SubTabs hub="..." />. */
  subTabs?: ReactNode
  /** Acción primaria sticky a la derecha del header (botón oscuro alto contraste). */
  action?: ReactNode
  /** Ancho máximo del contenido. Default 6xl (más ancho que el editorial 5xl). */
  maxWidth?: 'full' | '4xl' | '5xl' | '6xl' | '7xl'
  children: ReactNode
}

const MAX_W: Record<NonNullable<Props['maxWidth']>, string> = {
  full: 'max-w-none',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
}

export default function PageShell({
  title,
  subtitle,
  back,
  subTabs,
  action,
  maxWidth = '6xl',
  children,
}: Props) {
  return (
    <div
      className={`${MAX_W[maxWidth]} mx-auto`}
      style={{ padding: 'var(--space-page)' }}
    >
      {/* Header de panel — sticky para que la acción primaria ancle la
          pantalla aunque se haga scroll del contenido. */}
      <header
        className="sticky top-0 z-20 -mx-[var(--space-page)] px-[var(--space-page)] bg-canvas/90 backdrop-blur-sm border-b border-line"
        style={{ paddingTop: 'var(--space-card)', paddingBottom: 'var(--space-card)' }}
      >
        {back && (
          <Link
            href={back.href}
            className="inline-flex items-center gap-1 text-meta text-ink-3 hover:text-ink transition-colors mb-1.5"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
            {back.label}
          </Link>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="font-semibold text-ink leading-tight truncate"
              style={{ fontSize: 'var(--text-page-title)' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="text-ink-2 mt-0.5 truncate"
                style={{ fontSize: 'var(--text-meta)' }}
              >
                {subtitle}
              </p>
            )}
          </div>

          {action && <div className="shrink-0">{action}</div>}
        </div>

        {subTabs && <div className="mt-3">{subTabs}</div>}
      </header>

      <div style={{ marginTop: 'var(--space-section)' }}>{children}</div>
    </div>
  )
}
