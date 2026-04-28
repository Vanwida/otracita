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
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm'
import {
  CheckCircle2,
  CreditCard,
  Clock,
  Wrench,
  ArrowRight,
  CalendarCheck,
  UserPlus,
  Star,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { Suspense } from 'react'
import { auth } from '@/lib/auth/server'
import StatsPeriodTabs from './_components/StatsPeriodTabs'
import WelcomeBanner from './_components/WelcomeBanner'
import BotActivationStatus from './_components/BotActivationStatus'
import AttentionPanel, { type AttentionAlert } from './_components/AttentionPanel'
import PendingClosureList, { type PendingClosureBooking } from './_components/PendingClosureList'
import TodayMiniAgenda, { type MiniBooking } from './_components/TodayMiniAgenda'
import { hoursForDate } from '@/lib/availability'
import { computeOccupancy } from '@/lib/dashboard/occupancy'
import {
  type Period,
  resolvePeriod,
  getPeriodStart,
  getPreviousPeriod,
} from '@/lib/dashboard/period'

// -----------------------------------------------------------------------------
// /dashboard — Inicio.
//
// Privacidad: la pantalla del barbero suele estar visible para clientes en
// mostrador. NO mostramos cifras monetarias aquí. Facturación, propinas y
// ticket medio viven en /dashboard/clientes y /dashboard/facturas (donde
// el barbero entra explícitamente).
//
// Estructura:
//   1. Saludo + fecha + chip "Próxima cita: en X min"
//   2. BotActivationStatus
//   3. WelcomeBanner condicional (?welcome=1)
//   4. ActivationTracker condicional (isPending)
//   5. AttentionPanel — alertas accionables (solo si hay)
//   6. KPIs no-sensibles: Visitas, Clientes nuevos, % Ocupación, Nota media
//      Cada KPI con flecha tendencia vs periodo anterior cuando aplica.
//   7. TodayMiniAgenda — citas de hoy con huecos visibles
//   8. Plan/suscripción al final
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string; welcome?: string }>
}

