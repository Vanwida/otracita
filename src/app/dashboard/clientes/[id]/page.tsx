export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { db } from '@/db'
import { clients, customers, bookings, ratings, tips, loyaltyLedger, barbers as barbersTable } from '@/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  ChevronLeft,
  Phone,
  Calendar,
  Wallet,
  Heart,
  Star,
  Award,
  Scissors,
  User,
  XCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import CustomerNotesEditor from './CustomerNotesEditor'

// -----------------------------------------------------------------------------
// /dashboard/clientes/[id] — ficha completa de un cliente.
//
// Datos cargados (todo en paralelo, multi-tenancy via JOIN con clientId):
//   1. Customer row
//   2. Stats agregadas (gastado, propinas, nota media, no-shows, %)
//   3. Bookings completos (timeline desc, con servicio + barbero + estado)
//   4. Reseñas que dejó (chronological)
//   5. Saldo loyalty (SUM ledger)
//   6. Notas libres del barbero (editables)
//
// Multi-tenancy: validamos que customer.clientId === client del barbero
// logueado, sino 404 (nunca 403 — no revelamos que existe).
// -----------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Customer + check multi-tenancy en una sola query.
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.clientId, client.id)))
  if (!customer) notFound()

  // Stats agregadas + bookings + ratings + loyalty en paralelo.
  const [statsRow, bookingRows, ratingRows, loyaltyRow] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
          WHERE client_id = ${client.id} AND customer_phone = ${customer.phone}
          AND status = 'completed')::bigint AS spent_eur,
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${client.id} AND customer_phone = ${customer.phone}
          AND status = 'completed')::int AS completed_count,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
          WHERE client_id = ${client.id} AND customer_phone = ${customer.phone}
          AND status = 'paid')::bigint AS tips_cents,
        (SELECT AVG(rating)::float FROM ${ratings}
          WHERE client_id = ${client.id} AND customer_phone = ${customer.phone}) AS avg_rating,
        (SELECT COUNT(*) FROM ${ratings}
          WHERE client_id = ${client.id} AND customer_phone = ${customer.phone})::int AS rating_count
    `),
    db
      .select()
      .from(bookings)
      .where(and(eq(bookings.clientId, client.id), eq(bookings.customerPhone, customer.phone)))
      .orderBy(desc(bookings.date), desc(bookings.time))
      .limit(50),
    db
      .select()
      .from(ratings)
      .where(and(eq(ratings.clientId, client.id), eq(ratings.customerPhone, customer.phone)))
      .orderBy(desc(ratings.createdAt)),
    db
      .select({ balance: sql<number>`COALESCE(SUM(${loyaltyLedger.delta}), 0)` })
      .from(loyaltyLedger)
      .where(and(eq(loyaltyLedger.clientId, client.id), eq(loyaltyLedger.customerId, customer.id)))
      .then((rows) => rows[0]),
  ])

  const stats = (statsRow as unknown as {
    rows: Array<{
      spent_eur: number | string
      completed_count: number
      tips_cents: number | string
      avg_rating: number | null
      rating_count: number
    }>
  }).rows[0]

  const spentEur = Number(stats?.spent_eur ?? 0)
  const completedCount = Number(stats?.completed_count ?? 0)
  const tipsEur = Number(stats?.tips_cents ?? 0) / 100
  const avgRating = stats?.avg_rating !== null && stats?.avg_rating !== undefined ? Number(stats.avg_rating) : null
  const ratingCount = Number(stats?.rating_count ?? 0)
  const avgTicketEur = completedCount > 0 ? spentEur / completedCount : 0
  const loyaltyBalance = Number(loyaltyRow?.balance ?? 0)

  // Top servicio + top barbero (mode entre las reservas completadas o confirmadas).
  const topService = topByCount(
    bookingRows.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show').map((b) => b.service),
  )
  const topBarber = topByCount(
    bookingRows
      .filter((b) => b.status !== 'cancelled' && b.status !== 'no_show')
      .map((b) => b.barber)
      .filter((n): n is string => n !== null && n.trim().length > 0),
  )

  // Loyalty mode — para mostrar "puntos" o "sellos" en el chip
  const loyaltyMode = client.loyaltyEnabled ? client.loyaltyMode : null
  const loyaltyUnit = loyaltyMode === 'points' ? 'puntos' : 'sellos'

  // Lista de barberos activos para enriquecer la UI si quieren mostrar foto
  // en el futuro — por ahora solo nombre.
  void barbersTable // imported for future use; suppress unused warning if any

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Link
        href="/dashboard/clientes"
        className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink mb-4 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Todos los clientes
      </Link>

      {/* Header — datos básicos + reputación */}
      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 mb-6 flex items-start gap-4 flex-wrap">
        <div className="h-14 w-14 rounded-2xl bg-brand-softer text-brand-strong flex items-center justify-center font-display text-xl font-bold shrink-0">
          {(customer.name?.[0] ?? customer.phone[0]).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-ink">
            {customer.name || 'Sin nombre'}
          </h1>
          <p className="text-sm text-ink-2 flex items-center gap-1.5 mt-1">
            <Phone className="h-3.5 w-3.5 text-ink-3" />
            {customer.phone}
          </p>
          <p className="text-xs text-ink-3 mt-1">
            Cliente desde {formatDate(customer.createdAt)}
          </p>
        </div>
        <ReputationBadge reputation={(customer.reputation as 'good' | 'warning' | 'blocked' | null) ?? 'good'} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat icon={Wallet} label="Gastado" value={spentEur > 0 ? `${spentEur.toFixed(0)} €` : '—'} hint={completedCount > 0 ? `${completedCount} servicios` : undefined} />
        <Stat icon={Calendar} label="Ticket medio" value={completedCount > 0 ? `${avgTicketEur.toFixed(2)} €` : '—'} />
        <Stat icon={Heart} label="Propinas" value={tipsEur > 0 ? `${tipsEur.toFixed(2)} €` : '—'} />
        <Stat
          icon={Star}
          label="Nota media"
          value={avgRating !== null ? `${avgRating.toFixed(1)} / 5` : '—'}
          hint={ratingCount > 0 ? `${ratingCount} ${ratingCount === 1 ? 'reseña' : 'reseñas'}` : undefined}
        />
      </div>

      {/* Insights row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Insight icon={Scissors} label="Servicio favorito" value={topService ?? '—'} />
        <Insight icon={User} label="Barbero favorito" value={topBarber ?? '—'} />
        {client.loyaltyEnabled ? (
          <Insight
            icon={Award}
            label={`Saldo en ${loyaltyUnit}`}
            value={String(Math.max(0, loyaltyBalance))}
          />
        ) : (
          <Insight icon={AlertTriangle} label="No-shows" value={String(customer.noShows ?? 0)} tone={(customer.noShows ?? 0) > 0 ? 'danger' : 'default'} />
        )}
      </div>

      {/* Notas del barbero */}
      <div className="mb-6">
        <CustomerNotesEditor customerId={customer.id} initialNotes={customer.barberNotes ?? ''} />
      </div>

      {/* Historial bookings */}
      <section className="mb-6">
        <h2 className="font-display text-lg font-semibold text-ink mb-3">Historial de reservas</h2>
        {bookingRows.length === 0 ? (
          <div className="bg-surface border border-line rounded-xl p-6 text-center text-sm text-ink-3">
            Aún no tiene reservas registradas.
          </div>
        ) : (
          <ul className="space-y-2">
            {bookingRows.map((b) => (
              <li key={b.id} className="bg-surface border border-line rounded-xl p-4 flex items-start gap-3">
                <BookingStatusIcon status={b.status} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink text-sm">
                    {b.service}
                    {b.barber && <span className="text-ink-3 font-normal"> · {b.barber}</span>}
                  </p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    {formatBookingDate(b.date, b.time)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {b.price !== null && b.price !== undefined && b.price > 0 && (
                    <p className="font-medium text-ink text-sm tabular-nums">{b.price} €</p>
                  )}
                  <BookingStatusLabel status={b.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reseñas */}
      {ratingRows.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display text-lg font-semibold text-ink mb-3">Reseñas dejadas</h2>
          <ul className="space-y-2">
            {ratingRows.map((r) => (
              <li key={r.id} className="bg-surface border border-line rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Stars value={r.rating} />
                  <p className="text-xs text-ink-3">
                    {formatDate(r.createdAt)}
                    {r.barberName && <span> · {r.barberName}</span>}
                  </p>
                </div>
                {r.comment && (
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                    {r.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes + helpers
// ─────────────────────────────────────────────────────────────────────────────

function topByCount<T>(items: T[]): T | null {
  if (items.length === 0) return null
  const counts = new Map<T, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  let max: T | null = null
  let maxCount = 0
  for (const [k, v] of counts) {
    if (v > maxCount) {
      max = k
      maxCount = v
    }
  }
  return max
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-ink-3" />
        <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold truncate">{label}</p>
      </div>
      <p className="text-lg md:text-xl font-bold text-ink tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-ink-3 mt-1">{hint}</p>}
    </div>
  )
}

function Insight({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Scissors
  label: string
  value: string
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
        tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-overlay text-ink-2'
      }`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold">{label}</p>
        <p className="text-sm font-semibold text-ink truncate">{value}</p>
      </div>
    </div>
  )
}

