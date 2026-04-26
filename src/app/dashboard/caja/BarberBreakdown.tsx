import { db } from '@/db'
import { barbers as barbersTable, bookings, productSales, ratings, tips } from '@/db/schema'
import { sql } from 'drizzle-orm'
import { Wallet, Receipt, CalendarCheck, Heart, Star, User, ShoppingBag } from 'lucide-react'

// -----------------------------------------------------------------------------
// BarberBreakdown — desglose de la actividad financiera por barbero.
//
// Vive en /dashboard/caja debajo de los KPIs globales. Útil para barberías
// con equipo: ver quién factura más, quién recibe más propinas, quién tiene
// mejor nota.
//
// Solo se renderiza si hay ≥2 barberos activos (con 1 es redundante con
// los KPIs globales). El parent decide si pasarlo o no.
//
// Match canonical:
//   - bookings.barber_id (FK a barbers.id) cuando está set
//   - Fallback case-insensitive por bookings.barber (text) → barbers.name
//     para bookings legacy creados antes de que existiera la tabla barbers
//   - bookings con NULL en ambos → fila "Sin asignar"
//
// Filtra por periodo igual que los KPIs globales (StatsPeriodTabs URL param).
//
// Upsells (venta de productos): pendiente cuando esté el módulo Tienda
// (tarea #43). Por ahora no aparece esa columna.
// -----------------------------------------------------------------------------

interface Props {
  clientId: string
  /** YYYY-MM-DD inclusive. null = sin filtro (lifetime). */
  periodStartIso: string | null
}

interface BarberRow {
  barber_key: string
  barber_name: string
  active: boolean | null
  completed_count: number
  billed_eur: number | string
  tips_cents: number | string
  rating_count: number
  avg_rating: number | null
  upsells_cents: number | string
  upsells_count: number
}

