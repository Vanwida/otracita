import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// -----------------------------------------------------------------------------
// Breadcrumb que aparece en cada subpágina del hub:
//
//     ‹ Más  ›  Tu barbería
//
// Sirve dos funciones:
//   1. Vuelta clara al hub (el barbero no se "pierde" en una página de form).
//   2. Indicar visualmente que esa página vive *dentro* del hub.
//
// El hub vivía bajo el label "Ajustes"; renombrado a "Más" en commit 5
// porque ahora contiene también marketing, fidelización, etc. — no solo
// configuración. La URL /dashboard/ajustes se mantiene (no rompemos
// bookmarks).
// -----------------------------------------------------------------------------

interface Props {
  current: string
}

export default function AjustesBreadcrumb({ current }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm">
      <Link
        href="/dashboard/ajustes"
        className="text-ink-3 hover:text-ink transition-colors"
      >
        Más
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-ink-3 shrink-0" />
      <span className="text-ink font-medium truncate">{current}</span>
    </nav>
  )
}
