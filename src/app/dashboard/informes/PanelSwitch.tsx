'use client'

import { useState, type ReactNode } from 'react'

// -----------------------------------------------------------------------------
// PanelSwitch — conmutador del Panel de Informes entre la lectura de 10
// segundos (Resumen, por defecto) y el P&L completo (Detalle financiero).
//
// Por qué un conmutador y no dos pestañas: el contrato de IA fija las 6
// pestañas de Informes (Panel·Ingresos·Citas·Clientes·Nóminas·Marketing).
// "Panel" debe ser la lectura rápida (lo que Booksy llama "Panel de
// control"), pero el P&L real no se pierde ni se rompe — vive aquí mismo,
// a un clic, byte-idéntico (FinanzasClient se monta tal cual como hijo).
//
// Ambos hijos los renderiza el SERVIDOR (data ya cargada); este componente
// solo decide cuál se muestra. El P&L se monta sólo cuando se selecciona
// para no pagar su árbol pesado en la vista por defecto.
// -----------------------------------------------------------------------------

interface Props {
  /** La lectura de 10 segundos (OperatorPanel). Default visible. */
  resumen: ReactNode
  /** El P&L completo (FinanzasClient). Se monta al seleccionarlo. */
  detalle: ReactNode
}

type View = 'resumen' | 'detalle'

const SEGMENTS: { key: View; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'detalle', label: 'Detalle financiero' },
]

export default function PanelSwitch({ resumen, detalle }: Props) {
  const [view, setView] = useState<View>('resumen')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Conmutador — segmented control (mismo lenguaje que el selector de
          periodo): no es navegación de área, es un toggle de vista. */}
      <div className="shrink-0 px-[var(--space-page)] pt-[var(--space-card)]">
        <div
          role="tablist"
          aria-label="Vista del panel"
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-overlay p-1"
        >
          {SEGMENTS.map((s) => {
            const active = view === s.key
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(s.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Cuerpo. Resumen = región con scroll interno propio (no scrollea la
          página). Detalle = FinanzasClient, que ya trae su shell
          viewport-locked autocontenido — se monta sólo al activarlo. */}
      {view === 'resumen' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-[var(--space-page)]">
          <div className="mx-auto w-full max-w-7xl">{resumen}</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{detalle}</div>
      )}
    </div>
  )
}
