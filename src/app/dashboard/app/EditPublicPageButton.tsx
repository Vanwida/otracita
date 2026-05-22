'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import SlideOver from '@/app/dashboard/_components/SlideOver'
import PublicPageSettings, {
  type PublicPageInitial,
} from '@/app/dashboard/_components/PublicPageSettings'

// -----------------------------------------------------------------------------
// EditPublicPageButton — abre el editor canónico (PublicPageSettings) en un
// SlideOver lateral derecho desde la pestaña App. Antes esta acción
// redirigía a /dashboard/ajustes/reservas, rompiendo el contexto del usuario.
// El editor sigue siendo el mismo componente — no se duplica lógica ni se
// toca el form, solo el chasis donde se monta. Misma persistencia
// (PATCH /api/public-page/config) que en Ajustes → Reservas online.
// -----------------------------------------------------------------------------

interface Props {
  initial: PublicPageInitial
}

export default function EditPublicPageButton({ initial }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-ink">
            Personalizar la página de reservas
          </p>
          <p className="mt-0.5 text-[0.75rem] text-ink-2">
            Logo, color, portada, descripción y redes — sin salir de aquí.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Editar página pública"
          className="btn-secondary btn-sm shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar página pública
        </button>
      </div>

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Página pública de reservas"
        ariaLabel="Editar página pública de reservas"
        width="w-[560px] max-w-[92vw]"
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <PublicPageSettings initial={initial} />
          </div>
        </div>
      </SlideOver>
    </>
  )
}
