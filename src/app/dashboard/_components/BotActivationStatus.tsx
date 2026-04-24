import Link from 'next/link'
import { Bot, Clock, Copy, ExternalLink } from 'lucide-react'
import BotStatusCopyButton from './BotStatusCopyButton'

// -----------------------------------------------------------------------------
// BotActivationStatus — banner informativo cuando el bot WhatsApp aún no está
// activo para este barbero.
//
// Activación de Meta es un proceso OFFLINE (Alex lo hace manualmente en Meta
// Business Manager con el número del barbero). Mientras tanto, el barbero
// puede usar TODO el producto excepto el bot conversacional:
//   · Dashboard, agenda, clientes ✓
//   · Facturación, cobros ✓
//   · App pública /b/[slug] ✓
//   · Bot WhatsApp ✗ — requiere activación Meta
//
// Este banner reduce la sensación de "producto roto" al explicar que:
//   1. Es temporal, nosotros lo estamos activando
//   2. Qué SÍ puede hacer mientras tanto
//   3. Link público copiable para que empiece a compartir
// -----------------------------------------------------------------------------

interface Props {
  whatsappPhoneNumberId: string | null
  whatsappAccessToken: string | null
  metaWebhookVerifiedAt: Date | string | null
  publicSlug: string | null
  publicEnabled: boolean
}

const SITE_ORIGIN = 'https://otracita.es'

export default function BotActivationStatus({
  whatsappPhoneNumberId,
  whatsappAccessToken,
  metaWebhookVerifiedAt,
  publicSlug,
  publicEnabled,
}: Props) {
  // Bot está listo cuando los 3 campos están rellenos.
  const botReady = !!(whatsappPhoneNumberId && whatsappAccessToken && metaWebhookVerifiedAt)
  if (botReady) return null

  const publicUrl = publicSlug && publicEnabled ? `${SITE_ORIGIN}/b/${publicSlug}` : null

  return (
    <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/5 overflow-hidden">
      <div className="px-5 md:px-6 py-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-warning/15 border border-warning/20 flex items-center justify-center shrink-0">
          <Clock className="h-5 w-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink">Tu bot de WhatsApp se está activando</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-warning px-2 py-0.5 rounded-full bg-warning/10 border border-warning/20">
              En proceso
            </span>
          </div>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">
            Estamos conectando tu número con Meta WhatsApp — trámite técnico que
            hacemos nosotros. Te escribimos cuando el bot pueda atender a tus
            clientes (normalmente 24-48h).
          </p>
        </div>
      </div>

      {/* Qué SÍ puede hacer ya */}
      <div className="px-5 md:px-6 py-4 border-t border-warning/20 bg-surface/60">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2">
          Mientras tanto ya puedes
        </p>
        <ul className="space-y-1.5 text-sm text-ink-2">
          <li className="flex items-start gap-2">
            <span className="text-success shrink-0">✓</span>
            <span>
              Compartir tu link público para que los clientes reserven desde la web
              {publicUrl && (
                <span className="block font-mono text-xs text-ink-3 mt-0.5 truncate">
                  {publicUrl}
                </span>
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-success shrink-0">✓</span>
            <span>Gestionar tu agenda desde el dashboard</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-success shrink-0">✓</span>
            <span>Emitir facturas y tickets automáticos</span>
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
            para poder compartir tu link mientras se termina el trámite del bot.
          </div>
        )}
      </div>
    </div>
  )
}

// eslint wrapper — import usage just to satisfy the compiler for icons
// that only appear inside BotStatusCopyButton client component.
void Bot
void Copy
