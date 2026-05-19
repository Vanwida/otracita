export const dynamic = 'force-dynamic'

import AreaContent from '../_components/AreaContent'
import PosTerminal from './PosTerminal'
import { loadPosData } from './_data'

// -----------------------------------------------------------------------------
// /dashboard/ventas — pestaña ÍNDICE = TPV "Nueva venta" (patrón Booksy
// literal, screenshots 10.00.16 / 10.00.25 / 10.00.41 / 10.01.18 / 10.01.36).
//
// Es el punto de entrada que un barbero que viene de Booksy busca primero:
// abre Ventas y está en el TPV listo para cobrar un walk-in SIN cita previa.
// Tres zonas igual que Booksy: rail de categorías a la izquierda, rejilla de
// tiles (servicios + productos) en el centro, carrito acoplado a la derecha.
//
// El catálogo (servicios/productos/equipo) lo trae `loadPosData` de las
// MISMAS fuentes que ya usan agenda y tienda. El cobro real NO vive aquí:
// PosTerminal hace POST /api/pos/sale, que REUSA el pipeline único
// createBooking + auto-factura + caja. Cero lógica de cobro duplicada.
// -----------------------------------------------------------------------------

export default async function VentasNuevaVentaPage() {
  const d = await loadPosData()

  return (
    <AreaContent scroll="fixed" maxWidth="full" bleed>
      <PosTerminal
        services={d.services}
        products={d.products}
        barbers={d.barbers}
        invoicingEnabled={d.client.invoicingEnabled}
      />
    </AreaContent>
  )
}
