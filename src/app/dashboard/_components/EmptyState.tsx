import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// EmptyState — superficie vacía canónica del dashboard.
//
// Reemplaza al patrón repetido 9× en el codebase:
//   <div className="max-w-md rounded-control border border-line bg-surface p-8 text-center">
//     <div className="mx-auto mb-4 flex h-12 w-12 ... rounded-control border ...">
//       <Icon className="h-5 w-5 text-..." />
//     </div>
//     <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
//       Título
//     </h2>
//     <p className="mt-1.5 text-[0.8125rem] text-ink-2">Descripción</p>
//   </div>
//
// API mínima — icon + title + description + optional action. `tone` controla
// el cromo del icono (brand cálido para CTAs activadores, neutral para
// "sin datos"). Server-component-safe.
//
// Uso:
//   <EmptyState
//     icon={Banknote}
//     tone="brand"
//     title="La caja de efectivo está desactivada"
//     description="Actívala para abrir y cerrar caja cada día…"
//     action={<Link href="/dashboard/ajustes/pagos" className="btn-primary">Activar</Link>}
//   />
// -----------------------------------------------------------------------------

interface Props {
  icon: LucideIcon
  title: string
  description: ReactNode
  /**
   * Cromo del icono:
   *   · `'brand'`   → borde brand/20, fondo brand-softer, icon brand
   *      (para CTAs activadores: "Actívalo", "Empieza aquí").
   *   · `'neutral'` (default) → borde line, fondo overlay, icon ink-2
   *      (para "sin datos en este periodo", "aún no hay X").
   */
  tone?: 'brand' | 'neutral'
  /** CTA opcional bajo la descripción (botón, link). */
  action?: ReactNode
  /** Clases extra del contenedor (margins en el layout padre). */
  className?: string
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  tone = 'neutral',
  action,
  className = '',
}: Props) {
  const iconChrome =
    tone === 'brand'
      ? 'border-brand/20 bg-brand-softer text-brand'
      : 'border-line bg-overlay text-ink-2'

  return (
    <div className={`max-w-md rounded-control border border-line bg-surface p-8 text-center ${className}`}>
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-control border ${iconChrome}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
        {title}
      </h2>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2">{description}</p>
      {action && <div className="mt-6 inline-flex">{action}</div>}
    </div>
  )
}
