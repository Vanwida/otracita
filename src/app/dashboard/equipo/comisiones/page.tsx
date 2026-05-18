export const dynamic = 'force-dynamic'

import { Coins } from 'lucide-react'

// -----------------------------------------------------------------------------
// /dashboard/equipo/comisiones — pestaña "Comisiones" (shell).
//
// WS-0 solo crea la ruta y la pestaña. La gestión de comisiones por
// servicio / tipos de bono / competición semanal (R8, R9, R10 —
// screenshots 09.46.25, 10.16.45) la construye WS-F. Placeholder hasta
// entonces para que la pestaña navegue y el deep-link funcione.
// -----------------------------------------------------------------------------

export default function EquipoComisionesPage() {
  return (
    <div className="rounded-control border border-line bg-surface p-8 text-center">
      <Coins className="h-6 w-6 text-ink-3 mx-auto mb-3" />
      <h2
        className="font-semibold text-ink"
        style={{ fontSize: 'var(--text-section-title)' }}
      >
        Comisiones
      </h2>
      <p
        className="text-ink-2 mt-1 max-w-md mx-auto"
        style={{ fontSize: 'var(--text-meta)' }}
      >
        La configuración de comisiones y bonos del equipo llega pronto.
      </p>
    </div>
  )
}
