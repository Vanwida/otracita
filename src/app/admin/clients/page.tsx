import Link from "next/link"
import { db } from "@/db"
import { clients, subscriptions, analytics, invoices } from "@/db/schema"
import { eq, sql, desc, and, or, ilike } from "drizzle-orm"
import { ArrowRight, Search, Users } from "lucide-react"

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
    active: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    pending: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    paused: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
    cancelled: 'bg-red-500/10 border-red-500/30 text-red-300',
    neutral: 'bg-white/5 border-white/10 text-indigo-200/70',
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
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-indigo-300 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">
          Clientes
        </h1>
        <p className="text-indigo-200/70 text-lg font-medium tracking-wide">
          Todos los clientes del SaaS · <span className="text-cyan-400">{rows.length}</span> mostrados · MRR <span className="text-cyan-400">{(mrrCents / 100).toFixed(2)} €</span>
        </p>
      </div>

      {/* Filters */}
      <form method="get" className="mb-8 flex flex-col lg:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-300/50" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por negocio, email o teléfono…"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#04040A] border border-indigo-500/20 text-indigo-100 placeholder:text-indigo-200/30 focus:border-indigo-400/60 focus:outline-none text-sm"
          />
        </div>
        <select
          name="status"
          defaultValue={statusFilter}
          className="px-4 py-3 rounded-xl bg-[#04040A] border border-indigo-500/20 text-indigo-100 text-sm focus:border-indigo-400/60 focus:outline-none"
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
          className="px-4 py-3 rounded-xl bg-[#04040A] border border-indigo-500/20 text-indigo-100 text-sm focus:border-indigo-400/60 focus:outline-none"
        >
          <option value="all">Todos los planes</option>
          <option value="chatbot">Chatbot</option>
          <option value="ads">Ads (legacy)</option>
          <option value="full">Full (legacy)</option>
        </select>
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20 hover:border-indigo-400/50 text-sm font-semibold transition-colors"
        >
          Filtrar
        </button>
      </form>

      {/* Clients table */}
      {rows.length === 0 ? (
        <div className="rounded-3xl border border-indigo-500/20 bg-[#05050A]/80 backdrop-blur-2xl p-16 text-center">
          <Users className="mx-auto h-12 w-12 text-indigo-300/30 mb-4" />
          <p className="text-indigo-200/70">No hay clientes que coincidan con los filtros.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-indigo-500/20 bg-[#05050A]/80 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
          <table className="min-w-full text-left text-sm text-indigo-100/70">
            <thead className="border-b border-indigo-500/20 bg-indigo-500/5 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-5 py-4 font-bold text-indigo-300">Negocio</th>
                <th className="px-5 py-4 font-bold text-indigo-300">Email</th>
                <th className="px-5 py-4 font-bold text-indigo-300">Estado</th>
                <th className="px-5 py-4 font-bold text-indigo-300">Plan</th>
                <th className="px-5 py-4 font-bold text-indigo-300 text-right">Mensajes</th>
                <th className="px-5 py-4 font-bold text-indigo-300 text-right">Reservas</th>
                <th className="px-5 py-4 font-bold text-indigo-300 text-right">Facturas</th>
                <th className="px-5 py-4 font-bold text-indigo-300 text-right">Facturado</th>
                <th className="px-5 py-4 font-bold text-indigo-300">Creado</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-500/10">
              {rows.map((c) => {
                const analyticsRow = analyticsByClient.get(c.id) || { messages: 0, bookings: 0 }
                const invoiceRow = invoicesByClient.get(c.id) || { count: 0, totalCents: 0 }
                const status = c.status as 'pending' | 'active' | 'paused' | 'cancelled'
                return (
                  <tr key={c.id} className="hover:bg-indigo-500/5 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-indigo-100">{c.businessName || <span className="italic text-indigo-200/40">sin nombre</span>}</p>
                      {c.phone && <p className="text-xs text-indigo-200/50 mt-0.5 font-mono">{c.phone}</p>}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-indigo-200/70">{c.email}</td>
                    <td className="px-5 py-4"><Badge tone={status || 'neutral'}>{c.status}</Badge></td>
                    <td className="px-5 py-4 uppercase text-xs tracking-wider text-indigo-200">{c.plan}</td>
                    <td className="px-5 py-4 text-right font-mono">{analyticsRow.messages.toLocaleString('es-ES')}</td>
                    <td className="px-5 py-4 text-right font-mono">{analyticsRow.bookings.toLocaleString('es-ES')}</td>
                    <td className="px-5 py-4 text-right font-mono">{invoiceRow.count.toLocaleString('es-ES')}</td>
                    <td className="px-5 py-4 text-right font-mono text-cyan-300">{(invoiceRow.totalCents / 100).toFixed(2)} €</td>
                    <td className="px-5 py-4 text-xs text-indigo-200/50">{new Date(c.createdAt).toLocaleDateString('es-ES')}</td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/clients/${c.id}`}
                        className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100 font-semibold text-sm"
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
