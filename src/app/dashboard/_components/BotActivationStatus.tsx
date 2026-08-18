import Link from 'next/link'
import { AlertTriangle, Check, Clock, ExternalLink, MessageCircle } from 'lucide-react'
import BotStatusCopyButton from './BotStatusCopyButton'
import { SITE_ORIGIN } from '@/lib/site'
import type { BotActivationStatus as Status } from '@/lib/whatsapp/activation-status'

// -----------------------------------------------------------------------------
// BotActivationStatus — banner de estado del bot de WhatsApp. Presentacional:
// el estado lo calcula `getBotActivationStatus` (src/lib/whatsapp/
// activation-status.ts), que es quien sabe si el bot atiende DE VERDAD.
//
//   'active'      → verde. Número + credenciales que Meta acepta + puede
//                   ofrecer huecos. Solo entonces decimos "atendiendo".
//   'incomplete'  → ámbar. Tiene número pero algo lo bloquea; se listan los
//                   motivos concretos, no un "revisa la configuración".
//   'requested'   → ámbar. Solicitud enviada, esperando el alta con Meta.
//   'idle'        → null. La página muestra el formulario de solicitud.
//
// Aquí NO hay botón de "probar el bot": mandar un mensaje de plantilla para
// comprobar el estado se lo cobraríamos al barbero. La comprobación se hace
// con lecturas gratis contra la Graph API.
// -----------------------------------------------------------------------------

interface BotRequest {
  phoneRequested?: string | null
  businessLegalName?: string | null
  fbBusinessId?: string | null
  submittedAt?: string | null
}

interface Props {
  status: Status
  whatsappBotRequest: BotRequest | null
  publicSlug: string | null
  publicEnabled: boolean
}

export default function BotActivationStatus({
  status,
  whatsappBotRequest,
  publicSlug,
  publicEnabled,
}: Props) {
  if (status.state === 'active') {
    return <ActiveBanner />
  }

  if (status.state === 'incomplete') {
    return (
      <IncompleteBanner
        blockers={status.blockers}
        publicSlug={publicSlug}
        publicEnabled={publicEnabled}
      />
    )
  }

  if (status.state === 'requested' && whatsappBotRequest) {
    return (
      <RequestedBanner
        request={whatsappBotRequest}
        publicSlug={publicSlug}
        publicEnabled={publicEnabled}
      />
    )
  }

  return null
}

// ─── Banner: atendiendo de verdad ────────────────────────────────────────────

function ActiveBanner() {
  return (
    <div className="mb-6 rounded-2xl border border-success/30 bg-success/5 overflow-hidden">
      <div className="px-5 md:px-6 py-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-success/15 border border-success/20 flex items-center justify-center shrink-0">
          <Check className="h-5 w-5 text-success" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink">Tu bot de WhatsApp está atendiendo</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-success px-2 py-0.5 rounded-full bg-success/10 border border-success/20">
              Atendiendo
            </span>
          </div>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">
            Número activo en Meta y agenda con huecos que ofrecer. Personaliza su
            nombre, tono y bienvenida en el formulario de abajo.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Banner: tiene número pero no atiende ────────────────────────────────────

function IncompleteBanner({
  blockers,
  publicSlug,
  publicEnabled,
}: {
  blockers: Status['blockers']
  publicSlug: string | null
  publicEnabled: boolean
}) {
  return (
    <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/5 overflow-hidden">
      <div className="px-5 md:px-6 py-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-warning/15 border border-warning/20 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink">Tu bot todavía no atiende</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-warning px-2 py-0.5 rounded-full bg-warning/10 border border-warning/20">
              Sin atender
            </span>
          </div>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">
            Tienes número dado de alta, pero si un cliente escribe ahora mismo no
            va a poder reservar. Esto es lo que falta:
          </p>
        </div>
      </div>

      <ul className="px-5 md:px-6 py-4 border-t border-warning/20 bg-surface/60 space-y-3">
        {blockers.map((blocker) => (
          <li key={blocker.code} className="flex items-start gap-2.5">
            <span
              className="mt-1.5 h-1.5 w-1.5 rounded-full bg-warning shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{blocker.title}</p>
              <p className="text-sm text-ink-2 leading-relaxed">{blocker.detail}</p>
              {blocker.action && (
                <Link
                  href={blocker.action.href}
                  className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-brand hover:text-brand-strong transition-colors"
                >
                  {blocker.action.label} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      <MeanwhileBlock publicSlug={publicSlug} publicEnabled={publicEnabled} />
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
  return (
    <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/5 overflow-hidden">
      <div className="px-5 md:px-6 py-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-warning/15 border border-warning/20 flex items-center justify-center shrink-0">
          <Clock className="h-5 w-5 text-warning" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink">Solicitud recibida</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-warning px-2 py-0.5 rounded-full bg-warning/10 border border-warning/20">
              En cola
            </span>
          </div>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">
            El alta del número la hacemos nosotros con Meta. Te avisamos por email
            en cuanto tu bot esté atendiendo.
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

      <MeanwhileBlock publicSlug={publicSlug} publicEnabled={publicEnabled} />
    </div>
  )
}

// ─── "Mientras tanto" — compartido por los dos estados ámbar ─────────────────

function MeanwhileBlock({
  publicSlug,
  publicEnabled,
}: {
  publicSlug: string | null
  publicEnabled: boolean
}) {
  const publicUrl = publicSlug && publicEnabled ? `${SITE_ORIGIN}/${publicSlug}` : null

  return (
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
        <li className="flex items-start gap-2">
          <MessageCircle className="h-4 w-4 text-ink-3 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Contesta tú los WhatsApp que te lleguen: los mensajes de tus clientes
            no se pierden, simplemente no los contesta nadie por ti.
          </span>
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
          para poder compartir tu link mientras tanto.
        </div>
      )}
    </div>
  )
}
