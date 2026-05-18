export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react'
import { auth } from '@/lib/auth/server'
import { db } from '@/db'
import {
  bookings,
  clients,
  tips,
  subscriptions,
} from '@/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import AttentionPanel, { type AttentionAlert } from './_components/AttentionPanel'
import HomeIntroCard from './_components/HomeIntroCard'
import PendingClosureList, { type PendingClosureBooking } from './_components/PendingClosureList'
import { computeHomeState, type HomeState } from '@/lib/dashboard/home-state'
import { pluralizeEs, formatEuros } from '@/lib/i18n/plural-es'
import type { WeeklyHours } from '@/lib/availability'

// -----------------------------------------------------------------------------
// /dashboard — Home como **panel de control denso** (UI0 / Booksy), no
// portada de revista. Una pregunta, una respuesta: el barbero entra a leer
// "qué toca ahora" en 3 segundos.
//
// Estructura (densa, sans, tokens):
//   Header compacto — fecha + negocio + plan/estado (utility labels)
//   AttentionPanel condicional (token Meta a punto de caducar, etc.)
//   StatusLine — la respuesta del state machine: titular sans pesado
//     (NUNCA Fraunces / clamp editorial) + soporte + acción
//   Bloque secundario condicional (lista, recap o pasos de activación)
//     dentro de DataPanel
//
// Las KPIs viven cada una en su sitio: visitas y € en Caja, clientes nuevos
// en Clientes, nota media en Crecer → Reseñas. La privacidad de cifras
// durante la jornada se preserva: aquí solo enseñamos € en estado "done"
// (después de cierre).
//
// State machine en src/lib/dashboard/home-state.ts. El page solo decide copy
// + layout; los hechos los computa la lib (inalterada).
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ welcome?: string }>
}

