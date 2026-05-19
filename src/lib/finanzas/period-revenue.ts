import { db } from '@/db';
import { bookings, bookingServices, manualIncomes, productSales, tips } from '@/db/schema';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
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
      .select({ total: sql<string>`COALESCE(SUM(${productSales.totalCents}), 0)` })
      .from(productSales)
      .where(and(eq(productSales.clientId, clientId), gte(productSales.soldAt, new Date(start)), lt(productSales.soldAt, new Date(end)))),
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
      .select({
        month: sql<number>`EXTRACT(MONTH FROM (${productSales.soldAt} AT TIME ZONE 'Europe/Madrid')::date)::int`,
        total: sql<string>`COALESCE(SUM(${productSales.totalCents}), 0)`,
      })
      .from(productSales)
      .where(and(eq(productSales.clientId, clientId), gte(productSales.soldAt, new Date(yearStart)), lt(productSales.soldAt, new Date(yearEnd))))
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
