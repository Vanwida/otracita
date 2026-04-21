import { db } from "@/db"
import { clients, leads, subscriptions, analytics } from "@/db/schema"
import { eq, sql, count, sum } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { Users, CreditCard, MessageCircle, Activity } from "lucide-react"

export default async function AdminOverview() {
  // Summary stats
  const [totalClientsResult] = await db.select({ count: count() }).from(clients)
  const [activeClientsResult] = await db.select({ count: count() }).from(clients).where(eq(clients.status, 'active'))
  const [mrrResult] = await db.select({ total: sum(subscriptions.amount) }).from(subscriptions).where(eq(subscriptions.status, 'active'))
  const [messagesResult] = await db.select({ total: sql<number>`coalesce(sum(${analytics.messagesReplied}), 0)` }).from(analytics)

  const totalClients = totalClientsResult?.count || 0
  const activeClients = activeClientsResult?.count || 0
  const mrr = Number(mrrResult?.total || 0) / 100 // cents to euros
  const totalMessagesHandled = Number(messagesResult?.total || 0)

  // All clients with subscription info
  const allClients = await db.select().from(clients).orderBy(clients.createdAt)
  const allSubs = await db.select().from(subscriptions)
  const allLeads = await db.select().from(leads).orderBy(leads.createdAt)

  // Map subscriptions by clientId for quick lookup
  const subsByClient = new Map<string, typeof allSubs[0]>()
  for (const sub of allSubs) {
    if (sub.status === 'active' || !subsByClient.has(sub.clientId)) {
      subsByClient.set(sub.clientId, sub)
    }
  }

  // Server action to update client status
  async function updateClientStatus(formData: FormData) {
    "use server"
    const clientId = formData.get("clientId") as string
    const newStatus = formData.get("newStatus") as string
    if (!clientId || !newStatus) return

    const updateData: Record<string, unknown> = { status: newStatus, updatedAt: new Date() }
    if (newStatus === 'active') {
      updateData.onboardedAt = new Date()
    }

    await db.update(clients).set(updateData).where(eq(clients.id, clientId))
    revalidatePath("/admin")
  }

  const statusOptions = ['pending', 'onboarding', 'active', 'paused', 'cancelled']

  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto relative z-10">
      <div className="mb-12">
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mb-3 text-ink">
          Panel de Control General
        </h1>
        <p className="text-ink-2 text-lg tracking-wide">
          Administra todos los <span className="text-brand font-semibold">clientes activos</span> del SaaS y los leads entrantes.
        </p>
      </div>

      {/* Summary Stats */}
      <StatGrid>
        <StatCard icon={<Users size={120} />} label="Total Clientes" value={totalClients.toString()} />
        <StatCard icon={<Activity size={120} />} label="Clientes Activos" value={activeClients.toString()} />
        <StatCard icon={<CreditCard size={120} />} label="MRR" value={`${mrr.toFixed(2)} EUR`} />
        <StatCard
          icon={<MessageCircle size={120} />}
          label="Mensajes Gestionados"
          value={totalMessagesHandled.toLocaleString('es-ES')}
        />
      </StatGrid>

      {/* Clients Table */}
      <div className="mb-16">
        <h2 className="text-sm font-bold uppercase tracking-widest text-ink-3 mb-5">
          Clientes Registrados ({allClients.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="min-w-full text-left text-sm text-ink-2">
            <thead className="border-b border-line bg-overlay uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4 font-bold text-ink-3">Negocio</th>
                <th className="px-6 py-4 font-bold text-ink-3">Dueño</th>
                <th className="px-6 py-4 font-bold text-ink-3">Email</th>
                <th className="px-6 py-4 font-bold text-ink-3">Teléfono</th>
                <th className="px-6 py-4 font-bold text-ink-3">Plan</th>
                <th className="px-6 py-4 font-bold text-ink-3">Suscripción</th>
                <th className="px-6 py-4 font-bold text-ink-3">Estado</th>
                <th className="px-6 py-4 font-bold text-ink-3">Creado</th>
                <th className="px-6 py-4 font-bold text-ink-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {allClients.map((client) => {
                const sub = subsByClient.get(client.id)
                return (
                  <tr key={client.id} className="hover:bg-overlay/50 transition-colors group">
                    <td className="px-6 py-5 font-semibold text-ink">{client.businessName}</td>
                    <td className="px-6 py-5 text-ink-2 font-medium">{client.ownerName}</td>
                    <td className="px-6 py-5 text-xs text-ink-3">{client.email}</td>
                    <td className="px-6 py-5 text-xs text-ink-3">{client.phone || '-'}</td>
                    <td className="px-6 py-5 uppercase text-xs font-bold tracking-widest text-brand">{client.plan}</td>
                    <td className="px-6 py-5 text-xs font-medium">
                      {sub ? (
                        <span className="text-success">{(sub.amount / 100).toFixed(2)} EUR/{sub.status}</span>
                      ) : (
                        <span className="text-ink-3">-</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <StatusBadge status={client.status} />
                    </td>
                    <td className="px-6 py-5 text-xs text-ink-3">
                      {client.createdAt ? new Date(client.createdAt).toLocaleDateString('es-ES') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <form action={updateClientStatus} className="flex items-center justify-center gap-3">
                        <input type="hidden" name="clientId" value={client.id} />
                        <select
                          name="newStatus"
                          defaultValue={client.status}
                          className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors cursor-pointer"
                        >
                          {statusOptions.map(s => (
                            <option key={s} value={s}>{s.toUpperCase()}</option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-xl bg-brand text-brand-ink px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-brand-strong transition-colors"
                        >
                          Ok
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
              {allClients.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-ink-3 font-medium tracking-wider">
                    No hay clientes registrados en el sistema.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leads Table */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-ink-3 mb-5">
          Leads Recientes ({allLeads.length})
        </h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="min-w-full text-left text-sm text-ink-2">
            <thead className="border-b border-line bg-overlay uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4 font-bold text-ink-3">Nombre</th>
                <th className="px-6 py-4 font-bold text-ink-3">Negocio</th>
                <th className="px-6 py-4 font-bold text-ink-3">Teléfono</th>
                <th className="px-6 py-4 font-bold text-ink-3">Email</th>
                <th className="px-6 py-4 font-bold text-ink-3">Fuente</th>
                <th className="px-6 py-4 font-bold text-ink-3">Estado</th>
                <th className="px-6 py-4 font-bold text-ink-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {allLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-overlay/50 transition-colors">
                  <td className="px-6 py-5 font-semibold text-ink">{lead.name || "Anónimo"}</td>
                  <td className="px-6 py-5 text-ink-2 font-medium">{lead.businessName || "-"}</td>
                  <td className="px-6 py-5 text-xs text-ink-3 font-mono tracking-wide">{lead.phone}</td>
                  <td className="px-6 py-5 text-xs text-ink-3">{lead.email || "-"}</td>
                  <td className="px-6 py-5 text-xs font-bold tracking-widest uppercase text-brand">{lead.source}</td>
                  <td className="px-6 py-5">
                    <StatusBadge status={lead.status || 'new'} />
                  </td>
                  <td className="px-6 py-5 text-xs text-ink-3">
                    {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('es-ES') : '-'}
                  </td>
                </tr>
              ))}
              {allLeads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-ink-3 font-medium tracking-wider">
                    No hay leads detectados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
      {children}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-brand">
      <div className="absolute -right-4 -top-4 text-brand-softer pointer-events-none">{icon}</div>
      <p className="relative z-10 text-xs font-bold uppercase tracking-widest text-ink-3 mb-3">{label}</p>
      <span className="relative z-10 block font-display text-4xl md:text-5xl font-semibold text-ink">
        {value}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.toLowerCase()

  const styles: Record<string, string> = {
    active: 'bg-success/10 border-success/30 text-success',
    pending: 'bg-warning/10 border-warning/30 text-warning',
    onboarding: 'bg-brand-softer border-brand/30 text-brand-strong',
    paused: 'bg-overlay border-line-strong text-ink-2',
    cancelled: 'bg-danger/10 border-danger/30 text-danger',
    new: 'bg-brand-softer border-brand/30 text-brand-strong',
    contacted: 'bg-gold-soft border-gold/40 text-brand-strong',
    converted: 'bg-success/10 border-success/30 text-success',
    lost: 'bg-overlay border-line-strong text-ink-3',
  }

  const activeStyle = styles[normalizedStatus] || 'bg-overlay border-line-strong text-ink-2'

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${activeStyle}`}>
      {status}
    </span>
  )
}
