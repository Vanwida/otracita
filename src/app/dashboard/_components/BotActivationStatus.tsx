import Link from 'next/link'
import { Check, Clock, ExternalLink, Sparkles } from 'lucide-react'
import BotStatusCopyButton from './BotStatusCopyButton'
import { SITE_ORIGIN } from '@/lib/site'

// -----------------------------------------------------------------------------
// BotActivationStatus — banner informativo sobre el estado de activación del
// bot WhatsApp del barbero. Tiene 3 estados:
//
//   1. ACTIVO        — `whatsappPhoneNumberId` poblado → banner verde corto
//                      ("Bot activo, atendiendo clientes").
//   2. EN COLA       — `whatsappBotRequest` poblado pero phoneNumberId aún
//                      null → banner amarillo "Hemos recibido tu solicitud,
//                      en máximo 24h te activamos el bot. Te avisamos por
//                      email cuando esté listo." + datos enviados + qué
//                      puede ir haciendo mientras.
//   3. IDLE          — nada poblado → return null. La UI de arriba muestra
//                      el form de solicitud.
//
// El banner se renderiza arriba del form en /dashboard/marketing/whatsapp,
// y opcionalmente en cualquier sitio que quiera dar visibilidad permanente
// del estado del bot (ej. home del dashboard).
// -----------------------------------------------------------------------------

interface BotRequest {
  phoneRequested?: string | null
  businessLegalName?: string | null
  fbBusinessId?: string | null
  submittedAt?: string | null
}

interface Props {
  whatsappPhoneNumberId: string | null
  whatsappBotRequest: BotRequest | null
  publicSlug: string | null
  publicEnabled: boolean
}

export default function BotActivationStatus({
  whatsappPhoneNumberId,
  whatsappBotRequest,
  publicSlug,
  publicEnabled,
}: Props) {
  // Estado 1 — Bot activo.
  if (whatsappPhoneNumberId) {
    return <ActiveBanner />
  }

  // Estado 2 — Solicitud enviada, esperando Meta.
  if (whatsappBotRequest && whatsappBotRequest.phoneRequested) {
    return (
      <RequestedBanner
        request={whatsappBotRequest}
        publicSlug={publicSlug}
        publicEnabled={publicEnabled}
      />
    )
  }

  // Estado 3 — Sin solicitud todavía. La UI de arriba muestra el form.
  return null
}

// ─── Banner: activo ──────────────────────────────────────────────────────────

function ActiveBanner() {
  return (
    <div className="mb-6 rounded-2xl border border-success/30 bg-success/5 overflow-hidden">
      <div className="px-5 md:px-6 py-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-success/15 border border-success/20 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink">Tu bot de WhatsApp está activo</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-success px-2 py-0.5 rounded-full bg-success/10 border border-success/20">
              Atendiendo
            </span>
          </div>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">
            El bot ya recibe mensajes en el número que configuraste con Meta. Personaliza
            su nombre, tono y bienvenida en el formulario de abajo.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Banner: en cola ─────────────────────────────────────────────────────────

function RequestedBanner({
  request,
  publicSlug,
  publicEnabled,
}: {
  request: BotRequest
  publicSlug: string | null
  publicEnabled: boolean
}) {
  const publicUrl = publicSlug && publicEnabled ? `${SITE_ORIGIN}/${publicSlug}` : null

  return (
    <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/5 overflow-hidden">
      <div className="px-5 md:px-6 py-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-warning/15 border border-warning/20 flex items-center justify-center shrink-0">
          <Clock className="h-5 w-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink">Solicitud recibida</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-warning px-2 py-0.5 rounded-full bg-warning/10 border border-warning/20">
              En cola
            </span>
          </div>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">
            En máximo 24h tendrás el bot activo. Te avisamos por email cuando esté listo
            para atender a tus clientes.
          </p>
        </div>
      </div>

      {/* Datos enviados */}
      <div className="px-5 md:px-6 py-4 border-t border-warning/20 bg-surface/60">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2">
          Datos enviados
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {request.phoneRequested && (
            <div>
              <dt className="text-xs text-ink-3">Número WhatsApp</dt>
              <dd className="font-mono text-ink">{request.phoneRequested}</dd>
            </div>
          )}
          {request.businessLegalName && (
            <div>
              <dt className="text-xs text-ink-3">Nombre legal</dt>
              <dd className="text-ink">{request.businessLegalName}</dd>
            </div>
          )}
          {request.fbBusinessId && (
            <div>
              <dt className="text-xs text-ink-3">Facebook Business ID</dt>
              <dd className="font-mono text-ink">{request.fbBusinessId}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Qué puede hacer mientras */}
      <div className="px-5 md:px-6 py-4 border-t border-warning/20 bg-surface/40">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2">
          Mientras tanto
        </p>
        <ul className="space-y-1.5 text-sm text-ink-2">
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Comparte tu link público para que los clientes reserven desde la web
              {publicUrl && (
                <span className="block font-mono text-xs text-ink-3 mt-0.5 truncate">
                  {publicUrl}
                </span>
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
            <span>Gestiona tu agenda desde el dashboard</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
            <span>Emite facturas y tickets automáticos</span>
          </li>
        </ul>

        {publicUrl && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] bg-overlay rounded-lg px-3 py-2 font-mono text-sm text-ink truncate border border-line">
              {publicUrl}
            </div>
            <BotStatusCopyButton url={publicUrl} />
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver
            </a>
          </div>
        )}

        {!publicUrl && (
          <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs text-ink-2">
            Tu app pública no está activa.{' '}
            <Link href="/dashboard/app" className="text-brand underline">
              Actívala aquí
            </Link>{' '}
            para poder compartir tu link mientras se termina el alta del bot.
          </div>
        )}
      </div>
    </div>
  )
}
