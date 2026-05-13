'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  Scissors,
  Droplets,
  Megaphone,
  User,
  Wallet,
  MoreHorizontal,
  Check,
  Loader2,
  Printer,
  Receipt,
  Banknote,
  Coins,
  Landmark,
} from 'lucide-react'

// ── Formatters ───────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  const euros = cents / 100
  if (Number.isInteger(euros)) return `${euros} €`
  return `${euros.toFixed(2).replace('.', ',')} €`
}

function formatMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(year, mon - 1, 1)
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

function formatMonthShort(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(year, mon - 1, 1)
  return date.toLocaleDateString('es-ES', { month: 'short' })
}

function prevMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  if (mon === 1) return `${year - 1}-12`
  return `${year}-${String(mon - 1).padStart(2, '0')}`
}

function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  if (mon === 12) return `${year + 1}-01`
  return `${year}-${String(mon + 1).padStart(2, '0')}`
}

// IVA countdown: próximo vencimiento trimestral (20 abr, 20 jul, 20 oct, 20 ene)
function nextIvaDeadline(): { label: string; daysLeft: number } {
  const now = new Date()
  const year = now.getFullYear()
  const deadlines = [
    new Date(year, 3, 20),       // 20 abril (Q1)
    new Date(year, 6, 20),       // 20 julio (Q2)
    new Date(year, 9, 20),       // 20 octubre (Q3)
    new Date(year + 1, 0, 20),   // 20 enero siguiente (Q4)
  ]
  const future = deadlines.find((d) => d > now) ?? deadlines[deadlines.length - 1]
  const days = Math.ceil((future.getTime() - now.getTime()) / 86400000)
  const label = future.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  return { label, daysLeft: days }
}

function trendPct(current: number, prev: number): string | null {
  if (prev === 0) return null
  const pct = Math.round(((current - prev) / Math.abs(prev)) * 100)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, height = 48 }: { data: number[]; height?: number }) {
  if (data.length < 2) return null
  const W = 300
  const H = height
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 8) - 4
    return `${x},${y}`
  })
  const zeroY = H - ((0 - min) / range) * (H - 8) - 4
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="none">
      {min < 0 && (
        <line
          x1="0" y1={zeroY}
          x2={W} y2={zeroY}
          stroke="var(--color-line-strong)"
          strokeWidth="1"
          strokeDasharray="4,4"
        />
      )}
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {/* Hero */}
      <div className="h-44 bg-overlay rounded-2xl" />
      {/* 2×2 KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-overlay rounded-xl" />
        <div className="h-24 bg-overlay rounded-xl" />
        <div className="h-24 bg-overlay rounded-xl" />
        <div className="h-24 bg-overlay rounded-xl" />
      </div>
      {/* Action row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="h-11 bg-overlay rounded-xl" />
        <div className="h-11 bg-overlay rounded-xl" />
        <div className="h-11 bg-overlay rounded-xl" />
      </div>
      {/* Collapsibles */}
      <div className="h-12 bg-overlay rounded-xl mt-4" />
      <div className="h-12 bg-overlay rounded-xl" />
      <div className="h-12 bg-overlay rounded-xl" />
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type FinanzasSummary = {
  month: string
  ingresosCents: number
  manualIngresosCents: number
  gastosVariablesCents: number
  costosFijosCents: number
  totalGastosCents: number
  ivaRepercutidoCents: number
  ivaSoportadoCents: number
  ivaAPagarCents: number
  beneficioBrutoCents: number
  retirosCents: number
  beneficioRealCents: number
  irpfEstimadoCents: number
  prevYearIngresosCents: number
}

export type ManualIncome = {
  id: string
  date: string
  amountCents: number
  notes: string | null
  createdAt: string
}

export type Expense = {
  id: string
  date: string
  amountCents: number
  category: string
  notes: string | null
  createdAt: string
}

export type FixedCost = {
  id: string
  name: string
  amountCents: number
  category: string
  activeFrom: string
  active: boolean
  sortOrder: number
}

export type Withdrawal = {
  id: string
  date: string
  amountCents: number
  notes: string | null
  createdAt: string
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

type ExpenseCategory = 'productos' | 'suministros' | 'publicidad' | 'personal' | 'nomina' | 'otro'

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string; Icon: typeof Scissors }[] = [
  { value: 'productos',   label: 'Productos',   Icon: Scissors },
  { value: 'suministros', label: 'Suministros', Icon: Droplets },
  { value: 'publicidad',  label: 'Publicidad',  Icon: Megaphone },
  { value: 'personal',    label: 'Personal',    Icon: User },
  { value: 'nomina',      label: 'Nómina',      Icon: Wallet },
  { value: 'otro',        label: 'Otro',        Icon: MoreHorizontal },
]