export default async function DashboardOverview({ searchParams }: PageProps) {
  const { period: rawPeriod, welcome } = await searchParams
  const period: Period = resolvePeriod(rawPeriod, 'lifetime')
  const showWelcome = welcome === '1'
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const isPending = client.status === 'pending'

  // Periodo → date range para queries (centralizado en lib/dashboard/period).
  const now = new Date()
  const periodStart = getPeriodStart(period, now)
  const periodStartIso = periodStart
    ? `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(periodStart.getDate()).padStart(2, '0')}`
    : null

  // Today / yesterday / day-before-yesterday string (Madrid timezone).
  // El rango de "citas por cerrar" cubre los últimos 2 días — el barbero
  // suele cerrar al día siguiente como muy tarde; pasados 3 días el cron
  // de safety net las cierra automáticamente como completed.
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const dayBeforeYesterdayStr = new Date(Date.now() - 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

  // Hora actual HH:MM en Madrid — para no marcar huecos pasados.
  const nowTime = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // ─── KPIs del negocio (sobre el periodo + el periodo anterior para tendencia) ─
  // Privacidad: NO incluimos importe facturado aquí — la pantalla del barbero
  // suele estar visible al cliente. Para € ir a /dashboard/clientes o
  // /dashboard/facturas que requieren navegación explícita.
  //
  // Para tendencia comparamos contra el periodo "anterior" del mismo tamaño:
  //   - day → ayer
  //   - week → 7 días anteriores a periodStart
  //   - month → mes pasado completo
  //   - lifetime → no hay tendencia (mostramos KPI sin flecha)
  const previousPeriod = getPreviousPeriod(period, periodStart, now)

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

  const visitsCount = Number(kpiRow?.visits_count ?? 0)
  const newCustomers = Number(kpiRow?.new_customers ?? 0)
  const avgRating = kpiRow?.avg_rating !== null && kpiRow?.avg_rating !== undefined ? Number(kpiRow.avg_rating) : null

  // KPIs del periodo anterior — solo si tenemos un previousPeriod definido
  // (lifetime → null → todas las tendencias quedan null).
  let visitsPrev: number | null = null
  let newCustomersPrev: number | null = null
  if (previousPeriod) {
    const [prevRow] = (await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${client.id}
          AND status IN ('confirmed', 'completed')
          AND date >= ${previousPeriod.startIso} AND date < ${periodStartIso ?? previousPeriod.endIso}
        )::int AS visits_count,
        (SELECT COUNT(*) FROM ${customers}
          WHERE client_id = ${client.id}
          AND created_at >= ${previousPeriod.startDate} AND created_at < ${periodStart ?? previousPeriod.endDate}
        )::int AS new_customers
    `).then((r) => (r as unknown as { rows: { visits_count: number; new_customers: number }[] }).rows)) ?? []
    visitsPrev = prevRow ? Number(prevRow.visits_count) : null
    newCustomersPrev = prevRow ? Number(prevRow.new_customers) : null
  }

  // % Ocupación — solo tiene sentido para periodos acotados (no lifetime).
  // Coste: O(días × barberos), aceptable hasta 31 días.
  const occupancy = periodStart
    ? await computeOccupancy({
        clientId: client.id,
        rangeStart: periodStartIso!,
        rangeEnd: todayStr,
        nowTime,
      })
    : null

  // Próxima cita confirmada (en futuro) — para el badge de cabecera.
  const [nextBooking] = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      time: bookings.time,
      service: bookings.service,
      barber: bookings.barber,
      customerName: bookings.customerName,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.status, 'confirmed'),
        sql`(${bookings.date} || ' ' || ${bookings.time})::timestamp >= now() AT TIME ZONE 'Europe/Madrid'`,
      ),
    )
    .orderBy(asc(bookings.date), asc(bookings.time))
    .limit(1)

  // ─── Bookings: anteayer + ayer + hoy ──────────────────────────────────
  // Una sola query cubre mini-agenda (hoy) y citas pendientes de cerrar
  // (ayer + anteayer en estado 'confirmed').
  const recentBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        gte(bookings.date, dayBeforeYesterdayStr),
        lt(bookings.date, sql`(${todayStr}::date + interval '1 day')::text`),
      ),
    )

  // Citas confirmadas de los últimos 2 días → lista accionable inline.
  const pendingClosure: PendingClosureBooking[] = recentBookings
    .filter((b) => b.status === 'confirmed' && (b.date === yesterdayStr || b.date === dayBeforeYesterdayStr))
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
    .map((b) => ({
      id: b.id,
      date: b.date,
      time: b.time,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      service: b.service,
      barber: b.barber,
      price: b.price,
    }))

  const todayBookings: MiniBooking[] = recentBookings
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
  // Las citas pendientes de cerrar tienen su propio panel inline accionable
  // (PendingClosureList) — NO van aquí. AttentionPanel queda para alertas
  // que requieren navegar a otro sitio (token Meta, promos, etc).
  const alerts: AttentionAlert[] = []

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
      {/* Header con próxima cita destacada */}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-ink mb-1">
            Hola, <span className="text-brand">{client.businessName || session.user.email!.split('@')[0]}</span>
          </h1>
          <p className="text-sm text-ink-3">{formatTodayLong()}</p>
        </div>
        {nextBooking && (
          <NextBookingBadge
            date={nextBooking.date}
            time={nextBooking.time}
            customerName={nextBooking.customerName}
            service={nextBooking.service}
            barber={nextBooking.barber}
            todayStr={todayStr}
            nowTime={nowTime}
          />
        )}
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

      {/* Citas por cerrar — accionable inline, prioridad sobre AttentionPanel
          porque es la primera acción del día (cerrar lo de ayer). */}
      <PendingClosureList
        bookings={pendingClosure}
        todayStr={todayStr}
        yesterdayStr={yesterdayStr}
        cashRegisterEnabled={client.cashRegisterEnabled}
        sumupReaderConnected={
          !!client.sumupAccessToken && !!client.sumupMerchantCode && !!client.sumupReaderId
        }
      />

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
          <Kpi
            icon={CalendarCheck}
            label="Visitas"
            value={visitsCount.toLocaleString('es-ES')}
            trend={computeTrend(visitsCount, visitsPrev)}
          />
          <Kpi
            icon={UserPlus}
            label="Clientes nuevos"
            value={newCustomers.toLocaleString('es-ES')}
            trend={computeTrend(newCustomers, newCustomersPrev)}
          />
          <Kpi
            icon={Activity}
            label="Ocupación"
            value={occupancy ? `${occupancy.pct}%` : '—'}
            hint={occupancy && occupancy.availableMinutes > 0
              ? `${Math.round(occupancy.availableMinutes / 60 - occupancy.bookedMinutes / 60)}h libres`
              : period === 'lifetime' ? 'Elige un periodo' : undefined}
          />
          <Kpi
            icon={Star}
            label="Nota media"
            value={avgRating !== null ? `${avgRating.toFixed(1)} / 5` : '—'}
          />
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
  visits_count: number
  new_customers: number
  avg_rating: number | null
}

interface Trend {
  /** Direccion: up = mejor, down = peor, flat = igual, none = sin tendencia. */
  direction: 'up' | 'down' | 'flat' | 'none'
  /** Texto a mostrar, tipo "+12%" o "−5%" o "=". */
  label: string
}

function Kpi({
  icon: Icon,
  label,
  value,
  trend,
  hint,
}: {
  icon: typeof CalendarCheck
  label: string
  value: string
  trend?: Trend
  hint?: string
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-ink-3" />
        <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold truncate">{label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-xl md:text-2xl font-bold text-ink tabular-nums">{value}</p>
        {trend && trend.direction !== 'none' && (
          <TrendChip trend={trend} />
        )}
      </div>
      {hint && <p className="text-[10px] text-ink-3 mt-1">{hint}</p>}
    </div>
  )
}

function TrendChip({ trend }: { trend: Trend }) {
  const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus
  const color = trend.direction === 'up' ? 'text-success' : trend.direction === 'down' ? 'text-danger' : 'text-ink-3'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${color}`}>
      <Icon className="h-3 w-3" />
      {trend.label}
    </span>
  )
}

