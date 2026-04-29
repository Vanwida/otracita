import { Check, Loader2, AlertCircle, Minus, AlertTriangle } from 'lucide-react'

// -----------------------------------------------------------------------------
// Badge visual del estado VeriFactu de una factura. Usado en la lista de
// facturas y en la vista individual. Traducciones humanas — cero jerga SIF.
//
// Estados posibles (columna verifactu_status):
//   pending               — aún no enviada a Hacienda (o en cola)
//   sent                  — enviada, esperando respuesta
//   accepted              — Hacienda la registró ok
//   accepted_with_errors  — registrada pero con observaciones
//   rejected              — Hacienda rechazó (hay que corregir algo)
//   error                 — fallo técnico (red, etc) — reintentable
//   null/undefined        — factura anterior a activar VeriFactu (legacy)
// -----------------------------------------------------------------------------

export type VerifactuStatus =
  | 'pending'
  | 'sent'
  | 'accepted'
  | 'accepted_with_errors'
  | 'rejected'
  | 'error'
  | null
  | undefined

interface Props {
  status: VerifactuStatus
  /** 'full' muestra icono + texto, 'icon' solo icono (para filas densas). */
  variant?: 'full' | 'icon'
}

interface Style {
  icon: typeof Check
  iconClass?: string
  label: string
  bgClass: string
  textClass: string
  title: string
}

function styleFor(status: VerifactuStatus): Style {
  switch (status) {
    case 'accepted':
      return {
        icon: Check,
        label: 'Registrada',
        bgClass: 'bg-success/10 border border-success/25',
        textClass: 'text-success',
        title: 'Registrada en Hacienda. El QR es verificable por el cliente.',
      }
    case 'accepted_with_errors':
      return {
        icon: AlertTriangle,
        label: 'Con avisos',
        bgClass: 'bg-warning/10 border border-warning/30',
        textClass: 'text-warning',
        title: 'Registrada en Hacienda con observaciones — revisar detalles',
      }
    case 'sent':
    case 'pending':
      return {
        icon: Loader2,
        iconClass: 'animate-spin',
        label: 'Pendiente',
        bgClass: 'bg-overlay border border-line',
        textClass: 'text-ink-3',
        title: 'Pendiente de envío a Hacienda — se procesa automáticamente',
      }
    case 'rejected':
      return {
        icon: AlertCircle,
        label: 'Rechazada',
        bgClass: 'bg-danger/10 border border-danger/25',
        textClass: 'text-danger',
        title: 'Hacienda rechazó el envío — hay que corregir y reintentar',
      }
    case 'error':
      return {
        icon: AlertCircle,
        label: 'Error',
        bgClass: 'bg-danger/10 border border-danger/25',
        textClass: 'text-danger',
        title: 'Error técnico (red, etc) — se reintenta automáticamente',
      }
    default:
      // null/undefined: facturas anteriores a VeriFactu
      return {
        icon: Minus,
        label: '—',
        bgClass: 'bg-overlay border border-line',
        textClass: 'text-ink-3',
        title: 'Factura emitida antes de activar VeriFactu',
      }
  }
}

export default function VerifactuBadge({ status, variant = 'full' }: Props) {
  const s = styleFor(status)
  const Icon = s.icon

  if (variant === 'icon') {
    return (
      <span
        title={s.title}
        className={`inline-flex items-center justify-center h-6 w-6 rounded ${s.bgClass} ${s.textClass}`}
      >
        <Icon className={`h-3.5 w-3.5 ${s.iconClass ?? ''}`} />
      </span>
    )
  }

  return (
    <span
      title={s.title}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${s.bgClass} ${s.textClass}`}
    >
      <Icon className={`h-3 w-3 ${s.iconClass ?? ''}`} />
      {s.label}
    </span>
  )
}
