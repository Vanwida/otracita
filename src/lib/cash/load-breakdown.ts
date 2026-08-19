import { db } from '@/db'
import {
  barbers,
  bookings,
  cashMovements,
  cashSessions,
  payments,
  productSales,
  tips,
} from '@/db/schema'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import {
  buildMovementBreakdown,
  type CashClosingSnapshot,
  type MovementBreakdown,
  type MovementForBreakdown,
  type MovementListItem,
  type PaymentMethodDetail,
  type PaymentMethodDetailRow,
} from './breakdown'
import {
  computeExpectedClosing,
  isIncoming,
  type MovementKind,
  type PaymentMethod,
} from './compute'

// -----------------------------------------------------------------------------
// loadBreakdownForSession — carga los movimientos de una sesión con el
// `barberId` ya resuelto y devuelve el desglose completo + el mapping de
// nombres legibles. Es la capa "impura" sobre `breakdown.ts`.
//
// Resolución de barbero (orden de prioridad):
//   1. cash_movements.barber_id directo (tip_cash, manuales, app móvil)
//   2. bookings.barber_id cuando referenceType='booking' (los booking
//      movements no almacenan barberId hoy — ver record-movement.ts)
//   3. product_sales.barber_id cuando referenceType='product_sale'
//   4. NULL → fila "Sin asignar"
//
// Devuelve además el listado enriquecido de movimientos (con hora, nombre
// barbero, label de referencia) y la granularidad fina de payments.method
// (card_physical / bizum / card_online / mixed) cuando aplica.
// -----------------------------------------------------------------------------

interface MovementRow {
  id: string
  kind: MovementKind
  method: PaymentMethod
  amountCents: number
  barberId: string | null
  createdAt: string
  notes: string | null
  referenceType: 'booking' | 'product_sale' | null
  referenceId: string | null
  referenceLabel: string | null
}

interface PaymentDetailRow {
  method: string | null
  totalCents: number
  count: number
}