function NextBookingBadge({
  date,
  time,
  customerName,
  service,
  barber,
  todayStr,
  nowTime,
}: {
  date: string
  time: string
  customerName: string | null
  service: string
  barber: string | null
  todayStr: string
  nowTime: string
}) {
  // Texto temporal: si es hoy, "En X min" o "Ahora"; si mañana, "Mañana HH:MM"; sino, fecha relativa.
  let when: string
  if (date === todayStr) {
    const [bH, bM] = time.split(':').map(Number)
    const [nH, nM] = nowTime.split(':').map(Number)
    const diffMin = bH * 60 + bM - (nH * 60 + nM)
    if (diffMin <= 0) when = 'Ahora'
    else if (diffMin < 60) when = `En ${diffMin} min`
    else when = `Hoy ${time}`
  } else {
    const d = new Date(`${date}T00:00:00`)
    const today = new Date(`${todayStr}T00:00:00`)
    const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 1) when = `Mañana ${time}`
    else when = `${new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)} · ${time}`
  }

  const subtitle = `${customerName || '—'} · ${service}${barber ? ` con ${barber}` : ''}`

  return (
    <Link
      href="/dashboard/agenda"
      className="inline-flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-softer px-4 py-2.5 text-left hover:border-brand transition-colors max-w-sm"
    >
      <Clock className="h-4 w-4 text-brand-strong shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-strong">Próxima cita · {when}</p>
        <p className="text-sm text-ink truncate">{subtitle}</p>
      </div>
    </Link>
  )
}

function computeTrend(current: number, previous: number | null): Trend {
  if (previous === null) return { direction: 'none', label: '' }
  if (previous === 0 && current === 0) return { direction: 'flat', label: '=' }
  if (previous === 0) return { direction: 'up', label: 'nuevo' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { direction: 'flat', label: '=' }
  const sign = pct > 0 ? '+' : '−'
  return {
    direction: pct > 0 ? 'up' : 'down',
    label: `${sign}${Math.abs(pct)}%`,
  }
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
