import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'

// -----------------------------------------------------------------------------
// AjustesSection — tarjeta de bloque dentro de una pestaña de Ajustes.
//
// Sustituye al patrón inconsistente que había en /ajustes/pagos
// (`border-t border-line pt-8`) y en el antiguo NegocioForm (cards sueltas
// con header ad-hoc). Unifica: borde fino redondeado, surface blanca, header
// con icono terracota suave, título h2 ink-bold, descripción meta ink-2,
// slot acciones a la derecha del header. Footer slot opcional para CTAs.
//
// Mobile-first: padding clamp del tema, full-bleed lateral cómodo. El target
// táctil se garantiza desde los hijos (inputs, botones); aquí es chrome.
//
// Server component — sin estado. Imports explícitos de React.
// -----------------------------------------------------------------------------

interface Props {
  /** Icono terracota a la izquierda del título. Opcional. */
  icon?: LucideIcon
  /** Título de la sección — h2, semibold, ink. */
  title: string
  /** Subtítulo corto (meta). 1-2 frases máximo, sin párrafos. */
  description?: string
  /** Acciones del header (botón secundario, link, badge). */
  headerAction?: ReactNode
  /** Pie opcional — separado por hairline. Útil para save inline. */
  footer?: ReactNode
  /** Quita el padding interno (para componentes que ya lo aportan). */
  bleed?: boolean
  children: ReactNode
}

export default function AjustesSection({
  icon: Icon,
  title,
  description,
  headerAction,
  footer,
  bleed = false,
  children,
}: Props) {
  return (
    <section className="rounded-2xl border border-line bg-surface shadow-[0_1px_0_0_var(--color-line)]">
      <header className="flex flex-wrap items-start justify-between gap-3 px-[var(--space-card)] pt-[var(--space-card)] md:px-6 md:pt-6">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-softer text-brand-strong"
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
          )}
          <div className="min-w-0">
            <h2
              className="font-semibold leading-tight text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              {title}
            </h2>
            {description && (
              <p
                className="mt-1 text-ink-2"
                style={{ fontSize: 'var(--text-meta)' }}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </header>

      <div
        className={
          bleed
            ? 'pt-4 md:pt-5'
            : 'px-[var(--space-card)] pb-[var(--space-card)] pt-4 md:px-6 md:pb-6 md:pt-5'
        }
      >
        {children}
      </div>

      {footer && (
        <footer className="border-t border-line px-[var(--space-card)] py-3 md:px-6 md:py-4">
          {footer}
        </footer>
      )}
    </section>
  )
}
