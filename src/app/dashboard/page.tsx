import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import {
  bookings,
  clients,
  customers,
  ratings,
  subscriptions,
} from '@/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import {
  CheckCircle2,
  CreditCard,
  Clock,
  Wrench,
  ArrowRight,
  Wallet,
  CalendarCheck,
  UserPlus,
  Star,
} from 'lucide-react'
import { Suspense } from 'react'
import { auth } from '@/lib/auth/server'
import StatsPeriodTabs from './_components/StatsPeriodTabs'
import WelcomeBanner from './_components/WelcomeBanner'
import BotActivationStatus from './_components/BotActivationStatus'
import AttentionPanel, { type AttentionAlert } from './_components/AttentionPanel'
import TodayMiniAgenda, { type MiniBooking } from './_components/TodayMiniAgenda'
import { hoursForDate } from '@/lib/availability'

// -----------------------------------------------------------------------------
// /dashboard — Inicio rediseñado.
//
// Estructura:
//   1. Saludo + fecha
//   2. BotActivationStatus (alerta si bot no activado)
//   3. WelcomeBanner condicional (?welcome=1 tras setup)
//   4. ActivationTracker condicional (cuando isPending)
//   5. AttentionPanel — alertas accionables (solo si hay)
//   6. KPIs negocio: facturado, visitas, clientes nuevos, nota media
//      (filtrables por periodo via StatsPeriodTabs)
//   7. TodayMiniAgenda — citas de hoy con huecos visibles
//   8. Plan/suscripción al final
//
// Cambios vs versión anterior:
//   - Quitamos KPIs vanity del bot (mensajes respondidos, clientes contactados)
//   - KPIs ahora son del NEGOCIO (facturado, visitas reales, nuevos, nota)
//   - AttentionPanel + mini-agenda son nuevos
//   - Plan al final, no estorba arriba
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string; welcome?: string }>
}

const PERIODS = ['day', 'week', 'month', 'lifetime'] as const
type Period = (typeof PERIODS)[number]

