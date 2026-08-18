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
import { and, eq, gte, isNull, lt, sum, sql } from 'drizzle-orm'
import { computeBarberPayroll, isProfileConfigured } from './compute'
import type { BarberSalaryProfile, BarberMonthRaw, PayrollBreakdown, SalaryType } from './types'
import { computeBonusProgress, type BonusUnit, type BonusKind } from '@/lib/bonuses/progress'
import {
  computeServicesCommissionCents,
  type ServiceRevenueRow,
  type ServiceCommissionOverride,
} from './services-commission'

// -----------------------------------------------------------------------------
// computeMonthlyPayroll — agregación DB-pesada del payroll por barbero para
// un mes. Usado por:
//   · /api/finanzas/payroll/route.ts (devuelve el desglose entero)
//   · /api/finanzas/summary/route.ts (necesita el total para restar del P&L)
//
// Centraliza las 4 queries (bookings, productos, propinas, bonos) en un
// solo lugar para que ambos endpoints calculen lo MISMO. Sin esto, el
// total nóminas que ve el barbero en /equipo podría no coincidir con la
// línea "Nóminas" que ve en el P&L de /finanzas — incoherencia clásica.
// -----------------------------------------------------------------------------

export interface MonthlyPayrollItem {
  barberId: string
  barberName: string
  salaryType: SalaryType | null
  profile: BarberSalaryProfile
  raw: BarberMonthRaw
  breakdown: PayrollBreakdown
  /**
   * Épica Reni #28 parte 3b — IDs de las propinas CARD pendientes de pagar
   * a este barbero en el mes (paid_out_at IS NULL, payment_method='card' o
   * NULL legacy). La UI las usa para el botón "Marcar X propinas como
   * pagadas" → POST /api/tips/payout con estos ids.
   *
   * Solo CARD: las cash el barbero ya las tiene en mano, no se "liquidan"
   * desde la nómina (se liquidan desde /informes/propinas si el jefe quiere
   * registrarlo).
   */
  pendingCardTipIds: string[]
}

export interface MonthlyPayroll {
  items: MonthlyPayrollItem[]
  totalCents: number
}

export interface MonthBounds {
  start: string
  end: string
}

