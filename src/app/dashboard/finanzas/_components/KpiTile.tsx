import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// KpiTile — tile de KPI del panel Finanzas: icono + label uppercase + cifra
// tabular grande. Variante `warning` para tiles que reservan dinero (IVA,
// IRPF) — fondo y borde ámbar tenue + badge opcional ("VENCE EN N D").
//
// Children: contenido extra debajo de `sub` (típicamente un sparkline o un
// chip secundario). Sin children, sólo cifra + sub.
// -----------------------------------------------------------------------------

interface Props {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  /**
   * `'warning'` aplica tinte ámbar (bg-warning/5 + border-warning/20). Para
   * reservas fiscales y similares. Default `'default'`.
   */
  tone?: 'default' | 'warning'
  /** Badge superior derecha (ej. "VENCE EN 5 D"). Sólo si hay urgencia. */
  badge?: string
  children?: ReactNode
}

export default function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'default',
  badge,
  children,
}: Props) {
  const bg = tone === 'warning' ? 'bg-warning/5 border-warning/20' : 'bg-surface border-line'
  const iconColor = tone === 'warning' ? 'text-warning' : 'text-ink-3'
  return (
    <div className={`relative rounded-xl border px-4 py-3 ${bg}`}>
      <div className="flex items-start justify-between gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
        {badge && (
          <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-warning text-canvas uppercase tracking-wider">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[11px] font-medium text-ink-3 uppercase tracking-[0.1em] mt-2">{label}</p>
      <p className="tabular-nums text-lg font-bold mt-0.5 leading-tight text-ink">{value}</p>
      {sub && <p className="text-[11px] text-ink-3 mt-1 leading-snug truncate">{sub}</p>}
      {children}
    </div>
  )
}
