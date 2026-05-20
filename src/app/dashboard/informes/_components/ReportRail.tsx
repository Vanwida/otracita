'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

// -----------------------------------------------------------------------------
// ReportRail — el rail derecho "Informes" de Booksy (patrón firma, presente
// en TODOS los screenshots 09.4x/09.5x: una lista de sub-reportes nombrados
// por pestaña, cada uno lleva a una vista filtrada).
//
// El barbero que viene de Booksy busca este rail con los ojos: "Lista de
// clientes", "Inasistencias", "Ventas por servicio"… son su mapa mental.
// Aquí curamos SOLO los sub-reportes que se pueden construir con datos que
// YA tenemos y que llevan a un destino real ya filtrado (la lista de
// clientes con ?status=, una pestaña de Informes con otro ?period=, etc.).
// No falseamos reportes que no existen.
//
// DRY: un solo componente; cada page.tsx declara sus items. Preserva el
// `?period=` actual al navegar entre pestañas de Informes para que el
// drill-down se quede en el mismo periodo (continuidad de contexto, igual
// que Booksy mantiene el mes seleccionado al saltar de reporte).
//
// Presentación pura. Tokens-only, AAA (text-ink-2 ≈6.4:1), castellano.
// -----------------------------------------------------------------------------

export interface ReportRailItem {
  /** Etiqueta del sub-reporte (nomenclatura Booksy: "Lista de clientes"…). */
  label: string
  /** Destino. Ruta + query ya filtrada (producible con datos existentes). */
  href: string
  /**
   * Si true, se le añade el `?period=` actual al navegar (para pestañas de
   * Informes que comparten el selector). Las rutas con su propio filtro
   * (lista de clientes con ?status=) NO lo necesitan → false.
   */
  carryPeriod?: boolean
}

interface Props {
  /** Sub-reportes curados de la pestaña activa. */
  items: ReportRailItem[]
}

export default function ReportRail({ items }: Props) {
  const searchParams = useSearchParams()
  const period = searchParams.get('period')

  const resolveHref = (item: ReportRailItem): string => {
    if (!item.carryPeriod || !period) return item.href
    const sep = item.href.includes('?') ? '&' : '?'
    return `${item.href}${sep}period=${period}`
  }

  return (
    <aside
      aria-label="Informes"
      className="panel"
    >
      <header
        className="border-b border-line px-[var(--space-card)] py-3"
        style={{ background: 'var(--table-head-bg)' }}
      >
        <h2 className="text-[0.8125rem] font-semibold text-ink">Informes</h2>
      </header>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={resolveHref(item)}
              className="flex items-center justify-between gap-3 px-[var(--space-card)] py-2.5 text-[0.8125rem] text-ink-2 transition-colors hover:bg-overlay hover:text-ink"
            >
              <span className="min-w-0 truncate">{item.label}</span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-ink-3"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
