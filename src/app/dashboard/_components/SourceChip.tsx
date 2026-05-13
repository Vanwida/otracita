import { SOURCE_LABEL, SOURCE_TONE, type AttributionSource } from '@/lib/attribution/types'

// -----------------------------------------------------------------------------
// SourceChip — chip de origen del cliente. Reutilizable: lista de clientes,
// vista detalle, donut (legend), filtros futuros.
//
// Tono: usa los semánticos del design system (brand / ok / warn / neutral)
// del mapping en attribution/types. Si el source es null (cliente antiguo
// pre-attribution), no se renderiza (devuelve null). El barbero ve el
// hueco como pista de que ese cliente vino antes de tener tracking.
// -----------------------------------------------------------------------------

interface Props {
  source: string | null
  size?: 'xs' | 'sm'
}

const TONE_CLASSES: Record<'brand' | 'ok' | 'warn' | 'neutral', string> = {
  brand: 'bg-brand-softer text-brand-strong border-brand/20',
  ok: 'bg-success/10 text-success border-success/20',
  warn: 'bg-warning/10 text-warning border-warning/20',
  neutral: 'bg-overlay text-ink-2 border-line',
}

export default function SourceChip({ source, size = 'sm' }: Props) {
  if (!source) return null
  const knownSource = source in SOURCE_LABEL ? (source as AttributionSource) : 'other'
  const label = SOURCE_LABEL[knownSource]
  const tone = SOURCE_TONE[knownSource]
  const sizeCls = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-xs px-2.5 py-0.5'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium border ${TONE_CLASSES[tone]} ${sizeCls}`}>
      {label}
    </span>
  )
}
