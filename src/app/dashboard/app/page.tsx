export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { db } from '@/db'
import { clients, pushSubscriptions } from '@/db/schema'
import { and, count, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Bell,
  ExternalLink,
  BarChart3,
  Lock,
} from 'lucide-react'
import AppPageCopyButton from './AppPageCopyButton'
import PublicPageSettings from '@/app/dashboard/_components/PublicPageSettings'
import PageShell from '@/app/dashboard/_components/PageShell'
import GtmSettings from './GtmSettings'
import Link from 'next/link'
import { hasFeature } from '@/lib/billing/tier'

const SITE_ORIGIN = 'https://otracita.es'

export default async function AppPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const url = client.publicSlug ? `${SITE_ORIGIN}/b/${client.publicSlug}` : null
  const brand =
    client.brandColor && /^#[0-9a-f]{6}$/i.test(client.brandColor) ? client.brandColor : '#111111'

  // QR for printing on flyers / in-store.
  let qrDataUrl: string | null = null
  if (url) {
    try {
      qrDataUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        color: { dark: brand, light: '#FFFFFF' },
      })
    } catch {
      qrDataUrl = null
    }
  }

  // Active PWA subscriptions counter — simple proof-of-life for the barber
  // ("hay 12 clientes con tu app instalada").
  const [{ n: activeInstalls } = { n: 0 }] = await db
    .select({ n: count() })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.clientId, client.id), eq(pushSubscriptions.enabled, true)))

  const readyForApp = Boolean(url && client.publicEnabled)

  return (
    <PageShell
      title="App para clientes"
      maxWidth="5xl"
      back={{ label: 'Ajustes', href: '/dashboard/ajustes' }}
    >
      <div className="space-y-6">
      <p className="text-ink-2 max-w-2xl" style={{ fontSize: 'var(--text-meta)' }}>
        La app de tu barbería en el móvil de tus clientes. Instalable desde Safari y Chrome (sin App Store),
        con tu logo, tus colores y tu nombre. Usa el mismo motor que tu agenda y tu WhatsApp: no hay nada
        que mantener en paralelo.
      </p>

      {!readyForApp && (
        <div className="bg-overlay border border-line rounded-xl p-4 text-sm text-ink-2">
          Tu app no está publicada todavía. Activa el toggle &ldquo;App publicada&rdquo; abajo y guarda.
        </div>
      )}

      {/* Hero: share card */}
      <section className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="shrink-0">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR de tu app" className="h-40 w-40 rounded-lg border border-line" />
            ) : (
              <div className="h-40 w-40 rounded-lg border border-dashed border-line flex items-center justify-center text-ink-3 text-xs text-center p-3">
                Publica tu app para ver el QR.
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl font-semibold text-ink">Compártela con tus clientes</h2>
            <p className="text-sm text-ink-2 mt-1">
              Pega este enlace en tu biografía de Instagram, en la ficha de Google Business Profile, en flyers
              del local, o escanea el QR desde el móvil del cliente directamente.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0 bg-overlay rounded-lg px-3 py-2 font-mono text-sm text-ink truncate border border-line">
                {url ?? '(sin enlace)'}
              </div>
              {url && <AppPageCopyButton url={url} />}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-surface border border-line hover:border-line-strong px-3 py-2 text-sm text-ink-2 hover:text-ink transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver
                </a>
              )}
              {qrDataUrl && (
                <a
                  href={qrDataUrl}
                  download={`otracita-qr-${client.publicSlug}.png`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-surface border border-line hover:border-line-strong px-3 py-2 text-sm text-ink-2 hover:text-ink transition-colors"
                >
                  Descargar QR
                </a>
              )}
            </div>
            <p className="mt-3 text-xs text-ink-3">
              {activeInstalls > 0
                ? `${activeInstalls} cliente${activeInstalls === 1 ? '' : 's'} con app instalada y notificaciones activas.`
                : 'Aún no hay clientes con la app instalada. Comparte el enlace y los primeros caerán.'}
            </p>
          </div>
        </div>
      </section>

      {/* Identity editor — full form (slug, logo upload, cover, color,
          descripción, redes). Lives here now that "Mi app" is the single
          home for the PWA; no more duplicate "Página pública" tab in
          Mi negocio. */}
      <section className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <PublicPageSettings
          initial={{
            slug: client.publicSlug,
            publicEnabled: client.publicEnabled,
            brandLogoUrl: client.brandLogoUrl,
            brandLogoAltUrl: client.brandLogoAltUrl,
            brandCoverUrl: client.brandCoverUrl,
            brandColor: client.brandColor,
            brandTheme: client.brandTheme,
            publicDescription: client.publicDescription,
            instagramHandle: client.instagramHandle,
            tiktokHandle: client.tiktokHandle,
            facebookUrl: client.facebookUrl,
            websiteUrl: client.websiteUrl,
          }}
        />
      </section>

      {/* Notifications */}
      <section className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4 text-brand" />
          <h2 className="text-lg font-semibold text-ink">Notificaciones push</h2>
        </div>
        <p className="text-sm text-ink-2 max-w-2xl">
          Cuando un cliente instala la app y acepta notificaciones, recibe:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
          <li>• <strong>Confirmación</strong> de cada reserva al instante.</li>
          <li>• <strong>Recordatorio</strong> el día antes de la cita (junto con el WhatsApp).</li>
          <li>• <strong>Promos</strong> si tienes huecos libres (v2, próximamente).</li>
        </ul>
        <p className="mt-3 text-xs text-ink-3">
          Activado automáticamente para todos tus clientes que instalen la app. Nada que configurar.
        </p>
      </section>

      {/* GTM — feature Pro. Si tiene el plan, mostramos el input; si no,
          un upsell discreto que explica el valor. */}
      <section className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand" />
            <h2 className="text-lg font-semibold text-ink">Google Tag Manager</h2>
            <span className="text-[10px] uppercase tracking-widest font-bold text-brand-strong bg-brand-softer px-1.5 py-0.5 rounded">Pro</span>
          </div>
        </div>
        <p className="text-sm text-ink-2 max-w-2xl mb-4">
          Conecta tu GTM para medir conversiones con tus propios pixels (Meta, Google Ads, GA4, TikTok…)
          cuando un cliente confirma reserva. Una sola pieza, todos los tags. Con consentimiento de cookies
          gestionado automáticamente en tu app pública.
        </p>

        {hasFeature(client, 'gtmContainer') ? (
          <GtmSettings initial={client.gtmContainerId ?? null} />
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-overlay px-4 py-5 flex items-start gap-3">
            <Lock className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink mb-1">Disponible en el plan Pro</p>
              <p className="text-xs text-ink-2 mb-3">
                Activa Pro para conectar tu GTM y empezar a medir el ROI de tus campañas en redes sociales y
                buscadores. También desbloqueas bot WhatsApp, SumUp, fidelidad avanzada y control financiero.
              </p>
              <Link
                href="/dashboard/mi-plan"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong transition-colors"
              >
                Ver Mi plan →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Promos contextuales se gestionan ahora en /dashboard/marketing —
          conceptualmente son marketing, no configuración de la app. */}
      </div>
    </PageShell>
  )
}
