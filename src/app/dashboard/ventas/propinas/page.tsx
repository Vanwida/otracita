export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, tips as tipsTable, barbers as barbersTable } from '@/db/schema'
import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { Heart, Banknote, CreditCard, Trophy } from 'lucide-react'
import AreaContent from '../../_components/AreaContent'
import TipsSettings from '../../_components/TipsSettings'
import TipsList, { type TipRow } from './TipsList'
import { resolvePeriodSelection } from '@/lib/dashboard/period'
import { formatCents } from '@/lib/format'

// -----------------------------------------------------------------------------
// /dashboard/ventas/propinas — pestaña PROPINAS del área Ventas.
//
// Tres bloques:
//   1. TipsSettings — activar propinas + importes sugeridos.
//   2. KPIs del periodo — total · cash · card · top 3 barberos. Filtrado por
//      el selector StatsPeriodTabs (?period=day|week|month|year|lifetime,
//      default 'month'). Reni V1: el barbero quiere ver propinas por periodo
//      para reconciliar cash (caja física) vs card (Stripe Connect).
//   3. TipsList — propinas cobradas con método visible + asignación manual.
//
// Multi-tenancy: tenant por sesión (convención #1); tips filtrados por
// client.id. payment_method NULL en tips legacy se interpreta como 'card'
// implícito (todas las pre-V1 venían de Stripe Checkout).
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    period?: string
    date?: string
    start?: string
    end?: string
  }>
}

interface TopBarberRow {
  barber_name: string
  total_cents: number
}

