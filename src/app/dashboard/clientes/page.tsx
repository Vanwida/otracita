export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { db } from '@/db'
import { clients, customers, bookings, ratings, tips } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Users,
  Repeat,
  Shield,
  Phone,
  Wallet,
  Receipt,
  Heart,
  Star,
  Sparkles,
  Clock,
  Snowflake,
} from 'lucide-react'
import UnblockCustomerButton from '@/app/dashboard/_components/UnblockCustomerButton'
import ForgiveNoShowsButton from '@/app/dashboard/_components/ForgiveNoShowsButton'

// -----------------------------------------------------------------------------
// /dashboard/clientes — listado de clientes de la barbería con stats
// agregadas (gastado, propinas, nota media) y un chip de estado heurístico
// (Habitual / Nuevo / Inactivo).
//
// Datos:
//   · `bookings.price` está en EUROS (no cents — foot-gun documentado en
//     CLAUDE.md). Lo multiplicamos por 100 al normalizar para mostrar.
//   · Aggregates por cliente vía LEFT JOINs en una sola query — evita
//     N round-trips. La tabla escala a ~miles de clientes por barbería
//     sin problema; si crece más, paginar.
//   · Stats globales (facturado, ticket medio, propinas) se computan
//     sobre el set sin filtro para que cambiar el filtro de reputación
//     no altere los KPIs del top.
// -----------------------------------------------------------------------------

type Reputation = 'good' | 'warning' | 'blocked'
type ReputationFilter = Reputation | 'all'

interface Props {
  searchParams: Promise<{ rep?: string }>
}

interface CustomerRow {
  id: string
  phone: string
  name: string | null
  total_bookings: number | null
  no_shows: number | null
  cancellations: number | null
  reputation: string | null
  last_booking_at: Date | null
  spent_cents: number
  tips_cents: number
  rating_count: number
  avg_rating: number | null
  completed_count: number
}

const HABITUAL_DAYS = 30
const INACTIVO_DAYS = 90