export default async function DashboardOverview({ searchParams }: PageProps) {
  await searchParams // currently no params consumed; reserved
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', {
    timeZone: 'Europe/Madrid',
  })
  const dayBeforeYesterdayStr = new Date(Date.now() - 2 * 86400000).toLocaleDateString('en-CA', {
    timeZone: 'Europe/Madrid',
  })
  const nowTime = now.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // Citas relevantes: anteayer + ayer + hoy. Hoy alimenta el state machine;
  // ayer + anteayer alimentan PendingClosureList cuando estamos en
  // 'closingPending'.
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

  const todayBookings = recentBookings.filter((b) => b.date === todayStr)
  const pendingClosure: PendingClosureBooking[] = recentBookings
    .filter(
      (b) =>
        b.status === 'confirmed' &&
        (b.date === yesterdayStr || b.date === dayBeforeYesterdayStr),
    )
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

  // Revenue + tips de hoy — solo se mostrará en estado 'done' (después de
  // cierre, no durante la jornada).
  const [revenueRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${bookings.price}), 0)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.date, todayStr),
        eq(bookings.status, 'completed'),
      ),
    )
  const revenueToday = Number(revenueRow?.total ?? 0)

  const [tipsRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, client.id),
        eq(tips.status, 'paid'),
        sql`${tips.createdAt}::date = ${todayStr}::date`,
      ),
    )
  const tipsToday = Number(tipsRow?.count ?? 0)

  // Compute the home state.
  const state: HomeState = computeHomeState({
    clientStatus: client.status,
    shopHours: (client.chatbotHours as WeeklyHours | null) ?? null,
    blockedDates: (client.blockedDates as string[] | null) ?? [],
    todayStr,
    nowTime,
    todayBookings: todayBookings.map((b) => ({
      id: b.id,
      time: b.time,
      customerName: b.customerName,
      service: b.service,
      barber: b.barber,
      status: b.status,
    })),
    revenueToday,
    tipsToday,
    pendingClosuresCount: pendingClosure.length,
  })

  // Alertas reales (token Meta, promos con huecos, etc). Independiente del
  // state machine — pueden coexistir con cualquier titular.
  const alerts: AttentionAlert[] = []
  if (client.metaTokenExpiresAt) {
    const daysToExpiry = Math.floor(
      (client.metaTokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysToExpiry <= 7 && daysToExpiry >= 0) {
      alerts.push({
        id: 'meta-token-expiring',
        tone: 'danger',
        title: `Token de WhatsApp caduca en ${pluralizeEs(daysToExpiry, 'día', 'días')}`,
        description: 'Si caduca, el bot deja de responder. Renueva el token desde Meta Business.',
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

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clientId, client.id))

  return (
    <div
      className="max-w-5xl mx-auto"
      style={{ padding: 'var(--space-page)' }}
    >
      {/* Header compacto de panel — fecha + negocio + plan/estado como
          metadata de utilidad. Sin titular de revista. */}
      <header
        className="flex items-start justify-between gap-4 border-b border-line"
        style={{ paddingBottom: 'var(--space-card)' }}
      >
        <div className="min-w-0">
          <p className="text-[0.6875rem] uppercase tracking-[0.1em] font-semibold text-ink-2 tabular-nums">
            {formatDateline(now)}
          </p>
          {client.businessName && (
            <h1
              className="mt-0.5 font-semibold text-ink leading-tight truncate"
              style={{ fontSize: 'var(--text-page-title)' }}
              title={client.businessName}
            >
              {client.businessName}
            </h1>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end text-[0.6875rem]">
          <span className="uppercase tracking-[0.1em] font-semibold text-ink-2">
            {planLabel(client.plan)}
          </span>
          <span
            className={`uppercase tracking-[0.1em] font-semibold ${
              client.status === 'active'
                ? 'text-success'
                : client.status === 'pending'
                ? 'text-warning'
                : 'text-ink-2'
            }`}
          >
            {clientStatusLabel(client.status)}
          </span>
          {subscription && (
            <span className="tabular-nums text-ink-2">
              {(subscription.amount / 100).toFixed(2).replace('.', ',')} €/mes
            </span>
          )}
          <Link
            href="/dashboard/mi-plan"
            className="text-brand hover:text-brand-strong font-semibold transition-colors"
          >
            Mi plan
          </Link>
        </div>
      </header>

      <div style={{ marginTop: 'var(--space-section)' }} className="space-y-4">
        {/* Intro card — primera visita, dismissable, jamás vuelve. */}
        <HomeIntroCard />

        {/* AttentionPanel — solo si hay alertas reales */}
        {alerts.length > 0 && <AttentionPanel alerts={alerts} />}

        {/* StatusLine — la respuesta del state machine, densa */}
        <StatusLine state={state} />

        {/* Bloque secundario por estado */}
        <SecondaryBand
          state={state}
          pendingClosure={pendingClosure}
          todayStr={todayStr}
          yesterdayStr={yesterdayStr}
          cashRegisterEnabled={Boolean(client.cashRegisterEnabled)}
          sumupReaderConnected={Boolean(
            client.sumupAccessToken && client.sumupMerchantCode && client.sumupReaderId,
          )}
          clientForActivation={client}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusLine — la respuesta del state machine como tarjeta densa de panel.
// El titular es sans pesado (NUNCA Fraunces, NUNCA clamp editorial): es la
// línea de estado del control panel, no un masthead de revista. Borde +
// tono cálido cuando hay acción pendiente (mismo lenguaje que la Caja).
// ─────────────────────────────────────────────────────────────────────────────

function StatusLine({ state }: { state: HomeState }) {
  const content = renderState(state)
  // El estado 'closingPending' es el único que reclama atención activa —
  // tinte cálido como las citas pendientes de cierre en la agenda.
  const needsAttention = state.kind === 'closingPending'
  return (
    <section
      className={`rounded-control border bg-surface ${
        needsAttention ? 'border-warning/30 bg-warning/5' : 'border-line'
      }`}
      style={{ padding: 'var(--space-card)' }}
    >
      <h2 className="font-bold text-ink leading-tight tracking-[-0.01em] text-2xl sm:text-[1.75rem]">
        {content.lead}
      </h2>
      {content.supporting && (
        <p className="mt-2 text-data text-ink-2 leading-relaxed">
          {content.supporting}
        </p>
      )}
      {content.link && (
        <Link
          href={content.link.href}
          className="mt-3 inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.1em] font-bold text-brand hover:text-brand-strong transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {content.link.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </section>
  )
}

interface MastheadContent {
  lead: string
  supporting: string | null
  link: { label: string; href: string } | null
}

function renderState(state: HomeState): MastheadContent {
  switch (state.kind) {
    case 'pendingActivation':
      return {
        lead: 'Tu bot se está activando.',
        supporting:
          'Termina la configuración. Cuando esté lista, el bot empieza a responder a tus clientes.',
        link: { label: 'Continuar activación', href: '/dashboard/setup' },
      }

    case 'preOpening': {
      const minutes = minutesBetween(currentMadridTime(), state.openTime)
      const tail = state.firstBookingTime
        ? `La primera cita es de ${state.firstBookingCustomer ?? 'tu cliente'} a las ${state.firstBookingTime}.`
        : `Hoy no tienes citas todavía.`
      const totalLine =
        state.totalToday > 0
          ? ` ${pluralizeEs(state.totalToday, 'cita hoy', 'citas hoy')}.`
          : ''
      return {
        lead:
          minutes > 0
            ? `Abres en ${minutes < 60 ? `${minutes} min` : formatHumanDuration(minutes)}.`
            : `Abres ahora.`,
        supporting: tail + totalLine,
        link: { label: 'Ver agenda', href: '/dashboard/agenda' },
      }
    }

    case 'nextImminent': {
      const customer = state.booking.customerName ?? 'tu cliente'
      const when = state.minutesUntil <= 0 ? 'ahora' : `en ${state.minutesUntil} min`
      return {
        lead: `${customer} ${when}.`,
        supporting: `${state.booking.service}${state.booking.barber ? ` con ${state.booking.barber}` : ''}.`,
        link: { label: 'Ver cita', href: '/dashboard/agenda' },
      }
    }

    case 'midShiftGap': {
      if (!state.nextBookingTime) {
        return {
          lead: 'No quedan más citas hoy.',
          supporting: 'Buen momento para descansar o cerrar antes.',
          link: { label: 'Ver agenda', href: '/dashboard/agenda' },
        }
      }
      return {
        lead: `Hueco hasta las ${state.nextBookingTime}.`,
        supporting:
          state.restOfDay.length > 1
            ? `Después: ${pluralizeEs(state.restOfDay.length, 'cita más', 'citas más')} hoy.`
            : 'Una cita más hoy.',
        link: { label: 'Llenar huecos', href: '/dashboard/agenda' },
      }
    }

    case 'closingPending':
      return {
        lead: `Te ${pluralizeEs(state.pendingCount, 'falta', 'faltan')} ${state.pendingCount} ${state.pendingCount === 1 ? 'cierre' : 'cierres'}.`,
        supporting:
          state.closedCount > 0
            ? `Cerraste ${state.closedCount} de ${state.totalToday + state.pendingCount}. Menos de un minuto.`
            : 'Marca quién vino y quién no.',
        link: null,
      }

    case 'done': {
      if (state.shopClosedAllDay) {
        return {
          lead: 'Hoy está cerrado.',
          supporting: state.nextOpen
            ? `Abres ${state.nextOpen.weekday} a las ${state.nextOpen.time}.`
            : 'Disfruta el día.',
          link: null,
        }
      }
      const moneyLine = state.revenueToday > 0 ? `${formatEuros(state.revenueToday)} hoy. ` : ''
      const bookingsLine =
        state.bookingsToday > 0
          ? pluralizeEs(state.bookingsToday, 'cita', 'citas')
          : 'Sin citas hoy'
      const tipsLine = state.tipsToday > 0 ? `, ${pluralizeEs(state.tipsToday, 'propina', 'propinas')}` : ''
      const nextOpenLine = state.nextOpen
        ? ` Abres ${state.nextOpen.weekday} a las ${state.nextOpen.time}.`
        : ''
      return {
        lead: 'Has terminado.',
        supporting: `${moneyLine}${bookingsLine}${tipsLine}.${nextOpenLine}`,
        link: state.revenueToday > 0 ? { label: 'Ver caja', href: '/dashboard/caja' } : null,
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SecondaryBand — bajo el masthead, separado por una línea fina. Solo
// renderiza algo si el estado lo pide. Tipografía pura, sin cards.
// ─────────────────────────────────────────────────────────────────────────────

interface SecondaryBandProps {
  state: HomeState
  pendingClosure: PendingClosureBooking[]
  todayStr: string
  yesterdayStr: string
  cashRegisterEnabled: boolean
  sumupReaderConnected: boolean
  clientForActivation: {
    businessName: string | null
    phone: string | null
    chatbotServices: unknown
    whatsappPhoneNumberId: string | null
    booksyInboundEmail: string | null
    status: string
  }
}

function SecondaryBand({
  state,
  pendingClosure,
  todayStr,
  yesterdayStr,
  cashRegisterEnabled,
  sumupReaderConnected,
  clientForActivation,
}: SecondaryBandProps) {
  if (state.kind === 'pendingActivation') {
    return (
      <PanelSection title="Activación">
        <ActivationSteps client={clientForActivation} />
      </PanelSection>
    )
  }

  if (state.kind === 'closingPending') {
    return (
      <PanelSection title="Pendiente de cierre">
        <PendingClosureList
          bookings={pendingClosure}
          todayStr={todayStr}
          yesterdayStr={yesterdayStr}
          cashRegisterEnabled={cashRegisterEnabled}
          sumupReaderConnected={sumupReaderConnected}
        />
      </PanelSection>
    )
  }

  if (state.kind === 'nextImminent' && state.followUps.length > 0) {
    return (
      <PanelSection title="Después">
        <ul>
          {state.followUps.map((b) => (
            <BookingRow key={b.id} time={b.time} customer={b.customerName} service={b.service} />
          ))}
        </ul>
      </PanelSection>
    )
  }

  if (state.kind === 'midShiftGap' && state.restOfDay.length > 0) {
    return (
      <PanelSection title="Resto del día">
        <ul>
          {state.restOfDay.map((b) => (
            <BookingRow key={b.id} time={b.time} customer={b.customerName} service={b.service} />
          ))}
        </ul>
      </PanelSection>
    )
  }

  return null
}

// PanelSection — contenedor denso (DataPanel-like): header de utilidad
// tintado + cuerpo con borde. Reemplaza al `border-t pt-10` editorial.
function PanelSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-control border border-line bg-surface overflow-hidden">
      <header
        className="border-b border-line px-[var(--space-card)] py-2"
        style={{ background: 'var(--table-head-bg)' }}
      >
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-2">
          {title}
        </p>
      </header>
      <div className="p-[var(--space-card)]">{children}</div>
    </section>
  )
}

function BookingRow({
  time,
  customer,
  service,
}: {
  time: string
  customer: string | null
  service: string
}) {
  return (
    <li className="flex items-baseline gap-3 py-[var(--space-tight)] text-data border-b border-line/70 last:border-b-0">
      <span className="text-brand-strong tabular-nums font-semibold w-12 shrink-0">{time}</span>
      <span className="text-ink truncate">
        {customer || 'Sin nombre'} <span className="text-ink-2">· {service}</span>
      </span>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivationSteps — render plano (numerado) de la activación cuando estamos
// en 'pendingActivation'. Sustituye al ActivationTracker anterior con cards.
// ─────────────────────────────────────────────────────────────────────────────

function ActivationSteps({
  client,
}: {
  client: SecondaryBandProps['clientForActivation']
}) {
  function isServicesFilled(services: unknown): boolean {
    if (services == null) return false
    if (Array.isArray(services)) return services.length > 0
    if (typeof services === 'object') return Object.keys(services as object).length > 0
    return false
  }

  const businessDataDone = Boolean(
    client.businessName && client.phone && isServicesFilled(client.chatbotServices),
  )
  const whatsappDone = Boolean(client.whatsappPhoneNumberId)
  const booksyDone = Boolean(client.booksyInboundEmail)
  const botActive = client.status === 'active'

  const opsPendingSubtitle = 'Lo activa nuestro equipo en 24h. Te avisaremos por WhatsApp.'

  const steps: Array<{ title: string; subtitle: string; done: boolean }> = [
    { title: 'Pago recibido', subtitle: 'Tu suscripción está activa.', done: true },
    {
      title: 'Datos del negocio',
      subtitle: businessDataDone
        ? 'Nombre, teléfono y servicios completados.'
        : 'Añade nombre, teléfono y servicios en la configuración.',
      done: businessDataDone,
    },
    {
      title: 'WhatsApp Business',
      subtitle: whatsappDone
        ? 'Tu número está conectado al bot.'
        : opsPendingSubtitle,
      done: whatsappDone,
    },
    {
      title: 'Booksy sincronizado',
      subtitle: booksyDone
        ? 'Los emails de Booksy se sincronizan con tu agenda.'
        : opsPendingSubtitle,
      done: booksyDone,
    },
    {
      title: 'Bot activo',
      subtitle: botActive
        ? 'El bot está respondiendo a tus clientes 24/7.'
        : 'Se activa cuando los pasos anteriores están listos.',
      done: botActive,
    },
  ]

  return (
    <ol>
      {steps.map((step, idx) => (
        <li
          key={step.title}
          className="flex items-start gap-3 py-[var(--space-tight)] border-b border-line/70 last:border-b-0"
        >
          <div className="shrink-0 mt-0.5">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            ) : (
              <Clock className="h-4 w-4 text-ink-2" aria-hidden="true" />
            )}
            <span className="sr-only">{step.done ? 'Completado' : 'Pendiente'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-data font-semibold text-ink">
              <span className="text-ink-2 mr-1.5 tabular-nums font-medium">{idx + 1}.</span>
              {step.title}
            </p>
            <p className="text-meta text-ink-2 mt-0.5 leading-relaxed">{step.subtitle}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAY_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTH_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function formatDateline(date: Date): string {
  // Formato: "MARTES · 5 DE MAYO".
  const madrid = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const weekday = WEEKDAY_ES[madrid.getDay()].toUpperCase()
  const day = madrid.getDate()
  const month = MONTH_ES[madrid.getMonth()].toUpperCase()
  return `${weekday} · ${day} DE ${month}`
}

function currentMadridTime(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function minutesBetween(fromHHMM: string, toHHMM: string): number {
  const [fH, fM] = fromHHMM.split(':').map(Number)
  const [tH, tM] = toHHMM.split(':').map(Number)
  return tH * 60 + tM - (fH * 60 + fM)
}

function formatHumanDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return pluralizeEs(h, 'hora', 'horas')
  return `${h} h ${m} min`
}

function clientStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Activo'
    case 'pending':
      return 'Pendiente'
    case 'inactive':
      return 'Inactivo'
    default:
      return status
  }
}

function planLabel(plan: string): string {
  // Mapea plan IDs internos a etiquetas humanas. El plan ID en DB puede ser
  // legacy ('chatbot', 'full', 'ads') o nuevo ('solo', 'pro', 'estudio') —
  // muestra siempre algo legible, nunca el enum raw.
  switch (plan) {
    case 'chatbot':
      return 'Chatbot WhatsApp'
    case 'ads':
      return 'Google Ads'
    case 'full':
      return 'Pack completo'
    case 'solo':
      return 'Solo'
    case 'pro':
      return 'Pro'
    case 'estudio':
      return 'Estudio'
    default:
      return plan
  }
}

