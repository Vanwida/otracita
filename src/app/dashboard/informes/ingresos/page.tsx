import ReportSoon from '../_ReportSoon'

// /dashboard/informes/ingresos — reporte de ingresos (pendiente de query).
export default function InformesIngresosPage() {
  return (
    <ReportSoon
      title="Ingresos"
      description="Evolución de ingresos por periodo, servicios y productos. Llega cuando esté la query de agregación — el panel P&L completo está en la pestaña Panel."
    />
  )
}
