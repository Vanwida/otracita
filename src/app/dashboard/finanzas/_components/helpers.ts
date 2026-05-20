import { Scissors, Droplets, Megaphone, User, Wallet, MoreHorizontal } from 'lucide-react'
import { MS_IN_DAY } from '@/lib/time'
import type { ExpenseCategory } from './types'

// -----------------------------------------------------------------------------
// finanzas/helpers — pure functions y constantes del módulo Finanzas.
//
// Extraídos del cliente monolítico para que los sub-componentes los reusen
// sin importar el archivo de 2k+ LOC. Cero estado, cero side-effects, cero
// componentes React aquí — sólo strings, fechas y un mapa de categorías.
// -----------------------------------------------------------------------------

/** Formatea "2026-05" → "mayo de 2026" (locale es-ES, mes en minúsculas). */
export function formatMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(year, mon - 1, 1)
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

/** Formatea "2026-05" → "may." (3 letras, locale es-ES). */
export function formatMonthShort(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(year, mon - 1, 1)
  return date.toLocaleDateString('es-ES', { month: 'short' })
}

/** Mes anterior en formato YYYY-MM. "2026-01" → "2025-12". */
export function prevMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  if (mon === 1) return `${year - 1}-12`
  return `${year}-${String(mon - 1).padStart(2, '0')}`
}

/** Mes siguiente en formato YYYY-MM. "2025-12" → "2026-01". */
export function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  if (mon === 12) return `${year + 1}-01`
  return `${year}-${String(mon + 1).padStart(2, '0')}`
}

/**
 * Próximo vencimiento trimestral del Modelo 303 (IVA): 20 abr, 20 jul,
 * 20 oct, 20 ene. Devuelve etiqueta legible + días restantes para el
 * countdown del panel fiscal. Si todos los del año pasaron, usa el último
 * (defensivo — el caller suele estar mirando el mes en curso).
 */
export function nextIvaDeadline(): { label: string; daysLeft: number } {
  const now = new Date()
  const year = now.getFullYear()
  const deadlines = [
    new Date(year, 3, 20),       // 20 abril (Q1)
    new Date(year, 6, 20),       // 20 julio (Q2)
    new Date(year, 9, 20),       // 20 octubre (Q3)
    new Date(year + 1, 0, 20),   // 20 enero siguiente (Q4)
  ]
  const future = deadlines.find((d) => d > now) ?? deadlines[deadlines.length - 1]
  const days = Math.ceil((future.getTime() - now.getTime()) / MS_IN_DAY)
  const label = future.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  return { label, daysLeft: days }
}

/**
 * % de cambio actual vs anterior, ya formateado ("+12%" / "-3%"). Devuelve
 * `null` cuando no hay base de comparación (prev === 0), para que el caller
 * decida qué mostrar (típicamente nada).
 */
export function trendPct(current: number, prev: number): string | null {
  if (prev === 0) return null
  const pct = Math.round(((current - prev) / Math.abs(prev)) * 100)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

/**
 * Catálogo de categorías de gasto. ÚNICA fuente; el `value` se persiste en
 * DB, el `label` se renderiza, `Icon` se usa en pills y selectores. Añadir
 * una categoría se hace aquí — el resto del módulo la hereda.
 */
export const CATEGORY_OPTIONS: {
  value: ExpenseCategory
  label: string
  Icon: typeof Scissors
}[] = [
  { value: 'productos',   label: 'Productos',   Icon: Scissors },
  { value: 'suministros', label: 'Suministros', Icon: Droplets },
  { value: 'publicidad',  label: 'Publicidad',  Icon: Megaphone },
  { value: 'personal',    label: 'Personal',    Icon: User },
  { value: 'nomina',      label: 'Nómina',      Icon: Wallet },
  { value: 'otro',        label: 'Otro',        Icon: MoreHorizontal },
]

/** Resuelve la etiqueta visible de una categoría (cae al value si no existe). */
export function categoryLabel(cat: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat
}
