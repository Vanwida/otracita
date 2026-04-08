'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const PERIODS = [
  { key: 'day', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'lifetime', label: 'Total' },
] as const

export default function StatsPeriodTabs() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('period') ?? 'lifetime'

  const set = (period: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', period)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1 bg-overlay border border-line rounded-lg p-1">
      {PERIODS.map(p => (
        <button
          key={p.key}
          onClick={() => set(p.key)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            current === p.key
              ? 'bg-surface shadow-sm text-ink'
              : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
