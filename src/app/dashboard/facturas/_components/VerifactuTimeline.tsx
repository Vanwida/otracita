import { Check, Loader2, AlertCircle, Circle, AlertTriangle } from 'lucide-react'
import VerifactuBadge, { type VerifactuStatus } from './VerifactuBadge'

// -----------------------------------------------------------------------------
// Timeline visual del ciclo de vida VeriFactu de una factura individual.
// Hay 3 pasos clave:
//   1. Emitida      (siempre, al crear la row)
//   2. Enviada a Hacienda  (cuando el worker M4 la procesa)
//   3. Aceptada / Rechazada / Error  (respuesta de AEAT)
//
// Visualizamos cada paso con punto + label + timestamp si aplica. Si hay error
// o rechazo, mostramos el código + mensaje AEAT para que el barbero entienda
// qué corregir (ej. "NIF de cliente no válido").
// -----------------------------------------------------------------------------

interface Props {
  status: VerifactuStatus
  createdAt: Date | string
  sentAt: Date | string | null
  responseAt: Date | string | null
  errorCode: string | null
  errorMsg: string | null
}

function fmt(d: Date | string | null): string | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date)
}

export default function VerifactuTimeline({ status, createdAt, sentAt, responseAt, errorCode, errorMsg }: Props) {
  const step1Done = true
  const step2Done = !!sentAt
  const step3Done = !!responseAt
  const step3Error = status === 'rejected' || status === 'error'
  const step3Warning = status === 'accepted_with_errors'

  return (
    <div>
      <div className="mb-4">
        <VerifactuBadge status={status} />
      </div>

      <ol className="space-y-4 relative">
        {/* Línea vertical conectando los puntos */}
        <div className="absolute left-[11px] top-3 bottom-3 w-px bg-line" aria-hidden="true" />

        <Step
          done={step1Done}
          icon={<Check className="h-3 w-3" />}
          title="Emitida"
          timestamp={fmt(createdAt)}
          description="La factura se ha guardado en tu libro."
          variant="success"
        />

        <Step
          done={step2Done}
          icon={step2Done ? <Check className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
          title="Enviada a Hacienda"
          timestamp={fmt(sentAt)}
          description={
            step2Done
              ? 'Transmitida al sistema VeriFactu de la AEAT.'
              : 'Pendiente de envío — se procesa automáticamente en segundos.'
          }
          variant={step2Done ? 'success' : 'pending'}
        />

        <Step
          done={step3Done}
          icon={
            step3Error ? (
              <AlertCircle className="h-3 w-3" />
            ) : step3Warning ? (
              <AlertTriangle className="h-3 w-3" />
            ) : step3Done ? (
              <Check className="h-3 w-3" />
            ) : (
              <Circle className="h-3 w-3" />
            )
          }
          title={
            step3Error ? 'Rechazada por Hacienda' : step3Warning ? 'Aceptada con avisos' : 'Registrada en Hacienda'
          }
          timestamp={fmt(responseAt)}
          description={
            step3Error
              ? `${errorCode ? `Código ${errorCode}: ` : ''}${errorMsg ?? 'Revisa los datos e inténtalo de nuevo.'}`
              : step3Warning
              ? `${errorCode ? `Aviso ${errorCode}: ` : ''}${errorMsg ?? 'Registrada con observaciones — revisar.'}`
              : step3Done
              ? 'El cliente puede verificar la factura escaneando el QR.'
              : 'Esperando respuesta de AEAT.'
          }
          variant={step3Error ? 'error' : step3Warning ? 'warning' : step3Done ? 'success' : 'pending'}
        />
      </ol>
    </div>
  )
}

function Step({
  done,
  icon,
  title,
  timestamp,
  description,
  variant,
}: {
  done: boolean
  icon: React.ReactNode
  title: string
  timestamp: string | null
  description: string
  variant: 'success' | 'pending' | 'error' | 'warning'
}) {
  const dotBg = {
    success: 'bg-success text-white',
    pending: 'bg-overlay border border-line text-ink-3',
    error: 'bg-danger text-white',
    warning: 'bg-warning text-white',
  }[variant]

  return (
    <li className="flex gap-3 items-start relative">
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 relative z-10 ${dotBg}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-semibold ${done ? 'text-ink' : 'text-ink-3'}`}>{title}</p>
          {timestamp && <span className="text-xs text-ink-3">· {timestamp}</span>}
        </div>
        <p className="text-xs text-ink-2 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </li>
  )
}