export default async function DashboardOverview({ searchParams }: PageProps) {
  const { period: rawPeriod = 'lifetime', welcome } = await searchParams
  const period: Period = (PERIODS as readonly string[]).includes(rawPeriod) ? (rawPeriod as Period) : 'lifetime'
  const showWelcome = welcome === '1'
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const isPending = client.status === 'pending'

  // Periodo → date range para queries.
  const now = new Date()
  let periodStart: Date | null = null
  if (period === 'day') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (period === 'week') {
    periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (period === 'month') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  }
  const periodStartIso = periodStart ? periodStart.toISOString().slice(0, 10) : null

  // Today / yesterday string (Madrid timezone).
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

  // Hora actual HH:MM en Madrid — para no marcar huecos pasados.
  const nowTime = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // ─── KPIs del negocio (sobre el periodo seleccionado) ────────────────────
  // bookings.price está en EUROS (foot-gun documentado).
  const periodWhereDate = periodStartIso
    ? sql`AND ${bookings.date} >= ${periodStartIso}`
    : sql``
  const periodWhereCreated = periodStart
    ? sql`AND ${customers.createdAt} >= ${periodStart}`
    : sql``
  const periodWhereRating = periodStart
    ? sql`AND ${ratings.createdAt} >= ${periodStart}`
    : sql``

  const [kpiRow] = (await db.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
        WHERE client_id = ${client.id} AND status = 'completed'
        ${periodWhereDate})::bigint AS billed_eur,
      (SELECT COUNT(*) FROM ${bookings}
        WHERE client_id = ${client.id}
        AND status IN ('confirmed', 'completed')
        ${periodWhereDate})::int AS visits_count,
      (SELECT COUNT(*) FROM ${customers}
        WHERE client_id = ${client.id}
        ${periodWhereCreated})::int AS new_customers,
      (SELECT AVG(${ratings.rating})::float FROM ${ratings}
        WHERE client_id = ${client.id}
        ${periodWhereRating}) AS avg_rating
  `).then((r) => (r as unknown as { rows: KpiRow[] }).rows)) ?? [{} as KpiRow]

  const billedEur = Number(kpiRow?.billed_eur ?? 0)
  const visitsCount = Number(kpiRow?.visits_count ?? 0)
  const newCustomers = Number(kpiRow?.new_customers ?? 0)
  const avgRating = kpiRow?.avg_rating !== null && kpiRow?.avg_rating !== undefined ? Number(kpiRow.avg_rating) : null

  // ─── Bookings de hoy + ayer (para mini-agenda y alertas) ─────────────────
  const todayAndYesterday = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        gte(bookings.date, yesterdayStr),
        lt(bookings.date, sql`(${todayStr}::date + interval '1 day')::text`),
      ),
    )
  const yesterdayConfirmed = todayAndYesterday.filter(
    (b) => b.date === yesterdayStr && b.status === 'confirmed',
  )
  const todayBookings: MiniBooking[] = todayAndYesterday
    .filter((b) => b.date === todayStr)
    .map((b) => ({
      id: b.id,
      time: b.time,
      duration: b.duration,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      service: b.service,
      barber: b.barber,
      status: b.status,
    }))

  // Horario shop hoy.
  const shopHoursMap = (client.chatbotHours as Record<string, string> | null) ?? null
  const shopHoursToday = hoursForDate(todayStr, shopHoursMap)

  // ─── Construir alertas accionables ───────────────────────────────────────
  const alerts: AttentionAlert[] = []

  // Reservas de ayer status='confirmed' sin marcar (no completed ni no_show).
  if (yesterdayConfirmed.length > 0) {
    alerts.push({
      id: 'yesterday-unmarked',
      tone: 'warn',
      title: `${yesterdayConfirmed.length} ${yesterdayConfirmed.length === 1 ? 'reserva de ayer sin marcar' : 'reservas de ayer sin marcar'}`,
      description: 'Marca si vinieron o fueron no-shows para que las stats salgan bien.',
      cta: { label: 'Ir a agenda', href: '/dashboard/agenda' },
      icon: 'alert',
    })
  }

  // Token Meta a punto de expirar (< 7 días).
  if (client.metaTokenExpiresAt) {
    const daysToExpiry = Math.floor(
      (client.metaTokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysToExpiry <= 7 && daysToExpiry >= 0) {
      alerts.push({
        id: 'meta-token-expiring',
        tone: 'danger',
        title: `Token de WhatsApp expira en ${daysToExpiry} ${daysToExpiry === 1 ? 'día' : 'días'}`,
        description: 'Si caduca, el bot dejará de responder. Renueva el token desde Meta Business.',
        icon: 'key',
      })
    } else if (daysToExpiry < 0) {
      alerts.push({
        id: 'meta-token-expired',
        tone: 'danger',
        title: 'Token de WhatsApp caducado',
        description: 'El bot no puede responder hasta que renueves el token en Meta Business.',
        icon: 'key',
      })
    }
  }

  // Promos contextuales activas + huecos hoy detectables → CTA.
  // Heurística simple: si hay >= 2 huecos detectables en la mini-agenda Y promos
  // están activas, sugerir llenarlos. La detección real vive en /promos/preview;
  // aquí solo miramos si el barbero tiene huecos relevantes hoy.
  if (client.promosEnabled && shopHoursToday) {
    const gapsToday = countSignificantGaps(
      todayBookings.filter((b) => b.status !== 'cancelled'),
      shopHoursToday,
      nowTime,
    )
    if (gapsToday >= 2) {
      alerts.push({
        id: 'fill-gaps-today',
        tone: 'info',
        title: `Tienes ${gapsToday} huecos hoy`,
        description: 'Manda una promo a tus clientes habituales para llenarlos.',
        cta: { label: 'Llenar huecos', href: '/dashboard/agenda' },
        icon: 'megaphone',
      })
    }
  }

  // ─── Suscripción (info al final) ─────────────────────────────────────────
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clientId, client.id))

  return (
    <div className="p-4 md:p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-ink mb-1">
          Hola, <span className="text-brand">{client.businessName || session.user.email!.split('@')[0]}</span>
        </h1>
        <p className="text-sm text-ink-3">{formatTodayLong()}</p>
      </header>

      {showWelcome && (
        <WelcomeBanner
          businessName={client.businessName}
          publicSlug={client.publicSlug}
          invoicingEnabled={client.invoicingEnabled}
        />
      )}

      <BotActivationStatus
        whatsappPhoneNumberId={client.whatsappPhoneNumberId}
        whatsappAccessToken={client.whatsappAccessToken}
        metaWebhookVerifiedAt={client.metaWebhookVerifiedAt}
        publicSlug={client.publicSlug}
        publicEnabled={client.publicEnabled}
      />

      {isPending && (
        <>
          <div className="mb-6 bg-brand-softer border border-brand/30 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
              <Wrench className="h-5 w-5 text-brand" />
            </div>
            <div className="flex-1">
              <p className="text-ink font-semibold text-base md:text-lg mb-1">Termina de configurar tu negocio</p>
              <p className="text-ink-2 text-sm leading-relaxed max-w-2xl">
                Añade tus servicios, horarios y conecta tu calendario para que el bot empiece a agendar citas automáticamente.
              </p>
            </div>
            <Link
              href="/dashboard/setup"
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-5 py-3 text-sm font-semibold text-brand-ink transition-colors"
            >
              Termina tu configuración
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ActivationTracker client={client} />
        </>
      )}

      <AttentionPanel alerts={alerts} />

      {/* KPIs del negocio */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">Tu negocio</h2>
          <Suspense>
            <StatsPeriodTabs />
          </Suspense>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={Wallet} label="Facturado" value={billedEur > 0 ? `${billedEur.toFixed(0)} €` : '—'} />
          <Kpi icon={CalendarCheck} label="Visitas" value={visitsCount.toLocaleString('es-ES')} />
          <Kpi icon={UserPlus} label="Clientes nuevos" value={newCustomers.toLocaleString('es-ES')} />
          <Kpi icon={Star} label="Nota media" value={avgRating !== null ? `${avgRating.toFixed(1)} / 5` : '—'} />
        </div>
      </section>

      {/* Hoy mini-agenda con huecos */}
      <section className="mb-6">
        <TodayMiniAgenda
          bookings={todayBookings}
          shopHours={shopHoursToday}
          nowTime={nowTime}
        />
      </section>

      {/* Plan/suscripción al final */}
      <footer className="border-t border-line pt-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <CreditCard className="h-3.5 w-3.5" />
          <span>Plan</span>
          <span className="uppercase font-medium text-ink-2">{client.plan}</span>
        </div>
        <span className="text-line-strong">·</span>
        <span className={`text-xs uppercase font-medium ${
          client.status === 'active' ? 'text-success' : client.status === 'pending' ? 'text-warning' : 'text-ink-3'
        }`}>
          {client.status}
        </span>
        {subscription && (
          <>
            <span className="text-line-strong">·</span>
            <span className="text-xs text-ink-3">
              {(subscription.amount / 100).toFixed(2)} €/mes
            </span>
          </>
        )}
        <Link
          href="/dashboard/mi-plan"
          className="ml-auto text-xs text-brand hover:text-brand-strong transition-colors"
        >
          Gestionar suscripción →
        </Link>
      </footer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes + helpers
// ─────────────────────────────────────────────────────────────────────────────

interface KpiRow {
  billed_eur: number | string
  visits_count: number
  new_customers: number
  avg_rating: number | null
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet
  label: string
  value: string
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-ink-3" />
        <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold truncate">{label}</p>
      </div>
      <p className="text-xl md:text-2xl font-bold text-ink tabular-nums">{value}</p>
    </div>
  )
}

function formatTodayLong(): string {
  const dt = new Date()
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Madrid',
  }).format(dt)
  // Capitalize first letter ("domingo" → "Domingo").
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function countSignificantGaps(
  list: MiniBooking[],
  shopHours: { start: string; end: string },
  nowTime: string,
): number {
  const MIN_GAP = 30
  const parseMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const sorted = [...list].sort((a, b) => a.time.localeCompare(b.time))
  const openMin = Math.max(parseMin(shopHours.start), parseMin(nowTime))
  const closeMin = parseMin(shopHours.end)

  let cursor = openMin
  let gaps = 0
  for (const b of sorted) {
    const bStart = parseMin(b.time)
    const bEnd = bStart + b.duration
    if (bStart - cursor >= MIN_GAP) gaps++
    cursor = Math.max(cursor, bEnd)
  }
  if (closeMin - cursor >= MIN_GAP) gaps++
  return gaps
}

// -----------------------------------------------------------------------------
// Activation tracker — shown while client.status === 'pending'.
// (Lógica idéntica a la versión anterior — mantenido para no romper el
// flujo de barberías nuevas.)
// -----------------------------------------------------------------------------

type ClientForTracker = {
  businessName: string | null
  phone: string | null
  chatbotServices: unknown
  whatsappPhoneNumberId: string | null
  booksyInboundEmail: string | null
  status: string
}

function isServicesFilled(services: unknown): boolean {
  if (services == null) return false
  if (Array.isArray(services)) return services.length > 0
  if (typeof services === 'object') return Object.keys(services as object).length > 0
  return false
}

function ActivationTracker({ client }: { client: ClientForTracker }) {
  const businessDataDone = Boolean(
    client.businessName && client.phone && isServicesFilled(client.chatbotServices),
  )
  const whatsappDone = Boolean(client.whatsappPhoneNumberId)
  const booksyDone = Boolean(client.booksyInboundEmail)
  const botActive = client.status === 'active'

  const opsPendingSubtitle = 'Nuestro equipo lo activa en 24h · Te avisaremos por WhatsApp cuando esté listo.'

  const steps: Array<{ title: string; subtitle: string; done: boolean }> = [
    { title: 'Pago recibido', subtitle: 'Tu suscripción está activa.', done: true },
    {
      title: 'Datos del negocio',
      subtitle: businessDataDone
        ? 'Nombre, teléfono y servicios completados.'
        : 'Añade el nombre, teléfono y servicios en la configuración.',
      done: businessDataDone,
    },
    {
      title: 'WhatsApp Business conectado',
      subtitle: whatsappDone ? 'Tu número de WhatsApp Business está conectado al bot.' : opsPendingSubtitle,
      done: whatsappDone,
    },
    {
      title: 'Booksy sincronizado',
      subtitle: booksyDone ? 'Los emails de Booksy se sincronizan con tu agenda.' : opsPendingSubtitle,
      done: booksyDone,
    },
    {
      title: 'Bot activo',
      subtitle: botActive
        ? 'El bot está respondiendo a tus clientes 24/7.'
        : 'Se activa automáticamente cuando los pasos anteriores estén listos.',
      done: botActive,
    },
  ]

  return (
    <div className="mb-6 bg-surface border border-line rounded-2xl p-5 md:p-6">
      <h2 className="font-display text-2xl md:text-3xl font-semibold text-ink mb-1">Activando tu bot</h2>
      <p className="text-sm text-ink-2 mb-5">
        Así va la activación de tu cuenta. Los pasos que dependen de nuestro equipo los hacemos por ti.
      </p>
      <ol className="space-y-3">
        {steps.map((step, idx) => (
          <li
            key={step.title}
            className="flex items-start gap-3 rounded-xl border border-line bg-canvas/60 p-3 md:p-4"
          >
            <div className="shrink-0 mt-0.5">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
              ) : (
                <Clock className="h-5 w-5 text-warning" aria-hidden="true" />
              )}
              <span className="sr-only">{step.done ? 'Completado' : 'Pendiente'}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm md:text-base font-semibold text-ink">
                {idx + 1}. {step.title}
              </p>
              <p className="text-xs md:text-sm text-ink-2 mt-0.5 leading-relaxed">{step.subtitle}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
