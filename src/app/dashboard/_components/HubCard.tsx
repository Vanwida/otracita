import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

// -----------------------------------------------------------------------------
// Building blocks compartidos por los hubs (/dashboard/ajustes y /dashboard/crecer).
//
// Cada tarjeta tiene la misma estructura:
//   1. Header: icono + título + StatusPill (esquina derecha)
//   2. Cuerpo: 1-2 líneas de info principal
//   3. Chips: 2-4 mini-stats con icono — un vistazo y se entiende el estado.
//
// El barbero objetivo no es técnico: con un vistazo entiende "esto está bien,
// esto falta, esto puedo mirar".
// -----------------------------------------------------------------------------

export type HubTone = 'ok' | 'warn' | 'danger' | 'neutral'

interface HubCardProps {
  href: string
  icon: LucideIcon
  title: string
  status?: { tone: HubTone; label: string }
  children: React.ReactNode
}

export function HubCard({ href, icon: Icon, title, status, children }: HubCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 hover:border-line-strong hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-brand-softer text-brand-strong">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <h2 className="font-semibold text-ink text-base leading-tight pt-1.5">{title}</h2>
          {status && <HubStatusPill tone={status.tone} label={status.label} />}
        </div>
        <ChevronRight className="h-4 w-4 text-ink-3 mt-2 shrink-0 group-hover:text-ink transition-colors" />
      </div>
      <div className="flex flex-col gap-1.5 pl-14">
        {children}
      </div>
    </Link>
  )
}

export function HubStatusPill({ tone, label }: { tone: HubTone; label: string }) {
  const styles =
    tone === 'ok' ? 'bg-success/10 text-success border-success/30'
    : tone === 'warn' ? 'bg-warning/10 text-warning border-warning/30'
    : tone === 'danger' ? 'bg-danger/10 text-danger border-danger/30'
    : 'bg-overlay text-ink-3 border-line'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${styles}`}>
      {label}
    </span>
  )
}

interface HubCardLineProps {
  icon?: LucideIcon
  bold?: boolean
  mono?: boolean
  children: React.ReactNode
}

export function HubCardLine({ icon: Icon, bold, mono, children }: HubCardLineProps) {
  return (
    <p className={`flex items-center gap-1.5 text-sm ${bold ? 'text-ink font-medium' : 'text-ink-2'} ${mono ? 'font-mono text-xs' : ''}`}>
      {Icon && <Icon className="h-3.5 w-3.5 text-ink-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </p>
  )
}

export function HubChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5 mt-1">{children}</div>
}

interface HubChipProps {
  icon?: LucideIcon
  tone?: HubTone
  children: React.ReactNode
}

export function HubChip({ icon: Icon, tone, children }: HubChipProps) {
  const styles =
    tone === 'ok' ? 'bg-success/10 text-success border-success/30'
    : tone === 'warn' ? 'bg-warning/10 text-warning border-warning/30'
    : tone === 'danger' ? 'bg-danger/10 text-danger border-danger/30'
    : 'bg-overlay/60 text-ink-2 border-line'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  )
}
