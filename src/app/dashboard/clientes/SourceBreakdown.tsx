import { SOURCE_LABEL, type AttributionSource } from '@/lib/attribution/types'

// -----------------------------------------------------------------------------
// SourceBreakdown — barras horizontales mostrando de dónde llegan los
// clientes nuevos (first-touch) en una ventana de tiempo dada.
//
// Por qué barras y no donut:
//   · Donut requiere ≥3 categorías para ser legible. La mayoría de
//     barberías tienen 1-2 canales dominantes (Instagram + walk-in,
//     típicamente). Donut con 2 segmentos parece torta.
//   · Barras horizontales se leen en una sola pasada y escalan a 0-10
//     categorías sin perder claridad.
//   · "Cómo llegan tus clientes" se ordena descendente — el top canal es
//     el primero, accionable: "invertir más aquí o seguir igual".
//
// Datos: la suma SIEMPRE refleja los customers cuyo `first_source_captured_at`
// cae en la ventana. Los pre-attribution (null) NO entran. Eso es correcto
// porque el chart es "cómo llegan AHORA", no "histórico total".
// -----------------------------------------------------------------------------

interface Item {
  source: string
  count: number
}

interface Props {
  items: Item[]
  /** Texto bajo el título. Default "Últimos 30 días". */
  windowLabel?: string
  /** Total de customers nuevos en la ventana — para el % de cada barra. */
  total: number
}

const COLOR_BY_SOURCE: Record<string, string> = {
  instagram: 'var(--color-brand)',
  google_ads: 'var(--color-brand-strong)',
  google_organic: 'var(--color-success)',
  facebook: 'var(--color-brand)',
  tiktok: 'var(--color-brand)',
  youtube: 'var(--color-brand)',
  whatsapp_bot: 'var(--color-success)',
  walk_in: 'var(--color-ink-3)',
  referral: 'var(--color-success)',
  direct: 'var(--color-ink-3)',
  other: 'var(--color-ink-3)',
}

export default function SourceBreakdown({ items, windowLabel = 'Últimos 30 días', total }: Props) {
  if (total === 0 || items.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-xl px-4 py-5 mb-6">
        <p className="text-sm font-semibold text-ink mb-1">¿Cómo llegan tus clientes?</p>
        <p className="text-xs text-ink-3">
          Aún no hay datos de origen en los {windowLabel.toLowerCase()}. Comparte tu link <code className="text-brand">/b/tu-slug</code> con campañas en Instagram / Google para empezar a medir.
        </p>
      </div>
    )
  }

  const top = items.slice(0, 6)
  const max = top[0]?.count ?? 1

  return (
    <div className="bg-surface border border-line rounded-xl px-4 py-4 mb-6">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <p className="text-sm font-semibold text-ink">¿Cómo llegan tus clientes?</p>
        <p className="text-[11px] text-ink-3 shrink-0">{windowLabel} · {total} {total === 1 ? 'cliente nuevo' : 'clientes nuevos'}</p>
      </div>

      <ul className="space-y-1.5">
        {top.map((item) => {
          const label = item.source in SOURCE_LABEL
            ? SOURCE_LABEL[item.source as AttributionSource]
            : 'Otro'
          const widthPct = Math.max(2, Math.round((item.count / max) * 100))
          const sharePct = Math.round((item.count / total) * 100)
          const color = COLOR_BY_SOURCE[item.source] ?? 'var(--color-ink-3)'
          return (
            <li key={item.source} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-ink-2 truncate">{label}</span>
              <div className="flex-1 h-2 rounded-full bg-overlay overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
              <span className="w-14 shrink-0 text-right tabular-nums text-ink-2">
                {item.count} <span className="text-ink-3">({sharePct}%)</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
