'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageMinus } from 'lucide-react'
import RegistrarConsumoSlideOver from './RegistrarConsumoSlideOver'

// -----------------------------------------------------------------------------
// RegistrarConsumoButton — botón "Registrar consumo" + SlideOver asociado.
//
// Punto de entrada DIRECTO para descontar stock sin cita (consumo interno o
// merma). Antes esto solo se podía hacer desde el drawer de cita en agenda,
// lo cual obligaba al barbero a crear/abrir una cita falsa para registrar un
// consumo propio — fricción inaceptable.
//
// Click → abre SlideOver con producto + cantidad + tipo (consumo/merma) +
// barbero atribuido (si aplica). Tras submit, llamamos router.refresh() para
// que ProductsManager refleje el stock actualizado en SSR.
// -----------------------------------------------------------------------------

export default function RegistrarConsumoButton() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary btn-sm"
      >
        <PackageMinus className="h-3.5 w-3.5" />
        Registrar consumo
      </button>
      <RegistrarConsumoSlideOver
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          // Refresca la página SSR para recoger el stock actualizado.
          // No cerramos el SlideOver — el usuario ve la confirmación y
          // decide cuándo cerrar (mismo patrón que AddProductSaleModal).
          router.refresh()
        }}
      />
    </>
  )
}
