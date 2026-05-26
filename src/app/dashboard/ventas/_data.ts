import 'server-only'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import {
  barbers as barbersTable,
  bookings,
  cashSessions,
  clients,
  invoices,
  productSales,
  products,
  tips,
} from '@/db/schema'
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  type Period,
  type PeriodSelectionInput,
  resolvePeriodSelection,
  getPreviousPeriod,
} from '@/lib/dashboard/period'
import type { ClosedRegister } from '../caja/CajaRegisters'

// -----------------------------------------------------------------------------
// Datos compartidos del área Ventas. Extraído 1:1 del antiguo
// `caja/page.tsx` — las QUERIES Y LA LÓGICA DE SERVIDOR NO CAMBIAN: solo se
// centralizan para que las pestañas (Resumen / Cierre de caja / Cobros) las
// consuman sin duplicar. Multi-tenancy igual: el client se resuelve siempre
// de la sesión, nunca del request.
//
// bookings.price está en EUROS (foot-gun documentado en CLAUDE.md). tips,
// productSales e invoices viven en céntimos.
// -----------------------------------------------------------------------------

interface KpiRow {
  billed_eur: number | string
  completed_count: number
  tips_cents: number | string
  upsells_cents: number | string
  upsells_count: number
}

export interface VentasData {
  client: typeof clients.$inferSelect
  period: Period
  periodLabel: string
  periodStartIso: string | null
  billedEur: number
  completedCount: number
  tipsEur: number
  upsellsEur: number
  upsellsCount: number
  ticketMedio: number
  billedPrev: number | null
  completedPrev: number | null
  tipsPrevEur: number | null
  invoiceCountThisMonth: number
  hasEmittedInvoices: boolean
  registerHistory: ClosedRegister[]
}

/** Resuelve sesión + client + KPIs del periodo. Idéntico al caja/page.tsx
 *  original (mismas queries, mismos casts, mismo orden). */
