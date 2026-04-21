import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/db"
import { analytics, clients, subscriptions, bookings, customers } from "@/db/schema"
import { eq, sql, gte, and, or } from "drizzle-orm"
import { CalendarCheck, CheckCircle2, CreditCard, AlertCircle, Clock, User, Scissors, Wrench, ArrowRight } from "lucide-react"
import { auth } from "@/lib/auth/server";
import NoShowButton from "./_components/NoShowButton";
import StatsPeriodTabs from "./_components/StatsPeriodTabs";
import { Suspense } from "react";

export default async function DashboardOverview({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period = 'lifetime' } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // Get client details
  const clientRecords = await db.select().from(clients).where(eq(clients.email, session.user.email))
  const client = clientRecords[0]

  // No client record at all — user hasn't been through Stripe yet. Push to
  // the setup wizard which will create the record.
  if (!client) {
    redirect("/dashboard/setup");
  }

  // Pending clients stay on the dashboard and see a prominent CTA below —
  // setup is no longer a forced redirect.
  const isPending = client.status === 'pending'

  // Compute period start date
  const now = new Date()
  let periodStart: Date | null = null
  if (period === 'day') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (period === 'week') {
    periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (period === 'month') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  // Get analytics data filtered by period
  let uniqueClients = 0
  let totalReplied = 0
  let totalBookings = 0
  let totalCancelled = 0

  if (client) {
    const statsWhere = periodStart
      ? and(eq(analytics.clientId, client.id), gte(analytics.date, periodStart))
      : eq(analytics.clientId, client.id)

    const stats = await db
      .select({
        totalReplied: sql<number>`coalesce(sum(${analytics.messagesReplied}), 0)`,
        totalBookings: sql<number>`coalesce(sum(${analytics.bookingsMade}), 0)`,
        totalCancelled: sql<number>`coalesce(sum(${analytics.bookingsCancelled}), 0)`,
      })
      .from(analytics)
      .where(statsWhere)

    if (stats[0]) {
      totalReplied = Number(stats[0].totalReplied) || 0
      totalBookings = Number(stats[0].totalBookings) || 0
      totalCancelled = Number(stats[0].totalCancelled) || 0
    }

    // Count unique customers (distinct phone numbers) for this period
    const customersWhere = periodStart
      ? and(eq(customers.clientId, client.id), gte(customers.createdAt, periodStart))
      : eq(customers.clientId, client.id)

    const clientCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(customersWhere)

    uniqueClients = Number(clientCount[0]?.count) || 0
  }

  // Get subscription info
  let subscription = null
  if (client) {
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.clientId, client.id))
    subscription = subs[0] || null
  }

  // Get upcoming bookings (today + next 7 days) + yesterday's confirmed (for no-show marking)
  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const upcomingBookings = client
    ? await db.select().from(bookings).where(
        and(
          eq(bookings.clientId, client.id),
          or(eq(bookings.status, 'confirmed'), eq(bookings.status, 'no_show')),
          gte(bookings.date, yesterdayStr)
        )
      ).then(rows => rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 30))
    : []

  // Get customer reputation data indexed by phone
  const customerPhones = [...new Set(upcomingBookings.map(b => b.customerPhone))]
  const customerMap: Record<string, { reputation: string | null; noShows: number | null }> = {}
  if (customerPhones.length > 0 && client) {
    const customerRows = await db.select().from(customers).where(eq(customers.clientId, client.id))
    for (const c of customerRows) {
      customerMap[c.phone] = { reputation: c.reputation, noShows: c.noShows }
    }
  }

  const todayBookings = upcomingBookings.filter(b => b.date === todayStr)
  const yesterdayBookings = upcomingBookings.filter(b => b.date === yesterdayStr)
  const futureBookings = upcomingBookings.filter(b => b.date > todayStr)

  const nowTime = new Date().toTimeString().slice(0, 5) // HH:MM

  const hasData = uniqueClients > 0 || totalReplied > 0 || totalBookings > 0

  return (
    <div className="p-4 md:p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-6 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-ink mb-2">
            Hola, <span className="text-brand">{client?.businessName || session.user.email.split('@')[0]}</span>
          </h1>
          <p className="text-ink-2 text-base">
            Resumen del rendimiento de tu chatbot IA.
          </p>
        </div>

        {isPending && (
          <div className="bg-surface border border-line px-4 py-2 rounded-xl text-sm font-semibold text-warning flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
            Configuración pendiente
          </div>
        )}
      </div>

      {isPending && (
        <div className="mb-8 bg-brand-softer border border-brand/30 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
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
      )}

      {isPending && (
        <ActivationTracker client={client} />
      )}

      {/* Plan & Subscription Info */}
      {client && (
        <div className="mb-8 flex items-center gap-3 flex-wrap">
          <div className="bg-surface border border-line rounded-xl px-4 py-2 text-sm font-medium text-ink-2 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-ink-3" />
            Plan: <span className="uppercase text-ink ml-1">{client.plan}</span>
          </div>
          <div className={`rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2 border ${
            client.status === 'active'
              ? 'bg-surface border-line text-success'
              : client.status === 'pending'
                ? 'bg-surface border-line text-warning'
                : 'bg-surface border-line text-ink-3'
          }`}>
            Estado: <span className="uppercase tracking-wide ml-1">{client.status}</span>
          </div>
          {subscription && (
            <div className="bg-surface border border-line rounded-xl px-4 py-2 text-sm font-medium text-ink-2">
              {(subscription.amount / 100).toFixed(2)} EUR/mes
              <span className="mx-2 text-line-strong">&bull;</span>
              <span className="uppercase tracking-wide text-ink-3">{subscription.status}</span>
            </div>
          )}
        </div>
      )}

      {!hasData && !isPending && (
        <div className="mb-8 bg-surface border border-line rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-4">
          <AlertCircle className="h-8 w-8 text-warning shrink-0" />
          <div>
            <p className="text-warning font-semibold text-base mb-0.5">Tu chatbot aún no tiene datos</p>
            <p className="text-ink-2 text-sm leading-relaxed max-w-2xl">
              Los datos aparecerán aquí cuando tu chatbot empiece a recibir y responder mensajes por WhatsApp.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-ink-2">Estadísticas</h2>
        <Suspense>
          <StatsPeriodTabs />
        </Suspense>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {/* Messages Received */}
        <div className="bg-surface border border-line rounded-xl p-4 md:p-6 hover:bg-canvas transition-colors">
          <p className="text-sm text-ink-2 mb-3">Clientes Contactados</p>
          <span className="text-3xl md:text-4xl font-bold text-ink">{uniqueClients.toLocaleString('es-ES')}</span>
        </div>

        {/* Messages Replied */}
        <div className="bg-surface border border-line rounded-xl p-4 md:p-6 hover:bg-canvas transition-colors">
          <p className="text-sm text-ink-2 mb-3">Mensajes Respondidos</p>
          <span className="text-3xl md:text-4xl font-bold text-ink">{totalReplied.toLocaleString('es-ES')}</span>
        </div>

        {/* Bookings Made */}
        <div className="bg-surface border border-line rounded-xl p-4 md:p-6 hover:bg-canvas transition-colors">
          <p className="text-sm text-ink-2 mb-3">Reservas Realizadas</p>
          <span className="text-3xl md:text-4xl font-bold text-ink">{totalBookings.toLocaleString('es-ES')}</span>
        </div>

        {/* Bookings Cancelled */}
        <div className="bg-surface border border-line rounded-xl p-4 md:p-6 hover:bg-canvas transition-colors">
          <p className="text-sm text-ink-2 mb-3">Reservas Canceladas</p>
          <span className="text-3xl md:text-4xl font-bold text-ink">{totalCancelled.toLocaleString('es-ES')}</span>
        </div>
      </div>

      {/* Bookings */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Reservas</h2>
          <span className="text-xs text-ink-2">
            {upcomingBookings.filter(b => b.status === 'confirmed').length} confirmadas
          </span>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CalendarCheck className="h-8 w-8 text-ink-3" />
            <p className="text-ink-3 text-sm">No hay reservas próximas</p>
          </div>
        ) : (
          <div className="divide-y divide-line">

            {/* Yesterday — needs no-show attention */}
            {yesterdayBookings.length > 0 && (
              <>
                <div className="px-4 py-2 md:px-6 bg-overlay">
                  <span className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Ayer</span>
                </div>
                {yesterdayBookings.map(b => (
                  <BookingRow key={b.id} booking={b} customer={customerMap[b.customerPhone]} canMarkNoShow={true} nowTime={nowTime} />
                ))}
              </>
            )}

            {/* Today */}
            {todayBookings.length > 0 && (
              <>
                <div className="px-4 py-2 md:px-6 bg-overlay">
                  <span className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Hoy</span>
                </div>
                {todayBookings.map(b => (
                  <BookingRow key={b.id} booking={b} customer={customerMap[b.customerPhone]} canMarkNoShow={b.time <= nowTime} nowTime={nowTime} />
                ))}
              </>
            )}

            {/* Upcoming — grouped by date */}
            {futureBookings.length > 0 && (() => {
              const grouped: Record<string, typeof futureBookings> = {}
              for (const b of futureBookings) {
                if (!grouped[b.date]) grouped[b.date] = []
                grouped[b.date].push(b)
              }
              return Object.entries(grouped).map(([date, rows]) => {
                const d = new Date(date + 'T00:00:00')
                const label = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
                return (
                  <div key={date}>
                    <div className="px-4 py-2 md:px-6 bg-overlay">
                      <span className="text-xs font-semibold text-ink-2 uppercase tracking-wider">{label}</span>
                    </div>
                    {rows.map(b => (
                      <BookingRow key={b.id} booking={b} customer={customerMap[b.customerPhone]} canMarkNoShow={false} nowTime={nowTime} />
                    ))}
                  </div>
                )
              })
            })()}

          </div>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Activation tracker — shown while client.status === 'pending'.
//
// 5 steps, each derived from fields on the `clients` row. Steps 3 and 4 flip
// to "done" when our ops team wires up WhatsApp / Booksy for the client —
// typically within 24h of signup.
// -----------------------------------------------------------------------------

type ClientForTracker = {
  businessName: string | null;
  phone: string | null;
  chatbotServices: unknown;
  whatsappPhoneNumberId: string | null;
  booksyInboundEmail: string | null;
  status: string;
};

function isServicesFilled(services: unknown): boolean {
  if (services == null) return false;
  if (Array.isArray(services)) return services.length > 0;
  if (typeof services === 'object') return Object.keys(services as object).length > 0;
  return false;
}

function ActivationTracker({ client }: { client: ClientForTracker }) {
  const businessDataDone = Boolean(
    client.businessName &&
      client.phone &&
      isServicesFilled(client.chatbotServices)
  );
  const whatsappDone = Boolean(client.whatsappPhoneNumberId);
  const booksyDone = Boolean(client.booksyInboundEmail);
  const botActive = client.status === 'active';

  const opsPendingSubtitle =
    'Nuestro equipo lo activa en 24h · Te avisaremos por WhatsApp cuando esté listo.';

  const steps: Array<{ title: string; subtitle: string; done: boolean }> = [
    {
      title: 'Pago recibido',
      subtitle: 'Tu suscripción está activa.',
      done: true,
    },
    {
      title: 'Datos del negocio',
      subtitle: businessDataDone
        ? 'Nombre, teléfono y servicios completados.'
        : 'Añade el nombre, teléfono y servicios en la configuración.',
      done: businessDataDone,
    },
    {
      title: 'WhatsApp Business conectado',
      subtitle: whatsappDone
        ? 'Tu número de WhatsApp Business está conectado al bot.'
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
        : 'Se activa automáticamente cuando los pasos anteriores estén listos.',
      done: botActive,
    },
  ];

  return (
    <div className="mb-8 bg-surface border border-line rounded-2xl p-5 md:p-6">
      <h2 className="font-display text-2xl md:text-3xl font-semibold text-ink mb-1">
        Activando tu bot
      </h2>
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
              <span className="sr-only">
                {step.done ? 'Completado' : 'Pendiente'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm md:text-base font-semibold text-ink">
                {idx + 1}. {step.title}
              </p>
              <p className="text-xs md:text-sm text-ink-2 mt-0.5 leading-relaxed">
                {step.subtitle}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BookingRow({
  booking,
  customer,
  canMarkNoShow,
}: {
  booking: { id: string; customerName: string | null; customerPhone: string; service: string; barber: string | null; date: string; time: string; status: string }
  customer?: { reputation: string | null; noShows: number | null }
  canMarkNoShow: boolean
  nowTime: string
}) {
  const isNoShow = booking.status === 'no_show'
  const rep = customer?.reputation ?? 'good'

  return (
    <div className={`px-4 py-3 md:px-6 md:py-4 flex items-center gap-4 ${isNoShow ? 'opacity-50' : ''}`}>
      {/* Time */}
      <div className="flex items-center gap-1.5 w-14 shrink-0">
        <Clock className="h-3.5 w-3.5 text-ink-3" />
        <span className="text-sm font-mono text-ink-2">{booking.time}</span>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="h-7 w-7 rounded-full bg-overlay border border-line flex items-center justify-center shrink-0">
          <User className="h-3.5 w-3.5 text-ink-3" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-ink font-medium truncate">
            {booking.customerName || booking.customerPhone}
          </p>
          {booking.customerName && (
            <p className="text-xs text-ink-3 truncate">{booking.customerPhone}</p>
          )}
        </div>
        {rep === 'warning' && (
          <span className="shrink-0 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-0.5">2 no-shows</span>
        )}
        {rep === 'blocked' && (
          <span className="shrink-0 text-xs bg-red-50 text-red-500 border border-red-200 rounded px-1.5 py-0.5">Bloqueado</span>
        )}
      </div>

      {/* Service */}
      <div className="hidden md:flex items-center gap-1.5 w-48 shrink-0">
        <Scissors className="h-3.5 w-3.5 text-ink-3 shrink-0" />
        <span className="text-sm text-ink-2 truncate">{booking.service}</span>
        {booking.barber && (
          <span className="text-line-strong">·</span>
        )}
        {booking.barber && (
          <span className="text-sm text-ink-3 truncate">{booking.barber}</span>
        )}
      </div>

      {/* Status / Action */}
      <div className="shrink-0 ml-auto">
        {isNoShow ? (
          <NoShowButton bookingId={booking.id} initiallyMarked={true} />
        ) : canMarkNoShow ? (
          <NoShowButton bookingId={booking.id} />
        ) : (
          <span className="text-xs text-success font-medium">Confirmada</span>
        )}
      </div>
    </div>
  )
}
