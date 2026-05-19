export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { bookings, bookingServices, productSales, tips, clients, expenses, fixedCosts, ownerWithdrawals, manualIncomes } from '@/db/schema'
import { eq, and, gte, lt, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import { TrendingUp } from 'lucide-react'
import FinanzasClient from '../finanzas/FinanzasClient'
import UpgradeRequired from '../_components/UpgradeRequired'
import AreaTabs from '../_components/AreaTabs'
import PanelSwitch from './PanelSwitch'
import OperatorPanel from './OperatorPanel'
import { computeMonthlyPayroll } from '@/lib/payroll/monthly'

// -----------------------------------------------------------------------------
// /dashboard/informes — área Informes (nomenclatura estándar; ex-Finanzas).
//
// Es el P&L real del barbero (control financiero): ingresos, gastos, costes
// fijos, nóminas, IVA estimado, beneficio. FinanzasClient ya es una
// herramienta AUTOCONTENIDA viewport-locked (header propio con navegación
// de mes + imprimir + cuerpo con scroll interno) que respeta la regla "la
// página no scrollea". No se envuelve en AreaShell para no duplicar header;
// el rail resalta "Informes" vía los prefixes de area-config.
//
// LÓGICA DE SERVIDOR INTACTA: queries, cálculo de IVA/beneficio y
// computeMonthlyPayroll son IDÉNTICOS al antiguo finanzas/page.tsx (copia
// 1:1). La ruta legacy /dashboard/finanzas redirige aquí preservando ?month.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function parseMonth(raw: string | undefined): string {
  if (!raw) return currentMonthStr()
  if (/^\d{4}-\d{2}$/.test(raw)) return raw
  return currentMonthStr()
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split('-').map(Number)
  const start = `${year}-${String(mon).padStart(2, '0')}-01`
  const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`
  return { start, end: nextMonth }
}

const IVA_CATEGORIES = ['productos', 'suministros', 'publicidad']

export default async function FinanzasPage({ searchParams }: PageProps) {
  const { month: rawMonth } = await searchParams
  const month = parseMonth(rawMonth)

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  if (!hasFeature(client, 'controlFinanciero')) {
    return (
      <UpgradeRequired
        feature="controlFinanciero"
        title="Finanzas"
        icon={TrendingUp}
        back={{ label: 'Ventas', href: '/dashboard/ventas' }}
      />
    )
  }

  const { start, end } = monthBounds(month)

  // Helper: bounds para mes anterior
  function prevMonthBounds(m: string): { start: string; end: string } {
    const [y, mo] = m.split('-').map(Number)
    const pm = mo === 1 ? 12 : mo - 1
    const py = mo === 1 ? y - 1 : y
    const s = `${py}-${String(pm).padStart(2, '0')}-01`
    const e = `${y}-${String(mo).padStart(2, '0')}-01`
    return { start: s, end: e }
  }

  const prevBounds = prevMonthBounds(month)

  // Bounds for same month last year (YoY comparison)
  const [pyear, pmon] = month.split('-').map(Number)
  const prevYearStart = `${pyear - 1}-${String(pmon).padStart(2, '0')}-01`
  const prevYearEnd = pmon === 12 ? `${pyear}-01-01` : `${pyear - 1}-${String(pmon + 1).padStart(2, '0')}-01`

  const [monthExpenses, allFixedCosts, monthWithdrawals, monthManualIncomes] = await Promise.all([
    db.select().from(expenses).where(
      and(eq(expenses.clientId, client.id), gte(expenses.date, start), lt(expenses.date, end))
    ),
    db.select().from(fixedCosts).where(eq(fixedCosts.clientId, client.id))
      .orderBy(fixedCosts.sortOrder, fixedCosts.createdAt),
    db.select().from(ownerWithdrawals).where(
      and(eq(ownerWithdrawals.clientId, client.id), gte(ownerWithdrawals.date, start), lt(ownerWithdrawals.date, end))
    ),
    db.select().from(manualIncomes).where(
      and(eq(manualIncomes.clientId, client.id), gte(manualIncomes.date, start), lt(manualIncomes.date, end))
    ).orderBy(manualIncomes.date),
  ])

  // NOTA: este SSR replica el cálculo de /api/finanzas/summary para que el
  // render inicial coincida con el primer refetch del cliente. Cualquier
  // cambio aquí debe ir también allí (extras R7, productos, propinas, IVA).
  const [
    bookingRow,
    bookingContextRow,
    prevBookingRow,
    prevYearBookingRow,
    extrasRow,
    prevYearExtrasRow,
    productsRow,
    tipsRow,
  ] = await Promise.all([
    db
      .select({ totalEur: sql<number>`COALESCE(SUM(price), 0)` })
      .from(bookings)
      .where(and(eq(bookings.clientId, client.id), eq(bookings.status, 'completed'), gte(bookings.date, start), lt(bookings.date, end))),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        ticketMedio: sql<number>`COALESCE(AVG(price), 0)`,
      })
      .from(bookings)
      .where(and(eq(bookings.clientId, client.id), eq(bookings.status, 'completed'), gte(bookings.date, start), lt(bookings.date, end))),
    db
      .select({ total: sql<number>`COALESCE(SUM(price), 0)` })
      .from(bookings)
      .where(and(eq(bookings.clientId, client.id), eq(bookings.status, 'completed'), gte(bookings.date, prevBounds.start), lt(bookings.date, prevBounds.end))),
    db
      .select({ total: sql<number>`COALESCE(SUM(price), 0)` })
      .from(bookings)
      .where(and(eq(bookings.clientId, client.id), eq(bookings.status, 'completed'), gte(bookings.date, prevYearStart), lt(bookings.date, prevYearEnd))),
    // Servicios EXTRA (R7) — booking_services.priceEuros (EUROS, foot-gun).
    // Query separada (no LEFT JOIN) para no inflar SUM(price) por fan-out.
    db
      .select({ total: sql<number>`COALESCE(SUM(${bookingServices.priceEuros}), 0)` })
      .from(bookingServices)
      .innerJoin(bookings, eq(bookingServices.bookingId, bookings.id))
      .where(and(eq(bookings.clientId, client.id), eq(bookings.status, 'completed'), gte(bookings.date, start), lt(bookings.date, end))),
    db
      .select({ total: sql<number>`COALESCE(SUM(${bookingServices.priceEuros}), 0)` })
      .from(bookingServices)
      .innerJoin(bookings, eq(bookingServices.bookingId, bookings.id))
      .where(and(eq(bookings.clientId, client.id), eq(bookings.status, 'completed'), gte(bookings.date, prevYearStart), lt(bookings.date, prevYearEnd))),
    // Productos vendidos (total_cents ya en cents) — su comisión ya se
    // descuenta vía nóminas; sin sumar su ingreso el beneficio se infravalora.
    db
      .select({ total: sql<number>`COALESCE(SUM(${productSales.totalCents}), 0)` })
      .from(productSales)
      .where(and(eq(productSales.clientId, client.id), gte(productSales.soldAt, new Date(start)), lt(productSales.soldAt, new Date(end)))),
    // Propinas 'paid' (amount_cents ya en cents). Sin IVA (gratuidad).
    db
      .select({ total: sql<number>`COALESCE(SUM(${tips.amountCents}), 0)` })
      .from(tips)
      .where(and(eq(tips.clientId, client.id), eq(tips.status, 'paid'), gte(tips.paidAt, new Date(start)), lt(tips.paidAt, new Date(end)))),
  ])

  // Principal + extras en EUROS → ×100 una sola vez (boundary idéntico a
  // bookingTotalCents y la factura).
  const bookingIngresosCents = Math.round(
    (Number(bookingRow[0]?.totalEur ?? 0) + Number(extrasRow[0]?.total ?? 0)) * 100,
  )
  const manualIngresosCents = monthManualIncomes.reduce((sum, m) => sum + m.amountCents, 0)
  const productsIngresosCents = Number(productsRow[0]?.total ?? 0)
  const tipsIngresosCents = Number(tipsRow[0]?.total ?? 0)
  const ingresosCents =
    bookingIngresosCents + manualIngresosCents + productsIngresosCents + tipsIngresosCents
  const serviciosCount = Number(bookingContextRow[0]?.count ?? 0)
  const ticketMedioCents = Math.round(Number(bookingContextRow[0]?.ticketMedio ?? 0) * 100)
  const prevIngresosCents = Math.round(Number(prevBookingRow[0]?.total ?? 0) * 100)
  const prevYearIngresosCents = Math.round(
    (Number(prevYearBookingRow[0]?.total ?? 0) + Number(prevYearExtrasRow[0]?.total ?? 0)) * 100,
  )

  const gastosVariablesCents = monthExpenses.reduce((sum, e) => sum + e.amountCents, 0)

  const activeFixedThisMonth = allFixedCosts.filter(
    (fc) => fc.active && fc.activeFrom <= start,
  )
  const costosFijosCents = activeFixedThisMonth.reduce((sum, fc) => sum + fc.amountCents, 0)

  // Nóminas computadas del equipo (mismo helper que /api/finanzas/payroll
  // — coherencia entre la línea P&L y la vista de /dashboard/equipo).
  const payroll = await computeMonthlyPayroll(client.id, { start, end })
  const nominasCents = Math.max(0, payroll.totalCents)

  const totalGastosCents = gastosVariablesCents + costosFijosCents + nominasCents

  // IVA configurable por tenant (clients.ivaRate, default 21). Para un
  // tenant al 21% es idéntico a 21/121 (sin regresión). Base SIN propinas
  // (la propina no lleva IVA en España).
  const ivaRate = client.ivaRate
  const ivaDenom = 100 + ivaRate
  const ivaBaseCents = ingresosCents - tipsIngresosCents
  const ivaRepercutidoCents = Math.round((ivaBaseCents * ivaRate) / ivaDenom)

  // IVA soportado: solo categorías con IVA (productos, suministros, publicidad)
  const gastosConIvaCents = monthExpenses
    .filter((e) => IVA_CATEGORIES.includes(e.category))
    .reduce((sum, e) => sum + e.amountCents, 0)
  const fixedConIvaCents = activeFixedThisMonth
    .filter((fc) => IVA_CATEGORIES.includes(fc.category))
    .reduce((sum, fc) => sum + fc.amountCents, 0)
  const ivaSoportadoCents = Math.round(((gastosConIvaCents + fixedConIvaCents) * ivaRate) / ivaDenom)

  const ivaAPagarCents = Math.max(0, ivaRepercutidoCents - ivaSoportadoCents)

  // Beneficio bruto = ingresos netos (sin IVA) − total gastos (incluye nóminas).
  // Neto = base sin IVA + propinas (las propinas ya son netas).
  const ingresosNetosCents =
    Math.round((ivaBaseCents * 100) / ivaDenom) + tipsIngresosCents
  const beneficioBrutoCents = ingresosNetosCents - totalGastosCents
  const retirosCents = monthWithdrawals.reduce((sum, w) => sum + w.amountCents, 0)
  const beneficioRealCents = beneficioBrutoCents - retirosCents
  const irpfEstimadoCents = Math.max(0, Math.round((beneficioBrutoCents * 20) / 100))

  // Category breakdown for expenses bar chart
  const EXPENSE_CATEGORIES = ['productos', 'suministros', 'publicidad', 'personal', 'nomina', 'otro'] as const
  const categoryTotals: Record<string, number> = {}
  for (const cat of EXPENSE_CATEGORIES) {
    const varTotal = monthExpenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amountCents, 0)
    const fixedTotal = activeFixedThisMonth.filter((f) => f.category === cat).reduce((s, f) => s + f.amountCents, 0)
    categoryTotals[cat] = varTotal + fixedTotal
  }

  const initialSummary = {
    month,
    ingresosCents,
    manualIngresosCents,
    productsIngresosCents,
    tipsIngresosCents,
    gastosVariablesCents,
    costosFijosCents,
    nominasCents,
    totalGastosCents,
    ivaRepercutidoCents,
    ivaSoportadoCents,
    ivaAPagarCents,
    beneficioBrutoCents,
    retirosCents,
    beneficioRealCents,
    irpfEstimadoCents,
    prevYearIngresosCents,
  }

  const serializedExpenses = monthExpenses.map((e) => ({
    id: e.id,
    date: e.date,
    amountCents: e.amountCents,
    category: e.category,
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  }))

  const serializedFixedCosts = allFixedCosts.map((fc) => ({
    id: fc.id,
    name: fc.name,
    amountCents: fc.amountCents,
    category: fc.category,
    activeFrom: fc.activeFrom,
    active: fc.active,
    sortOrder: fc.sortOrder,
  }))

  const serializedWithdrawals = monthWithdrawals.map((w) => ({
    id: w.id,
    date: w.date,
    amountCents: w.amountCents,
    notes: w.notes,
    createdAt: w.createdAt.toISOString(),
  }))

  const serializedManualIncomes = monthManualIncomes.map((m) => ({
    id: m.id,
    date: m.date,
    amountCents: m.amountCents,
    notes: m.notes,
    createdAt: m.createdAt.toISOString(),
  }))

  // Etiqueta legible del mes para el Panel del operador (ej. "mayo de 2026").
  const [mlY, mlM] = month.split('-').map(Number)
  const monthLabel = new Date(mlY, mlM - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })

  // Panel = lectura de 10 segundos (OperatorPanel, por defecto) CON el P&L
  // completo a un clic (FinanzasClient, byte-idéntico). El conmutador
  // (PanelSwitch) respeta el contrato de IA: las 6 pestañas de Informes no
  // cambian; sólo "Panel" pasa a ser el resumen accionable que Booksy llama
  // "Panel de control" sin perder ni romper el P&L. FinanzasClient sigue
  // autocontenido viewport-locked; OperatorPanel es pura agregación sobre
  // tablas existentes. LÓGICA DEL P&L INTACTA (mismos props, misma data).
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <div className="shrink-0 border-b border-line bg-canvas px-[var(--space-page)] pt-[var(--space-card)]">
        <div className="flex items-baseline justify-between gap-4 pb-3">
          <h1
            className="font-semibold leading-tight text-ink"
            style={{ fontSize: 'var(--text-page-title)' }}
          >
            Informes
          </h1>
        </div>
        <AreaTabs area="informes" />
      </div>
      <div className="min-h-0 flex-1">
        <PanelSwitch
          resumen={
            <OperatorPanel
              clientId={client.id}
              start={start}
              end={end}
              monthLabel={monthLabel}
            />
          }
          detalle={
            <FinanzasClient
              initialMonth={month}
              initialSummary={initialSummary}
              initialExpenses={serializedExpenses}
              initialFixedCosts={serializedFixedCosts}
              initialWithdrawals={serializedWithdrawals}
              initialManualIncomes={serializedManualIncomes}
              initialServiciosCount={serviciosCount}
              initialTicketMedioCents={ticketMedioCents}
              initialCategoryTotals={categoryTotals}
              initialPrevIngresosCents={prevIngresosCents}
            />
          }
        />
      </div>
    </div>
  )
}