export async function loadBreakdownForSession(
  clientId: string,
  sessionId: string,
): Promise<MovementBreakdown> {
  // SQL raw para resolver el barber_id con COALESCE de tres fuentes + el
  // label legible de la referencia (nombre del cliente para bookings,
  // nombre del producto para product_sales). Drizzle no expresa esto
  // cómodamente con builders. Parametrizamos por clientId+sessionId para
  // garantizar aislamiento multi-tenant (defensa en profundidad sobre
  // requireClientAccess que ya pasó el caller).
  const result = await db.execute(sql`
    SELECT
      cm.id::text AS id,
      cm.kind,
      cm.method,
      cm.amount_cents AS "amountCents",
      cm.created_at AS "createdAt",
      cm.notes,
      cm.reference_type AS "referenceType",
      cm.reference_id::text AS "referenceId",
      COALESCE(
        cm.barber_id::text,
        (SELECT bk.barber_id::text FROM ${bookings} bk
           WHERE bk.id = cm.reference_id
             AND cm.reference_type = 'booking'
             AND bk.barber_id IS NOT NULL),
        (SELECT ps.barber_id::text FROM ${productSales} ps
           WHERE ps.id = cm.reference_id
             AND cm.reference_type = 'product_sale'
             AND ps.barber_id IS NOT NULL)
      ) AS "barberId",
      CASE
        WHEN cm.reference_type = 'booking' THEN (
          SELECT COALESCE(bk.customer_name, bk.customer_phone)
            FROM ${bookings} bk WHERE bk.id = cm.reference_id
        )
        WHEN cm.reference_type = 'product_sale' THEN (
          SELECT p.name FROM ${productSales} ps
            LEFT JOIN products p ON p.id = ps.product_id
           WHERE ps.id = cm.reference_id
        )
        ELSE NULL
      END AS "referenceLabel"
    FROM ${cashMovements} cm
    WHERE cm.client_id = ${clientId}
      AND cm.session_id = ${sessionId}
    ORDER BY cm.created_at ASC
  `)
  const rows = (result as unknown as { rows: MovementRow[] }).rows

  // Mapping id → nombre. Cargamos TODOS los barberos del cliente (no sólo
  // activos) porque un cierre puede mencionar a un barbero ya desactivado,
  // y queremos enseñar el nombre — no el uuid.
  const allBarbers = await db
    .select({ id: barbers.id, name: barbers.name })
    .from(barbers)
    .where(eq(barbers.clientId, clientId))
  const nameById = new Map(allBarbers.map((b) => [b.id, b.name]))

  // Granularidad fina sobre payments.method para bookings cobrados en esta
  // sesión. Sólo cuenta pagos `succeeded`/null status válidos (descartamos
  // pending/failed para no inflar el cuadre).
  const paymentDetailResult = await db.execute(sql`
    SELECT
      COALESCE(p.method, 'unknown') AS method,
      SUM(p.amount_cents)::bigint AS "totalCents",
      COUNT(*)::int AS count
    FROM ${payments} p
    WHERE p.client_id = ${clientId}
      AND p.status = 'succeeded'
      AND p.booking_id IN (
        SELECT cm.reference_id FROM ${cashMovements} cm
        WHERE cm.session_id = ${sessionId}
          AND cm.reference_type = 'booking'
          AND cm.reference_id IS NOT NULL
      )
    GROUP BY COALESCE(p.method, 'unknown')
  `)
  const paymentDetailRows = (
    paymentDetailResult as unknown as { rows: PaymentDetailRow[] }
  ).rows

  const validDetailMethods: ReadonlySet<PaymentMethodDetail> = new Set([
    'cash',
    'card_physical',
    'bizum',
    'card_online',
    'mixed',
    'unknown',
  ])

  const byPaymentDetail: PaymentMethodDetailRow[] = paymentDetailRows
    .map<PaymentMethodDetailRow>((r) => {
      const m = (r.method ?? 'unknown') as PaymentMethodDetail
      const safe: PaymentMethodDetail = validDetailMethods.has(m) ? m : 'unknown'
      return {
        method: safe,
        totalCents: Number(r.totalCents),
        count: Number(r.count),
      }
    })
    .sort((a, b) => b.totalCents - a.totalCents)

  const enriched: MovementForBreakdown[] = rows.map((r) => ({
    kind: r.kind,
    method: r.method,
    amountCents: Number(r.amountCents),
    barberId: r.barberId,
  }))

  const movementList: MovementListItem[] = rows.map((r) => {
    const amountCents = Number(r.amountCents)
    const signed = isIncoming(r.kind) ? amountCents : -amountCents
    return {
      id: r.id,
      kind: r.kind,
      method: r.method,
      amountCents,
      signedAmountCents: signed,
      barberId: r.barberId,
      barberName: r.barberId ? nameById.get(r.barberId) ?? null : null,
      createdAt: new Date(r.createdAt).toISOString(),
      notes: r.notes,
      referenceType: r.referenceType,
      referenceId: r.referenceId,
      referenceLabel: r.referenceLabel,
    }
  })

  return buildMovementBreakdown(enriched, nameById, movementList, byPaymentDetail)
}

// -----------------------------------------------------------------------------
// loadBreakdownForDay — variante por DÍA (no por sesión). Alimenta la página
// `/dashboard/ventas/resumen` con un detalle estilo cierre de caja por cada
// fecha del calendario, también para días sin caja abierta jamás.
//
// Tres ramas de resolución, en orden de preferencia:
//
//   1. Sesión cerrada CON `closing_snapshot` → devolvemos el snapshot 1:1
//      (inmutable, ya en el shape exacto que ClosingReport espera).
//   2. Sesión abierta/cerrada SIN snapshot (legacy, o aún viva) → reusamos
//      `loadBreakdownForSession` y computamos esperados con compute.ts.
//   3. Día sin sesión → sintetizamos movimientos pseudo-cash desde bookings
//      (completed + paymentMethod), product_sales (no internas) y tips
//      (paid + cash). Estos días no tienen apuntes manuales (expense /
//      withdrawal / deposit / adjustment / refund viven sólo en
//      cash_movements ligados a sesión).
//
// El resultado siempre trae los CAMPOS del header del report (opening,
// expected, descuadre…) para que la UI pinte el mismo bloque, con
// `openingCents=0` y `openedAt = startOfDay` cuando no hubo sesión.
//
// Multi-tenant: el caller pasa `clientId` ya resuelto por
// `requireClientAccess` / `auth.api.getSession` — defensa en profundidad
// con WHERE client_id en cada query.
// -----------------------------------------------------------------------------

export type DayBreakdownSource = 'snapshot' | 'session_live' | 'synthesized'