export default async function ClientesPage({ searchParams }: Props) {
  const { rep: rawRep } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const repFilter: ReputationFilter =
    rawRep === 'warning' || rawRep === 'blocked' || rawRep === 'good' ? rawRep : 'all'

  // Single SQL — customers + aggregates por LEFT JOIN. Más eficiente que
  // N+1 queries y mantiene la lectura simple en JS.
  const repWhere =
    repFilter === 'all'
      ? sql``
      : sql`AND c.reputation = ${repFilter}`

  const result = await db.execute(sql`
    SELECT
      c.id, c.phone, c.name, c.total_bookings, c.no_shows, c.cancellations,
      c.reputation, c.last_booking_at,
      COALESCE(b.spent_cents, 0)::bigint AS spent_cents,
      COALESCE(b.completed_count, 0)::int AS completed_count,
      COALESCE(t.tips_cents, 0)::bigint AS tips_cents,
      COALESCE(r.rating_count, 0)::int AS rating_count,
      r.avg_rating
    FROM ${customers} c
    LEFT JOIN (
      SELECT customer_phone,
             SUM(price) * 100 AS spent_cents,
             COUNT(*) AS completed_count
      FROM ${bookings}
      WHERE client_id = ${client.id} AND status = 'completed'
      GROUP BY customer_phone
    ) b ON b.customer_phone = c.phone
    LEFT JOIN (
      SELECT customer_phone, SUM(amount_cents) AS tips_cents
      FROM ${tips}
      WHERE client_id = ${client.id} AND status = 'paid'
      GROUP BY customer_phone
    ) t ON t.customer_phone = c.phone
    LEFT JOIN (
      SELECT customer_phone, COUNT(*) AS rating_count, AVG(rating)::float AS avg_rating
      FROM ${ratings}
      WHERE client_id = ${client.id}
      GROUP BY customer_phone
    ) r ON r.customer_phone = c.phone
    WHERE c.client_id = ${client.id}
    ${repWhere}
    ORDER BY c.last_booking_at DESC NULLS LAST
  `)

  const rows = (result as unknown as { rows: CustomerRow[] }).rows.map((r) => ({
    ...r,
    spent_cents: Number(r.spent_cents),
    tips_cents: Number(r.tips_cents),
    completed_count: Number(r.completed_count),
    rating_count: Number(r.rating_count),
    avg_rating: r.avg_rating !== null ? Number(r.avg_rating) : null,
    last_booking_at: r.last_booking_at ? new Date(r.last_booking_at) : null,
  }))

  // Stats globales — siempre sobre TODO el set, no afectados por el filtro.
  // Hacemos otra query separada (en lugar de juntar) porque cambiar el filtro
  // no debe alterar los KPIs y queremos paralelizar si en el futuro añadimos
  // más cosas.
  const globalsResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM ${customers} WHERE client_id = ${client.id})::int AS total_customers,
      (SELECT COUNT(*) FROM ${customers} WHERE client_id = ${client.id} AND COALESCE(total_bookings, 0) >= 2)::int AS recurring,
      (SELECT COUNT(*) FROM ${customers} WHERE client_id = ${client.id} AND reputation = 'blocked')::int AS blocked,
      (SELECT COALESCE(SUM(price), 0) FROM ${bookings} WHERE client_id = ${client.id} AND status = 'completed')::bigint AS billed_eur,
      (SELECT COUNT(*) FROM ${bookings} WHERE client_id = ${client.id} AND status = 'completed')::int AS completed_total,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips} WHERE client_id = ${client.id} AND status = 'paid')::bigint AS tips_total_cents,
      (SELECT AVG(rating)::float FROM ${ratings} WHERE client_id = ${client.id}) AS avg_rating_global
  `)

  const g = (globalsResult as unknown as {
    rows: Array<{
      total_customers: number
      recurring: number
      blocked: number
      billed_eur: number | string
      completed_total: number
      tips_total_cents: number | string
      avg_rating_global: number | null
    }>
  }).rows[0]

  const totalCustomers = Number(g?.total_customers ?? 0)
  const recurring = Number(g?.recurring ?? 0)
  const blocked = Number(g?.blocked ?? 0)
  const billedEur = Number(g?.billed_eur ?? 0)
  const completedTotal = Number(g?.completed_total ?? 0)
  const tipsTotalEur = Number(g?.tips_total_cents ?? 0) / 100
  const avgTicketEur = completedTotal > 0 ? billedEur / completedTotal : 0
  const avgRatingGlobal = g?.avg_rating_global !== null && g?.avg_rating_global !== undefined
    ? Number(g.avg_rating_global)
    : null

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Clientes</h1>
        <p className="text-ink-2">Las personas que han reservado contigo a través del bot.</p>
      </div>

      {/* Top stats — 6 KPIs principales en grid responsive. Bloqueados sigue en
          tono danger porque es señal de problema. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard icon={Users} label="Clientes" value={totalCustomers.toLocaleString('es-ES')} />
        <StatCard icon={Repeat} label="Recurrentes" value={recurring.toLocaleString('es-ES')} hint="Con 2+ reservas" />
        <StatCard
          icon={Wallet}
          label="Facturado"
          value={`${billedEur.toFixed(0)} €`}
          hint="Servicios completados"
        />
        <StatCard
          icon={Receipt}
          label="Ticket medio"
          value={completedTotal > 0 ? `${avgTicketEur.toFixed(2)} €` : '—'}
        />
        <StatCard
          icon={Heart}
          label="Propinas"
          value={tipsTotalEur > 0 ? `${tipsTotalEur.toFixed(2)} €` : '—'}
        />
        <StatCard
          icon={Star}
          label="Nota media"
          value={avgRatingGlobal !== null ? `${avgRatingGlobal.toFixed(1)} / 5` : '—'}
        />
        {/* Bloqueados se muestra solo si hay alguno — ahorra ruido visual. */}
        {blocked > 0 && (
          <StatCard
            icon={Shield}
            label="Bloqueados"
            value={blocked.toLocaleString('es-ES')}
            tone="danger"
          />
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto">
        <FilterPill href="/dashboard/clientes" active={repFilter === 'all'} label="Todos" />
        <FilterPill href="/dashboard/clientes?rep=good" active={repFilter === 'good'} label="Buena" />
        <FilterPill href="/dashboard/clientes?rep=warning" active={repFilter === 'warning'} label="Aviso" />
        <FilterPill href="/dashboard/clientes?rep=blocked" active={repFilter === 'blocked'} label="Bloqueados" />
      </div>

      {/* Table */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="h-8 w-8 text-ink-3" />
            <p className="text-ink-3 text-sm">
              {repFilter === 'all'
                ? 'Aún no tienes clientes registrados. Aparecerán aquí cuando el bot agende su primera reserva.'
                : 'No hay clientes con este filtro.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-overlay border-b border-line">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold text-ink-2">Cliente</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 hidden lg:table-cell">Teléfono</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 text-center">Visitas</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 text-right hidden md:table-cell">Gastado</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 hidden md:table-cell">Última visita</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 text-center hidden sm:table-cell">Nota</th>
                  <th className="px-4 py-3 font-semibold text-ink-2">Estado</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const status = computeStatus(c.last_booking_at, c.total_bookings ?? 0)
                  const reputationVal = (c.reputation as Reputation | null) ?? 'good'
                  return (
                    <tr key={c.id} className="hover:bg-canvas transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{c.name || '—'}</div>
                        <div className="text-xs text-ink-3 lg:hidden flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-2 hidden lg:table-cell">{c.phone}</td>
                      <td className="px-4 py-3 text-center text-ink">
                        {c.total_bookings ?? 0}
                        {(c.no_shows ?? 0) > 0 && (
                          <span className="ml-1.5 text-[10px] text-danger" title={`${c.no_shows} no-shows`}>
                            ({c.no_shows} NS)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-ink hidden md:table-cell tabular-nums">
                        {c.spent_cents > 0 ? `${(c.spent_cents / 100).toFixed(0)} €` : <span className="text-ink-3">—</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-2 hidden md:table-cell">
                        {formatLastVisit(c.last_booking_at)}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        {c.avg_rating !== null ? (
                          <span className="inline-flex items-center gap-1 text-ink">
                            <Star className="h-3 w-3 text-warning fill-warning" />
                            {c.avg_rating.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip status={status} reputation={reputationVal} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {reputationVal === 'blocked' ? (
                          <UnblockCustomerButton customerId={c.id} />
                        ) : (c.no_shows ?? 0) > 0 ? (
                          <ForgiveNoShowsButton customerId={c.id} customerName={c.name} />
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes + helpers
// ─────────────────────────────────────────────────────────────────────────────

type CustomerStatus = 'habitual' | 'nuevo' | 'inactivo' | 'normal'

function computeStatus(lastBookingAt: Date | null, totalBookings: number): CustomerStatus {
  if (totalBookings === 0) return 'normal'
  if (totalBookings === 1) return 'nuevo'
  if (!lastBookingAt) return 'inactivo'
  const daysAgo = Math.floor((Date.now() - lastBookingAt.getTime()) / (1000 * 60 * 60 * 24))
  if (daysAgo > INACTIVO_DAYS) return 'inactivo'
  if (daysAgo <= HABITUAL_DAYS) return 'habitual'
  return 'normal'
}

function StatusChip({ status, reputation }: { status: CustomerStatus; reputation: Reputation }) {
  // La reputación bloqueada/aviso pisa al chip de actividad — es más
  // accionable para el barbero ("este me ha hecho no-shows" gana sobre
  // "este es habitual").
  if (reputation === 'blocked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 text-danger border border-danger/20 px-2.5 py-0.5 text-xs font-medium">
        Bloqueado
      </span>
    )
  }
  if (reputation === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning border border-warning/20 px-2.5 py-0.5 text-xs font-medium">
        Aviso
      </span>
    )
  }
  if (status === 'habitual') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-0.5 text-xs font-medium">
        <Sparkles className="h-3 w-3" />
        Habitual
      </span>
    )
  }
  if (status === 'nuevo') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-softer text-brand-strong border border-brand/20 px-2.5 py-0.5 text-xs font-medium">
        Nuevo
      </span>
    )
  }
  if (status === 'inactivo') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-overlay text-ink-3 border border-line px-2.5 py-0.5 text-xs font-medium">
        <Snowflake className="h-3 w-3" />
        Inactivo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-overlay/60 text-ink-2 border border-line px-2.5 py-0.5 text-xs font-medium">
      <Clock className="h-3 w-3" />
      Normal
    </span>
  )
}

function formatLastVisit(d: Date | null): React.ReactNode {
  if (!d) return <span className="text-ink-3">—</span>
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days}d`
  if (days < 60) return 'hace ~1 mes'
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`
  return `hace ${Math.floor(days / 365)} años`
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: typeof Users
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'danger'
}) {
  const tint = tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-ink-3" />
        <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold truncate">{label}</p>
      </div>
      <p className={`text-xl md:text-2xl font-bold ${tint} tabular-nums`}>{value}</p>
      {hint && <p className="text-[10px] text-ink-3 mt-1">{hint}</p>}
    </div>
  )
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors border ${
        active
          ? 'bg-brand text-brand-ink border-brand'
          : 'bg-surface text-ink-2 border-line hover:border-line-strong hover:text-ink'
      }`}
    >
      {label}
    </Link>
  )
}