export async function loadVentasData(
  input: PeriodSelectionInput,
): Promise<VentasData> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const now = new Date()
  const selection = resolvePeriodSelection(input, now, 'month')
  const period: Period = selection.period
  const periodStart = selection.periodStart
  const periodEnd = selection.periodEnd
  const periodStartIso = selection.periodStartIso
  const periodEndIso = selection.periodEndIso

  const previousPeriod = getPreviousPeriod(period, periodStart, now, {
    date: selection.date,
    start: selection.rangeStart,
    end: selection.rangeEnd,
  })
  // Acotamos por arriba con `periodEndIso` cuando lo hay (day, range, week,
  // month, year). En lifetime queda sin tope superior — mismo comportamiento
  // que antes (solo había `AND date >= …` o nada).
  const periodWhereDate = periodStartIso
    ? periodEndIso
      ? sql`AND date >= ${periodStartIso} AND date < ${periodEndIso}`
      : sql`AND date >= ${periodStartIso}`
    : sql``
  // Para tips/productSales el filtro va contra timestamps (paid_at, sold_at).
  // Cuando hay tope superior `periodEnd` lo aplicamos también — sin él, un
  // `day=2026-05-03` sumaba propinas POSTERIORES al 3 de mayo, bug.
  const tipsWhere = periodStart
    ? periodEnd
      ? sql`AND paid_at >= ${periodStart} AND paid_at < ${periodEnd}`
      : sql`AND paid_at >= ${periodStart}`
    : sql``
  const upsellsWhere = periodStart
    ? periodEnd
      ? sql`AND sold_at >= ${periodStart} AND sold_at < ${periodEnd}`
      : sql`AND sold_at >= ${periodStart}`
    : sql``

  // ─── KPIs principales ────────────────────────────────────────────────────
  const [kpiRow] =
    (await db
      .execute(sql`
    SELECT
      (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
        WHERE client_id = ${client.id} AND status = 'completed'
        ${periodWhereDate})::bigint AS billed_eur,
      (SELECT COUNT(*) FROM ${bookings}
        WHERE client_id = ${client.id} AND status = 'completed'
        ${periodWhereDate})::int AS completed_count,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
        WHERE client_id = ${client.id} AND status = 'paid'
        ${tipsWhere})::bigint AS tips_cents,
      (SELECT COALESCE(SUM(total_cents), 0) FROM ${productSales}
        WHERE client_id = ${client.id} AND consumption_kind IS NULL
        ${upsellsWhere})::bigint AS upsells_cents,
      (SELECT COUNT(*) FROM ${productSales}
        WHERE client_id = ${client.id} AND consumption_kind IS NULL
        ${upsellsWhere})::int AS upsells_count
  `)
      .then((r) => (r as unknown as { rows: KpiRow[] }).rows)) ?? []

  const billedEur = Number(kpiRow?.billed_eur ?? 0)
  const completedCount = Number(kpiRow?.completed_count ?? 0)
  const tipsEur = Number(kpiRow?.tips_cents ?? 0) / 100
  const upsellsEur = Number(kpiRow?.upsells_cents ?? 0) / 100
  const upsellsCount = Number(kpiRow?.upsells_count ?? 0)

  let billedPrev: number | null = null
  let completedPrev: number | null = null
  let tipsPrevEur: number | null = null
  if (previousPeriod) {
    const [prevRow] =
      (await db
        .execute(sql`
      SELECT
        (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
          WHERE client_id = ${client.id} AND status = 'completed'
          AND date >= ${previousPeriod.startIso} AND date < ${periodStartIso ?? previousPeriod.endIso}
        )::bigint AS billed_eur,
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${client.id} AND status = 'completed'
          AND date >= ${previousPeriod.startIso} AND date < ${periodStartIso ?? previousPeriod.endIso}
        )::int AS completed_count,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
          WHERE client_id = ${client.id} AND status = 'paid'
          AND paid_at >= ${previousPeriod.startDate} AND paid_at < ${periodStart ?? previousPeriod.endDate}
        )::bigint AS tips_cents
    `)
        .then(
          (r) =>
            (
              r as unknown as {
                rows: {
                  billed_eur: string | number
                  completed_count: number
                  tips_cents: string | number
                }[]
              }
            ).rows,
        )) ?? []
    billedPrev = prevRow ? Number(prevRow.billed_eur) : null
    completedPrev = prevRow ? Number(prevRow.completed_count) : null
    tipsPrevEur = prevRow ? Number(prevRow.tips_cents) / 100 : null
  }

  // ─── Facturas: contador este mes + flag hasEmittedInvoices para lock ────
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const nextMonthStartIso = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10)
  const [invoiceCountRow] = await db
    .select({
      thisMonth: sql<number>`count(*) FILTER (WHERE issue_date >= ${monthStartIso} AND issue_date < ${nextMonthStartIso})`,
      total: sql<number>`count(*)`,
    })
    .from(invoices)
    .where(eq(invoices.clientId, client.id))
  const invoiceCountThisMonth = Number(invoiceCountRow?.thisMonth ?? 0)
  const hasEmittedInvoices = Number(invoiceCountRow?.total ?? 0) > 0

  // ─── Histórico de cajas cerradas (read-only, multi-tenant por client.id).
  let registerHistory: ClosedRegister[] = []
  if (client.cashRegisterEnabled) {
    const closed = await db
      .select({
        id: cashSessions.id,
        openingCents: cashSessions.openingCents,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
        closingCentsExpected: cashSessions.closingCentsExpected,
        closingCentsCounted: cashSessions.closingCentsCounted,
        cashDescuadreCents: cashSessions.cashDescuadreCents,
        cardTerminalExpectedCents: cashSessions.cardTerminalExpectedCents,
        cardDescuadreCents: cashSessions.cardDescuadreCents,
        closingSnapshot: cashSessions.closingSnapshot,
        openingCarriedFromSessionId: cashSessions.openingCarriedFromSessionId,
        openingCarriedCents: cashSessions.openingCarriedCents,
        openingManualAdjustmentReason: cashSessions.openingManualAdjustmentReason,
      })
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.clientId, client.id),
          isNotNull(cashSessions.closedAt),
        ),
      )
      .orderBy(desc(cashSessions.closedAt))
      .limit(60)
    registerHistory = closed.map((r) => ({
      id: r.id,
      openingCents: r.openingCents,
      openedAt: r.openedAt.toISOString(),
      closedAt: (r.closedAt as Date).toISOString(),
      closingCentsExpected: r.closingCentsExpected,
      closingCentsCounted: r.closingCentsCounted,
      cashDescuadreCents: r.cashDescuadreCents,
      cardTerminalExpectedCents: r.cardTerminalExpectedCents,
      cardDescuadreCents: r.cardDescuadreCents,
      // Cast: drizzle devuelve `unknown` para jsonb. Si la migración aún no
      // se aplicó en este entorno (lazy migration policy), `closingSnapshot`
      // será undefined en el row → mapearlo a null aquí. Si el shape no
      // matchea la versión esperada, la UI cae al desglose básico (no peta).
      closingSnapshot:
        (r.closingSnapshot as ClosedRegister['closingSnapshot']) ?? null,
      // Carryover info (task #91). Si la migración 0057 aún no se aplicó en
      // este entorno, drizzle devuelve undefined → mapeamos a null y la UI
      // cae al render previo (sin info de carryover) sin petar.
      openingCarriedFromSessionId: r.openingCarriedFromSessionId ?? null,
      openingCarriedCents: r.openingCarriedCents ?? null,
      openingManualAdjustmentReason: r.openingManualAdjustmentReason ?? null,
    }))
  }

  const periodLabel = selection.periodLabel
  const ticketMedio = completedCount > 0 ? billedEur / completedCount : 0

  return {
    client,
    period,
    periodLabel,
    periodStartIso,
    billedEur,
    completedCount,
    tipsEur,
    upsellsEur,
    upsellsCount,
    ticketMedio,
    billedPrev,
    completedPrev,
    tipsPrevEur,
    invoiceCountThisMonth,
    hasEmittedInvoices,
    registerHistory,
  }
}

