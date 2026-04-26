import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// -----------------------------------------------------------------------------
// Breadcrumb que aparece en cada subpágina del hub Ajustes:
//
//     ‹ Ajustes  ›  Tu barbería
//
// Sirve dos funciones:
//   1. Vuelta clara al hub (el barbero no se "pierde" en una página de form).
//   2. Indicar visualmente que esa página vive *dentro* de Ajustes — la Fase 2
//      moverá las URLs a /dashboard/ajustes/* y el breadcrumb seguirá igual.
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
        Ajustes
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-ink-3 shrink-0" />
      <span className="text-ink font-medium truncate">{current}</span>
    </nav>
  )
}
