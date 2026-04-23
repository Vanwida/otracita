import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { barbers as barbersTable, clients } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { hoursForDate } from '@/lib/availability'
import { MapPin, Clock } from 'lucide-react'
import PublicBookingFlow from './PublicBookingFlow'
import SocialLinks from './SocialLinks'
import PwaBootstrap from './PwaBootstrap'
import AppAccount from './AppAccount'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import { buildPalette, hexToRgba } from './brand-utils'

// -----------------------------------------------------------------------------
// /b/[slug] — página pública de una barbería.
//
// Layout tipo app: TopBar + main + BottomTabBar. Tema (claro/oscuro) se
// deriva automáticamente de la luminancia del color principal del barbero.
// En tema oscuro, si hay logo alternativo configurado, se usa en cabecera
// y bottom bar.
//
// El flujo completo de reserva vive en PublicBookingFlow (client) para no
// forzar islas SSR/CSR en cada sección.
// -----------------------------------------------------------------------------

interface ServiceItem {
  name: string
  duration: number
  price: number
  description: string
  featured: boolean
}

interface Props {
  params: Promise<{ slug: string }>
}

async function loadBarbershop(slug: string) {
  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) return null
  const barbers = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))
  return { client, barbers }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await loadBarbershop(slug)
  if (!data) {
    return { title: 'Barbería no encontrada — otracita' }
  }
  const { client } = data
  const title = `${client.businessName} — Reserva online`
  const description =
    client.publicDescription ||
    `Reserva tu cita en ${client.businessName} online. Sin llamadas, sin esperas.`
  const brand =
    client.brandColor && /^#[0-9a-f]{6}$/i.test(client.brandColor) ? client.brandColor : '#111111'
  const iconUrl = client.brandLogoUrl ?? `/manifest/${slug}/icon.svg`

  return {
    title,
    description,
    manifest: `/manifest/${slug}/manifest.webmanifest`,
    themeColor: brand,
    appleWebApp: {
      capable: true,
      title: client.businessName,
      statusBarStyle: 'default',
    },
    icons: { icon: iconUrl, apple: iconUrl, shortcut: iconUrl },
    openGraph: {
      title,
      description,
      images: client.brandCoverUrl ? [client.brandCoverUrl] : client.brandLogoUrl ? [client.brandLogoUrl] : undefined,
      type: 'website',
      locale: 'es_ES',
    },
    twitter: {
      card: client.brandCoverUrl ? 'summary_large_image' : 'summary',
      title,
      description,
    },
  }
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export default async function PublicBookingPage({ params }: Props) {
  const { slug } = await params
  const data = await loadBarbershop(slug)
  if (!data) notFound()

  const { client, barbers } = data
  const today = todayIso()
  const todayHours = hoursForDate(today, (client.chatbotHours as Record<string, string> | null) ?? null)
  const services: ServiceItem[] = ((client.chatbotServices as Array<Record<string, unknown>>) || [])
    .map((s) => ({
      name: String(s.name || ''),
      duration: Number(s.duration) || 30,
      price: Number(s.price) || 0,
      description: String(s.description || ''),
      featured: Boolean(s.featured),
    }))
    .filter((s) => s.name.length > 0)

  const palette = buildPalette(client.brandColor, client.brandColorSecondary)
  const whatsappNumber = client.whatsappNumber || client.phone
  const waLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
    : null

  // En tema oscuro, el logo principal negro no se verá — usar el alt si
  // existe. Si no, tiramos con el principal y asumimos la consecuencia.
  const headerLogoUrl =
    palette.isDark && client.brandLogoAltUrl
      ? client.brandLogoAltUrl
      : client.brandLogoUrl
  const heroLogoUrl = client.brandLogoUrl

  return (
    <main
      className="min-h-screen antialiased"
      style={{
        // ── Paleta de marca ──────────────────────────────────────────────
        ['--brand' as string]: palette.brand,
        ['--brand-2' as string]: palette.brand2,
        ['--brand-soft' as string]: palette.brandSoft,
        ['--brand-2-soft' as string]: palette.brand2Soft,
        ['--brand-strong' as string]: palette.brandStrong,
        ['--brand-ink' as string]: palette.brandInk,
        // ── Tokens de superficie (tema adaptativo claro/oscuro) ──────────
        ['--theme-canvas' as string]: palette.theme.canvas,
        ['--theme-surface' as string]: palette.theme.surface,
        ['--theme-surface-elevated' as string]: palette.theme.surfaceElevated,
        ['--theme-overlay' as string]: palette.theme.overlay,
        ['--theme-line' as string]: palette.theme.line,
        ['--theme-ink' as string]: palette.theme.ink,
        ['--theme-ink-2' as string]: palette.theme.ink2,
        ['--theme-ink-3' as string]: palette.theme.ink3,
        // ── Anular variables "canvas/ink" globales de otracita ──────────
        ['--color-canvas' as string]: palette.theme.canvas,
        ['--color-surface' as string]: palette.theme.surface,
        ['--color-line' as string]: palette.theme.line,
        ['--color-ink' as string]: palette.theme.ink,
        ['--color-ink-2' as string]: palette.theme.ink2,
        ['--color-ink-3' as string]: palette.theme.ink3,
        backgroundColor: 'var(--theme-canvas)',
        color: 'var(--theme-ink)',
        // Bajo la bottom tab bar (64px) + safe area.
        paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
      }}
    >
      <TopBar businessName={client.businessName} logoUrl={headerLogoUrl} slug={slug} />

      {/* ─── Hero card (NO full-bleed — se siente como app) ───────────── */}
      <section id="hero" className="mx-auto max-w-3xl px-4 pt-4">
        <div
          className="relative rounded-3xl overflow-hidden shadow-lg"
          style={{
            border: `1px solid ${palette.isDark ? 'transparent' : 'var(--theme-line)'}`,
            minHeight: '22rem',
          }}
        >
          {/* Fondo: cover si hay, si no degradado brand→brand2. */}
          {client.brandCoverUrl ? (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${client.brandCoverUrl})` }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, ${hexToRgba(palette.brand, 0.15)} 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.88) 100%)`,
                }}
              />
              {/* Halo de color secundario en esquina inferior izquierda. */}
              <div
                className="absolute -bottom-8 -left-8 w-52 h-52 rounded-full opacity-50 blur-3xl pointer-events-none"
                style={{ background: palette.brand2 }}
              />
            </>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, ${palette.brand} 0%, ${palette.brand2} 100%)`,
                }}
              />
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
                  backgroundSize: '22px 22px',
                }}
              />
            </>
          )}

          {/* Contenido */}
          <div className="relative h-full flex flex-col justify-between p-5 sm:p-7 min-h-[22rem]">
            {/* Arriba: eyebrow + logo */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="h-[2px] w-6 rounded-full"
                    style={{ backgroundColor: palette.brand2 }}
                  />
                  <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/80">
                    Premium Experience
                  </span>
                </div>
              </div>
              {heroLogoUrl && (
                <div
                  className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl overflow-hidden bg-white shadow-lg shrink-0"
                  style={{ boxShadow: `0 8px 24px -8px ${palette.brand2}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={heroLogoUrl} alt={client.businessName} className="h-full w-full object-cover" />
                </div>
              )}
            </div>

            {/* Abajo: nombre + tagline + CTA + meta */}
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white leading-[1.05]">
                {client.businessName}
              </h1>
              {client.publicDescription ? (
                <p className="mt-2 text-sm text-white/85 leading-relaxed line-clamp-2 max-w-md">
                  {client.publicDescription}
                </p>
              ) : (
                <p className="mt-2 text-sm text-white/85 max-w-md">
                  Reserva tu cita online en segundos. Confirmación al instante por WhatsApp.
                </p>
              )}

              <a
                href="#reservar"
                className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-transform active:scale-[0.98]"
                style={{
                  background: palette.brand,
                  color: palette.brandInk,
                  boxShadow: `0 10px 24px -8px ${palette.brand}`,
                }}
              >
                Reservar cita
                <span aria-hidden>→</span>
              </a>

              {/* Meta row — horario + dirección */}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-white/80">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: todayHours ? '#10B981' : '#9CA3AF' }}
                  />
                  <Clock className="h-3 w-3" />
                  {todayHours ? `Abierto · ${todayHours.start}–${todayHours.end}` : 'Cerrado hoy'}
                </span>
                {client.address && (
                  <span className="inline-flex items-center gap-1.5 max-w-full">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{client.address}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Redes sociales ─── */}
      <section className="mx-auto max-w-3xl px-4 mt-4">
        <SocialLinks
          whatsapp={waLink}
          phone={client.phone && client.phone !== whatsappNumber ? client.phone : null}
          instagramHandle={client.instagramHandle}
          tiktokHandle={client.tiktokHandle}
          facebookUrl={client.facebookUrl}
          websiteUrl={client.websiteUrl}
        />
      </section>

      {/* ─── Flujo de reserva (contiene servicios, barberos, día, hora, CTA)
           — todo dentro de un Client Component para sincronizar estado sin
           dramas. Las secciones internas llevan anchors para el bottom tab
           bar (#servicios, #reservar). */}
      <PublicBookingFlow
        slug={slug}
        services={services}
        barbers={barbers.map((b) => ({ id: b.id, name: b.name, photoUrl: b.photoUrl }))}
      />

      <BottomTabBar />

      <PwaBootstrap businessName={client.businessName} brand={palette.brand} />
      <AppAccount slug={slug} brand={palette.brand} />
    </main>
  )
}