export interface DayBreakdown extends MovementBreakdown {
  /** Día concreto en formato YYYY-MM-DD (local). */
  day: string
  /** Pista de origen para debugging / telemetría. */
  source: DayBreakdownSource
  /** Si existe sesión asociada al día, su id (link al detalle de caja). */
  sessionId: string | null
  /** Apertura — 0 cuando no hubo sesión. */
  openingCents: number
  /** ISO timestamp de apertura, o 00:00 local del día si no hubo sesión. */
  openedAt: string
  /** Quién abrió (email). "—" si no hubo sesión. */
  openedByEmail: string
  /** ISO timestamp de cierre, o null si la sesión sigue abierta / no hubo. */
  closedAt: string | null
  /** Esperados al cierre (ya incluyen opening en cash). */
  cashExpectedCents: number
  cardExpectedCents: number
  onlineExpectedCents: number
  /** Contados por el barbero (sólo en sesiones cerradas). */
  cashCountedCents: number | null
  cardCountedCents: number | null
  /** Descuadres (counted - expected) — sólo en sesiones cerradas. */
  cashDescuadreCents: number | null
  cardDescuadreCents: number | null
}

interface CashSessionRow {
  id: string
  openingCents: number
  openedAt: Date
  openedByEmail: string
  closedAt: Date | null
  closedByEmail: string | null
  closingCentsExpected: number | null
  closingCentsCounted: number | null
  cashDescuadreCents: number | null
  cardTerminalExpectedCents: number | null
  cardTerminalCountedCents: number | null
  cardDescuadreCents: number | null
  closingSnapshot: CashClosingSnapshot | null
}

/**
 * Carga el desglose del día seleccionado para `/dashboard/ventas/resumen`.
 *
 * @param clientId Tenant resuelto por el caller (NUNCA confiar en input).
 * @param day      YYYY-MM-DD (local time del barbero). Se valida arriba.
 */
export async function loadBreakdownForDay(
  clientId: string,
  day: string,
): Promise<DayBreakdown> {
  // Buscamos sesión cuyo opened_at::date = $day O closed_at::date = $day.
  // Si hay más de una (ejemplo: cierre nocturno + apertura a 00:30), elegimos
  // la más reciente — el día visualmente importante es ese final.
  const sessionRows = await db
    .select({
      id: cashSessions.id,
      openingCents: cashSessions.openingCents,
      openedAt: cashSessions.openedAt,
      openedByEmail: cashSessions.openedByEmail,
      closedAt: cashSessions.closedAt,
      closedByEmail: cashSessions.closedByEmail,
      closingCentsExpected: cashSessions.closingCentsExpected,
      closingCentsCounted: cashSessions.closingCentsCounted,
      cashDescuadreCents: cashSessions.cashDescuadreCents,
      cardTerminalExpectedCents: cashSessions.cardTerminalExpectedCents,
      cardTerminalCountedCents: cashSessions.cardTerminalCountedCents,
      cardDescuadreCents: cashSessions.cardDescuadreCents,
      closingSnapshot: cashSessions.closingSnapshot,
    })
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.clientId, clientId),
        or(
          sql`(${cashSessions.openedAt} AT TIME ZONE 'Europe/Madrid')::date = ${day}::date`,
          sql`(${cashSessions.closedAt} AT TIME ZONE 'Europe/Madrid')::date = ${day}::date`,
        ),
      ),
    )
    .orderBy(desc(cashSessions.openedAt))
    .limit(1)
  const session = (sessionRows[0] as CashSessionRow | undefined) ?? null

  // Día con sesión cerrada y snapshot intacto → es la verdad inmutable.
  if (session?.closedAt && session.closingSnapshot) {
    const snap = session.closingSnapshot
    return {
      day,
      source: 'snapshot',
      sessionId: session.id,
      openingCents: snap.openingCents,
      openedAt: session.openedAt.toISOString(),
      openedByEmail: session.openedByEmail,
      closedAt: session.closedAt.toISOString(),
      cashExpectedCents: snap.cashExpectedCents,
      cardExpectedCents: snap.cardExpectedCents,
      onlineExpectedCents: snap.onlineExpectedCents,
      cashCountedCents: snap.cashCountedCents,
      cardCountedCents: snap.cardCountedCents ?? null,
      cashDescuadreCents: snap.cashDescuadreCents,
      cardDescuadreCents: snap.cardDescuadreCents,
      totals: snap.totals,
      byMethod: snap.byMethod,
      byKind: snap.byKind,
      byBarber: snap.byBarber,
      byPaymentDetail: snap.byPaymentDetail,
      movements: snap.movements,
      // Snapshots inmutables ya pasaron por la validación previa al cierre,
      // ningún método unknown sobrevive ahí.
      unknownMethodCount: 0,
    }
  }

  // Día con sesión abierta o cerrada sin snapshot legacy → live compute.
  if (session) {
    const breakdown = await loadBreakdownForSession(clientId, session.id)
    // Reusamos el motor de compute para los esperados.
    const expected = computeExpectedClosing(
      session.openingCents,
      breakdown.movements.map((m) => ({
        kind: m.kind,
        method: m.method,
        amountCents: m.amountCents,
      })),
    )
    return {
      day,
      source: 'session_live',
      sessionId: session.id,
      openingCents: session.openingCents,
      openedAt: session.openedAt.toISOString(),
      openedByEmail: session.openedByEmail,
      closedAt: session.closedAt ? session.closedAt.toISOString() : null,
      cashExpectedCents:
        session.closingCentsExpected ?? expected.cashExpectedCents,
      cardExpectedCents:
        session.cardTerminalExpectedCents ?? expected.cardExpectedCents,
      onlineExpectedCents: expected.onlineExpectedCents,
      cashCountedCents: session.closingCentsCounted,
      cardCountedCents: session.cardTerminalCountedCents,
      cashDescuadreCents: session.cashDescuadreCents,
      cardDescuadreCents: session.cardDescuadreCents,
      ...breakdown,
    }
  }

  // Día sin sesión — sintetizamos pseudo-movimientos desde las fuentes de
  // ingreso (bookings, product_sales, tips). Los kinds outgoing
  // (expense / withdrawal / refund) sólo existen ligados a una sesión, así
  // que aquí no aparecen.
  return synthesizeDayBreakdown(clientId, day)
}

