import ReportSoon from '../_ReportSoon'

// /dashboard/informes/clientes — reporte de clientes (pendiente de query).
export default function InformesClientesPage() {
  return (
    <ReportSoon
      title="Clientes"
      description="Nuevos vs recurrentes, frecuencia y retención por periodo. La cartera accionable (inactivos, no-shows) está en el área Clientes."
    />
  )
}
