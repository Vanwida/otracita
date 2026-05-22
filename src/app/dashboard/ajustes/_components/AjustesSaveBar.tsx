'use client'

import { Check, Loader2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// AjustesSaveBar — barra de guardado canónica para forms de Ajustes.
//
// Dos comportamientos según viewport:
//   · Mobile (<md): sticky bottom (safe-area aware), elevada con shadow para
//     marcar profundidad sobre el contenido scrolleable. Target ≥44 en el
//     botón (h-11). Ocupa todo el ancho del area de contenido.
//   · Desktop (md+): inline (no sticky). Acciones alineadas a la derecha,
//     estado de "Guardado" como pill compacto a la izquierda del botón.
//
// Estados: 'idle' | 'saving' | 'saved'. El padre controla la transición:
// suele ser idle → saving (en useTransition) → saved (3-4s) → idle.
//
// Client component porque renderiza estado UI vivo. Imports explícitos.
// -----------------------------------------------------------------------------

export type SaveState = 'idle' | 'saving' | 'saved'

interface Props {
  state: SaveState
  /** Etiqueta del botón (default "Guardar cambios"). */
  label?: string
  /** Tipo del botón. Cuando vive dentro de <form>, usa 'submit' (default). */
  type?: 'submit' | 'button'
  /** Si se pasa, el botón actúa como <button onClick>; útil fuera de form. */
  onClick?: () => void
  /** Deshabilita el botón aunque el estado sea idle (validación externa). */
  disabled?: boolean
}

export default function AjustesSaveBar({
  state,
  label = 'Guardar cambios',
  type = 'submit',
  onClick,
  disabled = false,
}: Props) {
  const saving = state === 'saving'
  const saved = state === 'saved'

  return (
    <div
      className={[
        // Mobile: sticky bottom con safe-area + sombra hacia arriba.
        'sticky bottom-0 z-10 -mx-[var(--space-card)] mt-4 border-t border-line bg-surface px-[var(--space-card)] py-3',
        'shadow-[0_-6px_16px_-12px_rgba(42,29,20,0.18)]',
        // Desktop: inline, sin sticky, sin sombra, sin bg propia.
        'md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none',
        'md:mt-2',
      ].join(' ')}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-3 py-1 font-medium text-success"
            style={{ fontSize: 'var(--text-meta)' }}
            role="status"
            aria-live="polite"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Guardado
          </span>
        )}
        <button
          type={type}
          onClick={onClick}
          disabled={saving || disabled}
          className="btn-primary inline-flex min-h-11 min-w-[10rem] items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {saving ? 'Guardando…' : label}
        </button>
      </div>
    </div>
  )
}
