import { Suspense, type ReactNode } from 'react'
import ReportRail, { type ReportRailItem } from './ReportRail'

// -----------------------------------------------------------------------------
// ReportLayout — la rejilla main + rail de Booksy ("Estadísticas e
// informes": el reporte ocupa la columna ancha, el rail "Informes" la
// estrecha a la derecha). Presente en TODOS los screenshots 09.4x/09.5x.
//
// DRY: un solo wrapper; cada pestaña de Informes (Citas/Ingresos/Clientes/
// Marketing) envuelve su contenido con esto y declara sus sub-reportes
// curados. Cero duplicación de la rejilla ni del rail.
//
// Responsive: en < lg el rail baja debajo del contenido (no se pierde,
// pero el reporte manda en móvil). En ≥ lg, rail fijo a la derecha
// (288px) como Booksy. El rail usa useSearchParams → Suspense boundary.
// -----------------------------------------------------------------------------

interface Props {
  /** Sub-reportes curados de la pestaña (report-rail-config). */
  rail: ReportRailItem[]
  /** El reporte en sí (StatStrip + secciones). */
  children: ReactNode
}

export default function ReportLayout({ rail, children }: Props) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-5">{children}</div>
      <Suspense
        fallback={
          <div
            className="rounded-control border border-line bg-surface"
            aria-hidden="true"
          />
        }
      >
        <ReportRail items={rail} />
      </Suspense>
    </div>
  )
}
