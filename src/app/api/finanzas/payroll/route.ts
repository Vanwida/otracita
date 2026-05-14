import { db } from '@/db'
import {
  barbers as barbersTable,
  bookings,
  productSales,
  tips,
  bonuses,
  bonusEntries,
} from '@/db/schema'
import { and, eq, gte, lt, sum, sql } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { computeBarberPayroll, isProfileConfigured } from '@/lib/payroll/compute'
import type { BarberSalaryProfile, BarberMonthRaw, PayrollBreakdown } from '@/lib/payroll/types'
import { computeBonusProgress, type BonusUnit } from '@/lib/bonuses/progress'

// -----------------------------------------------------------------------------
// GET /api/finanzas/payroll?month=YYYY-MM
//
// Devuelve la nómina computada del mes para CADA barbero activo del tenant,
// usando su perfil salarial + datos agregados del mes:
//   · Servicios facturados (bookings.price × 100 ya que está en euros)
//   · Productos vendidos (product_sales.amount_cents) por barbero
//   · Propinas pagadas (tips.amount_cents) por barbero
//   · Bonos cobrados (suma de recompensas de bonos que alcanzó)
//
// Para los bonos: cada bono activo del local se aplica a cada barbero por
// separado — si alguno alcanzó el target en ese mes, suma la recompensa.
//
// Solo aparecen barberos con perfil CONFIGURADO (isProfileConfigured = true).
// Los demás no salen — el dueño puede ignorar esa sección hasta que les
// configure el pago.
//
// Pro-gated (controlFinanciero — coherente con resto de /finanzas).
// -----------------------------------------------------------------------------

interface PayrollItem {
  barberId: string
  barberName: string
  salaryType: string | null
  profile: BarberSalaryProfile
  raw: BarberMonthRaw
  breakdown: PayrollBreakdown
}

function monthBounds(raw: string): { start: string; end: string } | null {
  const m = raw.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { searchParams } = new URL(request.url)
  const rawMonth = searchParams.get('month')
  if (!rawMonth) return Response.json({ error: 'month requerido (YYYY-MM)' }, { status: 400 })
  const bounds = monthBounds(rawMonth)
  if (!bounds) return Response.json({ error: 'Formato de mes inválido' }, { status: 400 })

  const clientId = access.client.id

  // 1) Barberos activos.
  const barbers = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, clientId), eq(barbersTable.active, true)))

  if (barbers.length === 0) {
    return Response.json({ month: rawMonth, items: [] })
  }

  // 2) Servicios facturados por barbero (bookings.price está en EUROS — ×100).
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

  // 3) Productos vendidos por barbero.
  const productsByBarber = await db
    .select({
      barberId: productSales.barberId,
      totalCents: sum(productSales.totalCents).as('total'),
    })
    .from(productSales)
    .where(
      and(
        eq(productSales.clientId, clientId),
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

  // 4) Propinas pagadas por barbero. La tabla `tips` no tiene barberId
  //    (es un snapshot por nombre). Agrupamos por barberName y luego
  //    mapeamos al ID por coincidencia case-insensitive. Si el barbero
  //    fue renombrado después de cobrar la propina, esa propina pierde
  //    atribución — limitación heredada del schema existente.
  const tipsByName = await db
    .select({
      barberName: tips.barberName,
      totalCents: sum(tips.amountCents).as('total'),
    })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, clientId),
        eq(tips.status, 'paid'),
        gte(tips.paidAt, new Date(bounds.start)),
        lt(tips.paidAt, new Date(bounds.end)),
      ),
    )
    .groupBy(tips.barberName)

  const tipsMap = new Map<string, number>()
  for (const row of tipsByName) {
    if (!row.barberName) continue
    const norm = row.barberName.trim().toLowerCase()
    const match = barbers.find((b) => b.name.trim().toLowerCase() === norm)
    if (!match) continue
    tipsMap.set(match.id, (tipsMap.get(match.id) ?? 0) + Number(row.totalCents ?? 0))
  }

  // 5) Bonos cobrados por barbero. Cada bono activo del local se aplica
  //    a cada barbero; quien alcance el target cobra la recompensa.
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

  const progressMap = new Map<string, number>()  // `${bonusId}|${barberId}` → progress
  for (const p of bonusProgress) {
    progressMap.set(`${p.bonusId}|${p.barberId}`, Number(p.progress ?? 0))
  }

  const bonusesPayoutMap = new Map<string, number>()  // barberId → total reward cobrado
  for (const barber of barbers) {
    let total = 0
    for (const bonus of activeBonuses) {
      const progress = progressMap.get(`${bonus.id}|${barber.id}`) ?? 0
      const r = computeBonusProgress({
        unit: bonus.unit as BonusUnit,
        target: bonus.target,
        rewardCents: bonus.rewardCents,
        entries: [progress],
      })
      total += r.payoutCents
    }
    bonusesPayoutMap.set(barber.id, total)
  }

  // 6) Compute breakdown por barbero — solo los configurados.
  const items: PayrollItem[] = []
  for (const barber of barbers) {
    const profile: BarberSalaryProfile = {
      salaryType: (barber.salaryType as BarberSalaryProfile['salaryType']) ?? null,
      salaryBaseCents: barber.salaryBaseCents,
      commissionServicesPct: barber.commissionServicesPct,
      commissionProductsPct: barber.commissionProductsPct,
      chairRentCents: barber.chairRentCents,
    }
    if (!isProfileConfigured(profile)) continue

    const raw: BarberMonthRaw = {
      servicesRevenueCents: servicesRevenueMap.get(barber.id) ?? 0,
      productsRevenueCents: productsRevenueMap.get(barber.id) ?? 0,
      tipsCents: tipsMap.get(barber.id) ?? 0,
      bonusesPayoutCents: bonusesPayoutMap.get(barber.id) ?? 0,
    }
    items.push({
      barberId: barber.id,
      barberName: barber.name,
      salaryType: profile.salaryType,
      profile,
      raw,
      breakdown: computeBarberPayroll(profile, raw),
    })
  }

  // Orden por total descendente (al dueño le importa quién cobra más).
  items.sort((a, b) => b.breakdown.totalCents - a.breakdown.totalCents)

  return Response.json({ month: rawMonth, items })
}
