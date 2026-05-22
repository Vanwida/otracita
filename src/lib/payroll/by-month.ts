import { db } from '@/db'
import {
  barbers as barbersTable,
  bookings,
  bookingServices,
  productSales,
  tips,
  bonuses,
  bonusEntries,
  barberServiceCommissions,
} from '@/db/schema'
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { computeBarberPayroll, isProfileConfigured } from './compute'
import type { BarberSalaryProfile, BarberMonthRaw } from './types'
import { computeBonusProgress, type BonusUnit, type BonusKind } from '@/lib/bonuses/progress'
import {
  computeServicesCommissionCents,
  type ServiceRevenueRow,
  type ServiceCommissionOverride,
} from './services-commission'

// -----------------------------------------------------------------------------
// computePayrollTotalsByMonth — coste de nómina del LOCAL por mes, en BATCH.
//
// computeMonthlyPayroll(clientId, bounds) calcula UN mes con ~8 queries. Los
// endpoints multi-periodo (annual = 12 meses, quarterly = 3, trend ≤ 12) lo
// llamaban per-mes → 12×8 ≈ 96 queries en /annual, saturando el pool
// serverless de Neon. Este helper hace las MISMAS agregaciones pero agrupadas
// por mes en una sola query cada una (≈8 queries para el año entero), y luego
// corre la misma matemática pura por (mes, barbero).
//
// IMPORTANTE — no-regresión: la nómina NO es linealmente divisible por mes
// (un fijo de 1000€/mes no es "anual/12"). Por eso se calcula el breakdown
// por mes con su propio raw mensual, exactamente como computeMonthlyPayroll.
// La suma de los meses de un periodo == lo que darían N llamadas a
// computeMonthlyPayroll (mismas reglas de match: tips por barberName legacy,
// bonos por barberId; mismas funciones puras computeServicesCommissionCents /
// computeBarberPayroll / computeBonusProgress).
//
// Boundary de mes:
//   · bookings.date / bonus_entries.date son strings YYYY-MM-DD → mes =
//     substring(date,1,7) = 'YYYY-MM'.
//   · product_sales.sold_at / tips.paid_at son timestamps → mes =
//     to_char(col, 'YYYY-MM') en UTC, idéntico al filtro new Date(bounds)
//     que usa computeMonthlyPayroll hoy (sin cambio de semántica).
//
// Tenant-safe: clientId siempre del caller autenticado.
// -----------------------------------------------------------------------------

export interface PayrollByMonth {
  /** monthKey 'YYYY-MM' → coste total de nómina del local ese mes, en cents. */
  totalByMonth: Map<string, number>
}

/**
 * Coste total de nómina por mes para [spanStart, spanEnd). `monthKeys` es la
 * lista de meses 'YYYY-MM' que el caller necesita (meses sin actividad
 * devuelven 0). Devuelve solo el TOTAL por mes (los endpoints de P&L solo
 * restan la línea "Nóminas", no necesitan el desglose por barbero).
 */
