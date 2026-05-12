import Link from "next/link"
import { db } from "@/db"
import { clients, subscriptions, analytics, invoices } from "@/db/schema"
import { eq, sql, desc, and, or, ilike } from "drizzle-orm"
import { ArrowRight, Search, Users, Plus } from "lucide-react"

// -----------------------------------------------------------------------------
// /admin/clients — master list of ALL tenants (paying + pending + paused +
// cancelled), with search and filters. The counterpart of /admin/onboarding
// (which is pending-only kanban view). Rows link to /admin/clients/[id] for
// per-client editing. Intentionally separate from /admin (the control panel
// dashboard) so this view can grow its own filters/search without polluting
// the overview metrics.
// -----------------------------------------------------------------------------

interface SearchParams {
  q?: string
  status?: string
  plan?: string
}

const STATUSES = ['all', 'pending', 'active', 'paused', 'cancelled'] as const
const PLANS = ['all', 'chatbot', 'ads', 'full'] as const // legacy plans kept for historical rows

function Badge({ tone, children }: { tone: 'pending' | 'active' | 'paused' | 'cancelled' | 'neutral'; children: React.ReactNode }) {
  const palette = {
    active: 'bg-success/10 border-success/30 text-success',
    pending: 'bg-warning/10 border-warning/30 text-warning',
    paused: 'bg-overlay border-line-strong text-ink-2',
    cancelled: 'bg-danger/10 border-danger/30 text-danger',
    neutral: 'bg-overlay border-line text-ink-2',
  }[tone]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-xs font-semibold uppercase tracking-wider ${palette}`}>
      {children}
    </span>
  )
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const q = (params.q || '').trim()
  const statusFilter = STATUSES.includes(params.status as typeof STATUSES[number]) ? params.status : 'all'
  const planFilter = PLANS.includes(params.plan as typeof PLANS[number]) ? params.plan : 'all'

  // Build WHERE conditions
  const conditions = []
  if (q) {
    conditions.push(
      or(
        ilike(clients.businessName, `%${q}%`),
        ilike(clients.email, `%${q}%`),
        ilike(clients.phone, `%${q}%`),
      )
    )
  }
  if (statusFilter && statusFilter !== 'all') {
    conditions.push(eq(clients.status, statusFilter))
  }
  if (planFilter && planFilter !== 'all') {
    conditions.push(eq(clients.plan, planFilter))
  }

  const rows = await db
    .select()
    .from(clients)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(clients.createdAt))

  // Aggregate stats per client (subscriptions + bookings + invoices)
  const subs = await db.select().from(subscriptions)
  const subsByClient = new Map<string, typeof subs[0]>()
  for (const s of subs) {
    const existing = subsByClient.get(s.clientId)
    // Prefer active over others; otherwise keep most recent
    if (!existing || (s.status === 'active' && existing.status !== 'active')) {
      subsByClient.set(s.clientId, s)
    }
  }

  // Bookings / messages / invoices counters — one aggregate query per table
  const [analyticsAgg, invoicesAgg] = await Promise.all([
    db
      .select({
        clientId: analytics.clientId,
        messages: sql<number>`coalesce(sum(${analytics.messagesReplied}), 0)`,
        bookings: sql<number>`coalesce(sum(${analytics.bookingsMade}), 0)`,
      })
      .from(analytics)
      .groupBy(analytics.clientId),
    db
      .select({
        clientId: invoices.clientId,
        count: sql<number>`count(*)`,
        totalCents: sql<number>`coalesce(sum(${invoices.totalCents}), 0)`,
      })
      .from(invoices)
      .where(eq(invoices.status, 'issued'))
      .groupBy(invoices.clientId),
  ])

  const analyticsByClient = new Map<string, { messages: number; bookings: number }>()
  for (const a of analyticsAgg) {
    analyticsByClient.set(a.clientId, {
      messages: Number(a.messages || 0),
      bookings: Number(a.bookings || 0),
    })
  }
  const invoicesByClient = new Map<string, { count: number; totalCents: number }>()
  for (const i of invoicesAgg) {
    invoicesByClient.set(i.clientId, {
      count: Number(i.count || 0),
      totalCents: Number(i.totalCents || 0),
    })
  }

  // MRR sum
  const mrrCents = Array.from(subsByClient.values())
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => acc + (s.amount || 0), 0)

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      {/* Header */}
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mb-3 text-ink">
            Clientes
          </h1>
          <p className="text-ink-2 text-lg tracking-wide">
            Todos los clientes del SaaS · <span className="text-brand font-semibold">{rows.length}</span> mostrados · MRR <span className="text-brand font-semibold">{(mrrCents / 100).toFixed(2)} €</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="/api/admin/export/clients.csv"
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand"
          >
            Export CSV
          </a>
          <Link
            href="/admin/clients/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-brand text-brand-ink px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Link>
        </div>
      </div>

      {/* Filters */}
      <form method="get" className="mb-8 flex flex-col lg:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por negocio, email o teléfono…"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface border border-line text-ink placeholder:text-ink-3 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-sm transition-colors"
          />
        </div>
        <select
          name="status"
          defaultValue={statusFilter}
          className="px-4 py-3 rounded-xl bg-surface border border-line text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-colors cursor-pointer"
        >
          <option value="all">Todos los estados</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          name="plan"
          defaultValue={planFilter}
          className="px-4 py-3 rounded-xl bg-surface border border-line text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-colors cursor-pointer"
        >
          <option value="all">Todos los planes</option>
          <option value="chatbot">Chatbot</option>
          <option value="ads">Ads (legacy)</option>
          <option value="full">Full (legacy)</option>
        </select>
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-brand text-brand-ink text-sm font-semibold transition-colors hover:bg-brand-strong"
        >
          Filtrar
        </button>
      </form>

      {/* Clients table */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-16 text-center">
          <Users className="mx-auto h-12 w-12 text-ink-3 mb-4" />
          <p className="text-ink-2">No hay clientes que coincidan con los filtros.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="min-w-full text-left text-sm text-ink-2">
            <thead className="border-b border-line bg-overlay uppercase tracking-wider text-xs">
              <tr>
                <th className="px-5 py-4 font-bold text-ink-3">Negocio</th>
                <th className="px-5 py-4 font-bold text-ink-3">Email</th>
                <th className="px-5 py-4 font-bold text-ink-3">Estado</th>
                <th className="px-5 py-4 font-bold text-ink-3">Plan</th>
                <th className="px-5 py-4 font-bold text-ink-3 text-right">Mensajes</th>
                <th className="px-5 py-4 font-bold text-ink-3 text-right">Reservas</th>
                <th className="px-5 py-4 font-bold text-ink-3 text-right">Facturas</th>
                <th className="px-5 py-4 font-bold text-ink-3 text-right">Facturado</th>
                <th className="px-5 py-4 font-bold text-ink-3">Creado</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => {
                const analyticsRow = analyticsByClient.get(c.id) || { messages: 0, bookings: 0 }
                const invoiceRow = invoicesByClient.get(c.id) || { count: 0, totalCents: 0 }
                const status = c.status as 'pending' | 'active' | 'paused' | 'cancelled'
                return (
                  <tr key={c.id} className="hover:bg-overlay/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">{c.businessName || <span className="italic text-ink-3">sin nombre</span>}</p>
                      {c.phone && <p className="text-xs text-ink-3 mt-0.5 font-mono">{c.phone}</p>}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-ink-2">{c.email}</td>
                    <td className="px-5 py-4"><Badge tone={status || 'neutral'}>{c.status}</Badge></td>
                    <td className="px-5 py-4 uppercase text-xs tracking-wider text-ink-2">{c.plan}</td>
                    <td className="px-5 py-4 text-right font-mono text-ink-2">{analyticsRow.messages.toLocaleString('es-ES')}</td>
                    <td className="px-5 py-4 text-right font-mono text-ink-2">{analyticsRow.bookings.toLocaleString('es-ES')}</td>
                    <td className="px-5 py-4 text-right font-mono text-ink-2">{invoiceRow.count.toLocaleString('es-ES')}</td>
                    <td className="px-5 py-4 text-right font-mono text-brand">{(invoiceRow.totalCents / 100).toFixed(2)} €</td>
                    <td className="px-5 py-4 text-xs text-ink-3">{new Date(c.createdAt).toLocaleDateString('es-ES')}</td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/clients/${c.id}`}
                        className="inline-flex items-center gap-1 text-brand hover:text-brand-strong font-semibold text-sm transition-colors"
                      >
                        Editar <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
