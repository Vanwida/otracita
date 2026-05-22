import Link from 'next/link'
import { ChevronLeft, ArrowRight, type LucideIcon } from 'lucide-react'
import { upgradeMessage, type Feature } from '@/lib/billing/tier'
import { breadcrumbFor } from './area-config'

interface Props {
  feature: Feature
  title: string
  icon: LucideIcon
  /**
   * Pathname canónico de la página (literal, p.ej. '/dashboard/informes').
   * Se pasa explícito porque este es un Server Component sin acceso a
   * usePathname. Cuando se pasa, el back-link se DERIVA de area-config
   * — single source of truth (área padre + href correctos). Sin pathname
   * se omite el back-link.
   */
  pathname?: string
  /**
   * Override manual del back-link. Sólo usar cuando la ruta NO está en
   * area-config (ediciones one-off legacy). Por defecto, NO pasar — usa
   * `pathname` y deja que area-config decida.
   */
  back?: { label: string; href: string }
}

// -----------------------------------------------------------------------------
// UpgradeRequired — pantalla in-page para features no incluidas en el tier.
//
// Mismo patrón que /dashboard/finanzas: header de la sección + card centrada
// con icono, mensaje y CTA a Suscripción (Ajustes). La consistencia entre features evita
// que el barbero piense que es un fallo (una de cada dos páginas con un
// estilo distinto = bug aparente).
//
// Breadcrumb: deriva el área padre de area-config vía `pathname` (no
// hardcodear labels/hrefs en cada página — eso causó el bug de #48 donde
// `/dashboard/informes` mostraba "← Ventas" porque la página lo había
// fijado a mano).
// -----------------------------------------------------------------------------

export default function UpgradeRequired({ feature, title, icon: Icon, pathname, back }: Props) {
  const msg = upgradeMessage(feature)
  const derived = pathname ? breadcrumbFor(pathname).parent : null
  const backLink = back ?? derived
  return (
    <div className="px-4 md:px-8 lg:px-12 max-w-4xl mx-auto pb-16">
      <header className="pt-10 lg:pt-14 pb-8 border-b border-line">
        {backLink && (
          <Link
            href={backLink.href}
            className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink mb-6 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {backLink.label}
          </Link>
        )}
        <h1
          className="font-semibold text-ink leading-tight"
          style={{ fontSize: 'var(--text-page-title)' }}
        >
          {title}
        </h1>
      </header>

      <section
        className="flex flex-col items-center text-center max-w-sm mx-auto gap-5"
        style={{ marginTop: 'var(--space-section)' }}
      >
        <div className="w-14 h-14 rounded-2xl bg-brand-softer flex items-center justify-center">
          <Icon className="h-7 w-7 text-brand" aria-hidden="true" />
        </div>
        <div>
          <h2
            className="font-semibold text-ink mb-2"
            style={{ fontSize: 'var(--text-section-title)' }}
          >{msg.title}</h2>
          <p className="text-sm text-ink-2 leading-relaxed">{msg.body}</p>
        </div>
        <Link href="/dashboard/mi-plan" className="btn-primary inline-flex items-center gap-2">
          Ver Suscripción
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
