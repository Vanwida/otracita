import { BarChart3 } from 'lucide-react'
import AreaShell from '../_components/AreaShell'
import AreaContent from '../_components/AreaContent'

// -----------------------------------------------------------------------------
// ReportSoon — placeholder honesto para las pestañas de Informes cuyo
// reporte aún no tiene queries (Ingresos · Citas · Clientes · Marketing).
//
// El contrato de IA exige estas pestañas en el nav; crearlas vacías evita
// 404 y comunica el roadmap sin falsa expectativa (mismo criterio que el
// bloque "Próximamente" de Marketing). Cuando exista la query de cada
// reporte, se sustituye este stub por el contenido real — el shell ya
// está en su sitio. NO inventa datos.
// -----------------------------------------------------------------------------

export default function ReportSoon({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <AreaShell area="informes">
      <AreaContent scroll="fixed" maxWidth="5xl">
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md rounded-control border border-line bg-surface p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-control border border-brand/20 bg-brand-softer">
              <BarChart3 className="h-5 w-5 text-brand" />
            </div>
            <div className="mb-2 inline-flex items-center gap-1.5">
              <h2
                className="font-semibold text-ink"
                style={{ fontSize: 'var(--text-section-title)' }}
              >
                {title}
              </h2>
              <span className="rounded bg-overlay px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-3">
                Próximamente
              </span>
            </div>
            <p className="text-[0.8125rem] leading-relaxed text-ink-2">
              {description}
            </p>
          </div>
        </div>
      </AreaContent>
    </AreaShell>
  )
}
