import type { LucideIcon } from 'lucide-react'
import { DoorOpen, Lock, CheckCircle2, Clock, XCircle } from 'lucide-react'

// -----------------------------------------------------------------------------
// StatusBadge — pill de estado del panel de control (Booksy: ABIERTO /
// CERRADO / PAGADO).
//
// DESIGN.md regla dura: el color NUNCA es la única señal. Cada estado lleva
// color + icono + texto, así un daltónico, una captura en B/N o la pantalla
// al sol del escaparate siguen legibles. Fondo `*-soft`/tinte, texto `ink`
// o el color funcional saturado solo en icono+borde — nunca relleno
// saturado grande (anti-Booksy-plástico).
//
// Variantes mapeadas a los tokens semánticos existentes — sin color nuevo.
// -----------------------------------------------------------------------------

export type StatusVariant = 'open' | 'closed' | 'paid' | 'pending' | 'void'

interface VariantConfig {
  label: string
  icon: LucideIcon
  /** Clases de color (texto/borde/fondo) — solo tokens. */
  tone: string
}

const VARIANTS: Record<StatusVariant, VariantConfig> = {
  open: {
    label: 'Abierto',
    icon: DoorOpen,
    tone: 'text-success border-success/30 bg-success/10',
  },
  closed: {
    label: 'Cerrado',
    icon: Lock,
    tone: 'text-ink-2 border-line-strong bg-overlay',
  },
  paid: {
    label: 'Pagado',
    icon: CheckCircle2,
    tone: 'text-success border-success/30 bg-success/10',
  },
  pending: {
    label: 'Pendiente',
    icon: Clock,
    tone: 'text-warning border-warning/30 bg-warning/10',
  },
  void: {
    label: 'Anulado',
    icon: XCircle,
    tone: 'text-danger border-danger/30 bg-danger/10',
  },
}

interface Props {
  variant: StatusVariant
  /** Sobrescribe el texto por defecto (mismo icono/color). */
  label?: string
  /** Sin icono — solo cuando el contexto ya codifica el estado de otra forma. */
  hideIcon?: boolean
}

export default function StatusBadge({ variant, label, hideIcon }: Props) {
  const cfg = VARIANTS[variant]
  const Icon = cfg.icon
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ${cfg.tone}`}
    >
      {!hideIcon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {label ?? cfg.label}
    </span>
  )
}
