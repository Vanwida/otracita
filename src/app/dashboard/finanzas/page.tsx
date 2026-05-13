export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { db } from '@/db'
import { bookings, clients, expenses, fixedCosts, ownerWithdrawals, manualIncomes } from '@/db/schema'
import { eq, and, gte, lt, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature, upgradeMessage } from '@/lib/billing/tier'
import { ChevronLeft, ArrowRight, TrendingUp } from 'lucide-react'
import FinanzasClient from './FinanzasClient'

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
    const msg = upgradeMessage('controlFinanciero')
    return (
      <div className="px-4 md:px-8 lg:px-12 max-w-4xl mx-auto pb-16">
        <header className="pt-10 lg:pt-14 pb-8 border-b border-line">
          <Link
            href="/dashboard/caja"
            className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink mb-6 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Caja
          </Link>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-ink leading-tight">
            Finanzas
          </h1>
        </header>

        <section className="mt-16 flex flex-col items-center text-center max-w-sm mx-auto gap-6">
          <div className="w-14 h-14 rounded-2xl bg-brand-softer flex items-center justify-center">
            <TrendingUp className="h-7 w-7 text-brand" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink mb-2">{msg.title}</h2>
            <p className="text-sm text-ink-2 leading-relaxed">{msg.body}</p>
          </div>
          <Link
            href="/dashboard/mi-plan"
            className="btn-primary inline-flex items-center gap-2"
          >
            Ver Mi plan
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
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

  const [bookingRow, bookingContextRow, prevBookingRow, prevYearBookingRow] = await Promise.all([
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
  ])

  const bookingIngresosCents = Math.round(Number(bookingRow[0]?.totalEur ?? 0) * 100)
  const manualIngresosCents = monthManualIncomes.reduce((sum, m) => sum + m.amountCents, 0)
  const ingresosCents = bookingIngresosCents + manualIngresosCents
  const serviciosCount = Number(bookingContextRow[0]?.count ?? 0)
  const ticketMedioCents = Math.round(Number(bookingContextRow[0]?.ticketMedio ?? 0) * 100)
  const prevIngresosCents = Math.round(Number(prevBookingRow[0]?.total ?? 0) * 100)
  const prevYearIngresosCents = Math.round(Number(prevYearBookingRow[0]?.total ?? 0) * 100)

  const gastosVariablesCents = monthExpenses.reduce((sum, e) => sum + e.amountCents, 0)

  const activeFixedThisMonth = allFixedCosts.filter(
    (fc) => fc.active && fc.activeFrom <= start,
  )
  const costosFijosCents = activeFixedThisMonth.reduce((sum, fc) => sum + fc.amountCents, 0)

  const totalGastosCents = gastosVariablesCents + costosFijosCents

  // IVA: ingresos incluyen IVA (precio con IVA), repercutido = precio × 21/121
  const ivaRepercutidoCents = Math.round((ingresosCents * 21) / 121)

  // IVA soportado: solo categorías con IVA (productos, suministros, publicidad)
  const gastosConIvaCents = monthExpenses
    .filter((e) => IVA_CATEGORIES.includes(e.category))
    .reduce((sum, e) => sum + e.amountCents, 0)
  const fixedConIvaCents = activeFixedThisMonth
    .filter((fc) => IVA_CATEGORIES.includes(fc.category))
    .reduce((sum, fc) => sum + fc.amountCents, 0)
  const ivaSoportadoCents = Math.round(((gastosConIvaCents + fixedConIvaCents) * 21) / 121)

  const ivaAPagarCents = Math.max(0, ivaRepercutidoCents - ivaSoportadoCents)

  // Beneficio bruto = ingresos netos (sin IVA) − total gastos
  const ingresosNetosCents = Math.round((ingresosCents * 100) / 121)
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
    gastosVariablesCents,
    costosFijosCents,
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

  return (
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
  )
}
