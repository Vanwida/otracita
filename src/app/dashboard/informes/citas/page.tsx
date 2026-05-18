import ReportSoon from '../_ReportSoon'

// /dashboard/informes/citas — reporte de citas (pendiente de query).
export default function InformesCitasPage() {
  return (
    <ReportSoon
      title="Citas"
      description="Volumen de citas, completadas, no-shows y cancelaciones por periodo. El detalle operativo del día está en Agenda."
    />
  )
}
