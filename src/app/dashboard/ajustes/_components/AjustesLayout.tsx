import { type ReactNode } from 'react'

// -----------------------------------------------------------------------------
// AjustesLayout — chrome interior compartido por TODAS las pestañas del área
// Ajustes. AreaShell ya monta el header (título de área + barra de pestañas);
// este layout añade el copy contextual de la pestaña (subtítulo largo, no apto
// para el título compacto del header) y un slot de stack vertical para
// AjustesSection cards.
//
// Patrón: rail (AreaShell) → pestaña (AreaTabs) → contexto + secciones (este
// layout). Una sola fuente de chrome para que las cuatro pestañas se sientan
// hermanas en tipografía, ritmo y respiración.
//
// Server-compatible — sin estado. Imports explícitos de React (regla del
// proyecto: nunca UMD global).
// -----------------------------------------------------------------------------

interface Props {
  /** Copy corto de contexto de la pestaña (1-2 frases, no párrafo largo). */
  intro?: string
  /** Acción opcional alineada con el intro (p.ej. enlace "Ver en PWA"). */
  action?: ReactNode
  children: ReactNode
}

export default function AjustesLayout({ intro, action, children }: Props) {
  return (
    <div className="space-y-6 md:space-y-8">
      {(intro || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {intro && (
            <p
              className="max-w-2xl text-ink-2"
              style={{ fontSize: 'var(--text-meta)' }}
            >
              {intro}
            </p>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="space-y-5 md:space-y-6">{children}</div>
    </div>
  )
}
