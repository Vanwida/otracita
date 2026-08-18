'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  Loader2,
  Printer,
  Receipt,
  Banknote,
  Coins,
  Landmark,
} from 'lucide-react'
import MonthStepper from '@/app/dashboard/_components/MonthStepper'

// Types públicos del módulo Finanzas. Antes vivían inline; ahora en
// `_components/types.ts` para que sub-componentes y endpoints los reusen.
import type {
  FinanzasSummary,
  Expense,
  FixedCost,
  Withdrawal,
  ManualIncome,
  ExpenseCategory,
} from './_components/types'
// Helpers puros (formatters de mes, IVA deadline, trendPct, categorías).
import {
  formatMonthLabel,
  formatMonthShort,
  prevMonth,
  nextMonth,
  nextIvaDeadline,
  trendPct,
  CATEGORY_OPTIONS,
  categoryLabel,
} from './_components/helpers'
// Sub-componentes UI extraídos.
import Sparkline from './_components/Sparkline'
import FinanzasSkeleton from './_components/Skeleton'
import KpiTile from './_components/KpiTile'
import CollapsibleBlock from './_components/CollapsibleBlock'
import SectionHeader from './_components/SectionHeader'
import CategoryStackedBar from './_components/CategoryStackedBar'
import PrintReport from './_components/PrintReport'

// Re-exportamos los types para los callers que ya importaban `FinanzasSummary`
// y compañía desde este archivo. NO añadir lógica aquí; los types viven en
// `_components/types.ts`.
export type { FinanzasSummary, Expense, FixedCost, Withdrawal, ManualIncome }

// ── Formatters ───────────────────────────────────────────────────────────────

// Compact = omite ",00" en enteros. Coherente con la lectura densa del P&L
// (las cifras con muchos decimales rompen el ritmo del panel). El informe
// imprimible (PrintReport) usa la variante STRICT internamente — allí no
// se puede omitir decimales en facturas/Modelo 130.
import { formatCents as formatCentsBase } from '@/lib/format'
function formatCents(cents: number): string {
  return formatCentsBase(cents, { compact: true })
}

interface FinanzasClientProps {
  initialMonth: string
  initialSummary: FinanzasSummary
  initialExpenses: Expense[]
  initialFixedCosts: FixedCost[]
  initialWithdrawals: Withdrawal[]
  initialManualIncomes: ManualIncome[]
  initialServiciosCount: number
  initialTicketMedioCents: number
  initialCategoryTotals: Record<string, number>
  initialPrevIngresosCents: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinanzasClient({
  initialMonth,
  initialSummary,
  initialExpenses,
  initialFixedCosts,
  initialWithdrawals,
  initialManualIncomes,
  initialServiciosCount,
  initialTicketMedioCents,
  initialPrevIngresosCents,
}: FinanzasClientProps) {
  const [month, setMonth] = useState(initialMonth)
  const [summary, setSummary] = useState<FinanzasSummary>(initialSummary)
  const [expensesList, setExpensesList] = useState<Expense[]>(initialExpenses)
  const [fixedCostsList, setFixedCostsList] = useState<FixedCost[]>(initialFixedCosts)
  const [withdrawalsList, setWithdrawalsList] = useState<Withdrawal[]>(initialWithdrawals)
  const [manualIncomesList, setManualIncomesList] = useState<ManualIncome[]>(initialManualIncomes)
  const [isLoading, startTransition] = useTransition()

  // Context state (booking count / ticket medio are from SSR, static per page load)
  const [serviciosCount] = useState(initialServiciosCount)
  const [ticketMedioCents] = useState(initialTicketMedioCents)
  const [prevIngresosCents] = useState(initialPrevIngresosCents)

  // Trend sparkline
  const [trendData, setTrendData] = useState<{ month: string; beneficioBrutoCents: number }[]>([])
  const [trendLoaded, setTrendLoaded] = useState(false)

  // UI state
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showAddWithdrawal, setShowAddWithdrawal] = useState(false)
  const [showAddManual, setShowAddManual] = useState(false)
  const [showFiscal, setShowFiscal] = useState(false)
  const [quarterData, setQuarterData] = useState<{
    months: { month: string; ingresosCents: number; totalGastosCents: number; beneficioBrutoCents: number; ivaAPagarCents: number }[]
    totals: { ingresosCents: number; totalGastosCents: number; beneficioBrutoCents: number; ivaAPagarCents: number; irpfAPagarCents: number; reservaCents: number }
  } | null>(null)
  const [quarterLoading, setQuarterLoading] = useState(false)
  const [annualYear, setAnnualYear] = useState(() => parseInt(initialMonth.split('-')[0], 10))
  const [showAnnual, setShowAnnual] = useState(false)
  const [annualData, setAnnualData] = useState<{
    year: number
    months: { month: string; ingresosCents: number; totalGastosCents: number; beneficioBrutoCents: number; ivaAPagarCents: number }[]
    totals: { ingresosCents: number; totalGastosCents: number; beneficioBrutoCents: number; ivaAPagarCents: number }
    bestMonth: string
    avgIngresosCents: number
    activeMonths: number
  } | null>(null)
  const [annualLoading, setAnnualLoading] = useState(false)
  const [showHistorical, setShowHistorical] = useState(false)
  const [historicalData, setHistoricalData] = useState<{
    years: { year: number; ingresosCents: number; gastosVariablesCents: number; yoyPct: number | null }[]
    bestYear: number
  } | null>(null)
  const [historicalLoading, setHistoricalLoading] = useState(false)

  // Expense form
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('productos')
  const [expenseNote, setExpenseNote] = useState('')
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [expenseError, setExpenseError] = useState<string | null>(null)

