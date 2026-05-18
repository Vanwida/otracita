import { Suspense } from 'react'
import AreaShell from '../_components/AreaShell'
import StatsPeriodTabs from '../_components/StatsPeriodTabs'

// -----------------------------------------------------------------------------
// Layout del área Ventas (ex-Caja) — chrome compartido por las 4 pestañas:
//
//   /dashboard/ventas           → Resumen       (ruta índice, por defecto)
//   /dashboard/ventas/caja      → Cierre de caja (cajas registradoras)
//   /dashboard/ventas/facturas  → Facturas       (lista VeriFactu)
//   /dashboard/ventas/cobros    → Cobros         (online + ajustes de pago)
//
// Patrón Booksy literal (10.06.29 / 09.46.25): rail de iconos + header
// compacto + BARRA DE PESTAÑAS horizontal, cada pestaña cabe en pantalla,
// la página NO scrollea. El título "Ventas" + el selector de periodo +
// las pestañas viven aquí (estables al cambiar de tab, sin reflow); cada
// page.tsx hija solo aporta el contenido de su pestaña.
//
// "Ventas" es nomenclatura estándar de software de gestión — sustituye al
// nombre de marca "Caja". Lógica de servidor INTACTA: las queries no se
// tocan, solo se reparten entre rutas.
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
          <StatsPeriodTabs />
        </Suspense>
      }
    >
      {children}
    </AreaShell>
  )
}
