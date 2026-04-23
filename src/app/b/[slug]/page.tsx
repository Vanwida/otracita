import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { barbers as barbersTable, clients } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { hoursForDate } from '@/lib/availability'
import { MapPin, Scissors, Clock, Sparkles, ShieldCheck, Zap } from 'lucide-react'
import PublicBookingFlow from './PublicBookingFlow'
import SocialLinks from './SocialLinks'
import PwaBootstrap from './PwaBootstrap'
import AppAccount from './AppAccount'
import BrandStamp from './BrandStamp'
import { buildPalette, hexToRgba } from './brand-utils'

// -----------------------------------------------------------------------------
// /b/[slug] — página pública de una barbería.
//
// Diseño editorial con personalidad de barbería: poste de barbero como
// separador, sello rotativo vintage en el hero, paleta adaptativa al
// contraste (un amarillo no termina con texto blanco ilegible). La
// barbería configura 1 o 2 colores en /dashboard/app; todo lo demás se
// deriva en brand-utils.ts.
//
// `publicEnabled = false` → 404.
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
    }))
    .filter((s) => s.name.length > 0)

  const palette = buildPalette(client.brandColor, client.brandColorSecondary)
  const whatsappNumber = client.whatsappNumber || client.phone
  const waLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
    : null

  return (
    <main
      className="min-h-screen text-[var(--color-ink)] antialiased"
      style={{
        // Paleta de marca — inyectamos como CSS vars para que TODOS los hijos
        // (BookingFlow incluido) estilicen sin recomputar colores.
        ['--brand' as string]: palette.brand,
        ['--brand-2' as string]: palette.brand2,
        ['--brand-soft' as string]: palette.brandSoft,
        ['--brand-2-soft' as string]: palette.brand2Soft,
        ['--brand-strong' as string]: palette.brandStrong,
        ['--brand-ink' as string]: palette.brandInk,
        // Neutrales para la página pública — anulamos el espresso/crema de
        // otracita para que la identidad del barbero mande sola.
        ['--color-canvas' as string]: '#FAFAF7',
        ['--color-surface' as string]: '#FFFFFF',
        ['--color-overlay' as string]: '#F3F4F6',
        ['--color-line' as string]: '#E5E7EB',
        ['--color-ink' as string]: '#0F0F0F',
        ['--color-ink-2' as string]: '#4B5563',
        ['--color-ink-3' as string]: '#9CA3AF',
        backgroundColor: 'var(--color-canvas)',
      }}
    >
      {/* ─── Franja poste-de-barbero arriba del todo ─── */}
      <BarberPole />

      {/* ─── Hero editorial ─────────────────────────────────────────────── */}
      <section className="relative">
        <div className="relative h-80 sm:h-[26rem] w-full overflow-hidden">
          {client.brandCoverUrl ? (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center scale-105"
                style={{ backgroundImage: `url(${client.brandCoverUrl})` }}
              />
              {/* Degradado oscuro inferior para legibilidad del nombre. */}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, ${hexToRgba(palette.brand, 0.12)} 0%, rgba(0,0,0,0.08) 28%, rgba(0,0,0,0.85) 100%)`,
                }}
              />
              {/* Pincelada sutil en brand-2 desde la esquina inferior izq. */}
              <div
                className="absolute bottom-0 left-0 w-2/3 h-1/2 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at bottom left, ${hexToRgba(palette.brand2, 0.45)}, transparent 70%)`,
                }}
              />
            </>
          ) : (
            // Sin portada → degradado 2 colores a pantalla completa. La
            // identidad es pura color.
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${palette.brand} 0%, ${palette.brand2} 100%)`,
              }}
            >
              {/* Trama sutil de puntos para que no sea un bloque plano. */}
              <div
                className="absolute inset-0 opacity-[0.08]"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
                  backgroundSize: '18px 18px',
                }}
              />
            </div>
          )}

          {/* Sello rotativo arriba-derecha */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
            <BrandStamp
              text={`Reserva online · ${client.businessName}`}
              color="#FFFFFF"
              centerBg={palette.brand}
              iconColor={palette.brandInk}
              size={96}
            />
          </div>

          {/* Contenido del hero — anclado abajo */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:pb-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-4 sm:gap-5">
                <div
                  className="h-24 w-24 sm:h-32 sm:w-32 rounded-2xl bg-white shadow-2xl overflow-hidden flex items-center justify-center shrink-0"
                  style={{
                    boxShadow: `0 20px 40px -10px rgba(0,0,0,0.4), 0 0 0 3px ${palette.brand2}`,
                  }}
                >
                  {client.brandLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={client.brandLogoUrl}
                      alt={client.businessName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-4xl sm:text-5xl text-[var(--color-ink-2)]">
                      {client.businessName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="h-[3px] w-8 rounded-full"
                      style={{ backgroundColor: palette.brand2 }}
                    />
                    <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-white/85">
                      Barbería
                    </span>
                  </div>
                  <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.05]">
                    {client.businessName}
                  </h1>
                  {client.address && (
                    <p className="text-sm sm:text-base text-white/85 mt-2 flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="truncate">{client.address}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Meta pills (horario + trust row) ─── */}
      <section className="mx-auto max-w-3xl px-4 mt-5">
        <div className="flex flex-wrap gap-2">
          <StatusPill
            dotColor={todayHours ? '#10B981' : '#9CA3AF'}
            icon={Clock}
            label={todayHours ? `Abierto · ${todayHours.start}–${todayHours.end}` : 'Cerrado hoy'}
          />
          <TrustPill icon={Zap} label="Confirmación al instante" />
          <TrustPill icon={ShieldCheck} label="Sin compromiso" />
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

      {/* ─── About (si tiene) ─── */}
      {client.publicDescription && (
        <section className="mx-auto max-w-3xl px-4 mt-6">
          <div className="relative rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] p-5 overflow-hidden">
            {/* Barrita vertical brand→brand-2 a la izquierda */}
            <div
              className="absolute top-4 bottom-4 left-0 w-[3px] rounded-r-full"
              style={{
                background: `linear-gradient(180deg, ${palette.brand}, ${palette.brand2})`,
              }}
            />
            <p className="text-[15px] leading-relaxed text-[var(--color-ink)]/90 pl-3">
              {client.publicDescription}
            </p>
          </div>
        </section>
      )}

      {/* ─── Separador poste-de-barbero horizontal ─── */}
      <div className="mx-auto max-w-3xl px-4 mt-10 mb-5">
        <BarberPoleDivider />
      </div>

      {/* ─── Booking flow — el motivo por el que entró el cliente ─── */}
      <section id="reservar" className="mx-auto max-w-3xl px-4 pb-20">
        <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] overflow-hidden">
          <div
            className="px-5 py-4 border-b border-[var(--color-line)] relative overflow-hidden"
            style={{ background: palette.brandSoft }}
          >
            {/* Decorativa: línea brand2 diagonal en esquina */}
            <div
              className="absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-30"
              style={{ background: palette.brand2 }}
            />
            <div className="flex items-center gap-2.5 relative">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: palette.brand, color: palette.brandInk }}
              >
                <Scissors className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--color-ink)] leading-tight">
                  Reserva tu cita
                </h2>
                <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
                  Servicio · Barbero · Día · Hora
                </p>
              </div>
              <span
                className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-bold"
                style={{ color: palette.brandStrong }}
              >
                <Sparkles className="h-3 w-3" />
                Online 24/7
              </span>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <PublicBookingFlow
              slug={slug}
              services={services}
              barbers={barbers.map((b) => ({ id: b.id, name: b.name, photoUrl: b.photoUrl }))}
            />
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <BarberPole />
      <footer className="mx-auto max-w-3xl px-4 py-6 text-center text-xs text-[var(--color-ink-3)]">
        Tecnología por{' '}
        <a href="https://otracita.es" className="underline hover:text-[var(--color-ink-2)]">
          otracita.es
        </a>
      </footer>

      <PwaBootstrap businessName={client.businessName} brand={palette.brand} />
      <AppAccount slug={slug} brand={palette.brand} />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ornamentos reutilizables
// ─────────────────────────────────────────────────────────────────────────────

/** Poste de barbero — tres franjas diagonales repetidas. El clásico. */
function BarberPole() {
  return (
    <div
      className="h-[6px] w-full"
      style={{
        background: `repeating-linear-gradient(135deg,
          var(--brand) 0 14px,
          #FFFFFF 14px 28px,
          var(--brand-2) 28px 42px)`,
      }}
    />
  )
}

/** Divisor horizontal con tijeras al centro. */
function BarberPoleDivider() {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 h-[3px] rounded-full"
        style={{
          background: `repeating-linear-gradient(90deg,
            var(--brand) 0 8px,
            var(--color-canvas) 8px 14px,
            var(--brand-2) 14px 22px)`,
        }}
      />
      <div
        className="flex items-center justify-center h-8 w-8 rounded-full"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)' }}
      >
        <Scissors className="h-3.5 w-3.5" style={{ color: 'var(--brand-strong)' }} />
      </div>
      <div
        className="flex-1 h-[3px] rounded-full"
        style={{
          background: `repeating-linear-gradient(90deg,
            var(--brand-2) 0 8px,
            var(--color-canvas) 8px 14px,
            var(--brand) 14px 22px)`,
        }}
      />
    </div>
  )
}

function StatusPill({
  dotColor,
  icon: Icon,
  label,
}: {
  dotColor: string
  icon: typeof Clock
  label: string
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-line)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink-2)] shadow-sm">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  )
}

function TrustPill({
  icon: Icon,
  label,
}: {
  icon: typeof Zap
  label: string
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-ink-2)]"
      style={{ background: 'var(--brand-soft)' }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: 'var(--brand-strong)' }} />
      {label}
    </div>
  )
}
