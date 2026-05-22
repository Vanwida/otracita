'use client'

import React from 'react'
import SlideOver from '@/app/dashboard/_components/SlideOver'
import BlockedDatesManager from '@/app/dashboard/_components/BlockedDatesManager'

// -----------------------------------------------------------------------------
// BlockedDatesSlideOver — wrapper de BlockedDatesManager en SlideOver lateral.
//
// BlockedDatesManager auto-guarda contra /api/blocked-dates (no es form-
// driven), así que no necesita botones de guardar/cancelar propios: el
// SlideOver actúa solo como panel para añadir/quitar fechas sin romper el
// grid 2-col compacto de la pestaña Negocio.
// -----------------------------------------------------------------------------

interface Props {
  open: boolean
  onClose: () => void
  initialDates: string[]
  clientId: string
}

export default function BlockedDatesSlideOver({
  open,
  onClose,
  initialDates,
  clientId,
}: Props) {
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Días bloqueados"
      ariaLabel="Editar días bloqueados"
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="text-xs text-ink-3 mb-4">
            Vacaciones, festivos, días puntuales cerrados. El bot no
            ofrecerá citas en estas fechas.
          </p>
          <BlockedDatesManager
            key={open ? 'open' : 'closed'}
            initialDates={initialDates}
            clientId={clientId}
          />
        </div>
      </div>
    </SlideOver>
  )
}
