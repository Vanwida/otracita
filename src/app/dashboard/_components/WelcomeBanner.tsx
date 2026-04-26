'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Copy, ExternalLink, X, Sparkles, FileText, Users, Bot } from 'lucide-react'

// -----------------------------------------------------------------------------
// WelcomeBanner — se muestra una sola vez al completar el setup wizard
// (query param `?welcome=1`). Da bienvenida + link a la app + sugiere próximos
// pasos concretos, priorizados por impacto.
//
// Puede cerrarse con la X. Es informativo; el barbero puede ir a hacer lo que
// quiera. Las sugerencias llevan a sitios reales del dashboard.
// -----------------------------------------------------------------------------

interface Props {
  businessName: string
  publicSlug: string | null
  invoicingEnabled: boolean
}

const SITE_ORIGIN = 'https://otracita.es'

export default function WelcomeBanner({ businessName, publicSlug, invoicingEnabled }: Props) {
  const [closed, setClosed] = useState(false)
  const [copied, setCopied] = useState(false)

  if (closed) return null

  const publicUrl = publicSlug ? `${SITE_ORIGIN}/b/${publicSlug}` : null

  const onCopy = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="mb-6 bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
      {/* Hero */}
      <div
        className="relative px-5 md:px-7 py-5 md:py-6"
        style={{
          background:
            'linear-gradient(135deg, rgba(201,101,60,0.08) 0%, rgba(94,139,107,0.06) 100%)',
        }}
      >
        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label="Cerrar"
          className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-overlay transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-softer border border-brand/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h2 className="font-display text-lg md:text-xl font-bold text-ink">
              ¡Bienvenido a otracita, {businessName}!
            </h2>
            <p className="text-sm text-ink-2 mt-1">
              Tu cuenta está lista. Aquí tienes lo siguiente que puedes hacer.
            </p>
          </div>
        </div>
      </div>

      {/* Action: compartir tu link */}
      {publicUrl && (
        <div className="px-5 md:px-7 py-5 border-t border-line">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-ink-3">
              Tu app ya es accesible
            </h3>
          </div>
          <p className="text-sm text-ink-2 mb-3">
            Pega este enlace en Instagram, Google Maps, flyers — tus clientes
            podrán reservar sin descargar app.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] bg-overlay rounded-lg px-3 py-2.5 font-mono text-sm text-ink truncate border border-line">
              {publicUrl}
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-2.5 text-sm font-medium text-ink-2 hover:text-ink transition-colors"
            >
              {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-2.5 text-sm font-medium text-ink-2 hover:text-ink transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Ver
            </a>
          </div>
        </div>
      )}

      {/* Sugerencias próximos pasos */}
      <div className="px-5 md:px-7 py-5 border-t border-line bg-overlay/30">
        <h3 className="text-sm font-bold uppercase tracking-widest text-ink-3 mb-3">
          Próximos pasos sugeridos
        </h3>
        <ul className="space-y-2">
          <NextStep
            icon={Users}
            label="Sube fotos de tu equipo"
            hint="Aparecen cuando el cliente elige con quién reservar"
            href="/dashboard/negocio?tab=team"
          />
          <NextStep
            icon={Bot}
            label="Configura el tono del bot"
            hint="Cercano, neutro o formal — así responde tu asistente por WhatsApp"
            href="/dashboard/bot"
          />
          {invoicingEnabled ? (
            <NextStep
              icon={FileText}
              label="Saca tu certificado FNMT"
              hint="Necesario para el registro legal de facturas en Hacienda (VeriFactu). 30 min con Cl@ve, gratis."
              href="/dashboard/facturas"
              external
            />
          ) : (
            <NextStep
              icon={FileText}
              label="Activa la facturación cuando estés listo"
              hint="Emite tickets y facturas automáticas con cada reserva. Cumple VeriFactu de serie."
              href="/dashboard/caja"
            />
          )}
        </ul>
      </div>
    </div>
  )
}

function NextStep({
  icon: Icon,
  label,
  hint,
  href,
  external,
}: {
  icon: typeof Bot
  label: string
  hint: string
  href: string
  external?: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-surface transition-colors -mx-3"
      >
        <div className="h-8 w-8 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-ink-2 mt-0.5 leading-relaxed">{hint}</p>
        </div>
      </Link>
    </li>
  )
}
