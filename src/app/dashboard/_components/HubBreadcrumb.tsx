import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// -----------------------------------------------------------------------------
// Breadcrumb que aparece en cada subpágina de un hub:
//
//     ‹ Ajustes ›  Tu barbería
//     ‹ Crecer  ›  Reseñas
//
// Sirve dos funciones:
//   1. Vuelta clara al hub (el barbero no se "pierde" en una página de form).
//   2. Indicar visualmente que esa página vive *dentro* del hub.
// -----------------------------------------------------------------------------

interface Props {
  current: string
  /** Parent hub. Default: Ajustes. Crecer subpages pasan { label: 'Crecer', href: '/dashboard/crecer' }. */
  parent?: { label: string; href: string }
}

export default function HubBreadcrumb({ current, parent }: Props) {
  const p = parent ?? { label: 'Ajustes', href: '/dashboard/ajustes' }
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm">
      <Link
        href={p.href}
        className="text-ink-3 hover:text-ink transition-colors"
      >
        {p.label}
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-ink-3 shrink-0" />
      <span className="text-ink font-medium truncate">{current}</span>
    </nav>
  )
}
