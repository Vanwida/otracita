export const dynamic = 'force-dynamic'

import { Clock } from 'lucide-react'

// -----------------------------------------------------------------------------
// /dashboard/equipo/turnos — pestaña "Turnos" (shell).
//
// WS-0 solo crea la ruta y la pestaña. El editor de horarios/turnos
// (timeline empleado × horas, descansos, ausencias — screenshots
// 10.17.35 / 10.18.21) lo construye WS-B. Placeholder hasta entonces
// para que la pestaña navegue y el deep-link funcione.
// -----------------------------------------------------------------------------

export default function EquipoTurnosPage() {
  return (
    <div className="rounded-control border border-line bg-surface p-8 text-center">
      <Clock className="h-6 w-6 text-ink-3 mx-auto mb-3" />
      <h2
        className="font-semibold text-ink"
        style={{ fontSize: 'var(--text-section-title)' }}
      >
        Turnos
      </h2>
      <p
        className="text-ink-2 mt-1 max-w-md mx-auto"
        style={{ fontSize: 'var(--text-meta)' }}
      >
        El editor de turnos y horarios del equipo llega pronto.
      </p>
    </div>
  )
}
