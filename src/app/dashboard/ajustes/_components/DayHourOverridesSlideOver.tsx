'use client'

import SlideOver from '@/app/dashboard/_components/SlideOver'
import DayHourOverridesManager, {
  type DayOverride,
} from '@/app/dashboard/_components/DayHourOverridesManager'

// -----------------------------------------------------------------------------
// DayHourOverridesSlideOver — wrapper del editor de excepciones puntuales
// del horario del local. Auto-guarda contra /api/day-hour-overrides en
// cada acción (mismo patrón que BlockedDatesSlideOver) → el SlideOver no
// necesita botón de guardar/cancelar propio.
// -----------------------------------------------------------------------------

interface Props {
  open: boolean
  onClose: () => void
  initial: DayOverride[]
}

export default function DayHourOverridesSlideOver({ open, onClose, initial }: Props) {
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Excepciones por fecha"
      ariaLabel="Editar excepciones de horario por fecha"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="text-xs text-ink-3 mb-4">
            Excepciones puntuales del horario del local — días en los que
            abres en horario distinto al recurrente, o cierras
            puntualmente. El bot y la PWA pública usan este rango ese día.
          </p>
          <DayHourOverridesManager
            key={open ? 'open' : 'closed'}
            initial={initial}
          />
        </div>
      </div>
    </SlideOver>
  )
}
