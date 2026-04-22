export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { db } from '@/db'
import { clients, customers } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { Users, Repeat, Shield, Phone } from 'lucide-react'
import UnblockCustomerButton from '@/app/dashboard/_components/UnblockCustomerButton'
import ForgiveNoShowsButton from '@/app/dashboard/_components/ForgiveNoShowsButton'

type Reputation = 'good' | 'warning' | 'blocked'
type ReputationFilter = Reputation | 'all'

interface Props {
  searchParams: Promise<{ rep?: string }>
}

export default async function ClientesPage({ searchParams }: Props) {
  const { rep: rawRep } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const repFilter: ReputationFilter = rawRep === 'warning' || rawRep === 'blocked' || rawRep === 'good' ? rawRep : 'all'

  // Load all customers for this tenant, most-recent-booking first.
  const rows = await db
    .select()
    .from(customers)
    .where(
      repFilter === 'all'
        ? eq(customers.clientId, client.id)
        : and(eq(customers.clientId, client.id), eq(customers.reputation, repFilter))
    )
    .orderBy(desc(customers.lastBookingAt))

  // Top-line stats — always computed over the full set, independent of the filter.
  const allRows =
    repFilter === 'all'
      ? rows
      : await db.select().from(customers).where(eq(customers.clientId, client.id))

  const total = allRows.length
  const recurring = allRows.filter((c) => (c.totalBookings ?? 0) >= 2).length
  const blocked = allRows.filter((c) => c.reputation === 'blocked').length

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Clientes</h1>
        <p className="text-ink-2">Las personas que han reservado contigo a través del bot.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon={Users} label="Clientes totales" value={total} />
        <StatCard icon={Repeat} label="Recurrentes" value={recurring} hint="Con 2+ reservas" />
        <StatCard icon={Shield} label="Bloqueados" value={blocked} tone="danger" />
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
                  <th className="px-4 py-3 font-semibold text-ink-2 hidden sm:table-cell">Teléfono</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 text-center">Reservas</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 text-center">No-shows</th>
                  <th className="px-4 py-3 font-semibold text-ink-2">Reputación</th>
                  <th className="px-4 py-3 font-semibold text-ink-2 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-canvas transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{c.name || '—'}</div>
                      <div className="text-xs text-ink-3 sm:hidden flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-2 hidden sm:table-cell">{c.phone}</td>
                    <td className="px-4 py-3 text-center text-ink">{c.totalBookings ?? 0}</td>
                    <td className="px-4 py-3 text-center text-ink-2">{c.noShows ?? 0}</td>
                    <td className="px-4 py-3">
                      <ReputationBadge reputation={(c.reputation as Reputation | null) ?? 'good'} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.reputation === 'blocked' ? (
                        <UnblockCustomerButton customerId={c.id} />
                      ) : (c.noShows ?? 0) > 0 ? (
                        <ForgiveNoShowsButton customerId={c.id} customerName={c.name} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
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
  value: number
  hint?: string
  tone?: 'default' | 'danger'
}) {
  const tint = tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div className="bg-surface border border-line rounded-xl p-4 md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-ink-3" />
        <p className="text-sm text-ink-2">{label}</p>
      </div>
      <p className={`text-3xl md:text-4xl font-bold ${tint}`}>{value.toLocaleString('es-ES')}</p>
      {hint && <p className="text-xs text-ink-3 mt-1">{hint}</p>}
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

function ReputationBadge({ reputation }: { reputation: Reputation }) {
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
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-0.5 text-xs font-medium">
      Buena
    </span>
  )
}
