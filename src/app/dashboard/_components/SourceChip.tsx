import { getSourceMeta, type SourceTone } from '@/lib/sources'

// -----------------------------------------------------------------------------
// SourceChip — chip de origen del cliente. Reutilizable: lista de clientes,
// vista detalle, donut (legend), filtros futuros.
//
// Consume el catálogo unificado `src/lib/sources.ts` (icono + label + tono).
// El icono usa `currentColor` → respeta el tono semántico del chip sin
// introducir hex de marca hardcoded. Si el source es null (cliente antiguo
// pre-attribution) no se renderiza (devuelve null).
// -----------------------------------------------------------------------------

interface Props {
  source: string | null
  size?: 'xs' | 'sm'
  /** Mostrar icono junto al label. Default true. */
  showIcon?: boolean
}

const TONE_CLASSES: Record<SourceTone, string> = {
  brand: 'bg-brand-softer text-brand-strong border-brand/20',
  ok: 'bg-success/10 text-success border-success/20',
  warn: 'bg-warning/10 text-warning border-warning/20',
  neutral: 'bg-overlay text-ink-2 border-line',
}

export default function SourceChip({ source, size = 'sm', showIcon = true }: Props) {
  if (!source) return null
  const meta = getSourceMeta(source)
  const sizeCls =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5 gap-1'
      : 'text-xs px-2.5 py-0.5 gap-1.5'
  const iconCls = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border ${TONE_CLASSES[meta.tone]} ${sizeCls}`}
    >
      {showIcon && <meta.Icon className={iconCls} aria-hidden="true" />}
      {meta.label}
    </span>
  )
}