export async function computeMonthlyPayroll(
  clientId: string,
  bounds: MonthBounds,
): Promise<MonthlyPayroll> {
  // 1) Barberos activos.
  const barbers = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, clientId), eq(barbersTable.active, true)))

  if (barbers.length === 0) {
    return { items: [], totalCents: 0 }
  }

  // 2) Servicios facturados por barbero (bookings.price en EUROS → ×100).
  const servicesByBarber = await db
    .select({
      barberId: bookings.barberId,
      totalEur: sql<string>`COALESCE(SUM(${bookings.price}), 0)`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.status, 'completed'),
        gte(bookings.date, bounds.start),
        lt(bookings.date, bounds.end),
      ),
    )
    .groupBy(bookings.barberId)

  const servicesRevenueMap = new Map<string, number>()
  for (const row of servicesByBarber) {
    if (!row.barberId) continue
    servicesRevenueMap.set(row.barberId, Math.round(parseFloat(row.totalEur ?? '0') * 100))
  }

  // 2b) R8 — facturación de servicios partida por (barbero, servicio) para
  // poder aplicar overrides de comisión por-servicio. bookings.price EUROS → ×100.
  const serviceRevByBarberService = await db
    .select({
      barberId: bookings.barberId,
      serviceName: bookings.service,
      totalEur: sql<string>`COALESCE(SUM(${bookings.price}), 0)`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.status, 'completed'),
        gte(bookings.date, bounds.start),
        lt(bookings.date, bounds.end),
      ),
    )
    .groupBy(bookings.barberId, bookings.service)

  const serviceRowsByBarber = new Map<string, ServiceRevenueRow[]>()
  for (const row of serviceRevByBarberService) {
    if (!row.barberId || !row.serviceName) continue
    const cents = Math.round(parseFloat(row.totalEur ?? '0') * 100)
    const list = serviceRowsByBarber.get(row.barberId) ?? []
    list.push({ serviceName: row.serviceName, revenueCents: cents })
    serviceRowsByBarber.set(row.barberId, list)
  }

  // 2d) Servicios EXTRA (R7) — booking_services.priceEuros. Sin esto el
  // barbero cobra comisión SOLO del servicio principal y se le infrapaga
  // toda cita multi-servicio. El barbero lo hereda del booking padre
  // (FK bookingId). priceEuros EUROS (foot-gun) → ×100. Se agrupa por
  // (barbero, nombre del extra) para que un override por-servicio del
  // extra aplique igual que al principal (computeServicesCommissionCents).
  const extraRevByBarberService = await db
    .select({
      barberId: bookings.barberId,
      serviceName: bookingServices.name,
      totalEur: sql<string>`COALESCE(SUM(${bookingServices.priceEuros}), 0)`,
    })
    .from(bookingServices)
    .innerJoin(bookings, eq(bookingServices.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.status, 'completed'),
        gte(bookings.date, bounds.start),
        lt(bookings.date, bounds.end),
      ),
    )
    .groupBy(bookings.barberId, bookingServices.name)

  for (const row of extraRevByBarberService) {
    if (!row.barberId || !row.serviceName) continue
    const cents = Math.round(parseFloat(row.totalEur ?? '0') * 100)
    if (cents <= 0) continue
    // 2a — sube también el total mostrado del barbero.
    servicesRevenueMap.set(
      row.barberId,
      (servicesRevenueMap.get(row.barberId) ?? 0) + cents,
    )
    // 2b — fila propia para que la comisión del extra se calcule con su
    // override si existe, o el % global del barbero si no.
    const list = serviceRowsByBarber.get(row.barberId) ?? []
    list.push({ serviceName: row.serviceName, revenueCents: cents })
    serviceRowsByBarber.set(row.barberId, list)
  }

  // 2c) R8 — overrides de comisión por (barbero, servicio). Sin filas para
  // un barbero ⇒ su comisión de servicios se calcula con el % global de
  // siempre (no-regresión, ver computeServicesCommissionCents).
  const overrideRows = await db
    .select({
      barberId: barberServiceCommissions.barberId,
      serviceName: barberServiceCommissions.serviceName,
      pct: barberServiceCommissions.pct,
    })
    .from(barberServiceCommissions)
    .where(eq(barberServiceCommissions.clientId, clientId))

  const overridesByBarber = new Map<string, ServiceCommissionOverride[]>()
  for (const row of overrideRows) {
    const list = overridesByBarber.get(row.barberId) ?? []
    list.push({ serviceName: row.serviceName, pct: row.pct })
    overridesByBarber.set(row.barberId, list)
  }

  // 3) Productos vendidos por barbero. Excluye consumos internos / mermas
  //    — no son ingreso ni base de comisión.
  const productsByBarber = await db
    .select({
      barberId: productSales.barberId,
      totalCents: sum(productSales.totalCents).as('total'),
    })
    .from(productSales)
    .where(
      and(
        eq(productSales.clientId, clientId),
        isNull(productSales.consumptionKind),
        gte(productSales.soldAt, new Date(bounds.start)),
        lt(productSales.soldAt, new Date(bounds.end)),
      ),
    )
    .groupBy(productSales.barberId)

  const productsRevenueMap = new Map<string, number>()
  for (const row of productsByBarber) {
    if (!row.barberId) continue
    productsRevenueMap.set(row.barberId, Number(row.totalCents ?? 0))
  }

  // 4) Propinas por barbero (matched por nombre, schema legacy sin FK).
  //
  // R-T3 — split CASH / CARD para que la nómina solo "deba" las CARD (las
  // CASH ya las cobró el barbero en mano). Legacy NULL → CARD implícito.
  // FILTER (WHERE ...) en SQL agrega ambos sub-totales en la misma query.
  //
  // Épica Reni #28 parte 3b — `paid_out_at IS NULL`. Si el jefe ya marcó la
  // propina como liquidada al barbero (cash entregada, transferencia, o ya
  // incluida en su nómina) sale del cálculo. Aplica a CASH (la marca informa
  // sólo) y a CARD (la marca evita doble-pago en la siguiente nómina).
  const tipsByName = await db
    .select({
      barberName: tips.barberName,
      totalCents: sum(tips.amountCents).as('total'),
      cashCents:
        sql<string>`COALESCE(SUM(${tips.amountCents}) FILTER (WHERE ${tips.paymentMethod} = 'cash'), 0)`,
      cardCents:
        sql<string>`COALESCE(SUM(${tips.amountCents}) FILTER (WHERE COALESCE(${tips.paymentMethod}, 'card') = 'card'), 0)`,
    })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, clientId),
        eq(tips.status, 'paid'),
        sql`${tips.paidOutAt} IS NULL`,
        gte(tips.paidAt, new Date(bounds.start)),
        lt(tips.paidAt, new Date(bounds.end)),
      ),
    )
    .groupBy(tips.barberName)

  const tipsMap = new Map<string, number>()
  const tipsCashMap = new Map<string, number>()
  const tipsCardMap = new Map<string, number>()
  for (const row of tipsByName) {
    if (!row.barberName) continue
    const norm = row.barberName.trim().toLowerCase()
    const match = barbers.find((b) => b.name.trim().toLowerCase() === norm)
    if (!match) continue
    tipsMap.set(match.id, (tipsMap.get(match.id) ?? 0) + Number(row.totalCents ?? 0))
    tipsCashMap.set(match.id, (tipsCashMap.get(match.id) ?? 0) + Number(row.cashCents ?? 0))
    tipsCardMap.set(match.id, (tipsCardMap.get(match.id) ?? 0) + Number(row.cardCents ?? 0))
  }

  // 4b) IDs de propinas CARD pendientes del mes por barbero (épica Reni #28
  // parte 3b). La UI las necesita para el botón "Marcar X propinas como
  // pagadas" → POST /api/tips/payout. Solo CARD: las cash ya las tiene en
  // mano el barbero. Legacy paymentMethod NULL cuenta como card implícito.
  // paid_out_at IS NULL → mismo filtro que la agregación de tipsCardCents.
  const pendingCardTipRows = await db
    .select({
      id: tips.id,
      barberName: tips.barberName,
    })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, clientId),
        eq(tips.status, 'paid'),
        sql`${tips.paidOutAt} IS NULL`,
        sql`COALESCE(${tips.paymentMethod}, 'card') = 'card'`,
        gte(tips.paidAt, new Date(bounds.start)),
        lt(tips.paidAt, new Date(bounds.end)),
      ),
    )

  const pendingCardTipIdsMap = new Map<string, string[]>()
  for (const row of pendingCardTipRows) {
    if (!row.barberName) continue
    const norm = row.barberName.trim().toLowerCase()
    const match = barbers.find((b) => b.name.trim().toLowerCase() === norm)
    if (!match) continue
    const list = pendingCardTipIdsMap.get(match.id) ?? []
    list.push(row.id)
    pendingCardTipIdsMap.set(match.id, list)
  }

  // 5) Bonos cobrados por barbero.
  const activeBonuses = await db
    .select()
    .from(bonuses)
    .where(and(eq(bonuses.clientId, clientId), eq(bonuses.active, true)))

  const bonusProgress = await db
    .select({
      bonusId: bonusEntries.bonusId,
      barberId: bonusEntries.barberId,
      progress: sum(bonusEntries.value).as('progress'),
    })
    .from(bonusEntries)
    .where(
      and(
        eq(bonusEntries.clientId, clientId),
        gte(bonusEntries.date, bounds.start),
        lt(bonusEntries.date, bounds.end),
      ),
    )
    .groupBy(bonusEntries.bonusId, bonusEntries.barberId)

  const progressMap = new Map<string, number>()
  for (const p of bonusProgress) {
    progressMap.set(`${p.bonusId}|${p.barberId}`, Number(p.progress ?? 0))
  }

  const bonusesPayoutMap = new Map<string, number>()
  for (const barber of barbers) {
    let total = 0
    for (const bonus of activeBonuses) {
      const progress = progressMap.get(`${bonus.id}|${barber.id}`) ?? 0
      const r = computeBonusProgress({
        unit: bonus.unit as BonusUnit,
        kind: bonus.kind as BonusKind,
        target: bonus.target,
        rewardCents: bonus.rewardCents,
        entries: [progress],
      })
      total += r.payoutCents
    }
    bonusesPayoutMap.set(barber.id, total)
  }

  // 6) Compute breakdown por barbero — solo los configurados.
  const items: MonthlyPayrollItem[] = []
  for (const barber of barbers) {
    const profile: BarberSalaryProfile = {
      salaryType: (barber.salaryType as SalaryType | null) ?? null,
      salaryBaseCents: barber.salaryBaseCents,
      commissionServicesPct: barber.commissionServicesPct,
      commissionProductsPct: barber.commissionProductsPct,
      chairRentCents: barber.chairRentCents,
      tierBonuses: barber.tierBonuses ?? null,
    }
    if (!isProfileConfigured(profile)) continue

    const raw: BarberMonthRaw = {
      servicesRevenueCents: servicesRevenueMap.get(barber.id) ?? 0,
      productsRevenueCents: productsRevenueMap.get(barber.id) ?? 0,
      tipsCents: tipsMap.get(barber.id) ?? 0,
      tipsCashCents: tipsCashMap.get(barber.id) ?? 0,
      tipsCardCents: tipsCardMap.get(barber.id) ?? 0,
      bonusesPayoutCents: bonusesPayoutMap.get(barber.id) ?? 0,
    }

    // R8 — comisión de servicios con overrides por-servicio. Sin overrides
    // para este barbero ⇒ esto da exactamente revenue×globalPct (idéntico
    // al camino histórico que aplicaría compute.ts por sí solo).
    const servicesCommissionCents = computeServicesCommissionCents({
      rows: serviceRowsByBarber.get(barber.id) ?? [],
      overrides: overridesByBarber.get(barber.id) ?? [],
      globalPct: profile.commissionServicesPct,
    })

    items.push({
      barberId: barber.id,
      barberName: barber.name,
      salaryType: profile.salaryType,
      profile,
      raw,
      breakdown: computeBarberPayroll(profile, raw, servicesCommissionCents),
      pendingCardTipIds: pendingCardTipIdsMap.get(barber.id) ?? [],
    })
  }

  items.sort((a, b) => b.breakdown.totalCents - a.breakdown.totalCents)
  const totalCents = items.reduce((acc, i) => acc + i.breakdown.totalCents, 0)

  return { items, totalCents }
}
