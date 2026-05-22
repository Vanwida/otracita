'use client'

import React, { useState } from 'react'
import { Check, X } from 'lucide-react'
import SlideOver from '@/app/dashboard/_components/SlideOver'
import HoursEditor, {
  type HoursMap,
} from '@/app/dashboard/_components/HoursEditor'

// -----------------------------------------------------------------------------
// HoursSlideOver — wrapper de HoursEditor dentro de un SlideOver lateral.
//
// Patrón canónico: la pestaña Negocio muestra una preview compacta del horario
// semanal y abre este SlideOver para edición. Mantiene `HoursEditor` intacto
// (sigue siendo el editor canónico y se reutiliza también desde turnos /
// BarbersManager), sólo cambia el chasis: deja de vivir inline en una card
// que estiraba el scroll vertical de Ajustes.
//
// El form padre (NegocioSettings) ya tiene un input oculto `hours` con el
// JSON serializado actual; al cerrar el SlideOver con "Guardar" se llama a
// `onSave(map)` con el nuevo HoursMap para que el padre actualice su estado
// y vuelva a serializar antes de submit.
// -----------------------------------------------------------------------------

interface Props {
  open: boolean
  onClose: () => void
  initial: HoursMap | null
  initialSlotStep: number
  onSave: (next: HoursMap, slotStep: number) => void
}

export default function HoursSlideOver({
  open,
  onClose,
  initial,
  initialSlotStep,
  onSave,
}: Props) {
  // Buffer local para que cancelar no aplique cambios. Se resetea cuando se
  // abre/cierra (montaje/desmontaje del HoursEditor con initial).
  const [draft, setDraft] = useState<HoursMap | null>(initial)
  const [stepDraft, setStepDraft] = useState<number>(initialSlotStep)

  // Sincroniza el draft cuando cambia el initial entrante (p.ej. tras guardar
  // y reabrir). Evita persistencia de buffers obsoletos entre aperturas.
  React.useEffect(() => {
    if (open) {
      setDraft(initial)
      setStepDraft(initialSlotStep)
    }
  }, [open, initial, initialSlotStep])

  const handleSave = () => {
    if (draft) onSave(draft, stepDraft)
    onClose()
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Horario semanal"
      ariaLabel="Editar horario semanal"
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="text-xs text-ink-3 mb-4">
            Las horas en las que aceptas reservas. El bot solo ofrece huecos
            dentro de este rango.
          </p>
          {/* HoursEditor en modo controlado: cada cambio sincroniza el draft
              local de este SlideOver. El input hidden interno no se usa aquí
              (no estamos en su form padre); el guardado se hace vía onSave.
              `key` fuerza remount al abrir para que initial no quede stale. */}
          <HoursEditor
            key={open ? 'open' : 'closed'}
            initial={initial}
            onChange={(next) => setDraft(next)}
          />

          {/* SlotStep — granularidad de los huecos (sub-ajuste del horario). */}
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-xs font-semibold text-ink">
              Granularidad de los huecos
            </h3>
            <p className="mt-1 mb-3 text-[11px] text-ink-3">
              Cada cuántos minutos se ofrece un posible inicio de cita.
              15 min (recomendado) rellena micro-huecos.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([15, 30, 45] as const).map((m) => (
                <label
                  key={m}
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-canvas px-3 text-ink transition-colors hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-brand-softer"
                  style={{ fontSize: 'var(--text-meta)' }}
                >
                  <input
                    type="radio"
                    name="slotStepMinutes"
                    value={m}
                    checked={stepDraft === m}
                    onChange={() => setStepDraft(m)}
                    className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                  />
                  <span className="font-semibold">{m} min</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-line bg-surface px-5 py-3 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary btn-sm"
          >
            <Check className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </SlideOver>
  )
}
