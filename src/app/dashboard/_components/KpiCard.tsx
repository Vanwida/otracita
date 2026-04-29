import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// -----------------------------------------------------------------------------
// KpiCard — bloque KPI compartido. Antes vivía duplicado en /dashboard/page.tsx
// y /dashboard/caja/page.tsx (drift inminente). Centralizado aquí con paso a
// AAA: text-ink-2 sobre surface (≈ 6.4:1) y text-xs (12px) en lugar de
// text-[11px] + text-ink-3 (que daba ≈ 3.7:1, AA-large solo).
//
// Uso típico:
//   <KpiCard icon={Star} label="Nota media" value="4.8 / 5" />
//   <KpiCard icon={Activity} label="Ocupación" value="92%" trend={...} />
// -----------------------------------------------------------------------------

export interface Trend {
  /** Direccion: up = mejor, down = peor, flat = igual, none = sin tendencia. */
  direction: 'up' | 'down' | 'flat' | 'none'
  /** Texto a mostrar, tipo "+12%" o "−5%" o "=". */
  label: string
}

interface Props {
  icon: LucideIcon
  label: string
  value: string
  trend?: Trend
  hint?: string
}

export default function KpiCard({ icon: Icon, label, value, trend, hint }: Props) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-ink-2" aria-hidden="true" />
        <p className="text-xs uppercase tracking-widest text-ink-2 font-semibold truncate">
          {label}
        </p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-xl md:text-2xl font-bold text-ink tabular-nums">{value}</p>
        {trend && trend.direction !== 'none' && <TrendChip trend={trend} />}
      </div>
      {hint && <p className="text-xs text-ink-2 mt-1">{hint}</p>}
    </div>
  )
}

function TrendChip({ trend }: { trend: Trend }) {
  const Icon =
    trend.direction === 'up'
      ? TrendingUp
      : trend.direction === 'down'
      ? TrendingDown
      : Minus
  const color =
    trend.direction === 'up'
      ? 'text-success'
      : trend.direction === 'down'
      ? 'text-danger'
      : 'text-ink-2'
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {trend.label}
    </span>
  )
}

/**
 * Calcula tendencia entre el valor actual y el del periodo anterior.
 * Returns direction 'none' si no hay periodo previo (lifetime).
 */
export function computeTrend(current: number, previous: number | null): Trend {
  if (previous === null) return { direction: 'none', label: '' }
  if (previous === 0 && current === 0) return { direction: 'flat', label: '=' }
  if (previous === 0) return { direction: 'up', label: 'nuevo' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { direction: 'flat', label: '=' }
  const sign = pct > 0 ? '+' : '−'
  return {
    direction: pct > 0 ? 'up' : 'down',
    label: `${sign}${Math.abs(pct)}%`,
  }
}
