export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowLeft, CalendarCheck, UserPlus, Activity, Star } from 'lucide-react'
import { auth } from '@/lib/auth/server'
import { db } from '@/db'
import { bookings, clients, customers, ratings } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import KpiCard, { computeTrend } from '../_components/KpiCard'
import StatsPeriodTabs from '../_components/StatsPeriodTabs'
import {
  type Period,
  resolvePeriod,
  getPeriodStart,
  getPreviousPeriod,
} from '@/lib/dashboard/period'
import { computeOccupancy } from '@/lib/dashboard/occupancy'

// -----------------------------------------------------------------------------
// /dashboard/rendimiento — KPIs del negocio.
//
// Vivían en /dashboard pero el rediseño de la home la libera de cifras (era
// una superficie de "qué toca ahora", no un panel de métricas). Aquí están
// las cuatro KPIs no-monetarias agrupadas con tabs de periodo:
//
//   Visitas · Clientes nuevos · % Ocupación · Nota media
//
// Privacidad: igual que en la home, NO mostramos importe facturado aquí. El
// € vive en /dashboard/caja, donde el barbero entra explícitamente.
//
// Acceso: este surface se accede desde /Más (hub) y desde links contextuales
// en /dashboard/clientes y /dashboard/caja. NO está en el sidebar top-level
// para mantener los 5 items existentes.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function RendimientoPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const period: Period = resolvePeriod(rawPeriod, 'month')
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const now = new Date()
  const periodStart = getPeriodStart(period, now)
  const periodStartIso = periodStart
    ? `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(periodStart.getDate()).padStart(2, '0')}`
    : null

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const nowTime = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

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
  const avgRating =
    kpiRow?.avg_rating !== null && kpiRow?.avg_rating !== undefined
      ? Number(kpiRow.avg_rating)
      : null

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

  const occupancy = periodStart
    ? await computeOccupancy({
        clientId: client.id,
        rangeStart: periodStartIso!,
        rangeEnd: todayStr,
        nowTime,
      })
    : null

  return (
    <div className="p-4 md:p-6 lg:p-10 max-w-4xl mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink mb-6 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Volver al inicio
      </Link>

      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-ink leading-tight">
            Tu negocio
          </h1>
          <p className="text-sm text-ink-2 mt-1">
            Visitas, ocupación y reputación.
          </p>
        </div>
        <Suspense>
          <StatsPeriodTabs />
        </Suspense>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiCard
          icon={CalendarCheck}
          label="Visitas"
          value={visitsCount.toLocaleString('es-ES')}
          trend={computeTrend(visitsCount, visitsPrev)}
        />
        <KpiCard
          icon={UserPlus}
          label="Clientes nuevos"
          value={newCustomers.toLocaleString('es-ES')}
          trend={computeTrend(newCustomers, newCustomersPrev)}
        />
        <KpiCard
          icon={Activity}
          label="Ocupación"
          value={occupancy ? `${occupancy.pct}%` : '—'}
          hint={
            occupancy && occupancy.availableMinutes > 0
              ? `${Math.round(occupancy.availableMinutes / 60 - occupancy.bookedMinutes / 60)}h libres`
              : period === 'lifetime'
              ? 'Elige un periodo'
              : undefined
          }
        />
        <KpiCard
          icon={Star}
          label="Nota media"
          value={avgRating !== null ? `${avgRating.toFixed(1)} / 5` : '—'}
        />
      </section>

      <footer className="border-t border-line pt-4 flex items-center gap-3 flex-wrap text-xs text-ink-2">
        <span>
          Para € e IVA, ve a{' '}
          <Link href="/dashboard/caja" className="text-brand hover:text-brand-strong">
            Caja
          </Link>
          .
        </span>
        <span className="text-line-strong">·</span>
        <span>
          Para tu base de clientes,{' '}
          <Link href="/dashboard/clientes" className="text-brand hover:text-brand-strong">
            Clientes
          </Link>
          .
        </span>
      </footer>
    </div>
  )
}

interface KpiRow {
  visits_count: number
  new_customers: number
  avg_rating: number | null
}
