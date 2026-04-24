'use client'

import Link from 'next/link'
import DropdownMenu, { type DropdownOption } from '@/components/DropdownMenu'

// -----------------------------------------------------------------------------
// /dashboard/facturas — barra de filtros.
//
// Usa DropdownMenu custom en lugar de <select> nativo. Razón: en iPadOS el
// popover nativo se descoloca, problemático para barberos que usan iPad
// como POS. Ahora todos los filtros son URL-driven — cada opción es un
// <Link> con los query params correspondientes, sin estado React.
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

function buildHref(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== 'all') p.set(k, v)
  }
  const query = p.toString()
  return `/dashboard/facturas${query ? `?${query}` : ''}`
}

// -----------------------------------------------------------------------------

export function MonthSelect({
  currentMonth,
  currentType,
  showVoided,
}: {
  currentMonth: string
  currentType?: string
  showVoided?: boolean
}) {
  const now = new Date()
  const options: DropdownOption[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({
      value,
      label: formatMonth(value),
      href: buildHref({
        month: value,
        type: currentType,
        showVoided: showVoided ? '1' : undefined,
      }),
    })
  }
  return <DropdownMenu label="Mes" options={options} selected={currentMonth} minWidth="11rem" />
}

// Versión simple de MonthSelect (retrocompatible con la firma anterior).
// La página pasa currentMonth, pero con los filtros adicionales los
// preserva si los tiene. Como solo currentMonth está en la firma externa,
// mantenemos una versión flexible arriba y un re-export abajo.

// -----------------------------------------------------------------------------

export function TypeSelect({
  currentType,
  currentMonth,
  showVoided,
}: {
  currentType: string
  currentMonth: string
  showVoided: boolean
}) {
  const options: DropdownOption[] = [
    {
      value: 'all',
      label: 'Todos los tipos',
      href: buildHref({
        month: currentMonth,
        showVoided: showVoided ? '1' : undefined,
      }),
    },
    {
      value: 'ticket',
      label: 'Tickets',
      href: buildHref({
        month: currentMonth,
        type: 'ticket',
        showVoided: showVoided ? '1' : undefined,
      }),
    },
    {
      value: 'invoice',
      label: 'Facturas',
      href: buildHref({
        month: currentMonth,
        type: 'invoice',
        showVoided: showVoided ? '1' : undefined,
      }),
    },
  ]
  return <DropdownMenu label="Tipo" options={options} selected={currentType} minWidth="10rem" />
}

// -----------------------------------------------------------------------------

export function VoidedToggle({
  month,
  typeFilter,
  showVoided,
}: {
  month: string
  typeFilter: string
  showVoided: boolean
}) {
  const off = buildHref({ month, type: typeFilter })
  const on = buildHref({ month, type: typeFilter, showVoided: '1' })
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