function categoryLabel(cat: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat
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
    <div className="px-4 md:px-8 lg:px-12 max-w-2xl mx-auto pb-24 print:hidden">

      {/* HEADER */}
      <header className="pt-10 lg:pt-14 pb-6">
        <Link
          href="/dashboard/caja"
          className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink mb-6 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Caja
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              disabled={isLoading}
              className="p-1.5 text-ink-2 hover:text-ink transition-colors disabled:opacity-40"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <h1 className="text-base font-semibold text-ink capitalize min-w-[8rem] text-center">
              {formatMonthLabel(month)}
            </h1>
            <button
              onClick={handleNextMonth}
              disabled={isLoading}
              className="p-1.5 text-ink-2 hover:text-ink transition-colors disabled:opacity-40"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink border border-line rounded-lg px-2.5 py-1.5 transition-colors"
            title="Imprimir para el gestor — usa &ldquo;Guardar como PDF&rdquo; en el diálogo del navegador"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Imprimir
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="mt-4"><Skeleton /></div>
      ) : (
        <>
          <div className="mt-4 space-y-3">

            {/* ── HERO — Te quedan limpios ──────────────────────────── */}
            <section className="bg-surface border border-line rounded-2xl px-5 py-6">
              <p className="text-xs font-medium text-ink-3 uppercase tracking-[0.12em]">
                Te quedan limpios
              </p>
              <div className="flex items-baseline gap-3 mt-2">
                <span className={`font-display tabular-nums text-5xl font-semibold leading-none ${quedanLimpiosCents < 0 ? 'text-danger' : 'text-ink'}`}>
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
              <p className="text-sm text-ink-3 mt-2">
                {quedanLimpiosCents < 0
                  ? 'Este mes te has llevado más de lo que puedes — revísalo.'
                  : 'después de Hacienda y de los retiros que ya te has llevado'}
              </p>

              {/* Comparativas */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
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
                <div className="mt-5 pt-5 border-t border-line">
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
                {/* Citas (read-only) */}
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
                    {formatCents(summary.ingresosCents - summary.manualIngresosCents)}
                  </span>
                </div>

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

              {/* Pie del bloque */}
              <div className="flex items-baseline justify-between px-4 py-3 bg-overlay">
                <span className="text-xs font-semibold text-ink-2 uppercase tracking-[0.1em]">Total gastos</span>
                <span className="tabular-nums text-sm font-bold text-ink">{formatCents(summary.totalGastosCents)}</span>
              </div>
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
                className="w-full text-3xl font-semibold text-ink bg-transparent border-b border-line outline-none pb-1 tabular-nums"
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
                className="w-full text-3xl font-semibold text-ink bg-transparent border-b border-line outline-none pb-1 tabular-nums"
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
                className="w-full text-3xl font-semibold text-ink bg-transparent border-b border-line outline-none pb-1 tabular-nums"
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

    {/* ── PRINT REPORT (hidden on screen, shown when printing) ──────────── */}
    <div
      className="hidden print:block"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '10pt', color: '#111', lineHeight: '1.6', padding: '1.5cm 2cm' }}
    >
      {/* Header */}
      <div style={{ borderBottom: '2px solid #111', paddingBottom: '12px', marginBottom: '20px' }}>
        <p style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#666', margin: '0 0 4px' }}>otracita</p>
        <h1 style={{ fontSize: '20pt', fontWeight: 700, margin: '0 0 4px' }}>Control Financiero</h1>
        <p style={{ fontSize: '11pt', color: '#444', margin: 0, textTransform: 'capitalize' }}>
          {formatMonthLabel(month)}
        </p>
        <p style={{ fontSize: '8pt', color: '#888', margin: '4px 0 0' }}>
          Generado el {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Resumen P&L */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#666', margin: '0 0 8px', fontWeight: 600 }}>Resumen del mes</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <PrintRow label="Ingresos brutos (con IVA)" value={formatCents(summary.ingresosCents)} />
            <PrintRow label="Gastos variables" value={`-${formatCents(summary.gastosVariablesCents)}`} indent />
            <PrintRow label="Costes fijos activos" value={`-${formatCents(summary.costosFijosCents)}`} indent />
            <PrintRow label="Total gastos" value={formatCents(summary.totalGastosCents)} />
            <PrintRow label="Beneficio bruto (sin IVA)" value={formatCents(summary.beneficioBrutoCents)} bold />
            <PrintRow label="Retiros personales" value={`-${formatCents(summary.retirosCents)}`} />
            <PrintRow label="Beneficio real" value={formatCents(summary.beneficioRealCents)} bold highlight={summary.beneficioRealCents < 0 ? 'loss' : 'profit'} />
          </tbody>
        </table>
      </section>

      {/* Contexto */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#666', margin: '0 0 8px', fontWeight: 600 }}>Contexto de ingresos</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <PrintRow label="Servicios completados" value={serviciosCount.toLocaleString('es-ES')} />
            <PrintRow label="Ticket medio" value={ticketMedioCents > 0 ? formatCents(ticketMedioCents) : '—'} />
          </tbody>
        </table>
      </section>

      {/* Fiscal */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#666', margin: '0 0 8px', fontWeight: 600 }}>Estimación fiscal</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <PrintRow label="IVA repercutido (21% s/ base)" value={formatCents(summary.ivaRepercutidoCents)} />
            <PrintRow label="IVA soportado (deducible)" value={`-${formatCents(summary.ivaSoportadoCents)}`} />
            <PrintRow label="IVA a declarar (Modelo 303)" value={formatCents(summary.ivaAPagarCents)} bold />
            <PrintRow label="IRPF estimado 20% (Modelo 130)" value={formatCents(summary.irpfEstimadoCents)} bold />
            <PrintRow label="Total reserva Hacienda" value={formatCents(reservaHaciendaCents)} bold highlight="warning" />
          </tbody>
        </table>
        <p style={{ fontSize: '8pt', color: '#888', marginTop: '6px' }}>
          Estimación orientativa. Consulta con tu gestor antes de presentar los modelos.
        </p>
      </section>

      {/* Gastos variables */}
      {expensesList.length > 0 && (
        <section style={{ marginBottom: '24px', pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#666', margin: '0 0 8px', fontWeight: 600 }}>
            Gastos variables ({expensesList.length})
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ccc' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontWeight: 600, color: '#444' }}>Fecha</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#444' }}>Categoría</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#444' }}>Nota</th>
                <th style={{ textAlign: 'right', padding: '4px 0 4px 8px', fontWeight: 600, color: '#444' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {expensesList.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td style={{ padding: '4px 8px' }}>{categoryLabel(e.category)}</td>
                  <td style={{ padding: '4px 8px', color: '#666' }}>{e.notes ?? ''}</td>
                  <td style={{ padding: '4px 0 4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatCents(e.amountCents)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #111' }}>
                <td colSpan={3} style={{ padding: '5px 8px 5px 0', fontWeight: 700 }}>Total gastos variables</td>
                <td style={{ padding: '5px 0 5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatCents(summary.gastosVariablesCents)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Costes fijos */}
      {fixedCostsList.filter((f) => f.active).length > 0 && (
        <section style={{ marginBottom: '24px', pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#666', margin: '0 0 8px', fontWeight: 600 }}>
            Costes fijos activos ({fixedCostsList.filter((f) => f.active).length})
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ccc' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontWeight: 600, color: '#444' }}>Nombre</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#444' }}>Categoría</th>
                <th style={{ textAlign: 'right', padding: '4px 0 4px 8px', fontWeight: 600, color: '#444' }}>Importe/mes</th>
              </tr>
            </thead>
            <tbody>
              {fixedCostsList.filter((f) => f.active).map((fc) => (
                <tr key={fc.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px 4px 0' }}>{fc.name}</td>
                  <td style={{ padding: '4px 8px', color: '#666' }}>{categoryLabel(fc.category)}</td>
                  <td style={{ padding: '4px 0 4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatCents(fc.amountCents)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #111' }}>
                <td colSpan={2} style={{ padding: '5px 8px 5px 0', fontWeight: 700 }}>Total costes fijos</td>
                <td style={{ padding: '5px 0 5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatCents(summary.costosFijosCents)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Retiros */}
      {withdrawalsList.length > 0 && (
        <section style={{ marginBottom: '24px', pageBreakInside: 'avoid' }}>
          <h2 style={{ fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#666', margin: '0 0 8px', fontWeight: 600 }}>
            Retiros personales ({withdrawalsList.length})
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ccc' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontWeight: 600, color: '#444' }}>Fecha</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#444' }}>Nota</th>
                <th style={{ textAlign: 'right', padding: '4px 0 4px 8px', fontWeight: 600, color: '#444' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {withdrawalsList.map((w) => (
                <tr key={w.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>{w.date}</td>
                  <td style={{ padding: '4px 8px', color: '#666' }}>{w.notes ?? ''}</td>
                  <td style={{ padding: '4px 0 4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatCents(w.amountCents)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #111' }}>
                <td colSpan={2} style={{ padding: '5px 8px 5px 0', fontWeight: 700 }}>Total retirado</td>
                <td style={{ padding: '5px 0 5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatCents(summary.retirosCents)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #ccc', paddingTop: '10px', marginTop: '16px', fontSize: '8pt', color: '#888', display: 'flex', justifyContent: 'space-between' }}>
        <span>otracita · Informe financiero mensual</span>
        <span>{formatMonthLabel(month)}</span>
      </div>
    </div>
    </>
  )
}

// ── Print helper component ────────────────────────────────────────────────────

function PrintRow({
  label,
  value,
  bold,
  indent,
  highlight,
}: {
  label: string
  value: string
  bold?: boolean
  indent?: boolean
  highlight?: 'profit' | 'loss' | 'warning'
}) {
  const bg = highlight === 'profit' ? '#f0fdf4' : highlight === 'loss' ? '#fef2f2' : highlight === 'warning' ? '#fffbeb' : 'transparent'
  const fw = bold ? 700 : 400
  return (
    <tr style={{ borderBottom: '1px solid #eee', background: bg }}>
      <td style={{ padding: '5px 8px 5px 0', fontWeight: fw, paddingLeft: indent ? '16px' : '0', color: indent ? '#555' : '#111' }}>{label}</td>
      <td style={{ padding: '5px 0 5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: fw, whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )
}

// ── KpiTile, CollapsibleBlock, SectionHeader, CategoryStackedBar ─────────────
//
// Building blocks visuales del nuevo Finanzas. Inline en el mismo archivo
// porque sólo se usan aquí — extraer a otro archivo añadiría fricción de
// navegación sin ganancia real.
// ──────────────────────────────────────────────────────────────────────────────

interface KpiTileProps {
  icon: typeof Scissors
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'warning'
  badge?: string
  children?: React.ReactNode
}

function KpiTile({ icon: Icon, label, value, sub, tone = 'default', badge, children }: KpiTileProps) {
  const bg = tone === 'warning' ? 'bg-warning/5 border-warning/20' : 'bg-surface border-line'
  const iconColor = tone === 'warning' ? 'text-warning' : 'text-ink-3'
  return (
    <div className={`relative rounded-xl border px-4 py-3 ${bg}`}>
      <div className="flex items-start justify-between gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
        {badge && (
          <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-warning text-canvas uppercase tracking-wider">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[11px] font-medium text-ink-3 uppercase tracking-[0.1em] mt-2">{label}</p>
      <p className={`tabular-nums text-lg font-bold mt-0.5 leading-tight text-ink`}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-ink-3 mt-1 leading-snug truncate">
          {sub}
        </p>
      )}
      {children}
    </div>
  )
}

interface CollapsibleBlockProps {
  label: string
  sub?: string
  right?: string
  rightTone?: 'default' | 'warning'
  isOpen?: boolean
  onToggle?: () => void
  extraHeader?: React.ReactNode
  children: React.ReactNode
}

/**
 * Plegable controlado o autónomo. Si recibe `isOpen`/`onToggle` usa estado
 * externo (para los bloques con carga lazy de datos); si no, mantiene
 * estado interno.
 */
function CollapsibleBlock({ label, sub, right, rightTone = 'default', isOpen, onToggle, extraHeader, children }: CollapsibleBlockProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isOpen !== undefined ? isOpen : internalOpen
  const toggle = onToggle ?? (() => setInternalOpen(!internalOpen))
  const rightClass = rightTone === 'warning'
    ? 'text-warning font-bold'
    : 'text-ink font-semibold'
  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-overlay/30 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          {sub && <p className="text-xs text-ink-3 mt-0.5 truncate">{sub}</p>}
        </div>
        {extraHeader}
        {right && (
          <span className={`tabular-nums text-sm shrink-0 ${rightClass}`}>{right}</span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-ink-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-line">
          {children}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-ink-3 uppercase tracking-[0.14em] pt-6 pb-1 px-1">
      {children}
    </h2>
  )
}

interface CategoryStackedBarProps {
  breakdown: { cat: string; cents: number; label: string }[]
  total: number
}

/**
 * Mini-bar apilada de las top categorías de gasto. La primera ocupa más,
 * la segunda menos, el resto se agrupa en "Otros". El barbero ve a primera
 * vista en qué está gastando más.
 */
function CategoryStackedBar({ breakdown, total }: CategoryStackedBarProps) {
  if (total === 0) return null
  // Top 2 + agrupar resto en "Otros"
  const top = breakdown.slice(0, 2)
  const restCents = breakdown.slice(2).reduce((s, b) => s + b.cents, 0)
  const segments: { label: string; cents: number; color: string }[] = []
  top.forEach((t, i) => {
    segments.push({
      label: t.label,
      cents: t.cents,
      color: i === 0 ? 'bg-brand/70' : 'bg-brand/40',
    })
  })
  if (restCents > 0) {
    segments.push({ label: 'Otros', cents: restCents, color: 'bg-brand/20' })
  }
  return (
    <div className="flex h-1.5 mt-2 rounded-full overflow-hidden bg-overlay">
      {segments.map((s, i) => (
        <div
          key={i}
          className={s.color}
          style={{ width: `${(s.cents / total) * 100}%` }}
          title={`${s.label} · ${(s.cents / 100).toFixed(0)} €`}
        />
      ))}
    </div>
  )
}