export async function computePayrollTotalsByMonth(
  clientId: string,
  spanStart: string,
  spanEnd: string,
  monthKeys: string[],
): Promise<PayrollByMonth> {
  const empty = (): PayrollByMonth => ({
    totalByMonth: new Map(monthKeys.map((m) => [m, 0])),
  })

  // 1) Barberos activos (igual que computeMonthlyPayroll).
  const barbers = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, clientId), eq(barbersTable.active, true)))

  if (barbers.length === 0) return empty()

  const dateMonth = sql<string>`substring(${bookings.date}, 1, 7)`
  const beDateMonth = sql<string>`substring(${bonusEntries.date}, 1, 7)`
  const psMonth = sql<string>`to_char(${productSales.soldAt} AT TIME ZONE 'UTC', 'YYYY-MM')`
  const tipMonth = sql<string>`to_char(${tips.paidAt} AT TIME ZONE 'UTC', 'YYYY-MM')`

  // 2) Servicios por (mes, barbero). 2b) por (mes, barbero, servicio).
  // 2d) extras por (mes, barbero, nombre extra). 2c) overrides (no temporal).
  // 3) productos por (mes, barbero). 4) propinas por (mes, barberName).
  // 5) bonos: activos + progreso por (mes, bono, barbero).
  const [
    servicesRows,
    serviceByNameRows,
    extraRows,
    overrideRows,
    productRows,
    tipRows,
    activeBonuses,
    bonusProgressRows,
  ] = await Promise.all([
    db
      .select({
        month: dateMonth,
        barberId: bookings.barberId,
        totalEur: sql<string>`COALESCE(SUM(${bookings.price}), 0)`,
      })
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, spanStart), lt(bookings.date, spanEnd)))
      .groupBy(dateMonth, bookings.barberId),
    db
      .select({
        month: dateMonth,
        barberId: bookings.barberId,
        serviceName: bookings.service,
        totalEur: sql<string>`COALESCE(SUM(${bookings.price}), 0)`,
      })
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, spanStart), lt(bookings.date, spanEnd)))
      .groupBy(dateMonth, bookings.barberId, bookings.service),
    db
      .select({
        month: dateMonth,
        barberId: bookings.barberId,
        serviceName: bookingServices.name,
        totalEur: sql<string>`COALESCE(SUM(${bookingServices.priceEuros}), 0)`,
      })
      .from(bookingServices)
      .innerJoin(bookings, eq(bookingServices.bookingId, bookings.id))
      .where(and(eq(bookings.clientId, clientId), eq(bookings.status, 'completed'), gte(bookings.date, spanStart), lt(bookings.date, spanEnd)))
      .groupBy(dateMonth, bookings.barberId, bookingServices.name),
    db
      .select({
        barberId: barberServiceCommissions.barberId,
        serviceName: barberServiceCommissions.serviceName,
        pct: barberServiceCommissions.pct,
      })
      .from(barberServiceCommissions)
      .where(eq(barberServiceCommissions.clientId, clientId)),
    db
      // Excluye consumos internos / mermas — no son ingreso del barbero.
      .select({
        month: psMonth,
        barberId: productSales.barberId,
        totalCents: sql<string>`COALESCE(SUM(${productSales.totalCents}), 0)`,
      })
      .from(productSales)
      .where(and(eq(productSales.clientId, clientId), isNull(productSales.consumptionKind), gte(productSales.soldAt, new Date(spanStart)), lt(productSales.soldAt, new Date(spanEnd))))
      .groupBy(psMonth, productSales.barberId),
    db
      .select({
        month: tipMonth,
        barberName: tips.barberName,
        totalCents: sql<string>`COALESCE(SUM(${tips.amountCents}), 0)`,
        // R-T3 — split cash/card por mes para que el total de nómina
        // solo cuente el CARD (CASH ya está en el bolsillo del barbero).
        cashCents:
          sql<string>`COALESCE(SUM(${tips.amountCents}) FILTER (WHERE ${tips.paymentMethod} = 'cash'), 0)`,
        cardCents:
          sql<string>`COALESCE(SUM(${tips.amountCents}) FILTER (WHERE COALESCE(${tips.paymentMethod}, 'card') = 'card'), 0)`,
      })
      .from(tips)
      .where(and(eq(tips.clientId, clientId), eq(tips.status, 'paid'), gte(tips.paidAt, new Date(spanStart)), lt(tips.paidAt, new Date(spanEnd))))
      .groupBy(tipMonth, tips.barberName),
    db
      .select()
      .from(bonuses)
      .where(and(eq(bonuses.clientId, clientId), eq(bonuses.active, true))),
    db
      .select({
        month: beDateMonth,
        bonusId: bonusEntries.bonusId,
        barberId: bonusEntries.barberId,
        progress: sql<string>`COALESCE(SUM(${bonusEntries.value}), 0)`,
      })
      .from(bonusEntries)
      .where(and(eq(bonusEntries.clientId, clientId), gte(bonusEntries.date, spanStart), lt(bonusEntries.date, spanEnd)))
      .groupBy(beDateMonth, bonusEntries.bonusId, bonusEntries.barberId),
  ])

  // Índices por mes. servicesRevenueMap[month][barberId] = cents (principal +
  // extras), serviceRowsByBarber[month][barberId] = filas por servicio.
  const servicesRevenue = new Map<string, Map<string, number>>()
  const serviceRows = new Map<string, Map<string, ServiceRevenueRow[]>>()
  const productsRevenue = new Map<string, Map<string, number>>()
  const tipsByBarber = new Map<string, Map<string, number>>()
  const tipsCashByBarber = new Map<string, Map<string, number>>()
  const tipsCardByBarber = new Map<string, Map<string, number>>()

  const mset = <V>(m: Map<string, Map<string, V>>, mk: string): Map<string, V> => {
    let inner = m.get(mk)
    if (!inner) {
      inner = new Map<string, V>()
      m.set(mk, inner)
    }
    return inner
  }

  for (const r of servicesRows) {
    if (!r.month || !r.barberId) continue
    const inner = mset(servicesRevenue, r.month)
    inner.set(r.barberId, (inner.get(r.barberId) ?? 0) + Math.round(parseFloat(r.totalEur ?? '0') * 100))
  }
  for (const r of serviceByNameRows) {
    if (!r.month || !r.barberId || !r.serviceName) continue
    const cents = Math.round(parseFloat(r.totalEur ?? '0') * 100)
    const inner = mset(serviceRows, r.month)
    const list = inner.get(r.barberId) ?? []
    list.push({ serviceName: r.serviceName, revenueCents: cents })
    inner.set(r.barberId, list)
  }
  for (const r of extraRows) {
    if (!r.month || !r.barberId || !r.serviceName) continue
    const cents = Math.round(parseFloat(r.totalEur ?? '0') * 100)
    if (cents <= 0) continue
    const sInner = mset(servicesRevenue, r.month)
    sInner.set(r.barberId, (sInner.get(r.barberId) ?? 0) + cents)
    const rInner = mset(serviceRows, r.month)
    const list = rInner.get(r.barberId) ?? []
    list.push({ serviceName: r.serviceName, revenueCents: cents })
    rInner.set(r.barberId, list)
  }
  for (const r of productRows) {
    if (!r.month || !r.barberId) continue
    mset(productsRevenue, r.month).set(r.barberId, Number(r.totalCents ?? 0))
  }
  for (const r of tipRows) {
    if (!r.month || !r.barberName) continue
    const norm = r.barberName.trim().toLowerCase()
    const match = barbers.find((b) => b.name.trim().toLowerCase() === norm)
    if (!match) continue
    const inner = mset(tipsByBarber, r.month)
    inner.set(match.id, (inner.get(match.id) ?? 0) + Number(r.totalCents ?? 0))
    const cashInner = mset(tipsCashByBarber, r.month)
    cashInner.set(match.id, (cashInner.get(match.id) ?? 0) + Number(r.cashCents ?? 0))
    const cardInner = mset(tipsCardByBarber, r.month)
    cardInner.set(match.id, (cardInner.get(match.id) ?? 0) + Number(r.cardCents ?? 0))
  }

  // Overrides por barbero (no temporales, igual que computeMonthlyPayroll).
  const overridesByBarber = new Map<string, ServiceCommissionOverride[]>()
  for (const row of overrideRows) {
    const list = overridesByBarber.get(row.barberId) ?? []
    list.push({ serviceName: row.serviceName, pct: row.pct })
    overridesByBarber.set(row.barberId, list)
  }

  // Bonos: progreso por (mes, bono, barbero) → payout por (mes, barbero).
  const progressMap = new Map<string, number>()
  for (const p of bonusProgressRows) {
    if (!p.month) continue
    progressMap.set(`${p.month}|${p.bonusId}|${p.barberId}`, Number(p.progress ?? 0))
  }
  const bonusesPayout = new Map<string, Map<string, number>>()
  for (const mk of monthKeys) {
    const inner = mset(bonusesPayout, mk)
    for (const barber of barbers) {
      let total = 0
      for (const bonus of activeBonuses) {
        const progress = progressMap.get(`${mk}|${bonus.id}|${barber.id}`) ?? 0
        const r = computeBonusProgress({
          unit: bonus.unit as BonusUnit,
          kind: bonus.kind as BonusKind,
          target: bonus.target,
          rewardCents: bonus.rewardCents,
          entries: [progress],
        })
        total += r.payoutCents
      }
      inner.set(barber.id, total)
    }
  }

  // Breakdown por (mes, barbero), idéntico a computeMonthlyPayroll.
  const totalByMonth = new Map<string, number>()
  for (const mk of monthKeys) {
    let monthTotal = 0
    for (const barber of barbers) {
      const profile: BarberSalaryProfile = {
        salaryType: (barber.salaryType as BarberSalaryProfile['salaryType']) ?? null,
        salaryBaseCents: barber.salaryBaseCents,
        commissionServicesPct: barber.commissionServicesPct,
        commissionProductsPct: barber.commissionProductsPct,
        chairRentCents: barber.chairRentCents,
        tierBonuses: barber.tierBonuses ?? null,
      }
      if (!isProfileConfigured(profile)) continue

      const raw: BarberMonthRaw = {
        servicesRevenueCents: servicesRevenue.get(mk)?.get(barber.id) ?? 0,
        productsRevenueCents: productsRevenue.get(mk)?.get(barber.id) ?? 0,
        tipsCents: tipsByBarber.get(mk)?.get(barber.id) ?? 0,
        tipsCashCents: tipsCashByBarber.get(mk)?.get(barber.id) ?? 0,
        tipsCardCents: tipsCardByBarber.get(mk)?.get(barber.id) ?? 0,
        bonusesPayoutCents: bonusesPayout.get(mk)?.get(barber.id) ?? 0,
      }

      const servicesCommissionCents = computeServicesCommissionCents({
        rows: serviceRows.get(mk)?.get(barber.id) ?? [],
        overrides: overridesByBarber.get(barber.id) ?? [],
        globalPct: profile.commissionServicesPct,
      })

      monthTotal += computeBarberPayroll(profile, raw, servicesCommissionCents).totalCents
    }
    totalByMonth.set(mk, monthTotal)
  }

  return { totalByMonth }
}
