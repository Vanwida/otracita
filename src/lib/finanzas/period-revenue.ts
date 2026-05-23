import { db } from '@/db';
import { bookings, bookingServices, manualIncomes, productSales, products, tips } from '@/db/schema';
import { and, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { RevenueComponents } from './pnl-math';

// -----------------------------------------------------------------------------
// Componentes de ingreso de un periodo, leídos de DB. Centraliza las 5 queries
// (bookings, extras R7, manual, productos, propinas) para que TODOS los
// endpoints de finanzas (trend/quarterly/historical/annual + summary) sumen
// EXACTAMENTE lo mismo. Antes cada endpoint copiaba un subconjunto distinto.
//
// Tenant-safe: clientId siempre del caller autenticado (requireClientAccess),
// nunca del request. `start`/`end` son fechas YYYY-MM-DD (bookings.date es
// string en ese formato); para tablas con timestamp (product_sales.soldAt,
// tips.paidAt) se castea a Date — mismo criterio que summary/route.ts.
//
// extras separados (no LEFT JOIN) para no inflar SUM(bookings.price) por
// fan-out cuando una cita tiene varios servicios extra.
// -----------------------------------------------------------------------------

/**
 * Componentes de ingreso de [start, end). `manualIncomes` puede excluirse
 * (algún endpoint legacy no lo sumaba); por defecto se incluye.
 */
export async function periodRevenueComponents(
  clientId: string,
  start: string,
  end: string,
  opts: { includeManual?: boolean } = {},
): Promise<RevenueComponents> {
  const includeManual = opts.includeManual ?? true;

  const [bookingRes, extrasRes, manualRes, productsRes, tipsRes] = await Promise.all([
    db
      .select({ total: sql<string>`COALESCE(SUM(${bookings.price}), 0)` })
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, start), lt(bookings.date, end))),
    db
      .select({ total: sql<string>`COALESCE(SUM(${bookingServices.priceEuros}), 0)` })
      .from(bookingServices)
      .innerJoin(bookings, eq(bookingServices.bookingId, bookings.id))
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, start), lt(bookings.date, end))),
    includeManual
      ? db
          .select({ total: sql<string>`COALESCE(SUM(${manualIncomes.amountCents}), 0)` })
          .from(manualIncomes)
          .where(and(eq(manualIncomes.clientId, clientId), gte(manualIncomes.date, start), lt(manualIncomes.date, end)))
      : Promise.resolve([{ total: '0' }] as { total: string }[]),
    db
      // Excluye consumos internos / mermas — no son ingreso.
      .select({ total: sql<string>`COALESCE(SUM(${productSales.totalCents}), 0)` })
      .from(productSales)
      .where(and(eq(productSales.clientId, clientId), isNull(productSales.consumptionKind), gte(productSales.soldAt, new Date(start)), lt(productSales.soldAt, new Date(end)))),
    db
      .select({ total: sql<string>`COALESCE(SUM(${tips.amountCents}), 0)` })
      .from(tips)
      .where(and(eq(tips.clientId, clientId), eq(tips.status, 'paid'), gte(tips.paidAt, new Date(start)), lt(tips.paidAt, new Date(end)))),
  ]);

  return {
    bookingPriceEuros: parseFloat(bookingRes[0]?.total ?? '0'),
    extrasEuros: parseFloat(extrasRes[0]?.total ?? '0'),
    manualCents: parseInt(manualRes[0]?.total ?? '0', 10),
    productsCents: parseInt(productsRes[0]?.total ?? '0', 10),
    tipsCents: parseInt(tipsRes[0]?.total ?? '0', 10),
  };
}

/**
 * Igual que `periodRevenueComponents` pero agregado por MES del año (1..12)
 * en pocas queries con GROUP BY — para /annual, que no puede lanzar 60
 * queries paralelas (satura el pool serverless de Neon). Devuelve un Map
 * month→components; meses sin datos no aparecen (el caller usa 0 por defecto).
 */
