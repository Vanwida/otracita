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

// -----------------------------------------------------------------------------
// /b/[slug] — public booking page for a single barbería.
//
// Rendered server-side so Google / social scrapers get the full HTML + OG
// tags. The interactive single-screen booking flow (PublicBookingFlow) is
// a Client Component mounted below and represents ~90% of the viewport —
// the visitor came here to book, so we don't hide that behind a catalogue.
//
// Page layout (Booksy-style, barber-first, mobile-first):
//   · Hero: logo + name + address (shop context only).
//   · Meta row: hours today, WhatsApp, phone, Instagram, website.
//   · About: optional short description.
//   · Booking flow: service + barber + day + hour + datos, all on one screen.
//
// `publicEnabled = false` returns 404 — the barber can toggle the page
// off from the dashboard without breaking already-shared links.
// -----------------------------------------------------------------------------

interface ServiceItem {
  name: string
  duration: number
  price: number
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
    // Per-barbería PWA manifest — "Add to Home Screen" uses this to build
    // the installed app with THIS barbería's name + logo, not otracita's.
    manifest: `/manifest/${slug}/manifest.webmanifest`,
    themeColor: brand,
    appleWebApp: {
      capable: true,
      title: client.businessName,
      statusBarStyle: 'default',
    },
    icons: {
      icon: iconUrl,
      apple: iconUrl,
      shortcut: iconUrl,
    },
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

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgba(0,0,0,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Mix hex with black (negative) or white (positive) to get a related shade. */
function shadeHex(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mix = amount < 0 ? 0 : 255
  const t = Math.abs(amount)
  const mr = Math.round(r + (mix - r) * t)
  const mg = Math.round(g + (mix - g) * t)
  const mb = Math.round(b + (mix - b) * t)
  return '#' + [mr, mg, mb].map((v) => v.toString(16).padStart(2, '0')).join('')
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
    }))
    .filter((s) => s.name.length > 0)

  // Brand accent color — drives buttons, selected states, hero gradient.
  // If the barber hasn't configured one, we fall back to black (neutral,
  // professional, works on any logo). NOT to otracita's terracotta —
  // the public page should never leak otracita's identity into a
  // barbería that hasn't asked for it.
  const brand =
    client.brandColor && /^#[0-9a-f]{6}$/i.test(client.brandColor)
      ? client.brandColor
      : '#111111'
  // Optional secondary/accent. When null we derive it from the primary
  // by darkening ~18% — always a usable related shade for subtle accents.
  const brandSecondary =
    client.brandColorSecondary && /^#[0-9a-f]{6}$/i.test(client.brandColorSecondary)
      ? client.brandColorSecondary
      : shadeHex(brand, -0.18)
  // rgba at 10% alpha — used for section tints, CTA backgrounds, selected
  // hover states. Same identity color, low intensity.
  const brandSoft = hexToRgba(brand, 0.09)
  const whatsappNumber = client.whatsappNumber || client.phone
  const waLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
    : null

  return (
    <main
      className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]"
      // Override otracita's cream + espresso palette with neutrals for the
      // public page — the barbería's identity should never clash with
      // otracita's. The only "identity" here is `brand`, which carries
      // accents (buttons, selected states, hero gradient). Everything else
      // is black/white/grey.
      style={{
        ['--brand' as string]: brand,
        ['--brand-2' as string]: brandSecondary,
        ['--brand-soft' as string]: brandSoft,
        ['--color-canvas' as string]: '#FFFFFF',
        ['--color-surface' as string]: '#FFFFFF',
        ['--color-overlay' as string]: '#F3F4F6',
        ['--color-line' as string]: '#E5E7EB',
        ['--color-ink' as string]: '#111111',
        ['--color-ink-2' as string]: '#4B5563',
        ['--color-ink-3' as string]: '#9CA3AF',
      }}
    >
      {/* ─── Hero ─────────────────────────────────────────────────────────
           Foto + degradado de marca al fondo para que, al aterrizar, la
           identidad de la barbería se lea al instante. El nombre se
           superpone sobre la foto con un degradado oscuro que garantiza
           contraste; una pequeña barra de acento (brand-2) subraya el
           título y aporta el segundo color sin ruido. Si no hay portada,
           usamos un degradado brand → brand-2 a pantalla completa. */}
      <section className="relative">
        <div className="relative h-64 sm:h-80 w-full overflow-hidden">
          {client.brandCoverUrl ? (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${client.brandCoverUrl})` }}
              />
              {/* Degradado: color de marca arriba (tinte sutil) + negro abajo
                  para asegurar lectura del nombre. */}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, ${hexToRgba(brand, 0.18)} 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.78) 100%)`,
                }}
              />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${brand} 0%, ${brandSecondary} 100%)`,
              }}
            />
          )}

          {/* Identidad sobre el hero */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-5 sm:pb-6">
            <div className="mx-auto max-w-3xl flex items-end gap-4">
              <div
                className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-white shadow-lg overflow-hidden flex items-center justify-center shrink-0"
                style={{ outline: `2px solid ${hexToRgba('#FFFFFF', 0.85)}`, outlineOffset: '-2px' }}
              >
                {client.brandLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={client.brandLogoUrl}
                    alt={client.businessName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-display text-3xl text-[var(--color-ink-2)]">
                    {client.businessName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                {/* Barra de acento — aporta el segundo color sin gritar. */}
                <div
                  className="h-1 w-10 rounded-full mb-2"
                  style={{ backgroundColor: brandSecondary }}
                />
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-sm leading-tight">
                  {client.businessName}
                </h1>
                {client.address && (
                  <p className="text-sm text-white/85 mt-1 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{client.address}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Meta row: horario + redes, sobre blanco ─── */}
      <section className="mx-auto max-w-3xl px-4 mt-5 space-y-3">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-2)]">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: todayHours ? '#10B981' : '#9CA3AF' }}
          />
          <Clock className="h-3.5 w-3.5" />
          {todayHours ? `Abierto · ${todayHours.start}–${todayHours.end}` : 'Cerrado hoy'}
        </p>
        <SocialLinks
          whatsapp={waLink}
          phone={client.phone && client.phone !== whatsappNumber ? client.phone : null}
          instagramHandle={client.instagramHandle}
          tiktokHandle={client.tiktokHandle}
          facebookUrl={client.facebookUrl}
          websiteUrl={client.websiteUrl}
        />
      </section>

      {/* ─── About ─── */}
      {client.publicDescription && (
        <section className="mx-auto max-w-3xl px-4 mt-6">
          <p className="text-[15px] leading-relaxed text-[var(--color-ink)]/90">
            {client.publicDescription}
          </p>
        </section>
      )}

      {/* ─── Booking flow — por eso entró el cliente ───────────────────────
           Contenedor tintado con brand-soft para señalar visualmente la
           acción principal. El borde sutil toma el color de marca a baja
           opacidad para "firmar" la sección con la identidad. */}
      <section id="reservar" className="mx-auto max-w-3xl px-4 mt-8 pb-20">
        <div
          className="rounded-2xl p-4 sm:p-6"
          style={{
            background: brandSoft,
            border: `1px solid ${hexToRgba(brand, 0.15)}`,
          }}
        >
          <div className="mb-4 flex items-center gap-2">
            <div
              className="h-1 w-8 rounded-full"
              style={{ backgroundColor: brand }}
            />
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Reserva tu cita
            </h2>
          </div>
          <PublicBookingFlow
            slug={slug}
            brand={brand}
            services={services}
            barbers={barbers.map((b) => ({ id: b.id, name: b.name, photoUrl: b.photoUrl }))}
          />
        </div>
      </section>

      <footer className="mx-auto max-w-3xl px-4 py-6 text-center text-xs text-[var(--color-ink-3)] border-t border-[var(--color-line)]">
        Tecnología por <a href="https://otracita.es" className="underline hover:text-[var(--color-ink-2)]">otracita.es</a>
      </footer>

      <PwaBootstrap businessName={client.businessName} brand={brand} />
      <AppAccount slug={slug} brand={brand} />
    </main>
  )
}
