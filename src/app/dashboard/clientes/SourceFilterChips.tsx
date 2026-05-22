import Link from 'next/link'
import { X } from 'lucide-react'
import { getSourceMeta } from '@/lib/sources'

// -----------------------------------------------------------------------------
// SourceFilterChips — filtro multi-select por canal de captación en la lista
// de clientes. Server component: el toggle se hace via Link (igual que los
// FilterPill de status), así no hay flicker ni client-side filter — el
// contador y la paginación los calcula siempre el servidor sobre los
// resultados reales.
//
// UI: cada chip muestra icono oficial (catálogo `src/lib/sources.ts`) +
// label + contador. Click → añade/quita ese canal del array `?source=…`.
// Solo se renderizan canales con ≥1 cliente (el listado de iconos completo
// es ruidoso cuando 7 de 11 chips marcan 0).
//
// Multi-tenant: el contador viene de la query agregada de la propia página
// — ya filtrada por `clientId`. Aquí solo pintamos.
// -----------------------------------------------------------------------------

interface SourceCount {
  source: string
  count: number
}

interface Props {
  /** Conteos por canal (ya filtrados por tenant). Solo se pintan ≥1. */
  counts: SourceCount[]
  /** Canales seleccionados (intersección con counts disponibles). */
  selected: string[]
  /** Builder de href que preserva el resto de query params (status, q, sort). */
  buildHref: (sources: string[]) => string
}

export default function SourceFilterChips({ counts, selected, buildHref }: Props) {
  // Filtra solo canales con ≥1 cliente. Mantiene el orden del catálogo
  // (no por cantidad) — así el barbero ve siempre Instagram antes que
  // walk-in independientemente del tráfico.
  const visible = counts.filter((c) => c.count > 0)
  if (visible.length === 0) return null

  const selectedSet = new Set(selected)
  const hasSelection = selected.length > 0

  return (
    <div className="mb-4">
      <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-2">
        Filtrar por canal de captación
      </p>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {visible.map(({ source, count }) => {
          const meta = getSourceMeta(source)
          const active = selectedSet.has(source)
          // Toggle: si está activo lo quitamos, si no lo añadimos.
          const nextSelection = active
            ? selected.filter((s) => s !== source)
            : [...selected, source]
          return (
            <Link
              key={source}
              href={buildHref(nextSelection)}
              aria-pressed={active}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors border min-h-[44px] ${
                active
                  ? 'bg-brand text-brand-ink border-brand'
                  : 'bg-surface text-ink-2 border-line hover:border-line-strong hover:text-ink'
              }`}
            >
              <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {meta.label}
              <span
                className={`tabular-nums ${active ? 'opacity-80' : 'text-ink-3'}`}
              >
                {count}
              </span>
            </Link>
          )
        })}
        {hasSelection && (
          <Link
            href={buildHref([])}
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-ink-3 hover:text-ink transition-colors min-h-[44px]"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Limpiar
          </Link>
        )}
      </div>
    </div>
  )
}