interface SynthRow {
  id: string
  kind: MovementKind
  method: PaymentMethod | 'unknown'
  amountCents: number
  barberId: string | null
  createdAt: string
  notes: string | null
  referenceType: 'booking' | 'product_sale' | null
  referenceId: string | null
  referenceLabel: string | null
}

async function synthesizeDayBreakdown(
  clientId: string,
  day: string,
): Promise<DayBreakdown> {
  // 1) Bookings completados del día. Dos casos:
  //    a) `paymentMethod` simple ('cash' | 'card_physical' | 'bizum' |
  //       'card_online') → una sola línea con el método del booking y
  //       el importe = price_cents.
  //    b) `paymentMethod = 'mixed'` o null + payments(N) → desplegamos UNA
  //       línea por payment para preservar el split (cash/card/online en
  //       proporciones distintas dentro del mismo booking, mismo flow que
  //       cash_movements cuando sí hay sesión abierta).
  const bookingResult = await db.execute(sql`
    SELECT
      b.id::text AS id,
      'booking'::text AS kind,
      NULLIF(b.payment_method, '') AS raw_method,
      b.price_cents::int AS "amountCents",
      b.barber_id::text AS "barberId",
      b.created_at AS "createdAt",
      COALESCE(b.customer_name, b.customer_phone) AS "referenceLabel"
    FROM ${bookings} b
    WHERE b.client_id = ${clientId}
      AND b.status = 'completed'
      AND b.date = ${day}
      AND b.price_cents IS NOT NULL
      AND b.price_cents > 0
  `)
  const bookingHeader = (
    bookingResult as unknown as {
      rows: {
        id: string
        kind: MovementKind
        raw_method: string | null
        amountCents: number
        barberId: string | null
        createdAt: string
        referenceLabel: string | null
      }[]
    }
  ).rows

  // Para bookings con `mixed` (o null), buscamos sus payments succeeded.
  const splitBookingIds = bookingHeader
    .filter((b) => !b.raw_method || b.raw_method === 'mixed')
    .map((b) => b.id)
  type PaymentSplitRow = {
    booking_id: string
    method: string | null
    amount_cents: number
    paid_at: string
  }
  let splitsByBooking = new Map<string, PaymentSplitRow[]>()
  if (splitBookingIds.length > 0) {
    const splitsResult = await db.execute(sql`
      SELECT
        p.booking_id::text AS booking_id,
        p.method,
        p.amount_cents,
        p.paid_at
      FROM ${payments} p
      WHERE p.client_id = ${clientId}
        AND p.status = 'succeeded'
        AND p.booking_id = ANY(${splitBookingIds}::uuid[])
        AND p.amount_cents > 0
      ORDER BY p.paid_at ASC NULLS LAST
    `)
    const splitRows = (splitsResult as unknown as { rows: PaymentSplitRow[] })
      .rows
    splitsByBooking = splitRows.reduce((acc, r) => {
      const list = acc.get(r.booking_id) ?? []
      list.push(r)
      acc.set(r.booking_id, list)
      return acc
    }, new Map<string, PaymentSplitRow[]>())
  }

  const bookingRows: (Omit<SynthRow, 'method'> & {
    raw_method: string | null
  })[] = []
  for (const b of bookingHeader) {
    const splits = splitsByBooking.get(b.id)
    if (splits && splits.length > 0) {
      // Una pseudo-línea por payment (split-payment).
      for (const s of splits) {
        bookingRows.push({
          id: `${b.id}:${s.method ?? 'unknown'}:${s.amount_cents}:${s.paid_at}`,
          kind: 'booking',
          raw_method: s.method,
          amountCents: Number(s.amount_cents),
          barberId: b.barberId,
          createdAt: s.paid_at,
          notes: null,
          referenceType: 'booking',
          referenceId: b.id,
          referenceLabel: b.referenceLabel,
        })
      }
    } else {
      // Booking con paymentMethod directo (no mixed) y/o sin payments rows
      // (legacy) — una sola línea con su método.
      bookingRows.push({
        id: b.id,
        kind: 'booking',
        raw_method: b.raw_method,
        amountCents: Number(b.amountCents),
        barberId: b.barberId,
        createdAt: b.createdAt,
        notes: null,
        referenceType: 'booking',
        referenceId: b.id,
        referenceLabel: b.referenceLabel,
      })
    }
  }

  // 2) Ventas de productos del día (excluye consumo interno / mermas).
  const productResult = await db.execute(sql`
    SELECT
      ps.id::text AS id,
      'product_sale'::text AS kind,
      ps.payment_method AS raw_method,
      ps.total_cents AS "amountCents",
      ps.barber_id::text AS "barberId",
      ps.sold_at AS "createdAt",
      NULL::text AS notes,
      'product_sale'::text AS "referenceType",
      ps.id::text AS "referenceId",
      (SELECT p.name FROM ${productSales} ps2
         LEFT JOIN products p ON p.id = ps2.product_id
        WHERE ps2.id = ps.id) AS "referenceLabel"
    FROM ${productSales} ps
    WHERE ps.client_id = ${clientId}
      AND ps.consumption_kind IS NULL
      AND (ps.sold_at AT TIME ZONE 'Europe/Madrid')::date = ${day}::date
  `)
  const productRows = (
    productResult as unknown as {
      rows: (Omit<SynthRow, 'method'> & { raw_method: string | null })[]
    }
  ).rows

  // 3) Propinas pagadas el día. Sólo las cash entran al cuadre — las card
  //    se cobran fuera del cajón (Stripe Connect) y no son physically counted.
  const tipResult = await db.execute(sql`
    SELECT
      t.id::text AS id,
      'tip_cash'::text AS kind,
      'cash'::text AS raw_method,
      t.amount_cents AS "amountCents",
      t.barber_id::text AS "barberId",
      t.paid_at AS "createdAt",
      NULL::text AS notes,
      NULL::text AS "referenceType",
      NULL::text AS "referenceId",
      t.barber_name AS "referenceLabel"
    FROM ${tips} t
    WHERE t.client_id = ${clientId}
      AND t.status = 'paid'
      AND t.payment_method = 'cash'
      AND (t.paid_at AT TIME ZONE 'Europe/Madrid')::date = ${day}::date
      AND t.amount_cents > 0
  `)
  const tipRows = (
    tipResult as unknown as {
      rows: (Omit<SynthRow, 'method'> & { raw_method: string | null })[]
    }
  ).rows

  // Normalizamos `raw_method` (granular) al bucket coarse del cuadre
  // (cash / card / online). Mantenemos el detalle granular para
  // byPaymentDetail.
  const coarseMethod = (raw: string | null): PaymentMethod | 'unknown' => {
    if (raw === 'cash') return 'cash'
    if (raw === 'card' || raw === 'card_physical' || raw === 'bizum') return 'card'
    if (raw === 'online' || raw === 'card_online') return 'online'
    if (raw === 'mixed') return 'card' // contable: split-payment lo dejamos en card
    return 'unknown'
  }

  const allRaw = [...bookingRows, ...productRows, ...tipRows]
  const rows: SynthRow[] = allRaw.map((r) => ({
    id: r.id,
    kind: r.kind,
    method: coarseMethod(r.raw_method),
    amountCents: Number(r.amountCents),
    barberId: r.barberId,
    createdAt: new Date(r.createdAt).toISOString(),
    notes: r.notes,
    referenceType: r.referenceType,
    referenceId: r.referenceId,
    referenceLabel: r.referenceLabel,
  }))

  // Mapping id → nombre del barbero, igual que la variante session.
  const allBarbers = await db
    .select({ id: barbers.id, name: barbers.name })
    .from(barbers)
    .where(eq(barbers.clientId, clientId))
  const nameById = new Map(allBarbers.map((b) => [b.id, b.name]))

  // Granularidad fina por canal de cobro — sólo bookings tienen `payments`
  // detrás. Para tips/products usamos su `payment_method` directo.
  const validDetailMethods: ReadonlySet<PaymentMethodDetail> = new Set([
    'cash',
    'card_physical',
    'bizum',
    'card_online',
    'mixed',
    'unknown',
  ])

  const detailAcc = new Map<
    PaymentMethodDetail,
    { totalCents: number; count: number }
  >()
  for (const r of allRaw) {
    const raw = (r.raw_method ?? 'unknown') as PaymentMethodDetail
    const safe: PaymentMethodDetail = validDetailMethods.has(raw)
      ? raw
      : 'unknown'
    const entry = detailAcc.get(safe) ?? { totalCents: 0, count: 0 }
    entry.totalCents += Number(r.amountCents)
    entry.count += 1
    detailAcc.set(safe, entry)
  }
  const byPaymentDetail: PaymentMethodDetailRow[] = [...detailAcc.entries()]
    .map(([method, v]) => ({ method, totalCents: v.totalCents, count: v.count }))
    .sort((a, b) => b.totalCents - a.totalCents)

  const enriched: MovementForBreakdown[] = rows.map((r) => ({
    kind: r.kind,
    // `unknown` rebota arriba al `unknownMethodCount` — lo dejamos pasar.
    method: r.method as PaymentMethod,
    amountCents: r.amountCents,
    barberId: r.barberId,
  }))

  const movementList: MovementListItem[] = rows.map((r) => {
    const signed = isIncoming(r.kind) ? r.amountCents : -r.amountCents
    return {
      id: r.id,
      kind: r.kind,
      method: r.method as PaymentMethod,
      amountCents: r.amountCents,
      signedAmountCents: signed,
      barberId: r.barberId,
      barberName: r.barberId ? nameById.get(r.barberId) ?? null : null,
      createdAt: r.createdAt,
      notes: r.notes,
      referenceType: r.referenceType,
      referenceId: r.referenceId,
      referenceLabel: r.referenceLabel,
    }
  })
  // Orden cronológico ascendente, igual que la versión por sesión.
  movementList.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const breakdown = buildMovementBreakdown(
    enriched,
    nameById,
    movementList,
    byPaymentDetail,
  )

  // Esperados sin sesión: opening=0, sólo lo que entró suma. No hay
  // outgoings posibles (no hay session_id), así que cash neto = cash in.
  const expected = computeExpectedClosing(0, enriched)

  // openedAt sintético: 00:00 local del día (sólo para la cabecera del
  // report, no afecta a queries).
  const synthOpenedAtIso = `${day}T00:00:00.000Z`

  return {
    day,
    source: 'synthesized',
    sessionId: null,
    openingCents: 0,
    openedAt: synthOpenedAtIso,
    openedByEmail: '—',
    closedAt: null,
    cashExpectedCents: expected.cashExpectedCents,
    cardExpectedCents: expected.cardExpectedCents,
    onlineExpectedCents: expected.onlineExpectedCents,
    cashCountedCents: null,
    cardCountedCents: null,
    cashDescuadreCents: null,
    cardDescuadreCents: null,
    ...breakdown,
  }
}

