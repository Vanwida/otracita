import { db } from '@/db'
import { barbers as barbersTable, bookings, productSales, ratings, tips } from '@/db/schema'
import { sql } from 'drizzle-orm'
import { Wallet, Receipt, CalendarCheck, Heart, Star, User, ShoppingBag, Trophy } from 'lucide-react'
import DataTable, { type Column } from '@/app/dashboard/_components/DataTable'

// -----------------------------------------------------------------------------
// BarberBreakdown — desglose de la actividad financiera por barbero.
//
// Se renderiza en dos sitios (mismo componente, misma query — no se
// duplica): el Resumen de Ventas (debajo de los KPIs globales) y la pestaña
// Equipo > Empleados (rendimiento del equipo: el barbero abre Equipo y ve
// quién tira del carro). Útil para barberías con equipo: ver quién factura
// más, quién recibe más propinas, quién tiene mejor nota.
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
// Atribución de propinas/ratings (ADD-2): tips/ratings NO tienen barber_id,
// sólo barber_name (snapshot que NO cambia si el barbero se renombra). Un
// join por lower(barber_name) pierde las propinas de un barbero renombrado
// (caso real prod: PABLO con bookings de snapshot "Jesús"). Solución: las
// resolvemos por su booking_id → bookings.barber_id → barbers.id, con
// fallback al snapshot de nombre sólo si no hay booking_id (propina/rating
// espontáneo) o el booking no tenía barber_id (legacy). Robust contra rename.
//
// billed_eur (ADD-2/P0-1): principal (bookings.price) + servicios EXTRA
// (booking_services.price_euros) — antes sólo sumaba el principal.
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
  /** Override del título de sección (default "Por barbero"). */
  title?: string
  /** Texto bajo el título (default el resumen de Ventas). */
  subtitle?: string
  /** Marca con badge TOP al barbero que más factura (≥2 con ventas). */
  highlightTop?: boolean
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

export default async function BarberBreakdown({
  clientId,
  periodStartIso,
  title = 'Por barbero',
  subtitle = 'Quién factura más, quién recibe más propinas, quién tiene mejor nota.',
  highlightTop = false,
}: Props) {
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
        -- Principal + servicios EXTRA (R7). price_euros en EUROS (foot-gun)
        -- igual que book.price; subquery correlada, sin fan-out. Sólo
        -- 'completed' (mismo filtro que el principal).
        COALESCE(SUM(
          (book.price + COALESCE((
            SELECT SUM(bs.price_euros)
            FROM booking_services bs
            WHERE bs.booking_id = book.id
              AND bs.price_euros IS NOT NULL
          ), 0))
        ) FILTER (WHERE book.status = 'completed'), 0)::bigint AS billed_eur
      FROM ${bookings} book
      LEFT JOIN ${barbersTable} b ON (
        book.barber_id = b.id
        OR (book.barber_id IS NULL AND lower(b.name) = lower(book.barber))
      )
      WHERE book.client_id = ${clientId}
      ${periodWhere}
      GROUP BY barber_key, barber_name, b.active
    ),
    -- Propinas resueltas al barbero canónico vía su booking (barber_id),
    -- fallback al snapshot de nombre. La misma fórmula de barber_key que
    -- bookings_by_barber para que el join sea por clave, no por nombre.
    -- barber_key resuelto POR FILA con subqueries escalares (no joins) para
    -- garantizar exactamente 1 clave por propina/rating → cero fan-out aunque
    -- dos barberos compartan nombre. Prioridad: (1) barber_id del booking
    -- vinculado, (2) snapshot de nombre → barbers.name, (3) sin asignar.
    tips_by_barber AS (
      SELECT
        COALESCE(
          (SELECT tbk.barber_id::text FROM bookings tbk
             WHERE tbk.id = t.booking_id AND tbk.barber_id IS NOT NULL),
          (SELECT tb.id::text FROM barbers tb
             WHERE tb.client_id = ${clientId}
               AND lower(tb.name) = lower(t.barber_name)
             ORDER BY tb.created_at LIMIT 1),
          lower(t.barber_name),
          '__unassigned__'
        ) AS barber_key,
        COALESCE(SUM(t.amount_cents), 0)::bigint AS tips_cents
      FROM ${tips} t
      WHERE t.client_id = ${clientId}
        AND t.status = 'paid'
        AND t.barber_name IS NOT NULL
        ${tipsPeriodWhere}
      GROUP BY barber_key
    ),
    ratings_by_barber AS (
      SELECT
        COALESCE(
          (SELECT rbk.barber_id::text FROM bookings rbk
             WHERE rbk.id = r.booking_id AND rbk.barber_id IS NOT NULL),
          (SELECT rb.id::text FROM barbers rb
             WHERE rb.client_id = ${clientId}
               AND lower(rb.name) = lower(r.barber_name)
             ORDER BY rb.created_at LIMIT 1),
          lower(r.barber_name),
          '__unassigned__'
        ) AS barber_key,
        COUNT(*)::int AS rating_count,
        AVG(r.rating)::float AS avg_rating
      FROM ${ratings} r
      WHERE r.client_id = ${clientId}
        AND r.barber_name IS NOT NULL
        ${ratingPeriodWhere}
      GROUP BY barber_key
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
    LEFT JOIN tips_by_barber t ON t.barber_key = bb.barber_key
    LEFT JOIN ratings_by_barber r ON r.barber_key = bb.barber_key
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

  // TOP = el que más factura. Las filas YA vienen ordenadas por
  // (billed + upsells) desc desde SQL: el TOP es la primera fila asignada
  // con facturación > 0. Pura UI sobre el orden existente — no re-ordena ni
  // añade query. Solo se marca con ≥2 barberos facturando (con 1 es obvio).
  const billingRows = rows.filter(
    (r) => r.barber_key !== '__unassigned__' && Number(r.billed_eur) > 0,
  )
  const topBarberKey =
    highlightTop && billingRows.length >= 2 ? billingRows[0].barber_key : null

  return (
    <section className="bg-surface border border-line rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-line">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">{title}</h2>
        <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>
      </header>

      {/* DataTable — chrome canónico (sticky head, zebra/hover por tokens).
          Las columnas Ticket / Upsells / Propinas / Nota se ocultan en
          breakpoints más bajos vía `column.className` ("hidden md:table-cell"
          etc) — patrón canónico documentado en DataTable JSDoc. */}
      <DataTable<BarberRow>
        ariaLabel={title}
        rows={rows}
        rowKey={(r) => r.barber_key}
        columns={barberColumns({ topBarberKey, grandTotalEur })}
      />
    </section>
  )
}

