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
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-indigo-300 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">
          Panel de Control General
        </h1>
        <p className="text-indigo-200/70 text-lg font-medium tracking-wide">
          Administra todos los <span className="text-cyan-400 font-semibold drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">clientes activos</span> del SaaS y los leads entrantes.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        <div className="group bg-[#04040A] border border-indigo-500/20 rounded-3xl p-7 backdrop-blur-2xl relative overflow-hidden transition-all duration-500 hover:border-indigo-400/50 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]">
          <div className="absolute -right-4 -top-4 text-indigo-500/10 group-hover:text-indigo-400/20 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12"><Users size={120} /></div>
          <p className="relative z-10 text-sm font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-blue-400 mb-3 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">Total Clientes</p>
          <span className="relative z-10 text-5xl font-black text-white drop-shadow-md">{totalClients}</span>
        </div>
        
        <div className="group bg-[#020A0A] border border-cyan-500/20 rounded-3xl p-7 backdrop-blur-2xl relative overflow-hidden transition-all duration-500 hover:border-cyan-400/50 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]">
          <div className="absolute -right-4 -top-4 text-cyan-500/10 group-hover:text-cyan-400/20 transition-all duration-500 group-hover:scale-110 group-hover:rotate-12"><Activity size={120} /></div>
          <p className="relative z-10 text-sm font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-teal-400 mb-3 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">Clientes Activos</p>
          <span className="relative z-10 text-5xl font-black text-white drop-shadow-md">{activeClients}</span>
        </div>
        
        <div className="group bg-[#0A0704] border border-amber-500/20 rounded-3xl p-7 backdrop-blur-2xl relative overflow-hidden transition-all duration-500 hover:border-amber-400/50 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]">
          <div className="absolute -right-4 -top-4 text-amber-500/10 group-hover:text-amber-400/20 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12"><CreditCard size={120} /></div>
          <p className="relative z-10 text-sm font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400 mb-3 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">MRR</p>
          <span className="relative z-10 text-5xl font-black text-white drop-shadow-md">{mrr.toFixed(2)} EUR</span>
        </div>
        
        <div className="group bg-[#08020A] border border-purple-500/20 rounded-3xl p-7 backdrop-blur-2xl relative overflow-hidden transition-all duration-500 hover:border-purple-400/50 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]">
          <div className="absolute -right-4 -top-4 text-purple-500/10 group-hover:text-purple-400/20 transition-all duration-500 group-hover:scale-110 group-hover:rotate-12"><MessageCircle size={120} /></div>
          <p className="relative z-10 text-sm font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-fuchsia-400 mb-3 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">Mensajes Gestionados</p>
          <span className="relative z-10 text-5xl font-black text-white drop-shadow-md">{totalMessagesHandled.toLocaleString('es-ES')}</span>
        </div>
      </div>

      {/* Clients Table */}
      <div className="mb-16">
        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-cyan-300 uppercase tracking-widest mb-6 drop-shadow-[0_0_5px_rgba(165,180,252,0.4)]">
          Clientes Registrados ({allClients.length})
        </h2>
        <div className="overflow-x-auto rounded-3xl border border-indigo-500/20 bg-[#05050A]/80 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
          <table className="min-w-full text-left text-sm text-indigo-100/70">
            <thead className="border-b border-indigo-500/20 bg-indigo-500/5 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-5 font-bold text-indigo-300">Negocio</th>
                <th className="px-6 py-5 font-bold text-indigo-300">Dueño</th>
                <th className="px-6 py-5 font-bold text-indigo-300">Email</th>
                <th className="px-6 py-5 font-bold text-indigo-300">Teléfono</th>
                <th className="px-6 py-5 font-bold text-indigo-300">Plan</th>
                <th className="px-6 py-5 font-bold text-indigo-300">Suscripción</th>
                <th className="px-6 py-5 font-bold text-indigo-300">Estado</th>
                <th className="px-6 py-5 font-bold text-indigo-300">Creado</th>
                <th className="px-6 py-5 font-bold text-indigo-300 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-500/10">
              {allClients.map((client) => {
                const sub = subsByClient.get(client.id)
                return (
                  <tr key={client.id} className="hover:bg-indigo-500/5 transition-colors group">
                    <td className="px-6 py-5 font-semibold text-white drop-shadow-md group-hover:text-cyan-100 transition-colors">{client.businessName}</td>
                    <td className="px-6 py-5 font-medium">{client.ownerName}</td>
                    <td className="px-6 py-5 text-xs text-indigo-200/50">{client.email}</td>
                    <td className="px-6 py-5 text-xs text-indigo-200/50">{client.phone || '-'}</td>
                    <td className="px-6 py-5 uppercase text-xs font-black tracking-widest text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">{client.plan}</td>
                    <td className="px-6 py-5 text-xs font-medium">
                      {sub ? (
                        <span className="text-emerald-400 drop-shadow-[0_0_3px_rgba(52,211,153,0.5)]">{(sub.amount / 100).toFixed(2)} EUR/{sub.status}</span>
                      ) : (
                        <span className="text-indigo-500/50">-</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <StatusBadge status={client.status} />
                    </td>
                    <td className="px-6 py-5 text-xs text-indigo-300/40">
                      {client.createdAt ? new Date(client.createdAt).toLocaleDateString('es-ES') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <form action={updateClientStatus} className="flex items-center justify-center gap-3 opacity-50 group-hover:opacity-100 transition-opacity">
                        <input type="hidden" name="clientId" value={client.id} />
                        <select
                          name="newStatus"
                          defaultValue={client.status}
                          className="rounded-xl border border-indigo-500/20 bg-[#0A0A12] px-3 py-2 text-xs font-semibold text-indigo-200 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all cursor-pointer shadow-inner"
                        >
                          {statusOptions.map(s => (
                            <option key={s} value={s} className="bg-[#0A0A12]">{s.toUpperCase()}</option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-indigo-300 hover:bg-cyan-500/20 hover:border-cyan-500/40 hover:text-cyan-300 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all"
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
                  <td colSpan={9} className="px-6 py-12 text-center text-indigo-300/40 font-medium tracking-wider">NO HAY CLIENTES REGISTRADOS EN EL SISTEMA CORE.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leads Table */}
      <div>
        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-rose-300 uppercase tracking-widest mb-6 drop-shadow-[0_0_5px_rgba(244,114,182,0.4)]">
          Leads Recientes ({allLeads.length})
        </h2>
        <div className="overflow-hidden rounded-3xl border border-pink-500/20 bg-[#0A0507]/80 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
          <table className="min-w-full text-left text-sm text-pink-100/70">
            <thead className="border-b border-pink-500/20 bg-pink-500/5 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-5 font-bold text-pink-300">Nombre</th>
                <th className="px-6 py-5 font-bold text-pink-300">Negocio</th>
                <th className="px-6 py-5 font-bold text-pink-300">Teléfono</th>
                <th className="px-6 py-5 font-bold text-pink-300">Email</th>
                <th className="px-6 py-5 font-bold text-pink-300">Fuente</th>
                <th className="px-6 py-5 font-bold text-pink-300">Estado</th>
                <th className="px-6 py-5 font-bold text-pink-300">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-500/10">
              {allLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-pink-500/5 transition-colors group">
                  <td className="px-6 py-5 font-semibold text-white drop-shadow-md group-hover:text-pink-100 transition-colors">{lead.name || "Anónimo"}</td>
                  <td className="px-6 py-5 font-medium">{lead.businessName || "-"}</td>
                  <td className="px-6 py-5 text-xs text-pink-200/60 font-mono tracking-wide">{lead.phone}</td>
                  <td className="px-6 py-5 text-xs text-pink-200/60">{lead.email || "-"}</td>
                  <td className="px-6 py-5 text-xs font-bold tracking-widest uppercase text-pink-400/80">{lead.source}</td>
                  <td className="px-6 py-5">
                    <StatusBadge status={lead.status || 'new'} />
                  </td>
                  <td className="px-6 py-5 text-xs text-pink-300/40">
                    {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('es-ES') : '-'}
                  </td>
                </tr>
              ))}
              {allLeads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-pink-300/40 font-medium tracking-wider">NO HAY LEADS DETECTADOS EN EL NODO ACTUAL.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.toLowerCase();
  
  // High-tech neon glow badges
  const styles: Record<string, string> = {
    active: "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
    pending: "bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
    onboarding: "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]",
    paused: "bg-orange-500/10 border border-orange-500/30 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.2)]",
    cancelled: "bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]",
    new: "bg-purple-500/10 border border-purple-500/30 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)]",
    contacted: "bg-blue-500/10 border border-blue-500/30 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]",
    converted: "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
    lost: "bg-gray-500/10 border border-gray-500/30 text-gray-400",
  }
  
  const activeStyle = styles[normalizedStatus] || "bg-indigo-500/10 border border-indigo-500/30 text-indigo-400";
  
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md ${activeStyle}`}>
      {status}
    </span>
  )
}
