import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { barbers as barbersTable, clients } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { hoursForDate } from '@/lib/availability'
import { loadShopOverridesForDate } from '@/lib/shop-day-overrides'

// Página dinámica — depende del horario, branding y servicios del local. Sin
// esto, Next puede pre-renderizar el slug y dejar al cliente con datos
// obsoletos hasta el siguiente deploy. Combinado con `revalidatePath('/[slug]',
// 'page')` en los server actions que tocan estos campos, el ciclo es: jefe
// guarda → la próxima visita ya renderiza fresh. Ver `dashboard/ajustes/page.tsx`.
export const dynamic = 'force-dynamic'
import { MapPin, Clock } from 'lucide-react'
import PublicBookingFlow from './PublicBookingFlow'
import SocialLinks from './SocialLinks'
import PwaBootstrap from './PwaBootstrap'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import { buildPalette, hexToRgba } from './brand-utils'

// -----------------------------------------------------------------------------
// /[slug] — página pública de una barbería.
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
  // themeColor de la pestaña del browser = color accent si hay, si no negro.
  const accent =
    client.brandColor && /^#[0-9a-f]{6}$/i.test(client.brandColor) ? client.brandColor : '#111111'
  const iconUrl = client.brandLogoUrl ?? `/manifest/${slug}/icon.svg`

  return {
    title,
    description,
    manifest: `/manifest/${slug}/manifest.webmanifest`,
    themeColor: accent,
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
  const todayOverrides = await loadShopOverridesForDate(client.id, today)
  const todayHours = hoursForDate(
    today,
    (client.chatbotHours as Record<string, string> | null) ?? null,
    todayOverrides,
  )
  const services: ServiceItem[] = ((client.chatbotServices as Array<Record<string, unknown>>) || [])
    .map((s) => ({
      name: String(s.name || ''),
      duration: Number(s.duration) || 30,
      price: Number(s.price) || 0,
      description: String(s.description || ''),
      featured: Boolean(s.featured),
    }))
    .filter((s) => s.name.length > 0)

  const palette = buildPalette(client.brandTheme, client.brandColor)
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
        // ── Accent (la UNICA identidad cromática del barbero) ───────────
        // Mantenemos también los alias antiguos (--brand*) para no romper
        // los componentes que aún referencian esos nombres — apuntan todos
        // al accent.
        ['--accent' as string]: palette.accent,
        ['--accent-soft' as string]: palette.accentSoft,
        ['--accent-strong' as string]: palette.accentStrong,
        ['--accent-ink' as string]: palette.accentInk,
        ['--brand' as string]: palette.accent,
        ['--brand-2' as string]: palette.accent,
        ['--brand-soft' as string]: palette.accentSoft,
        ['--brand-2-soft' as string]: palette.accentSoft,
        ['--brand-strong' as string]: palette.accentStrong,
        ['--brand-ink' as string]: palette.accentInk,
        // ── Tokens de superficie (tema light/dark) ──────────────────────
        ['--theme-canvas' as string]: palette.tokens.canvas,
        ['--theme-surface' as string]: palette.tokens.surface,
        ['--theme-surface-elevated' as string]: palette.tokens.surfaceElevated,
        ['--theme-overlay' as string]: palette.tokens.overlay,
        ['--theme-line' as string]: palette.tokens.line,
        ['--theme-ink' as string]: palette.tokens.ink,
        ['--theme-ink-2' as string]: palette.tokens.ink2,
        ['--theme-ink-3' as string]: palette.tokens.ink3,
        // ── Anular variables "canvas/ink" globales de otracita ──────────
        ['--color-canvas' as string]: palette.tokens.canvas,
        ['--color-surface' as string]: palette.tokens.surface,
        ['--color-line' as string]: palette.tokens.line,
        ['--color-ink' as string]: palette.tokens.ink,
        ['--color-ink-2' as string]: palette.tokens.ink2,
        ['--color-ink-3' as string]: palette.tokens.ink3,
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
                  background: `linear-gradient(180deg, ${hexToRgba(palette.accent, 0.15)} 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.88) 100%)`,
                }}
              />
              {/* Halo de color secundario en esquina inferior izquierda. */}
              <div
                className="absolute -bottom-8 -left-8 w-52 h-52 rounded-full opacity-50 blur-3xl pointer-events-none"
                style={{ background: palette.accent }}
              />
            </>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, ${palette.accent} 0%, ${palette.accent} 100%)`,
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
            {/* Arriba: solo logo alineado a la derecha (sin eyebrow hardcoded) */}
            <div className="flex items-start justify-end gap-3">
              {heroLogoUrl && (
                <div
                  className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl overflow-hidden bg-white shadow-lg shrink-0"
                  style={{ boxShadow: `0 8px 24px -8px ${palette.accent}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={heroLogoUrl} alt={client.businessName} className="h-full w-full object-cover" />
                </div>
              )}
            </div>

            {/* Abajo: nombre + descripcion (solo si el barbero la puso) + CTA + meta */}
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white leading-[1.05]">
                {client.businessName}
              </h1>
              {client.publicDescription && (
                <p className="mt-2 text-sm text-white/85 leading-relaxed line-clamp-2 max-w-md">
                  {client.publicDescription}
                </p>
              )}

              <a
                href="#reservar"
                className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-transform active:scale-[0.98]"
                style={{
                  background: palette.accent,
                  color: palette.accentInk,
                  boxShadow: `0 10px 24px -8px ${palette.accent}`,
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
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 max-w-full underline decoration-white/30 underline-offset-2 hover:decoration-white/80"
                    aria-label={`Abrir ${client.address} en Google Maps`}
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{client.address}</span>
                  </a>
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

      <BottomTabBar slug={slug} />

      <PwaBootstrap businessName={client.businessName} brand={palette.accent} />
    </main>
  )
}

