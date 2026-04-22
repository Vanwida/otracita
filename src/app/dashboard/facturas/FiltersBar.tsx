'use client'

import Link from 'next/link'

// -----------------------------------------------------------------------------
// /dashboard/facturas filter controls — Client Component.
// Previously these <select>s were defined inline inside the Server Component
// page with `onChange={e => form.submit()}`, which the Next.js 16 runtime
// rejects ("Event handlers cannot be passed to Client Component props") and
// crashed the page with a generic error boundary. Extracted here so the
// interactivity lives in a proper client bundle.
// -----------------------------------------------------------------------------

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTH_NAMES[idx] ?? m} ${y}`
}

export function MonthSelect({ currentMonth }: { currentMonth: string }) {
  const options: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <form method="get" className="flex items-center gap-2">
      <label className="sr-only" htmlFor="month">Mes</label>
      <select
        id="month"
        name="month"
        defaultValue={currentMonth}
        onChange={(e) => (e.currentTarget.form as HTMLFormElement).submit()}
        className="bg-surface border border-line rounded-xl px-4 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
      >
        {options.map((m) => (
          <option key={m} value={m}>{formatMonth(m)}</option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm text-brand hover:underline">Ver</button>
      </noscript>
    </form>
  )
}

export function TypeSelect({
  currentType,
  currentMonth,
  showVoided,
}: {
  currentType: string
  currentMonth: string
  showVoided: boolean
}) {
  return (
    <form method="get" className="flex items-center gap-2">
      <input type="hidden" name="month" value={currentMonth} />
      {showVoided && <input type="hidden" name="showVoided" value="1" />}
      <select
        name="type"
        defaultValue={currentType}
        onChange={(e) => (e.currentTarget.form as HTMLFormElement).submit()}
        className="bg-surface border border-line rounded-xl px-4 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
      >
        <option value="all">Todos los tipos</option>
        <option value="ticket">Tickets</option>
        <option value="invoice">Facturas</option>
      </select>
    </form>
  )
}

export function VoidedToggle({
  month,
  typeFilter,
  showVoided,
}: {
  month: string
  typeFilter: string
  showVoided: boolean
}) {
  const base = new URLSearchParams()
  base.set('month', month)
  if (typeFilter !== 'all') base.set('type', typeFilter)
  const off = `/dashboard/facturas?${base.toString()}`
  const onParams = new URLSearchParams(base)
  onParams.set('showVoided', '1')
  const on = `/dashboard/facturas?${onParams.toString()}`

  return (
    <Link
      href={showVoided ? off : on}
      prefetch={false}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
        showVoided
          ? 'bg-danger/10 border-danger/30 text-danger hover:bg-danger/15'
          : 'bg-surface border-line text-ink-2 hover:border-line-strong hover:text-ink'
      }`}
    >
      {showVoided ? 'Ocultar anuladas' : 'Mostrar anuladas'}
    </Link>
  )
}