export default async function BarberBreakdown({ clientId, periodStartIso }: Props) {
  // Necesitamos contar barberos activos primero — si <2, no renderizamos.
  const activeBarbers = await db
    .select({ id: barbersTable.id })
    .from(barbersTable)
    .where(sql`${barbersTable.clientId} = ${clientId} AND ${barbersTable.active} = true`)

  if (activeBarbers.length < 2) return null

  const periodWhere = periodStartIso ? sql`AND book.date >= ${periodStartIso}` : sql``
  const tipsPeriodWhere = periodStartIso
    ? sql`AND t.paid_at >= ${periodStartIso}::date`
    : sql``
  const ratingPeriodWhere = periodStartIso
    ? sql`AND r.created_at >= ${periodStartIso}::date`
    : sql``
  const salesPeriodWhere = periodStartIso
    ? sql`AND ps.sold_at >= ${periodStartIso}::date`
    : sql``

  // Single SQL — agregamos por barbero con LEFT JOIN para enriquecer con
  // tips y ratings. El COALESCE en barber_key garantiza grupos coherentes
  // incluso para bookings legacy con name pero sin id.
  const result = await db.execute(sql`
    WITH bookings_by_barber AS (
      SELECT
        COALESCE(b.id::text, lower(book.barber), '__unassigned__') AS barber_key,
        COALESCE(b.name, book.barber, 'Sin asignar') AS barber_name,
        b.active,
        COUNT(book.id) FILTER (WHERE book.status = 'completed')::int AS completed_count,
        COALESCE(SUM(book.price) FILTER (WHERE book.status = 'completed'), 0)::bigint AS billed_eur
      FROM ${bookings} book
      LEFT JOIN ${barbersTable} b ON (
        book.barber_id = b.id
        OR (book.barber_id IS NULL AND lower(b.name) = lower(book.barber))
      )
      WHERE book.client_id = ${clientId}
      ${periodWhere}
      GROUP BY barber_key, barber_name, b.active
    ),
    tips_by_barber AS (
      SELECT
        lower(t.barber_name) AS barber_name_key,
        COALESCE(SUM(t.amount_cents), 0)::bigint AS tips_cents
      FROM ${tips} t
      WHERE t.client_id = ${clientId}
        AND t.status = 'paid'
        AND t.barber_name IS NOT NULL
        ${tipsPeriodWhere}
      GROUP BY barber_name_key
    ),
    ratings_by_barber AS (
      SELECT
        lower(r.barber_name) AS barber_name_key,
        COUNT(*)::int AS rating_count,
        AVG(r.rating)::float AS avg_rating
      FROM ${ratings} r
      WHERE r.client_id = ${clientId}
        AND r.barber_name IS NOT NULL
        ${ratingPeriodWhere}
      GROUP BY barber_name_key
    ),
    sales_by_barber AS (
      SELECT
        ps.barber_id,
        COALESCE(SUM(ps.total_cents), 0)::bigint AS upsells_cents,
        COUNT(*)::int AS upsells_count
      FROM ${productSales} ps
      WHERE ps.client_id = ${clientId}
        ${salesPeriodWhere}
      GROUP BY ps.barber_id
    )
    SELECT
      bb.barber_key,
      bb.barber_name,
      bb.active,
      bb.completed_count,
      bb.billed_eur,
      COALESCE(t.tips_cents, 0)::bigint AS tips_cents,
      COALESCE(r.rating_count, 0)::int AS rating_count,
      r.avg_rating,
      COALESCE(s.upsells_cents, 0)::bigint AS upsells_cents,
      COALESCE(s.upsells_count, 0)::int AS upsells_count
    FROM bookings_by_barber bb
    LEFT JOIN tips_by_barber t ON t.barber_name_key = lower(bb.barber_name)
    LEFT JOIN ratings_by_barber r ON r.barber_name_key = lower(bb.barber_name)
    LEFT JOIN sales_by_barber s ON (
      (bb.barber_key = '__unassigned__' AND s.barber_id IS NULL)
      OR (bb.barber_key != '__unassigned__' AND s.barber_id::text = bb.barber_key)
    )
    WHERE bb.completed_count > 0 OR bb.barber_key != '__unassigned__'
    ORDER BY
      (bb.billed_eur + COALESCE(s.upsells_cents, 0) / 100.0) DESC NULLS LAST,
      bb.completed_count DESC
  `)

  const rows = (result as unknown as { rows: BarberRow[] }).rows.map((r) => ({
    ...r,
    billed_eur: Number(r.billed_eur),
    tips_cents: Number(r.tips_cents),
    completed_count: Number(r.completed_count),
    rating_count: Number(r.rating_count),
    avg_rating: r.avg_rating !== null ? Number(r.avg_rating) : null,
    upsells_cents: Number(r.upsells_cents),
    upsells_count: Number(r.upsells_count),
  }))

  if (rows.length === 0) return null

  // Total para % de cuota.
  const grandTotalEur = rows.reduce((acc, r) => acc + Number(r.billed_eur), 0)

  return (
    <section className="bg-surface border border-line rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-line">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">Por barbero</h2>
        <p className="text-xs text-ink-3 mt-0.5">
          Quién factura más, quién recibe más propinas, quién tiene mejor nota.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-overlay border-b border-line">
            <tr className="text-left">
              <th className="px-4 py-2.5 font-semibold text-ink-2 text-[11px] uppercase tracking-widest">Barbero</th>
              <th className="px-4 py-2.5 font-semibold text-ink-2 text-[11px] uppercase tracking-widest text-center">
                <CalendarCheck className="h-3 w-3 inline-block mr-1" />Servicios
              </th>
              <th className="px-4 py-2.5 font-semibold text-ink-2 text-[11px] uppercase tracking-widest text-right">
                <Wallet className="h-3 w-3 inline-block mr-1" />Facturado
              </th>
              <th className="px-4 py-2.5 font-semibold text-ink-2 text-[11px] uppercase tracking-widest text-right hidden sm:table-cell">
                <Receipt className="h-3 w-3 inline-block mr-1" />Ticket
              </th>
              <th className="px-4 py-2.5 font-semibold text-ink-2 text-[11px] uppercase tracking-widest text-right hidden lg:table-cell">
                <ShoppingBag className="h-3 w-3 inline-block mr-1" />Upsells
              </th>
              <th className="px-4 py-2.5 font-semibold text-ink-2 text-[11px] uppercase tracking-widest text-right hidden md:table-cell">
                <Heart className="h-3 w-3 inline-block mr-1" />Propinas
              </th>
              <th className="px-4 py-2.5 font-semibold text-ink-2 text-[11px] uppercase tracking-widest text-center hidden md:table-cell">
                <Star className="h-3 w-3 inline-block mr-1" />Nota
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const billed = Number(r.billed_eur)
              const tickets = r.completed_count
              const ticketMedio = tickets > 0 ? billed / tickets : 0
              const tipsEur = Number(r.tips_cents) / 100
              const sharePct = grandTotalEur > 0 ? Math.round((billed / grandTotalEur) * 100) : 0
              const isUnassigned = r.barber_key === '__unassigned__'
              return (
                <tr key={r.barber_key} className="hover:bg-canvas/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                        isUnassigned ? 'bg-overlay text-ink-3' : 'bg-brand-softer text-brand-strong'
                      }`}>
                        <User className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{r.barber_name}</p>
                        {r.active === false && (
                          <span className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">Inactivo</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-ink tabular-nums">{tickets}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="text-ink font-medium">{billed.toFixed(0)} €</span>
                    {sharePct > 0 && (
                      <span className="block text-[10px] text-ink-3">{sharePct}% del total</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-2 tabular-nums hidden sm:table-cell">
                    {tickets > 0 ? `${ticketMedio.toFixed(2)} €` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-2 tabular-nums hidden lg:table-cell">
                    {Number(r.upsells_cents) > 0 ? (
                      <>
                        <span className="text-ink">{(Number(r.upsells_cents) / 100).toFixed(2)} €</span>
                        <span className="block text-[10px] text-ink-3">{r.upsells_count} {r.upsells_count === 1 ? 'venta' : 'ventas'}</span>
                      </>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-2 tabular-nums hidden md:table-cell">
                    {tipsEur > 0 ? `${tipsEur.toFixed(2)} €` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {r.avg_rating !== null ? (
                      <span className="inline-flex items-center gap-1 text-ink">
                        <Star className="h-3 w-3 text-warning fill-warning" />
                        <span className="tabular-nums">{r.avg_rating.toFixed(1)}</span>
                        <span className="text-[10px] text-ink-3">({r.rating_count})</span>
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