// -----------------------------------------------------------------------------
// loadPosData — catálogo para el TPV "Nueva venta" (pestaña índice de Ventas).
//
// Mismas fuentes que ya consume la agenda y la tienda — NO se reinventa:
//   · servicios → clients.chatbotServices (catálogo jsonb, igual que
//     NewBookingPanel / availability)
//   · productos → products activos por client.id (query EXACTA de
//     ventas/productos)
//   · equipo → tabla canonical `barbers` (active, displayOrder) — nunca
//     clients.booksyServices (legacy congelado, CLAUDE.md regla 4)
//
// El cobro real NO pasa por aquí: lo hace POST /api/pos/sale, que reusa el
// pipeline único createBooking + auto-factura + caja.
// -----------------------------------------------------------------------------

export interface PosServiceItem {
  name: string
  priceEuros: number
  durationMin: number
}

export interface PosProductItem {
  id: string
  name: string
  priceCents: number
  stockQuantity: number | null
}

export interface PosBarberItem {
  id: string
  name: string
}

export interface PosData {
  client: typeof clients.$inferSelect
  services: PosServiceItem[]
  products: PosProductItem[]
  barbers: PosBarberItem[]
}

export async function loadPosData(): Promise<PosData> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const rawServices =
    (client.chatbotServices as
      | Array<{ name?: unknown; price?: unknown; duration?: unknown }>
      | null) || []
  const services: PosServiceItem[] = rawServices
    .filter((s) => s && typeof s.name === 'string' && s.name.trim().length > 0)
    .map((s) => ({
      name: String(s.name).trim(),
      priceEuros: typeof s.price === 'number' && s.price >= 0 ? s.price : 0,
      durationMin:
        typeof s.duration === 'number' && s.duration > 0
          ? Math.trunc(s.duration)
          : 30,
    }))

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      priceCents: products.priceCents,
      stockQuantity: products.stockQuantity,
    })
    .from(products)
    .where(and(eq(products.clientId, client.id), eq(products.active, true)))
    .orderBy(asc(products.displayOrder), asc(products.createdAt))

  const barberRows = await db
    .select({ id: barbersTable.id, name: barbersTable.name })
    .from(barbersTable)
    .where(
      and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)),
    )
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))

  return {
    client,
    services,
    products: productRows,
    barbers: barberRows,
  }
}
