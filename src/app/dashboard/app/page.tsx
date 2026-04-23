export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import QRCode from 'qrcode'
import { db } from '@/db'
import { clients, pushSubscriptions } from '@/db/schema'
import { and, count, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Smartphone,
  Image as ImageIcon,
  Heart,
  Bell,
  Link as LinkIcon,
  Palette,
  ExternalLink,
} from 'lucide-react'
import AppPageCopyButton from './AppPageCopyButton'

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
    <div className="p-4 md:p-8 max-w-5xl space-y-6">
      <div className="mb-2">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2 flex items-center gap-3">
          <Smartphone className="h-7 w-7 text-brand" />
          Mi app
        </h1>
        <p className="text-ink-2 text-sm max-w-2xl">
          La app de tu barbería en el móvil de tus clientes. Instalable desde Safari y Chrome (sin App Store),
          con tu logo, tus colores y tu nombre. Usa el mismo motor que tu agenda y tu WhatsApp — no hay nada
          que mantener en paralelo.
        </p>
      </div>

      {!readyForApp && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-sm text-ink-2">
          Tu página pública está desactivada o sin slug. Actívala en{' '}
          <Link className="text-brand underline" href="/dashboard/negocio?tab=publica">
            Mi negocio → Página pública
          </Link>
          {' '}para que tus clientes puedan instalar la app.
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
                Activa tu página pública para ver el QR.
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

      {/* Identity row */}
      <section className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-brand" />
            <h2 className="text-lg font-semibold text-ink">Identidad visual</h2>
          </div>
          <Link
            href="/dashboard/negocio?tab=publica"
            className="text-sm text-brand hover:text-brand-strong"
          >
            Editar
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <IdentityCard
            label="Logo"
            preview={
              client.brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={client.brandLogoUrl}
                  alt="Logo"
                  className="h-16 w-16 rounded-lg object-cover border border-line"
                />
              ) : (
                <div
                  className="h-16 w-16 rounded-lg flex items-center justify-center text-white font-display text-2xl"
                  style={{ background: brand }}
                >
                  {client.businessName.slice(0, 1).toUpperCase()}
                </div>
              )
            }
            hint={client.brandLogoUrl ? 'Subido' : 'Usando inicial'}
          />
          <IdentityCard
            label="Color"
            preview={<div className="h-16 w-16 rounded-lg border border-line" style={{ background: brand }} />}
            hint={<span className="font-mono text-xs">{brand}</span>}
          />
          <IdentityCard
            label="Nombre"
            preview={<span className="font-display text-xl text-ink truncate">{client.businessName}</span>}
            hint={`${client.businessName.length} chars`}
          />
          <IdentityCard
            label="Descripción"
            preview={
              <p className="text-xs text-ink-2 line-clamp-3">
                {client.publicDescription || '—'}
              </p>
            }
            hint={client.publicDescription ? `${client.publicDescription.length} chars` : 'Sin descripción'}
          />
        </div>
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
          <li>• <strong>Promos</strong> si tienes huecos libres (v2 — próximamente).</li>
        </ul>
        <p className="mt-3 text-xs text-ink-3">
          Activado automáticamente para todos tus clientes que instalen la app. Nada que configurar.
        </p>
      </section>

      {/* Upcoming features */}
      <section className="bg-surface border border-dashed border-line rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-softer px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold text-brand-strong">
            Próximamente
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RoadmapTile
            icon={Heart}
            title="Fidelidad por puntos"
            description="Tus clientes suman puntos con cada cita. Al llegar al umbral, canjean premio (corte gratis, descuento). Configurable por ti."
          />
          <RoadmapTile
            icon={ImageIcon}
            title="Galería de cortes"
            description="Sube fotos de tus trabajos. Aparecen en un carrusel visible en la app para que clientes nuevos vean tu estilo."
          />
          <RoadmapTile
            icon={LinkIcon}
            title="Promos contextuales"
            description="Si tienes hueco esta tarde, push a tus clientes fieles con descuento. Llenas huecos sin esfuerzo."
          />
        </div>
      </section>
    </div>
  )
}

function IdentityCard({
  label,
  preview,
  hint,
}: {
  label: string
  preview: React.ReactNode
  hint: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-overlay/40 p-3">
      <span className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">{label}</span>
      <div className="flex-1 flex items-center justify-center min-h-[72px]">{preview}</div>
      <span className="text-xs text-ink-3 truncate">{hint}</span>
    </div>
  )
}

function RoadmapTile({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Heart
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-line bg-overlay/40 p-4">
      <Icon className="h-4 w-4 text-brand mb-2" />
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="text-xs text-ink-2 mt-1 leading-relaxed">{description}</p>
    </div>
  )
}
