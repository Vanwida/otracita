import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Trend } from './KpiCard'

// -----------------------------------------------------------------------------
// StatStrip — tira de KPIs compacta del panel de control (Booksy: el cluster
// "CITAS 323 +37% · TIEMPO 25 -5% · CONFIRMADAS 72 · FINALIZADAS 205").
//
// Distinta del `KpiCard` (card aislada, grid de tarjetas iguales — que
// spatial-design.md y el brief desaconsejan para densidad). Aquí los KPIs
// viven en UNA superficie continua dividida por hairlines verticales: más
// señal por pixel, cero "grid de cards idénticas".
//
// label uppercase de utilidad + cifra `tabular-nums` bold + delta opcional
// (color + icono + signo → AAA, nunca solo color). Sin Fraunces: la cifra
// es sans pesada de utilidad, no un número editorial.
// -----------------------------------------------------------------------------

export interface Stat {
  /** Etiqueta uppercase corta. */
  label: string
  /** Valor ya formateado (importe, contador, %). */
  value: string
  /** Icono opcional de utilidad (lucide). */
  icon?: LucideIcon
  /** Tendencia opcional vs periodo anterior. */
  trend?: Trend
  /** Texto secundario bajo la cifra (ej. "12 servicios"). */
  hint?: string
}

interface Props {
  stats: Stat[]
  /** aria-label del grupo. */
  ariaLabel: string
}

export default function StatStrip({ stats, ariaLabel }: Props) {
  // Adapta el número de columnas al nº de stats — antes se forzaba 4 y con
  // 5 quedaba una tile huérfana en la segunda fila (F5 Reni: panel ahora
  // tiene 5 KPIs). Mobile: siempre 2 cols (legibilidad). md+: bloque de
  // 5 cuando son 5; bloque de 4 en el resto (default histórico).
  const desktopCols = stats.length === 5 ? 'md:grid-cols-5' : 'sm:grid-cols-4'
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`grid grid-cols-2 divide-x divide-y divide-line border border-line rounded-control bg-surface overflow-hidden ${desktopCols} sm:divide-y-0`}
    >
      {stats.map((s) => (
        <StatCell key={s.label} stat={s} />
      ))}
    </div>
  )
}

function StatCell({ stat }: { stat: Stat }) {
  const Icon = stat.icon
  return (
    <div className="px-[var(--space-cell-x)] py-3 min-w-0">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-ink-2 shrink-0" aria-hidden="true" />}
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-2 truncate">
          {stat.label}
        </p>
      </div>
      <div className="mt-1 flex items-baseline gap-2 flex-wrap">
        <p
          className="font-bold text-ink tabular-nums leading-none"
          style={{ fontSize: 'var(--text-figure)' }}
        >
          {stat.value}
        </p>
        {stat.trend && stat.trend.direction !== 'none' && (
          <DeltaPill trend={stat.trend} />
        )}
      </div>
      {stat.hint && (
        <p className="mt-1 text-[0.75rem] text-ink-2 truncate">{stat.hint}</p>
      )}
    </div>
  )
}

function DeltaPill({ trend }: { trend: Trend }) {
  const Icon =
    trend.direction === 'up'
      ? TrendingUp
      : trend.direction === 'down'
      ? TrendingDown
      : Minus
  const tone =
    trend.direction === 'up'
      ? 'text-success'
      : trend.direction === 'down'
      ? 'text-danger'
      : 'text-ink-2'
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${tone}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {trend.label}
    </span>
  )
}
