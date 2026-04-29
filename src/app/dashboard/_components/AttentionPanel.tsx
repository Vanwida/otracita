import Link from 'next/link'
import { AlertCircle, Megaphone, KeyRound, ChevronRight } from 'lucide-react'

// -----------------------------------------------------------------------------
// AttentionPanel — alertas accionables en /dashboard.
//
// Filosofía: cero ruido si todo va bien. Si no hay alertas, el componente no
// se renderiza (parent debe comprobar `alerts.length > 0` antes de incluirlo,
// o pasarlo y el componente devuelve null).
//
// Las alertas son urgentes Y accionables — algo que el barbero PUEDE hacer
// HOY. Cosas como "tu nota media bajó" no van aquí (es info, no acción).
// -----------------------------------------------------------------------------

export type AttentionAlertTone = 'warn' | 'info' | 'danger'

export interface AttentionAlert {
  id: string
  tone: AttentionAlertTone
  /** Texto principal corto. */
  title: string
  /** Línea secundaria opcional con detalle. */
  description?: string
  /** Si no se pasa, no hay CTA. */
  cta?: { label: string; href: string }
  icon?: 'megaphone' | 'key' | 'alert'
}

interface Props {
  alerts: AttentionAlert[]
}

export default function AttentionPanel({ alerts }: Props) {
  if (alerts.length === 0) return null

  return (
    <section className="mb-6 bg-warning/5 border border-warning/30 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">Atención</h2>
      </div>
      <ul className="space-y-2">
        {alerts.map((a) => (
          <AlertRow key={a.id} alert={a} />
        ))}
      </ul>
    </section>
  )
}

function AlertRow({ alert }: { alert: AttentionAlert }) {
  const Icon =
    alert.icon === 'megaphone' ? Megaphone
    : alert.icon === 'key' ? KeyRound
    : AlertCircle
  const toneClasses =
    alert.tone === 'danger' ? 'text-danger'
    : alert.tone === 'warn' ? 'text-warning'
    : 'text-ink-2'

  const content = (
    <>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-surface border border-line ${toneClasses}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{alert.title}</p>
        {alert.description && (
          <p className="text-xs text-ink-2 mt-0.5">{alert.description}</p>
        )}
      </div>
      {alert.cta && (
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand">
          {alert.cta.label}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  )

  if (alert.cta) {
    return (
      <li>
        <Link
          href={alert.cta.href}
          className="flex items-start gap-3 rounded-xl bg-surface border border-line p-3 hover:border-line-strong transition-colors"
        >
          {content}
        </Link>
      </li>
    )
  }

  return (
    <li className="flex items-start gap-3 rounded-xl bg-surface border border-line p-3">
      {content}
    </li>
  )
}
