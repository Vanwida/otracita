import { Suspense } from 'react'
import AreaShell from '../_components/AreaShell'
import VentasHeaderAction from './VentasHeaderAction'

// -----------------------------------------------------------------------------
// Layout del área Ventas — chrome compartido por las pestañas. Las 4
// primeras son el set Booksy literal:
//
//   /dashboard/ventas                → Nueva venta (TPV, ruta índice)
//   /dashboard/ventas/transacciones  → Transacciones (libro de ventas)
//   /dashboard/ventas/caja           → Cierre de caja (cajas registradoras)
//   /dashboard/ventas/facturas       → Facturas (lista VeriFactu)
//   …y Resumen / Cobros / Propinas / Productos como secundarias.
//
// Patrón Booksy literal (10.00.16 / 09.46.25): rail de iconos + header
// compacto + BARRA DE PESTAÑAS horizontal, cada pestaña cabe en pantalla,
// la página NO scrollea. El título "Ventas" + las pestañas viven aquí
// (estables al cambiar de tab, sin reflow); cada page.tsx hija solo aporta
// el contenido de su pestaña. El selector de periodo solo aparece en las
// pestañas que son informe (gate en VentasHeaderAction): el TPV no lo
// muestra, igual que Booksy.
// -----------------------------------------------------------------------------

export default function VentasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AreaShell
      area="ventas"
      action={
        <Suspense>
          <VentasHeaderAction />
        </Suspense>
      }
    >
      {children}
    </AreaShell>
  )
}