function ReputationBadge({ reputation }: { reputation: 'good' | 'warning' | 'blocked' }) {
  const styles =
    reputation === 'blocked'
      ? 'bg-danger/10 text-danger border-danger/20'
      : reputation === 'warning'
        ? 'bg-warning/10 text-warning border-warning/20'
        : 'bg-success/10 text-success border-success/20'
  const label = reputation === 'blocked' ? 'Bloqueado' : reputation === 'warning' ? 'Aviso' : 'Buena reputación'
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>
      {label}
    </span>
  )
}

function BookingStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
  if (status === 'cancelled') return <XCircle className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
  if (status === 'no_show') return <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
  return <Calendar className="h-4 w-4 text-brand mt-0.5 shrink-0" />
}

function BookingStatusLabel({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: 'Hecha', className: 'text-success' },
    confirmed: { label: 'Confirmada', className: 'text-ink-2' },
    cancelled: { label: 'Cancelada', className: 'text-ink-3' },
    no_show: { label: 'No-show', className: 'text-danger' },
  }
  const m = map[status] ?? { label: status, className: 'text-ink-3' }
  return <p className={`text-[10px] uppercase tracking-widest font-semibold mt-0.5 ${m.className}`}>{m.label}</p>
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        return (
          <Star
            key={n}
            className="h-3.5 w-3.5"
            style={{
              color: filled ? 'var(--color-warning)' : 'var(--color-line)',
              fill: filled ? 'var(--color-warning)' : 'transparent',
            }}
            strokeWidth={1.5}
          />
        )
      })}
    </div>
  )
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dt)
}

function formatBookingDate(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(dt)
  return `${formatted} · ${time}`
}