  // Withdrawal form
  const [withdrawalDate, setWithdrawalDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalNote, setWithdrawalNote] = useState('')
  const [withdrawalSaving, setWithdrawalSaving] = useState(false)
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null)

  // Manual income form
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [manualAmount, setManualAmount] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  // Fixed cost form
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null)
  const [editingFixedName, setEditingFixedName] = useState('')
  const [addingFixed, setAddingFixed] = useState(false)
  const [newFixedName, setNewFixedName] = useState('')
  const [newFixedAmount, setNewFixedAmount] = useState('')
  const [newFixedCategory, setNewFixedCategory] = useState<ExpenseCategory>('otro')
  const [fixedSaving, setFixedSaving] = useState(false)

  // Load trend once on mount
  useEffect(() => {
    fetch('/api/finanzas/trend?months=6')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { months: { month: string; beneficioBrutoCents: number }[] } | null) => {
        if (d?.months) {
          setTrendData(d.months)
          setTrendLoaded(true)
        }
      })
      .catch(() => {/* non-critical */})
  }, [])

  // Recalculate category totals from current expenses + fixed costs

  async function loadMonth(m: string) {
    startTransition(async () => {
      const [sumRes, expRes, wRes, manualRes] = await Promise.all([
        fetch(`/api/finanzas/summary?month=${m}`),
        fetch(`/api/finanzas/expenses?month=${m}`),
        fetch(`/api/finanzas/withdrawals?month=${m}`),
        fetch(`/api/finanzas/manual-incomes?month=${m}`),
      ])
      if (sumRes.ok && expRes.ok && wRes.ok && manualRes.ok) {
        const [sum, exps, wds, manuals] = await Promise.all([sumRes.json(), expRes.json(), wRes.json(), manualRes.json()])
        setSummary(sum)
        setExpensesList(exps.expenses ?? [])
        setWithdrawalsList(wds.withdrawals ?? [])
        setManualIncomesList(manuals.incomes ?? [])
      }
      setMonth(m)
    })
  }

  function handlePrevMonth() { loadMonth(prevMonth(month)) }
  function handleNextMonth() { loadMonth(nextMonth(month)) }

  // ── Expense handlers ───────────────────────────────────────────────────────

  async function handleAddExpense() {
    const cents = Math.round(parseFloat(expenseAmount.replace(',', '.')) * 100)
    if (!expenseAmount || isNaN(cents) || cents <= 0) {
      setExpenseError('Introduce un importe válido.')
      return
    }
    setExpenseSaving(true)
    setExpenseError(null)
    try {
      const res = await fetch('/api/finanzas/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: cents,
          category: expenseCategory,
          notes: expenseNote || null,
          date: new Date().toISOString().slice(0, 10),
          month,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const { expense: created } = await res.json() as { expense: Expense }
      const newExps = [created, ...expensesList]
      setExpensesList(newExps)
      setSummary((s) => ({
        ...s,
        gastosVariablesCents: s.gastosVariablesCents + cents,
        totalGastosCents: s.totalGastosCents + cents,
        beneficioBrutoCents: s.beneficioBrutoCents - cents,
        beneficioRealCents: s.beneficioRealCents - cents,
      }))
      invalidateAggregates()
      setExpenseAmount('')
      setExpenseNote('')
      setExpenseCategory('productos')
      setShowAddExpense(false)
    } catch {
      setExpenseError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setExpenseSaving(false)
    }
  }

  async function handleDeleteExpense(id: string) {
    const item = expensesList.find((e) => e.id === id)
    if (!item) return
    setExpensesList(expensesList.filter((e) => e.id !== id))
    setSummary((s) => ({
      ...s,
      gastosVariablesCents: s.gastosVariablesCents - item.amountCents,
      totalGastosCents: s.totalGastosCents - item.amountCents,
      beneficioBrutoCents: s.beneficioBrutoCents + item.amountCents,
      beneficioRealCents: s.beneficioRealCents + item.amountCents,
    }))
    invalidateAggregates()
    await fetch(`/api/finanzas/expenses/${id}`, { method: 'DELETE' })
  }

  // ── Fixed cost handlers ────────────────────────────────────────────────────

  async function handleToggleFixed(id: string) {
    const fc = fixedCostsList.find((f) => f.id === id)
    if (!fc) return
    const newActive = !fc.active
    setFixedCostsList(fixedCostsList.map((f) => f.id === id ? { ...f, active: newActive } : f))
    const delta = newActive ? fc.amountCents : -fc.amountCents
    setSummary((s) => ({
      ...s,
      costosFijosCents: s.costosFijosCents + delta,
      totalGastosCents: s.totalGastosCents + delta,
      beneficioBrutoCents: s.beneficioBrutoCents - delta,
      beneficioRealCents: s.beneficioRealCents - delta,
    }))
    invalidateAggregates()
    await fetch(`/api/finanzas/fixed-costs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: newActive }),
    })
  }

  async function handleRenameFixed(id: string) {
    if (!editingFixedName.trim()) { setEditingFixedId(null); return }
    setFixedCostsList((prev) => prev.map((f) => f.id === id ? { ...f, name: editingFixedName.trim() } : f))
    setEditingFixedId(null)
    await fetch(`/api/finanzas/fixed-costs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingFixedName.trim() }),
    })
  }

  async function handleDeleteFixed(id: string) {
    const fc = fixedCostsList.find((f) => f.id === id)
    if (!fc) return
    setFixedCostsList(fixedCostsList.filter((f) => f.id !== id))
    if (fc.active) {
      setSummary((s) => ({
        ...s,
        costosFijosCents: s.costosFijosCents - fc.amountCents,
        totalGastosCents: s.totalGastosCents - fc.amountCents,
        beneficioBrutoCents: s.beneficioBrutoCents + fc.amountCents,
        beneficioRealCents: s.beneficioRealCents + fc.amountCents,
      }))
      invalidateAggregates()
    }
    await fetch(`/api/finanzas/fixed-costs/${id}`, { method: 'DELETE' })
  }

  async function handleAddFixed() {
    const cents = Math.round(parseFloat(newFixedAmount.replace(',', '.')) * 100)
    if (!newFixedName.trim() || isNaN(cents) || cents <= 0) return
    setFixedSaving(true)
    try {
      const res = await fetch('/api/finanzas/fixed-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFixedName.trim(), amountCents: cents, category: newFixedCategory }),
      })
      if (!res.ok) throw new Error()
      const { fixedCost: created } = await res.json() as { fixedCost: FixedCost }
      setFixedCostsList([...fixedCostsList, created])
      if (created.active) {
        setSummary((s) => ({
          ...s,
          costosFijosCents: s.costosFijosCents + cents,
          totalGastosCents: s.totalGastosCents + cents,
          beneficioBrutoCents: s.beneficioBrutoCents - cents,
          beneficioRealCents: s.beneficioRealCents - cents,
        }))
        invalidateAggregates()
      }
      setNewFixedName('')
      setNewFixedAmount('')
      setNewFixedCategory('otro')
      setAddingFixed(false)
    } finally {
      setFixedSaving(false)
    }
  }

  // ── Withdrawal handlers ────────────────────────────────────────────────────

  async function handleAddWithdrawal() {
    const cents = Math.round(parseFloat(withdrawalAmount.replace(',', '.')) * 100)
    if (!withdrawalAmount || isNaN(cents) || cents <= 0) {
      setWithdrawalError('Introduce un importe válido.')
      return
    }
    setWithdrawalSaving(true)
    setWithdrawalError(null)
    try {
      const res = await fetch('/api/finanzas/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents, date: withdrawalDate, notes: withdrawalNote || null, month }),
      })
      if (!res.ok) throw new Error()
      const { withdrawal: created } = await res.json() as { withdrawal: Withdrawal }
      setWithdrawalsList((prev) => [created, ...prev])
      setSummary((s) => ({
        ...s,
        retirosCents: s.retirosCents + cents,
        beneficioRealCents: s.beneficioRealCents - cents,
      }))
      setWithdrawalAmount('')
      setWithdrawalNote('')
      setShowAddWithdrawal(false)
    } catch {
      setWithdrawalError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setWithdrawalSaving(false)
    }
  }

  async function handleDeleteWithdrawal(id: string) {
    const item = withdrawalsList.find((w) => w.id === id)
    if (!item) return
    setWithdrawalsList((prev) => prev.filter((w) => w.id !== id))
    setSummary((s) => ({
      ...s,
      retirosCents: s.retirosCents - item.amountCents,
      beneficioRealCents: s.beneficioRealCents + item.amountCents,
    }))
    await fetch(`/api/finanzas/withdrawals/${id}`, { method: 'DELETE' })
  }

  // ── Manual income handlers ─────────────────────────────────────────────────

  async function handleAddManualIncome() {
    const cents = Math.round(parseFloat(manualAmount.replace(',', '.')) * 100)
    if (!manualAmount || isNaN(cents) || cents <= 0) {
      setManualError('Introduce un importe válido.')
      return
    }
    setManualSaving(true)
    setManualError(null)
    try {
      const res = await fetch('/api/finanzas/manual-incomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents, date: manualDate, notes: manualNote || null }),
      })
      if (!res.ok) throw new Error()
      const { income: created } = await res.json() as { income: ManualIncome }
      setManualIncomesList((prev) => [created, ...prev])
      // Refetch month to get accurate totals with IVA recalculated
      await loadMonth(month)
      setManualAmount('')
      setManualNote('')
      setShowAddManual(false)
      invalidateAggregates()
    } catch {
      setManualError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setManualSaving(false)
    }
  }

  async function handleDeleteManualIncome(id: string) {
    setManualIncomesList((prev) => prev.filter((m) => m.id !== id))
    await fetch(`/api/finanzas/manual-incomes/${id}`, { method: 'DELETE' })
    await loadMonth(month)
    invalidateAggregates()
  }

  // ── Fiscal expand ──────────────────────────────────────────────────────────

  function handleExport() {
    window.print()
  }

  async function handleExpandFiscal() {
    if (showFiscal) {
      setShowFiscal(false)
      return
    }
    setShowFiscal(true)
    if (!quarterData) {
      setQuarterLoading(true)
      const [y, m] = month.split('-').map(Number)
      const q = Math.ceil(m / 3)
      try {
        const res = await fetch(`/api/finanzas/quarterly?quarter=${y}-Q${q}`)
        if (res.ok) {
          const data = await res.json()
          setQuarterData({ months: data.months, totals: data.totals })
        }
      } finally {
        setQuarterLoading(false)
      }
    }
  }

  async function loadAnnualYear(year: number) {
    if (annualData?.year === year) return
    setAnnualLoading(true)
    try {
      const res = await fetch(`/api/finanzas/annual?year=${year}`)
      if (res.ok) setAnnualData(await res.json())
    } finally {
      setAnnualLoading(false)
    }
  }

  async function handleExpandAnnual() {
    if (showAnnual) { setShowAnnual(false); return }
    setShowAnnual(true)
    await loadAnnualYear(annualYear)
  }

  async function handleAnnualPrev() {
    const y = annualYear - 1
    setAnnualYear(y)
    await loadAnnualYear(y)
  }

  async function handleAnnualNext() {
    const y = annualYear + 1
    setAnnualYear(y)
    await loadAnnualYear(y)
  }

  async function handleExpandHistorical() {
    if (showHistorical) { setShowHistorical(false); return }
    setShowHistorical(true)
    if (historicalData) return
    setHistoricalLoading(true)
    try {
      const res = await fetch('/api/finanzas/historical')
      if (res.ok) setHistoricalData(await res.json())
    } finally {
      setHistoricalLoading(false)
    }
  }

  function invalidateAggregates() {
    setQuarterData(null)
    setAnnualData(null)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const ivaDeadline = nextIvaDeadline()
  const reservaHaciendaCents = summary.ivaAPagarCents + summary.irpfEstimadoCents
  // "Te quedan limpios" — lo que de verdad está disponible después de
  // separar Hacienda y de los retiros ya hechos. El número encoge al
  // retirar (mental model correcto: lo que aún puedes sacar).
  const quedanLimpiosCents =
    summary.beneficioBrutoCents - reservaHaciendaCents - summary.retirosCents

  // Top categorías de gasto este mes (variables + fijos activos),
  // ordenadas descendentemente. Usadas en la KPI tile "Gastos" como
  // mini-bar apilado (top 2 + resto).
  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>()
    for (const e of expensesList) {
      totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountCents)
    }
    const monthStart = `${month}-01`
    for (const fc of fixedCostsList) {
      if (fc.active && fc.activeFrom <= monthStart) {
        totals.set(fc.category, (totals.get(fc.category) ?? 0) + fc.amountCents)
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, cents]) => ({ cat, cents, label: categoryLabel(cat) }))
  }, [expensesList, fixedCostsList, month])

  const yoyMonthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y - 1, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' })
  }, [month])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
    {/* Viewport-locked: header compacto fijo (shrink-0) + cuerpo con
        scroll INTERNO. Nada de scroll de página tipo revista. */}
    <div className="h-full flex flex-col overflow-hidden bg-canvas print:hidden">

      {/* HEADER — shrink-0, NUNCA scrollea */}
      <header
        className="shrink-0 border-b border-line bg-canvas px-[var(--space-page)]"
        style={{ paddingTop: 'var(--space-card)', paddingBottom: 'var(--space-card)' }}
      >
        {/* Ancho denso del panel de control (5xl, igual que el resto del
            dashboard) — antes era max-w-2xl: columna de revista. Solo
            presentación; la lógica fiscal/IVA/beneficio NO se toca. */}
        <div className="max-w-5xl mx-auto">
        <Link
          href="/dashboard/ventas"
          className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink mb-1.5 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Ventas
        </Link>
        <div className="flex items-center justify-between gap-4">
          {/* Selector de mes con el MISMO contenedor visual que
              StatsPeriodTabs (el resto de pestañas de Informes) para que
              el ex-Booksy no vea dos selectores distintos. Semántica de
              MES intacta: mismos handlers, misma `month`, mismo P&L. */}
          <h1 className="sr-only">{formatMonthLabel(month)}</h1>
          <MonthStepper
            label={formatMonthLabel(month)}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            disabled={isLoading}
          />
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink border border-line rounded-lg px-2.5 py-1.5 transition-colors"
            title="Imprimir para el gestor — usa &ldquo;Guardar como PDF&rdquo; en el diálogo del navegador"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Imprimir
          </button>
        </div>
        </div>
      </header>

      {/* Cuerpo — única región scrolleable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto" style={{ padding: 'var(--space-page)' }}>
      {isLoading ? (
        <div><FinanzasSkeleton /></div>
      ) : (
        <>
          <div className="space-y-3">

            {/* ── Resumen — Te quedan limpios ───────────────────────── */}
            {/* De-editorializado (fix #9): panel denso consistente con los
                KpiTile de abajo (rounded-xl, padding apretado, sin la
                cifra a escala de revista). LÓGICA Y DATOS INTACTOS — solo
                cambian clases de presentación. */}
            <section className="bg-surface border border-line rounded-xl px-4 py-4">
              <p className="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.1em]">
                Te quedan limpios
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`tabular-nums text-2xl font-bold leading-tight ${quedanLimpiosCents < 0 ? 'text-danger' : 'text-ink'}`}
                >
                  {formatCents(quedanLimpiosCents)}
                </span>
                {(() => {
                  const t = trendPct(summary.ingresosCents, prevIngresosCents)
                  if (!t) return null
                  const up = t.startsWith('+')
                  return (
                    <span className={`text-sm font-semibold ${up ? 'text-success' : 'text-danger'}`}>
                      {t}
                    </span>
                  )
                })()}
              </div>
              <p className="text-xs text-ink-3 mt-1">
                {quedanLimpiosCents < 0
                  ? 'Este mes te has llevado más de lo que puedes — revísalo.'
                  : 'después de Hacienda y de los retiros que ya te has llevado'}
              </p>

              {/* Comparativas */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {(() => {
                  const t = trendPct(summary.ingresosCents, prevIngresosCents)
                  if (!t) return null
                  const up = t.startsWith('+')
                  return (
                    <p className="text-xs text-ink-3">
                      <span className={`font-semibold ${up ? 'text-success' : 'text-danger'}`}>{t}</span> vs el mes pasado
                    </p>
                  )
                })()}
                {(() => {
                  const t = trendPct(summary.ingresosCents, summary.prevYearIngresosCents)
                  if (!t) return null
                  const up = t.startsWith('+')
                  const yPrev = parseInt(month.split('-')[0], 10) - 1
                  return (
                    <p className="text-xs text-ink-3">
                      <span className={`font-semibold ${up ? 'text-success' : 'text-danger'}`}>{t}</span> vs {yoyMonthLabel} {yPrev}
                    </p>
                  )
                })()}
              </div>

              {/* Sparkline 6 meses */}
              {trendLoaded && trendData.length >= 2 && (
                <div className="mt-3 pt-3 border-t border-line">
                  <Sparkline data={trendData.map((d) => d.beneficioBrutoCents / 100)} height={36} />
                  <div className="flex justify-between mt-2">
                    {trendData.map((d) => (
                      <span key={d.month} className="text-[10px] text-ink-3 capitalize">
                        {formatMonthShort(d.month)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ── KPI GRID 2×2 ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Cobrado */}
              <KpiTile
                icon={Banknote}
                label="Cobrado"
                value={formatCents(summary.ingresosCents)}
                sub={serviciosCount > 0
                  ? `${serviciosCount} ${serviciosCount === 1 ? 'cita' : 'citas'}${ticketMedioCents > 0 ? ` · ${formatCents(ticketMedioCents)}/c` : ''}`
                  : 'Sin citas aún'}
              />

              {/* Gastos con mini-bar de categorías */}
              <KpiTile
                icon={Receipt}
                label="Gastos"
                value={formatCents(summary.totalGastosCents)}
                sub={categoryBreakdown.length > 0
                  ? `Top: ${categoryBreakdown[0].label}`
                  : 'Sin gastos'}
              >
                {categoryBreakdown.length > 0 && summary.totalGastosCents > 0 && (
                  <CategoryStackedBar
                    breakdown={categoryBreakdown}
                    total={summary.totalGastosCents}
                  />
                )}
              </KpiTile>

              {/* Para Hacienda — tone warning */}
              <KpiTile
                icon={Landmark}
                label="Para Hacienda"
                value={formatCents(reservaHaciendaCents)}
                sub={reservaHaciendaCents > 0
                  ? `Sepáralo antes ${ivaDeadline.label}`
                  : 'Nada que separar'}
                tone="warning"
                badge={reservaHaciendaCents > 0 && ivaDeadline.daysLeft <= 30
                  ? `${ivaDeadline.daysLeft}d`
                  : undefined}
              />

              {/* Te has llevado */}
              <KpiTile
                icon={Coins}
                label="Te has llevado"
                value={formatCents(summary.retirosCents)}
                sub={withdrawalsList.length === 0
                  ? 'Sin retiros aún'
                  : `${withdrawalsList.length} ${withdrawalsList.length === 1 ? 'retiro' : 'retiros'}`}
              />
            </div>

            {/* ── ACTION ROW ─────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => setShowAddExpense(true)}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-ink border border-line bg-surface rounded-xl py-3 hover:border-line-strong hover:bg-overlay/40 transition-colors min-h-[48px]"
              >
                <Plus className="h-4 w-4 text-brand" aria-hidden="true" />
                Gasto
              </button>
              <button
                onClick={() => setShowAddWithdrawal(true)}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-ink border border-line bg-surface rounded-xl py-3 hover:border-line-strong hover:bg-overlay/40 transition-colors min-h-[48px]"
              >
                <Plus className="h-4 w-4 text-brand" aria-hidden="true" />
                Retiro
              </button>
              <button
                onClick={() => setShowAddManual(true)}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-ink border border-line bg-surface rounded-xl py-3 hover:border-line-strong hover:bg-overlay/40 transition-colors min-h-[48px]"
              >
                <Plus className="h-4 w-4 text-brand" aria-hidden="true" />
                Efectivo
              </button>
            </div>

            {/* ── DETALLE DEL MES ───────────────────────────────────── */}
            <SectionHeader>Detalle del mes</SectionHeader>

            {/* Cobrado al detalle */}
            <CollapsibleBlock
              label="Lo que has cobrado"
              sub={serviciosCount > 0
                ? `${serviciosCount} ${serviciosCount === 1 ? 'cita' : 'citas'}${summary.manualIngresosCents > 0 ? ` + efectivo` : ''}`
                : summary.manualIngresosCents > 0 ? 'Solo efectivo' : 'Sin movimientos'}
              right={formatCents(summary.ingresosCents)}
            >
              <div className="divide-y divide-line">
                {/* Citas (read-only). De citas = ingresos − efectivo manual
                    − productos − propinas (esos van en sus propias líneas).
                    Antes restaba sólo el efectivo y absorbía productos+propinas. */}
                <div className="flex items-baseline justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-ink">De citas</p>
                    {serviciosCount > 0 && ticketMedioCents > 0 && (
                      <p className="text-xs text-ink-3 mt-0.5">
                        {serviciosCount} {serviciosCount === 1 ? 'cita' : 'citas'} · {formatCents(ticketMedioCents)} de media
                      </p>
                    )}
                  </div>
                  <span className="tabular-nums text-sm font-semibold text-ink">
                    {formatCents(
                      summary.ingresosCents -
                        summary.manualIngresosCents -
                        summary.productsIngresosCents -
                        summary.tipsIngresosCents,
                    )}
                  </span>
                </div>

                {/* Productos vendidos */}
                {summary.productsIngresosCents > 0 && (
                  <div className="flex items-baseline justify-between px-4 py-3">
                    <p className="text-sm text-ink">De productos</p>
                    <span className="tabular-nums text-sm font-semibold text-ink">
                      {formatCents(summary.productsIngresosCents)}
                    </span>
                  </div>
                )}

                {/* Propinas (sin IVA — gratuidad) */}
                {summary.tipsIngresosCents > 0 && (
                  <div className="flex items-baseline justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-ink">Propinas</p>
                      <p className="text-xs text-ink-3 mt-0.5">Sin IVA · se reparte al equipo</p>
                    </div>
                    <span className="tabular-nums text-sm font-semibold text-ink">
                      {formatCents(summary.tipsIngresosCents)}
                    </span>
                  </div>
                )}

                {/* Efectivo manual */}
                {manualIncomesList.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <p className="text-sm text-ink">Efectivo apuntado</p>
                      <span className="tabular-nums text-sm font-semibold text-ink">
                        {formatCents(summary.manualIngresosCents)}
                      </span>
                    </div>
                    <div className="space-y-0">
                      {manualIncomesList.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 py-1.5 -mx-2 px-2 rounded hover:bg-overlay/50">
                          <span className="text-xs text-ink-3 w-10 shrink-0 tabular-nums">{m.date.slice(5)}</span>
                          <span className="flex-1 text-xs text-ink-2 min-w-0 truncate">
                            {m.notes ? m.notes : 'Efectivo'}
                          </span>
                          <span className="tabular-nums text-xs text-ink shrink-0">{formatCents(m.amountCents)}</span>
                          <button
                            onClick={() => handleDeleteManualIncome(m.id)}
                            className="shrink-0 p-1 text-ink-3 hover:text-danger transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                            aria-label="Eliminar"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {manualIncomesList.length === 0 && (
                  <button
                    onClick={() => setShowAddManual(true)}
                    className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-brand transition-colors px-4 py-2.5 w-full"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Apuntar efectivo (cobros sin cita)
                  </button>
                )}
              </div>
            </CollapsibleBlock>

            {/* Gastos al detalle */}
            <CollapsibleBlock
              label="Tus gastos"
              sub={(() => {
                const fijos = fixedCostsList.filter((f) => f.active).length
                const vars = expensesList.length
                if (fijos === 0 && vars === 0) return 'Sin gastos'
                const parts = []
                if (fijos > 0) parts.push(`${fijos} ${fijos === 1 ? 'fijo' : 'fijos'}`)
                if (vars > 0) parts.push(`${vars} ${vars === 1 ? 'puntual' : 'puntuales'}`)
                return parts.join(' · ')
              })()}
              right={formatCents(summary.totalGastosCents)}
            >
              {/* Fijos */}
              {fixedCostsList.length > 0 ? (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-xs text-ink-3 font-medium uppercase tracking-wider">Cada mes</p>
                  </div>
                  {fixedCostsList.map((fc) => (
                    <div key={fc.id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-line ${!fc.active ? 'opacity-40' : ''}`}>
                      <button
                        onClick={() => handleToggleFixed(fc.id)}
                        className={`shrink-0 w-9 h-5 rounded-full transition-colors ${fc.active ? 'bg-brand' : 'bg-line'}`}
                        aria-label={fc.active ? 'Desactivar este mes' : 'Activar este mes'}
                      >
                        <span className={`block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform mx-0.5 mt-0.5 ${fc.active ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        {editingFixedId === fc.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={editingFixedName}
                              onChange={(e) => setEditingFixedName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleRenameFixed(fc.id)}
                              className="flex-1 text-sm border-b border-brand bg-transparent outline-none text-ink py-0.5"
                              autoFocus
                            />
                            <button onClick={() => handleRenameFixed(fc.id)} className="p-1 text-brand" aria-label="Confirmar">
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingFixedId(fc.id); setEditingFixedName(fc.name) }}
                            className="text-sm text-left w-full text-ink hover:text-brand transition-colors"
                          >
                            {fc.name}
                          </button>
                        )}
                      </div>
                      <span className="tabular-nums text-sm font-semibold text-ink shrink-0">{formatCents(fc.amountCents)}</span>
                      <button
                        onClick={() => handleDeleteFixed(fc.id)}
                        className="shrink-0 p-1 text-ink-3 hover:text-danger transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        aria-label="Eliminar"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </>
              ) : null}

              {/* Variables */}
              {expensesList.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-xs text-ink-3 font-medium uppercase tracking-wider">Puntuales</p>
                  </div>
                  {expensesList.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line">
                      <span className="text-xs text-ink-3 w-10 shrink-0 tabular-nums">{e.date.slice(5)}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-ink">
                          {categoryLabel(e.category)}{e.notes ? ` · ${e.notes}` : ''}
                        </span>
                      </div>
                      <span className="tabular-nums text-sm font-semibold text-ink shrink-0">{formatCents(e.amountCents)}</span>
                      <button
                        onClick={() => handleDeleteExpense(e.id)}
                        className="shrink-0 p-1 text-ink-3 hover:text-danger transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        aria-label="Eliminar"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Añadir fijo inline */}
              {addingFixed ? (
                <div className="px-4 py-3 border-b border-line space-y-2 bg-overlay/30">
                  <div className="flex gap-3">
                    <input
                      value={newFixedName}
                      onChange={(e) => setNewFixedName(e.target.value)}
                      placeholder="Nombre (ej. Alquiler)"
                      className="flex-1 text-sm border-b border-line bg-transparent outline-none text-ink py-1 placeholder:text-ink-3"
                      autoFocus
                    />
                    <input
                      value={newFixedAmount}
                      onChange={(e) => setNewFixedAmount(e.target.value)}
                      placeholder="€"
                      inputMode="decimal"
                      className="w-20 text-sm border-b border-line bg-transparent outline-none text-ink py-1 placeholder:text-ink-3 text-right tabular-nums"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddFixed} disabled={fixedSaving} className="btn-primary text-sm py-1.5 px-4 flex items-center gap-2 disabled:opacity-60">
                      {fixedSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      Guardar
                    </button>
                    <button onClick={() => { setAddingFixed(false); setNewFixedName(''); setNewFixedAmount('') }} className="btn-ghost text-sm py-1.5">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingFixed(true)}
                  className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-brand transition-colors px-4 py-2.5 w-full border-b border-line"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  Añadir gasto fijo (alquiler, cuota…)
                </button>
              )}

              {/* Coste materiales — stock consumido internamente + merma.
                  Auto-calculado desde product_sales con consumption_kind ≠ NULL
                  (consumo barbero o rotura). El producto SE PAGÓ al proveedor →
                  gasto real aunque no haya flujo de caja. Fallback al precio de
                  venta cuando el producto no tiene coste de compra configurado
                  (margen 0 hasta que el jefe edite el producto). Detalle:
                  /dashboard/informes/transacciones filtrando por consumo/merma. */}
              {summary.materialsCostCents > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 border-t border-line">
                    <p className="text-xs text-ink-3 font-medium uppercase tracking-wider">Coste materiales</p>
                  </div>
                  {summary.materialsCostInternalCents > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink">Consumo del barbero</p>
                        <p className="text-[11px] text-ink-3 mt-0.5">Productos usados internamente</p>
                      </div>
                      <span className="tabular-nums text-sm font-semibold text-ink shrink-0">
                        {formatCents(summary.materialsCostInternalCents)}
                      </span>
                    </div>
                  )}
                  {summary.materialsCostDamageCents > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink">Merma</p>
                        <p className="text-[11px] text-ink-3 mt-0.5">Roturas y caducidades</p>
                      </div>
                      <span className="tabular-nums text-sm font-semibold text-ink shrink-0">
                        {formatCents(summary.materialsCostDamageCents)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Nóminas del equipo — auto-calculadas. Sólo aparece si hay
                  algún barbero con perfil de pago configurado. El detalle
                  se gestiona en /dashboard/equipo. */}
              {summary.nominasCents > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 border-t border-line">
                    <p className="text-xs text-ink-3 font-medium uppercase tracking-wider">Nóminas del equipo</p>
                  </div>
                  <Link
                    href="/dashboard/informes/nominas"
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-line hover:bg-overlay/30 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink">Lo que cobra el equipo este mes</p>
                      <p className="text-[11px] text-ink-3 mt-0.5">Ver desglose por barbero →</p>
                    </div>
                    <span className="tabular-nums text-sm font-semibold text-ink shrink-0">
                      {formatCents(summary.nominasCents)}
                    </span>
                  </Link>
                </>
              )}

              {/* Pie del bloque */}
              <div className="flex items-baseline justify-between px-4 py-3 bg-overlay">
                <span className="text-xs font-semibold text-ink-2 uppercase tracking-[0.1em]">Total gastos</span>
                <span className="tabular-nums text-sm font-bold text-ink">{formatCents(summary.totalGastosCents)}</span>
              </div>

              <Link
                href="/dashboard/informes/gastos"
                className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-brand transition-colors px-4 py-2.5 w-full border-t border-line"
              >
                Ver todos los gastos · filtrar por periodo →
              </Link>
            </CollapsibleBlock>

            {/* Retiros del mes */}
            {withdrawalsList.length > 0 && (
              <CollapsibleBlock
                label="Tus retiros"
                sub={`${withdrawalsList.length} ${withdrawalsList.length === 1 ? 'retiro' : 'retiros'} este mes`}
                right={formatCents(summary.retirosCents)}
              >
                <div className="divide-y divide-line">
                  {withdrawalsList.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs text-ink-3 w-10 shrink-0 tabular-nums">{w.date.slice(5)}</span>
                      <span className="flex-1 text-sm text-ink-2 min-w-0 truncate">
                        {w.notes ? w.notes : 'Retiro'}
                      </span>
                      <span className="tabular-nums text-sm font-semibold text-ink shrink-0">{formatCents(w.amountCents)}</span>
                      <button
                        onClick={() => handleDeleteWithdrawal(w.id)}
                        className="shrink-0 p-1 text-ink-3 hover:text-danger transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        aria-label="Eliminar retiro"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </CollapsibleBlock>
            )}

            {/* Hacienda al detalle */}
            <CollapsibleBlock
              label="Hacienda al detalle"
              sub="IVA · IRPF"
              right={formatCents(reservaHaciendaCents)}
              rightTone="warning"
            >
              <div className="divide-y divide-line">
                <div className="px-4 py-3 flex justify-between text-sm">
                  <span className="text-ink-2">IVA repercutido (21% s/ ingresos)</span>
                  <span className="tabular-nums text-ink">{formatCents(summary.ivaRepercutidoCents)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between text-sm">
                  <span className="text-ink-2">IVA soportado (deducible)</span>
                  <span className="tabular-nums text-ink">-{formatCents(summary.ivaSoportadoCents)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between text-sm bg-overlay/40">
                  <span className="text-ink font-medium">IVA a declarar</span>
                  <span className="tabular-nums font-semibold text-ink">{formatCents(summary.ivaAPagarCents)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between text-sm">
                  <span className="text-ink-2">IRPF estimado (~20% s/ beneficio)</span>
                  <span className="tabular-nums font-semibold text-ink">{formatCents(summary.irpfEstimadoCents)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between text-sm bg-warning/5 border-t border-warning/20">
                  <span className="font-semibold text-ink">Total a reservar</span>
                  <span className="tabular-nums font-bold text-ink">{formatCents(reservaHaciendaCents)}</span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-3">
                    Estimación orientativa. Próximo modelo 130/303 antes del{' '}
                    <span className="font-semibold text-ink-2">{ivaDeadline.label}</span>
                    {ivaDeadline.daysLeft <= 30 && (
                      <span className="ml-1 font-semibold text-warning">({ivaDeadline.daysLeft}d)</span>
                    )}
                  </p>
                </div>
              </div>
            </CollapsibleBlock>

            {/* ── MIRAR ATRÁS ───────────────────────────────────────── */}
            <SectionHeader>Mirar atrás</SectionHeader>

            {/* Trimestre */}
            <CollapsibleBlock
              label="Trimestre"
              sub={(() => {
                const [y, m] = month.split('-').map(Number)
                const q = Math.ceil(m / 3)
                return `Q${q} ${y} — modelo 130/303`
              })()}
              isOpen={showFiscal}
              onToggle={handleExpandFiscal}
            >
              <div className="px-4 py-4">
                {quarterLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Calculando…
                  </div>
                ) : quarterData ? (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left text-ink-3 font-medium pb-2 pr-3 w-24"></th>
                          {quarterData.months.map((m) => (
                            <th key={m.month} className="text-right text-ink-3 font-medium pb-2 px-2 capitalize">
                              {new Date(m.month + '-01').toLocaleDateString('es-ES', { month: 'short' })}
                            </th>
                          ))}
                          <th className="text-right text-ink-2 font-semibold pb-2 pl-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-line">
                          <td className="text-ink-3 py-2 pr-3">Ingresos</td>
                          {quarterData.months.map((m) => (
                            <td key={m.month} className="text-right tabular-nums py-2 px-2 text-ink">{formatCents(m.ingresosCents)}</td>
                          ))}
                          <td className="text-right tabular-nums py-2 pl-2 font-semibold text-ink">{formatCents(quarterData.totals.ingresosCents)}</td>
                        </tr>
                        <tr className="border-t border-line">
                          <td className="text-ink-3 py-2 pr-3">Gastos</td>
                          {quarterData.months.map((m) => (
                            <td key={m.month} className="text-right tabular-nums py-2 px-2 text-ink-2">{formatCents(m.totalGastosCents)}</td>
                          ))}
                          <td className="text-right tabular-nums py-2 pl-2 font-semibold text-ink-2">{formatCents(quarterData.totals.totalGastosCents)}</td>
                        </tr>
                        <tr className="border-t-2 border-line">
                          <td className="text-ink-2 font-semibold py-2 pr-3">Resultado</td>
                          {quarterData.months.map((m) => (
                            <td key={m.month} className={`text-right tabular-nums py-2 px-2 font-semibold ${m.beneficioBrutoCents < 0 ? 'text-danger' : 'text-ink'}`}>
                              {formatCents(m.beneficioBrutoCents)}
                            </td>
                          ))}
                          <td className={`text-right tabular-nums py-2 pl-2 font-bold ${quarterData.totals.beneficioBrutoCents < 0 ? 'text-danger' : 'text-ink'}`}>
                            {formatCents(quarterData.totals.beneficioBrutoCents)}
                          </td>
                        </tr>
                        <tr className="border-t border-line">
                          <td className="text-ink-3 py-2 pr-3">IVA</td>
                          {quarterData.months.map((m) => (
                            <td key={m.month} className="text-right tabular-nums py-2 px-2 text-ink-2">{formatCents(m.ivaAPagarCents)}</td>
                          ))}
                          <td className="text-right tabular-nums py-2 pl-2 font-semibold text-ink-2">{formatCents(quarterData.totals.ivaAPagarCents)}</td>
                        </tr>
                        <tr className="border-t border-line">
                          <td className="text-ink-3 py-2 pr-3">IRPF</td>
                          <td colSpan={3} className="text-right tabular-nums py-2 px-2 text-ink-2" />
                          <td className="text-right tabular-nums py-2 pl-2 font-semibold text-ink-2">{formatCents(quarterData.totals.irpfAPagarCents)}</td>
                        </tr>
                        <tr className="border-t-2 border-line bg-warning/5">
                          <td className="font-semibold text-ink py-2 pr-3">Reserva</td>
                          <td colSpan={3} />
                          <td className="text-right tabular-nums py-2 pl-2 font-bold text-ink">{formatCents(quarterData.totals.reservaCents)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </CollapsibleBlock>

            {/* Vista anual */}
            <CollapsibleBlock
              label="Vista anual"
              sub={annualYear === new Date().getFullYear()
                ? `${annualYear} · en curso`
                : `${annualYear}`}
              isOpen={showAnnual}
              onToggle={handleExpandAnnual}
              extraHeader={showAnnual ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAnnualPrev() }}
                    className="p-1 text-ink-2 hover:text-ink transition-colors"
                    aria-label="Año anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <span className="text-xs font-semibold text-ink tabular-nums min-w-[3rem] text-center">
                    {annualYear}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAnnualNext() }}
                    disabled={annualYear >= new Date().getFullYear()}
                    className="p-1 text-ink-2 hover:text-ink transition-colors disabled:opacity-30"
                    aria-label="Año siguiente"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : undefined}
            >
              <div className="px-4 py-4">
                {annualLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Calculando…
                  </div>
                ) : annualData ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div>
                        <p className="text-xs text-ink-3">Ingresos</p>
                        <p className="tabular-nums text-sm font-bold text-ink mt-0.5">{formatCents(annualData.totals.ingresosCents)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-3">Media/mes</p>
                        <p className="tabular-nums text-sm font-bold text-ink mt-0.5">{formatCents(annualData.avgIngresosCents)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-3">Resultado</p>
                        <p className={`tabular-nums text-sm font-bold mt-0.5 ${annualData.totals.beneficioBrutoCents < 0 ? 'text-danger' : 'text-ink'}`}>
                          {formatCents(annualData.totals.beneficioBrutoCents)}
                        </p>
                      </div>
                    </div>

                    {(() => {
                      const maxAbs = Math.max(...annualData.months.map((m) => Math.abs(m.beneficioBrutoCents)), 1)
                      return (
                        <div className="space-y-1.5">
                          {annualData.months.map((m) => {
                            const pct = Math.round((Math.abs(m.beneficioBrutoCents) / maxAbs) * 100)
                            const isNeg = m.beneficioBrutoCents < 0
                            const isEmpty = m.ingresosCents === 0 && m.totalGastosCents === 0
                            const label = new Date(m.month + '-01').toLocaleDateString('es-ES', { month: 'short' })
                            return (
                              <div key={m.month} className="flex items-center gap-2">
                                <span className="text-xs text-ink-3 w-7 shrink-0 capitalize">{label}</span>
                                <div className="flex-1 h-5 flex items-center">
                                  {isEmpty ? (
                                    <span className="text-xs text-ink-3">—</span>
                                  ) : (
                                    <div
                                      className={`h-4 rounded-sm transition-all ${isNeg ? 'bg-danger/30' : 'bg-brand/30'}`}
                                      style={{ width: `${Math.max(pct, 2)}%` }}
                                    />
                                  )}
                                </div>
                                {!isEmpty && (
                                  <span className={`tabular-nums text-xs font-semibold shrink-0 w-16 text-right ${isNeg ? 'text-danger' : 'text-ink-2'}`}>
                                    {formatCents(m.beneficioBrutoCents)}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {annualData.bestMonth && annualData.activeMonths > 0 && (
                      <p className="text-xs text-ink-3 mt-4">
                        Mejor mes: <span className="font-semibold text-ink capitalize">
                          {new Date(annualData.bestMonth + '-01').toLocaleDateString('es-ES', { month: 'long' })}
                        </span>
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            </CollapsibleBlock>

            {/* Año a año */}
            <CollapsibleBlock
              label="Año a año"
              sub="Histórico"
              isOpen={showHistorical}
              onToggle={handleExpandHistorical}
            >
              <div className="px-4 py-4">
                {historicalLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Calculando…
                  </div>
                ) : historicalData && historicalData.years.length > 0 ? (
                  <>
                    {(() => {
                      const maxIngresos = Math.max(...historicalData.years.map((y) => y.ingresosCents), 1)
                      return (
                        <div className="space-y-2">
                          {historicalData.years.map((y) => {
                            const pct = Math.round((y.ingresosCents / maxIngresos) * 100)
                            const isBest = y.year === historicalData.bestYear
                            return (
                              <div key={y.year} className="flex items-center gap-3">
                                <span className={`text-xs tabular-nums w-10 shrink-0 ${isBest ? 'font-bold text-ink' : 'text-ink-3'}`}>
                                  {y.year}
                                </span>
                                <div className="flex-1 h-5 flex items-center">
                                  <div
                                    className={`h-4 rounded-sm transition-all ${isBest ? 'bg-brand/60' : 'bg-brand/25'}`}
                                    style={{ width: `${Math.max(pct, 2)}%` }}
                                  />
                                </div>
                                <div className="flex items-baseline gap-2 shrink-0">
                                  <span className="tabular-nums text-xs font-semibold text-ink-2 w-16 text-right">
                                    {formatCents(y.ingresosCents)}
                                  </span>
                                  {y.yoyPct !== null && (
                                    <span className={`text-xs font-semibold w-10 text-right ${y.yoyPct >= 0 ? 'text-success' : 'text-danger'}`}>
                                      {y.yoyPct >= 0 ? `+${y.yoyPct}%` : `${y.yoyPct}%`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                    <p className="text-xs text-ink-3 mt-3">Solo ingresos. Gastos fijos no disponibles históricamente.</p>
                  </>
                ) : historicalData && historicalData.years.length === 0 ? (
                  <p className="text-sm text-ink-3">Sin datos históricos disponibles.</p>
                ) : null}
              </div>
            </CollapsibleBlock>

          </div>
        </>
      )}

      {/* ── BOTTOM SHEET: AÑADIR GASTO ────────────────────────────────── */}
      {showAddExpense && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'var(--color-scrim)' }}
            onClick={() => setShowAddExpense(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-surface rounded-t-2xl shadow-xl px-5 pt-5 pb-8 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg md:bottom-10 md:rounded-2xl">
            <div className="w-10 h-1 bg-line rounded-full mx-auto mb-5" />
            <h2 className="font-semibold text-ink mb-4">Apuntar un gasto</h2>

            <div className="mb-4">
              <label className="block text-xs text-ink-2 mb-1">Importe</label>
              <input
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full font-bold text-ink bg-transparent border-b border-line outline-none pb-1 tabular-nums focus:border-brand"
                style={{ fontSize: 'var(--text-figure)' }}
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-ink-2 mb-2">Categoría</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => setExpenseCategory(value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      expenseCategory === value
                        ? 'bg-brand text-brand-ink'
                        : 'bg-overlay text-ink-2 hover:bg-brand-softer hover:text-brand'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs text-ink-2 mb-1">Nota (opcional)</label>
              <input
                value={expenseNote}
                onChange={(e) => setExpenseNote(e.target.value)}
                placeholder="ej. Proveedor de cera"
                className="w-full text-sm text-ink bg-transparent border-b border-line outline-none py-1 placeholder:text-ink-3"
              />
            </div>

            {expenseError && <p className="text-xs text-danger mb-3">{expenseError}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleAddExpense}
                disabled={expenseSaving}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {expenseSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar gasto
              </button>
              <button
                onClick={() => { setShowAddExpense(false); setExpenseError(null) }}
                className="btn-ghost"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
      {/* ── BOTTOM SHEET: AÑADIR RETIRO ────────────────────────────────── */}
      {showAddWithdrawal && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'var(--color-scrim)' }}
            onClick={() => setShowAddWithdrawal(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-surface rounded-t-2xl shadow-xl px-5 pt-5 pb-8 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg md:bottom-10 md:rounded-2xl">
            <div className="w-10 h-1 bg-line rounded-full mx-auto mb-5" />
            <h2 className="font-semibold text-ink mb-4">Apuntar un retiro</h2>

            <div className="mb-4">
              <label className="block text-xs text-ink-2 mb-1">Importe</label>
              <input
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full font-bold text-ink bg-transparent border-b border-line outline-none pb-1 tabular-nums focus:border-brand"
                style={{ fontSize: 'var(--text-figure)' }}
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-ink-2 mb-1">Fecha</label>
              <input
                type="date"
                value={withdrawalDate}
                onChange={(e) => setWithdrawalDate(e.target.value)}
                className="w-full text-sm text-ink bg-transparent border-b border-line outline-none py-1"
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs text-ink-2 mb-1">Nota (opcional)</label>
              <input
                value={withdrawalNote}
                onChange={(e) => setWithdrawalNote(e.target.value)}
                placeholder="ej. Compra material casa"
                className="w-full text-sm text-ink bg-transparent border-b border-line outline-none py-1 placeholder:text-ink-3"
              />
            </div>

            {withdrawalError && <p className="text-xs text-danger mb-3">{withdrawalError}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleAddWithdrawal}
                disabled={withdrawalSaving}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {withdrawalSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar retiro
              </button>
              <button
                onClick={() => { setShowAddWithdrawal(false); setWithdrawalError(null) }}
                className="btn-ghost"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── BOTTOM SHEET: APUNTAR EFECTIVO (ingreso manual) ────────────── */}
      {showAddManual && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'var(--color-scrim)' }}
            onClick={() => setShowAddManual(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-surface rounded-t-2xl shadow-xl px-5 pt-5 pb-8 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg md:bottom-10 md:rounded-2xl">
            <div className="w-10 h-1 bg-line rounded-full mx-auto mb-5" />
            <h2 className="font-semibold text-ink mb-1">Apuntar efectivo</h2>
            <p className="text-xs text-ink-3 mb-4">Cobros que no están en la agenda — walk-ins, propinas, etc.</p>

            <div className="mb-4">
              <label className="block text-xs text-ink-2 mb-1">Importe</label>
              <input
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full font-bold text-ink bg-transparent border-b border-line outline-none pb-1 tabular-nums focus:border-brand"
                style={{ fontSize: 'var(--text-figure)' }}
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-ink-2 mb-1">Fecha</label>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="w-full text-sm text-ink bg-transparent border-b border-line outline-none py-1"
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs text-ink-2 mb-1">Concepto (opcional)</label>
              <input
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="ej. Walk-in tarde"
                className="w-full text-sm text-ink bg-transparent border-b border-line outline-none py-1 placeholder:text-ink-3"
              />
            </div>

            {manualError && <p className="text-xs text-danger mb-3">{manualError}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleAddManualIncome}
                disabled={manualSaving}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {manualSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar
              </button>
              <button
                onClick={() => { setShowAddManual(false); setManualError(null) }}
                className="btn-ghost"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
        </div>
      </div>

    </div>

    {/* ── PRINT REPORT (hidden on screen, shown when printing) ──────────── */}
    {/* Sub-componente `PrintReport` encapsula estilos + sub-secciones del
        informe imprimible (Modelo 130 / 303 para el gestor). Mantenido en
        `_components/PrintReport.tsx` — el archivo de este orquestador no
        debe lidiar con paginación, márgenes ni borders del PDF. */}
    <PrintReport
      month={month}
      summary={summary}
      expensesList={expensesList}
      fixedCostsList={fixedCostsList}
      withdrawalsList={withdrawalsList}
      serviciosCount={serviciosCount}
      ticketMedioCents={ticketMedioCents}
      reservaHaciendaCents={reservaHaciendaCents}
    />
    </>
  )
}

// Las definiciones internas de PRINT/PrintSection/PrintRow/KpiTile/
// CollapsibleBlock/SectionHeader/CategoryStackedBar vivieron aquí hasta
// que el archivo creció a 2k+ LOC. Movidas a `_components/*` — este
// orquestador sólo importa lo que renderiza.