export async function annualRevenueComponentsByMonth(
  clientId: string,
  yearStart: string,
  yearEnd: string,
): Promise<Map<number, RevenueComponents>> {
  const [bookingRows, extrasRows, manualRows, productRows, tipRows] = await Promise.all([
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${bookings.date}::date)::int`,
        totalEur: sql<string>`COALESCE(SUM(${bookings.price}), 0)`,
      })
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, yearStart), lt(bookings.date, yearEnd)))
      .groupBy(sql`EXTRACT(MONTH FROM ${bookings.date}::date)`),
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${bookings.date}::date)::int`,
        totalEur: sql<string>`COALESCE(SUM(${bookingServices.priceEuros}), 0)`,
      })
      .from(bookingServices)
      .innerJoin(bookings, eq(bookingServices.bookingId, bookings.id))
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, yearStart), lt(bookings.date, yearEnd)))
      .groupBy(sql`EXTRACT(MONTH FROM ${bookings.date}::date)`),
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${manualIncomes.date}::date)::int`,
        total: sql<string>`COALESCE(SUM(${manualIncomes.amountCents}), 0)`,
      })
      .from(manualIncomes)
      .where(and(eq(manualIncomes.clientId, clientId), gte(manualIncomes.date, yearStart), lt(manualIncomes.date, yearEnd)))
      .groupBy(sql`EXTRACT(MONTH FROM ${manualIncomes.date}::date)`),
    db
      // Excluye consumos internos / mermas — no son ingreso.
      .select({
        month: sql<number>`EXTRACT(MONTH FROM (${productSales.soldAt} AT TIME ZONE 'Europe/Madrid')::date)::int`,
        total: sql<string>`COALESCE(SUM(${productSales.totalCents}), 0)`,
      })
      .from(productSales)
      .where(and(eq(productSales.clientId, clientId), isNull(productSales.consumptionKind), gte(productSales.soldAt, new Date(yearStart)), lt(productSales.soldAt, new Date(yearEnd))))
      .groupBy(sql`EXTRACT(MONTH FROM (${productSales.soldAt} AT TIME ZONE 'Europe/Madrid')::date)`),
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM (${tips.paidAt} AT TIME ZONE 'Europe/Madrid')::date)::int`,
        total: sql<string>`COALESCE(SUM(${tips.amountCents}), 0)`,
      })
      .from(tips)
      .where(and(eq(tips.clientId, clientId), eq(tips.status, 'paid'), gte(tips.paidAt, new Date(yearStart)), lt(tips.paidAt, new Date(yearEnd))))
      .groupBy(sql`EXTRACT(MONTH FROM (${tips.paidAt} AT TIME ZONE 'Europe/Madrid')::date)`),
  ]);

  const byMonth = new Map<number, RevenueComponents>();
  const ensure = (m: number): RevenueComponents => {
    let r = byMonth.get(m);
    if (!r) {
      r = { bookingPriceEuros: 0, extrasEuros: 0, manualCents: 0, productsCents: 0, tipsCents: 0 };
      byMonth.set(m, r);
    }
    return r;
  };

  for (const row of bookingRows) ensure(row.month).bookingPriceEuros = parseFloat(row.totalEur);
  for (const row of extrasRows) ensure(row.month).extrasEuros = parseFloat(row.totalEur);
  for (const row of manualRows) ensure(row.month).manualCents = parseInt(row.total, 10);
  for (const row of productRows) ensure(row.month).productsCents = parseInt(row.total, 10);
  for (const row of tipRows) ensure(row.month).tipsCents = parseInt(row.total, 10);

  return byMonth;
}

// -----------------------------------------------------------------------------
// Coste de stock consumido — gasto real del periodo.
//
// `product_sales` con `consumption_kind` IN ('internal', 'damage') decrementa
// stock pero NO suma a revenue (correcto — no hubo flujo de dinero). El error
// era que TAMPOCO aparecía en gastos: ese producto SE PAGÓ al proveedor y se
// gastó internamente o se rompió → es coste real que el P&L debe reflejar.
//
// Cálculo:   SUM(quantity * COALESCE(cost_price_cents, price_cents))
//   · `cost_price_cents` = coste de compra unitario (lo ideal).
//   · `price_cents`      = fallback conservador (margen 0) cuando el jefe aún
//                          no ha configurado costes. Asegura que el gasto
//                          aparece desde el día 1 sin pedir setup previo.
//
// Desglose `internal` vs `damage` para el UI ("consumo barbero" vs "merma").
// Espejo simétrico de `periodRevenueComponents` (que filtra por
// `consumption_kind IS NULL`). Tenant-safe igual que el resto.
// -----------------------------------------------------------------------------

