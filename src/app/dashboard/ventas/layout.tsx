import { Suspense } from 'react'
import AreaShell from '../_components/AreaShell'
import VentasHeaderAction from './VentasHeaderAction'

// -----------------------------------------------------------------------------
// Layout del área Ventas — chrome compartido por las pestañas. Desde U-13 son
// CUATRO, y todas son cosas que el barbero HACE con dinero:
//
//   /dashboard/ventas                → Nueva venta (TPV, ruta índice)
//   /dashboard/ventas/caja           → Caja (abrir/cerrar, cuadrar)
//   /dashboard/ventas/facturas       → Facturas (lista VeriFactu)
//   /dashboard/ventas/productos      → Productos (catálogo + consumo)
//
// Fuera del nav pero bajo este layout: /resumen (detalle de otro día, se
// alcanza desde Caja) y /cobros (movimientos Stripe, se alcanza desde
// Informes → Fiscal). Transacciones y Propinas se fueron a Informes.
//
// Patrón Booksy literal (10.00.16 / 09.46.25): rail de iconos + header
// compacto + BARRA DE PESTAÑAS horizontal, cada pestaña cabe en pantalla,
// la página NO scrollea. El título "Ventas" + las pestañas viven aquí
// (estables al cambiar de tab, sin reflow); cada page.tsx hija solo aporta
// el contenido de su pestaña. La esquina derecha del header la resuelve
// VentasHeaderAction: por defecto la línea "el cobro de una cita se hace
// desde la agenda", y el selector de periodo solo donde hace falta.
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