// Builder de columnas — necesita `topBarberKey` (badge "Top") y
// `grandTotalEur` (calcular % share). Fuera del JSX para que `DataTable`
// reciba un array tipado sin closures pesados inline.
function barberColumns({
  topBarberKey,
  grandTotalEur,
}: {
  topBarberKey: string | null
  grandTotalEur: number
}): Column<BarberRow>[] {
  return [
    {
      key: 'barber',
      header: 'Barbero',
      cell: (r) => {
        const isUnassigned = r.barber_key === '__unassigned__'
        const isTop = topBarberKey === r.barber_key
        return (
          <div className="flex items-center gap-2">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                isUnassigned ? 'bg-overlay text-ink-3' : 'bg-brand-softer text-brand-strong'
              }`}
            >
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-ink truncate">{r.barber_name}</p>
                {isTop && (
                  <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full border border-brand/30 bg-brand-softer px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-strong">
                    <Trophy className="h-2.5 w-2.5" aria-hidden="true" />
                    Top
                  </span>
                )}
              </div>
              {r.active === false && (
                <span className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">Inactivo</span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'tickets',
      header: (
        <span>
          <CalendarCheck className="h-3 w-3 inline-block mr-1" />
          Servicios
        </span>
      ),
      align: 'center',
      numeric: true,
      cell: (r) => <span className="text-ink">{r.completed_count}</span>,
    },
    {
      key: 'billed',
      header: (
        <span>
          <Wallet className="h-3 w-3 inline-block mr-1" />
          Facturado
        </span>
      ),
      align: 'right',
      numeric: true,
      cell: (r) => {
        const billed = Number(r.billed_eur)
        const sharePct = grandTotalEur > 0 ? Math.round((billed / grandTotalEur) * 100) : 0
        return (
          <>
            <span className="text-ink font-medium">{billed.toFixed(0)} €</span>
            {sharePct > 0 && (
              <span className="block text-[10px] text-ink-3">{sharePct}% del total</span>
            )}
          </>
        )
      },
    },
    {
      key: 'ticketMedio',
      className: 'hidden sm:table-cell',
      header: (
        <span>
          <Receipt className="h-3 w-3 inline-block mr-1" />
          Ticket
        </span>
      ),
      align: 'right',
      numeric: true,
      cell: (r) => {
        const billed = Number(r.billed_eur)
        const tickets = r.completed_count
        const medio = tickets > 0 ? billed / tickets : 0
        return (
          <span className="text-ink-2">{tickets > 0 ? `${medio.toFixed(2)} €` : '—'}</span>
        )
      },
    },
    {
      key: 'upsells',
      className: 'hidden lg:table-cell',
      header: (
        <span>
          <ShoppingBag className="h-3 w-3 inline-block mr-1" />
          Upsells
        </span>
      ),
      align: 'right',
      numeric: true,
      cell: (r) => {
        const cents = Number(r.upsells_cents)
        if (cents === 0) return <span className="text-ink-3">—</span>
        return (
          <>
            <span className="text-ink">{(cents / 100).toFixed(2)} €</span>
            <span className="block text-[10px] text-ink-3">
              {r.upsells_count} {r.upsells_count === 1 ? 'venta' : 'ventas'}
            </span>
          </>
        )
      },
    },
    {
      key: 'tips',
      className: 'hidden md:table-cell',
      header: (
        <span>
          <Heart className="h-3 w-3 inline-block mr-1" />
          Propinas
        </span>
      ),
      align: 'right',
      numeric: true,
      cell: (r) => {
        const tipsEur = Number(r.tips_cents) / 100
        return (
          <span className="text-ink-2">{tipsEur > 0 ? `${tipsEur.toFixed(2)} €` : '—'}</span>
        )
      },
    },
    {
      key: 'rating',
      className: 'hidden md:table-cell',
      header: (
        <span>
          <Star className="h-3 w-3 inline-block mr-1" />
          Nota
        </span>
      ),
      align: 'center',
      cell: (r) =>
        r.avg_rating !== null ? (
          <span className="inline-flex items-center gap-1 text-ink">
            <Star className="h-3 w-3 text-warning fill-warning" />
            <span className="tabular-nums">{r.avg_rating.toFixed(1)}</span>
            <span className="text-[10px] text-ink-3">({r.rating_count})</span>
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ]
}
