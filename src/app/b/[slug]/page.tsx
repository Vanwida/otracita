import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { barbers as barbersTable, clients } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { hoursForDate } from '@/lib/availability'
import { MapPin, Clock, AtSign, Globe, Phone, MessageCircle } from 'lucide-react'
import PublicBookingFlow from './PublicBookingFlow'

// -----------------------------------------------------------------------------
// /b/[slug] — public booking page for a single barbería.
//
// Rendered server-side so Google / social scrapers get the full HTML + OG
// tags. The interactive booking flow is a Client Component mounted below.
//
// Design goals (Booksy/Treatwell parity, barber-first):
//   · Hero with logo, name, address, hours today, short about.
//   · Services list with price + duration (the bot has the same).
//   · Team with optional photo + bio.
//   · CTA "Reservar" at the top AND at the bottom.
//   · Mobile-first — >95% of visits come from Instagram link taps.
//   · Honours the per-client brand color if set, otherwise otracita brand.
//   · If `publicEnabled = false`, returns 404 — the barber can temporarily
//     disable the page from the dashboard without breaking shared links.
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
  return {
    title,
    description,
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

function formatEuros(n: number): string {
  return n.toFixed(2).replace('.', ',')
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

  const brand = client.brandColor && /^#[0-9a-f]{6}$/i.test(client.brandColor) ? client.brandColor : '#C9653C'
  const whatsappNumber = client.whatsappNumber || client.phone
  const waLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
    : null

  return (
    <main
      className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]"
      style={{ ['--brand' as string]: brand }}
    >
      {/* ─── Cover ─── */}
      <section className="relative">
        {client.brandCoverUrl ? (
          <div
            className="h-44 sm:h-56 w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${client.brandCoverUrl})` }}
          />
        ) : (
          <div
            className="h-24 sm:h-32 w-full"
            style={{
              background: `linear-gradient(135deg, ${brand} 0%, rgba(0,0,0,0.15) 100%)`,
            }}
          />
        )}
        <div className="mx-auto max-w-3xl px-4 -mt-14 sm:-mt-16 relative z-10">
          <div className="flex items-end gap-4">
            <div
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] shadow-sm overflow-hidden flex items-center justify-center shrink-0"
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
            <div className="flex-1 min-w-0 pb-2">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {client.businessName}
              </h1>
              {client.address && (
                <p className="text-sm text-[var(--color-ink-2)] mt-0.5 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{client.address}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Meta row ─── */}
      <section className="mx-auto max-w-3xl px-4 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--color-ink-2)]">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {todayHours ? `Abierto ${todayHours.start}–${todayHours.end}` : 'Cerrado hoy'}
        </span>
        {whatsappNumber && waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-[var(--color-ink)] transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        )}
        {client.phone && client.phone !== whatsappNumber && (
          <a
            href={`tel:${client.phone}`}
            className="inline-flex items-center gap-1.5 hover:text-[var(--color-ink)] transition-colors"
          >
            <Phone className="h-3.5 w-3.5" />
            {client.phone}
          </a>
        )}
        {client.instagramHandle && (
          <a
            href={`https://instagram.com/${client.instagramHandle.replace(/^@/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-[var(--color-ink)] transition-colors"
          >
            <AtSign className="h-3.5 w-3.5" />{client.instagramHandle.replace(/^@/, '')}
          </a>
        )}
        {client.websiteUrl && (
          <a
            href={client.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-[var(--color-ink)] transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            Web
          </a>
        )}
      </section>

      {/* ─── About ─── */}
      {client.publicDescription && (
        <section className="mx-auto max-w-3xl px-4 mt-6">
          <p className="text-[15px] leading-relaxed text-[var(--color-ink)]/90">
            {client.publicDescription}
          </p>
        </section>
      )}

      {/* ─── CTA top ─── */}
      <section className="mx-auto max-w-3xl px-4 mt-8">
        <a
          href="#reservar"
          className="block w-full rounded-2xl text-center px-6 py-4 text-base font-semibold shadow-sm transition-transform active:scale-[0.99]"
          style={{ backgroundColor: brand, color: 'white' }}
        >
          Reservar cita
        </a>
      </section>

      {/* ─── Services ─── */}
      {services.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 mt-10">
          <h2 className="font-display text-xl font-semibold mb-3">Servicios</h2>
          <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] overflow-hidden divide-y divide-[var(--color-line)]">
            {services.map((s, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--color-ink)] truncate">{s.name}</p>
                  <p className="text-xs text-[var(--color-ink-3)] mt-0.5">{s.duration} min</p>
                </div>
                <span className="font-mono text-sm text-[var(--color-ink)] shrink-0">
                  {formatEuros(s.price)} €
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Team ─── */}
      {barbers.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 mt-10">
          <h2 className="font-display text-xl font-semibold mb-3">Equipo</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {barbers.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] p-3 text-center"
              >
                <div className="mx-auto h-16 w-16 rounded-full bg-[var(--color-overlay)] overflow-hidden mb-2 flex items-center justify-center">
                  {b.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.photoUrl} alt={b.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-lg text-[var(--color-ink-2)]">
                      {b.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-[var(--color-ink)] truncate">{b.name}</p>
                {b.bio && (
                  <p className="text-xs text-[var(--color-ink-3)] mt-1 line-clamp-2">{b.bio}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Booking flow ─── */}
      <section id="reservar" className="mx-auto max-w-3xl px-4 mt-10 pb-20">
        <h2 className="font-display text-xl font-semibold mb-3">Reservar</h2>
        <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] p-4 sm:p-6">
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
    </main>
  )
}