export default async function VentasPropinasPage({ searchParams }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Periodo: default 'month' (coherente con informes). 'lifetime' = sin
  // filtro. Soporta 'day' (con ?date=) y 'range' (con ?start=&end=).
  const params = await searchParams
  const selection = resolvePeriodSelection(params, new Date(), 'month')
  const { periodLabel, periodStart, periodEnd, periodStartIso } = selection

  // Filtro común — tips pagadas del tenant en el periodo (paidAt). Para
  // 'day'/'range' acotamos también por arriba con `periodEnd`: sin tope,
  // un day=hoy sumaría propinas POSTERIORES al día seleccionado.
  const whereParts: SQL[] = [
    eq(tipsTable.clientId, client.id),
    eq(tipsTable.status, 'paid'),
  ]
  if (periodStart) whereParts.push(gte(tipsTable.paidAt, periodStart))
  if (periodEnd) whereParts.push(lt(tipsTable.paidAt, periodEnd))
  const baseWhere = and(...whereParts)
  // Fragmento SQL equivalente para los SUM/COUNT con `db.execute(sql`)`.
  const periodSqlFragment = periodStartIso
    ? selection.periodEndIso
      ? sql`AND ${tipsTable.paidAt} >= ${periodStartIso}::date AND ${tipsTable.paidAt} < ${selection.periodEndIso}::date`
      : sql`AND ${tipsTable.paidAt} >= ${periodStartIso}::date`
    : sql``

  // Carga paralela: lista detallada + agregados por método + top barberos
  // por importe + barberos activos para selector.
  const [tipRows, totalsByMethodRows, topBarberRows, barberRows] = await Promise.all([
    db
      .select({
        id: tipsTable.id,
        amountCents: tipsTable.amountCents,
        customerPhone: tipsTable.customerPhone,
        barberName: tipsTable.barberName,
        paymentMethod: tipsTable.paymentMethod,
        paidAt: tipsTable.paidAt,
        createdAt: tipsTable.createdAt,
      })
      .from(tipsTable)
      .where(baseWhere)
      .orderBy(desc(tipsTable.paidAt), desc(tipsTable.createdAt))
      .limit(200),

    // Subtotal cash/card. COALESCE legacy NULL → 'card'.
    db.execute(sql`
      SELECT
        COALESCE(${tipsTable.paymentMethod}, 'card') AS method,
        COALESCE(SUM(${tipsTable.amountCents}), 0)::bigint AS total_cents,
        COUNT(*)::int AS count
      FROM ${tipsTable}
      WHERE ${tipsTable.clientId} = ${client.id}
        AND ${tipsTable.status} = 'paid'
        ${periodSqlFragment}
      GROUP BY 1
    `),

    // Top barberos por € total. Filtramos NULL/'—' para no mostrar "sin
    // asignar" como entrada. Limit 3 por design — más satura la UI.
    db.execute(sql`
      SELECT
        ${tipsTable.barberName} AS barber_name,
        COALESCE(SUM(${tipsTable.amountCents}), 0)::bigint AS total_cents
      FROM ${tipsTable}
      WHERE ${tipsTable.clientId} = ${client.id}
        AND ${tipsTable.status} = 'paid'
        AND ${tipsTable.barberName} IS NOT NULL
        ${periodSqlFragment}
      GROUP BY ${tipsTable.barberName}
      ORDER BY total_cents DESC
      LIMIT 3
    `),

    db
      .select({ name: barbersTable.name })
      .from(barbersTable)
      .where(
        and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)),
      )
      .orderBy(barbersTable.displayOrder, barbersTable.name),
  ])

  const tips: TipRow[] = tipRows.map((t) => ({
    id: t.id,
    amountCents: t.amountCents,
    customerPhone: t.customerPhone,
    barberName: t.barberName,
    paymentMethod:
      (t.paymentMethod as 'cash' | 'card' | null) ?? null,
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }))
  const barberNames = barberRows.map((b) => b.name)

  // Normalizar agregados.
  const totalsByMethod = (
    totalsByMethodRows as unknown as { rows: Array<{ method: string; total_cents: string | number; count: number }> }
  ).rows
  const cashCents = Number(
    totalsByMethod.find((r) => r.method === 'cash')?.total_cents ?? 0,
  )
  const cardCents = Number(
    totalsByMethod.find((r) => r.method === 'card')?.total_cents ?? 0,
  )
  const totalCents = cashCents + cardCents
  const totalCount = totalsByMethod.reduce((acc, r) => acc + Number(r.count ?? 0), 0)

  const topBarbers = (
    topBarberRows as unknown as { rows: TopBarberRow[] }
  ).rows.map((r) => ({
    barber_name: r.barber_name,
    total_cents: Number(r.total_cents),
  }))

  return (
    <AreaContent scroll="region" maxWidth="5xl">
      <p
        className="mb-4 text-ink-2"
        style={{ fontSize: 'var(--text-meta)' }}
      >
        Activa las propinas y elige los importes sugeridos. Se piden tras
        cada servicio junto con la reseña.
      </p>
      <TipsSettings
        initial={{
          tipsEnabled: client.tipsEnabled,
          tipsSuggestedCents: client.tipsSuggestedCents || [200, 300, 500],
          connectActive: client.stripeConnectStatus === 'active',
        }}
      />

      {/* KPIs del periodo — total + split cash/card + top 3 barberos. Solo
          rendereamos si hay propinas en el periodo: si está vacío la lista
          ya muestra el empty-state, no hace falta duplicar mensajes. */}
      {totalCount > 0 && (
        <section className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-surface border border-line rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-ink-3 uppercase tracking-widest font-semibold">
              <Heart className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
              Total ({periodLabel})
            </div>
            <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">
              {formatCents(totalCents)}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              {totalCount} {totalCount === 1 ? 'propina' : 'propinas'}
            </p>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-ink-3 uppercase tracking-widest font-semibold">
              <Banknote className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              Cash
            </div>
            <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">
              {formatCents(cashCents)}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              <CreditCard className="inline h-3 w-3 mr-1 align-text-bottom" />
              Card: <span className="tabular-nums">{formatCents(cardCents)}</span>
            </p>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-ink-3 uppercase tracking-widest font-semibold">
              <Trophy className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
              Top barberos
            </div>
            {topBarbers.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Sin asignaciones aún.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {topBarbers.map((b, idx) => (
                  <li
                    key={b.barber_name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink">
                      <span className="text-ink-3 mr-1.5 tabular-nums">{idx + 1}.</span>
                      {b.barber_name}
                    </span>
                    <span className="font-semibold text-ink tabular-nums">
                      {formatCents(b.total_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <div className="mt-6">
        <TipsList tips={tips} barberNames={barberNames} />
      </div>
    </AreaContent>
  )
}