/** Coste del stock consumido (interno + merma) en céntimos, ya desglosado. */
export interface StockConsumptionCost {
  /** Coste del consumo interno del barbero (gomina, cera de uso). */
  internalCents: number;
  /** Coste de la merma / rotura. */
  damageCents: number;
  /** Suma = internal + damage. Lo que entra en `totalGastosCents`. */
  totalCents: number;
}

/**
 * Suma el coste del stock consumido del periodo `[start, end)`. `start`/`end`
 * son YYYY-MM-DD (mismo criterio que `periodRevenueComponents`); a Date para
 * comparar con `product_sales.sold_at`.
 */
export async function periodStockConsumptionCost(
  clientId: string,
  start: string,
  end: string,
): Promise<StockConsumptionCost> {
  const rows = await db
    .select({
      kind: productSales.consumptionKind,
      total: sql<string>`COALESCE(SUM(${productSales.quantity} * COALESCE(${products.costPriceCents}, ${products.priceCents})), 0)`,
    })
    .from(productSales)
    .innerJoin(products, eq(productSales.productId, products.id))
    .where(
      and(
        eq(productSales.clientId, clientId),
        isNotNull(productSales.consumptionKind),
        gte(productSales.soldAt, new Date(start)),
        lt(productSales.soldAt, new Date(end)),
      ),
    )
    .groupBy(productSales.consumptionKind);

  let internalCents = 0;
  let damageCents = 0;
  for (const row of rows) {
    const cents = parseInt(row.total, 10);
    if (row.kind === 'internal') internalCents = cents;
    else if (row.kind === 'damage') damageCents = cents;
    // Otros kinds futuros: ignorados aquí; añadirlos explícitamente cuando se
    // introduzcan para evitar contar dos veces sin querer.
  }
  return { internalCents, damageCents, totalCents: internalCents + damageCents };
}

/**
 * Igual que `periodStockConsumptionCost` pero agregado por MES del año para
 * `annualRevenueComponentsByMonth` — sin saturar el pool de Neon con 12
 * queries paralelas. Devuelve un Map month→cost; meses sin consumos no
 * aparecen (el caller usa 0 por defecto).
 */
export async function annualStockConsumptionCostByMonth(
  clientId: string,
  yearStart: string,
  yearEnd: string,
): Promise<Map<number, StockConsumptionCost>> {
  const rows = await db
    .select({
      month: sql<number>`EXTRACT(MONTH FROM (${productSales.soldAt} AT TIME ZONE 'Europe/Madrid')::date)::int`,
      kind: productSales.consumptionKind,
      total: sql<string>`COALESCE(SUM(${productSales.quantity} * COALESCE(${products.costPriceCents}, ${products.priceCents})), 0)`,
    })
    .from(productSales)
    .innerJoin(products, eq(productSales.productId, products.id))
    .where(
      and(
        eq(productSales.clientId, clientId),
        isNotNull(productSales.consumptionKind),
        gte(productSales.soldAt, new Date(yearStart)),
        lt(productSales.soldAt, new Date(yearEnd)),
      ),
    )
    .groupBy(
      sql`EXTRACT(MONTH FROM (${productSales.soldAt} AT TIME ZONE 'Europe/Madrid')::date)`,
      productSales.consumptionKind,
    );

  const byMonth = new Map<number, StockConsumptionCost>();
  const ensure = (m: number): StockConsumptionCost => {
    let r = byMonth.get(m);
    if (!r) {
      r = { internalCents: 0, damageCents: 0, totalCents: 0 };
      byMonth.set(m, r);
    }
    return r;
  };
  for (const row of rows) {
    const cents = parseInt(row.total, 10);
    const slot = ensure(row.month);
    if (row.kind === 'internal') slot.internalCents = cents;
    else if (row.kind === 'damage') slot.damageCents = cents;
    slot.totalCents = slot.internalCents + slot.damageCents;
  }
  return byMonth;
}
