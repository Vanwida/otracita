'use client'

import { useState } from 'react'
import { Loader2, Check, Heart, Banknote, CreditCard } from 'lucide-react'
import DataTable, { type Column } from '@/app/dashboard/_components/DataTable'
import { formatCents } from '@/lib/format'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// TipsList — listado de propinas cobradas con asignación de barbero (fix #7).
//
// Las propinas son del barbero que hizo el servicio. `tips.barberName` es
// un snapshot que el flow intenta rellenar pero a veces queda vacío
// (propina suelta, cliente sin barbero elegido). Aquí el barbero asigna o
// reasigna cada propina a un miembro del equipo → alimenta el desglose por
// barbero (BarberBreakdown).
//
// Guardado vía PATCH /api/tips/[id] (multi-tenant, valida barbero activo).
// Optimista con rollback si la API falla.
// -----------------------------------------------------------------------------

export interface TipRow {
  id: string
  amountCents: number
  customerPhone: string
  barberName: string | null
  /**
   * Método de pago. Filas legacy pre-V1 vienen con NULL y se renderizan como
   * 'card' implícito (todas eran Stripe Checkout antes del split Reni V1).
   */
  paymentMethod: 'cash' | 'card' | null
  paidAt: string | null
  createdAt: string
}

interface Props {
  tips: TipRow[]
  /** Nombres de los barberos activos del tenant (para el selector). */
  barberNames: string[]
}

// `formatEur` antes definido localmente — ahora consume el formatter
// compartido (`@/lib/format`, opt `compact`). UI densa de propinas → omitimos
// los ",00" cuando es entero (3 € en vez de 3,00 €) para encajar más filas
// en pantalla. Fuente única para todo el dashboard.
const formatEur = (cents: number) => formatCents(cents, { compact: true })

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

const UNASSIGNED = '__none__'

export default function TipsList({ tips, barberNames }: Props) {
  const [rows, setRows] = useState<TipRow[]>(tips)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function assign(tipId: string, value: string) {
    const barberName = value === UNASSIGNED ? null : value
    const prev = rows
    // Optimista.
    setRows((r) =>
      r.map((t) => (t.id === tipId ? { ...t, barberName } : t)),
    )
    setSavingId(tipId)
    setSavedId(null)
    setError(null)
    try {
      const res = await fetch(`/api/tips/${tipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barberName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRows(prev) // rollback
        setError(data?.error || 'No se pudo asignar la propina.')
        return
      }
      setSavedId(tipId)
      setTimeout(() => setSavedId((s) => (s === tipId ? null : s)), FEEDBACK_MS.copied)
    } catch {
      setRows(prev)
      setError('Error de red. La propina no se asignó.')
    } finally {
      setSavingId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-xl p-6 text-center text-sm text-ink-3">
        Aún no hay propinas cobradas.
      </div>
    )
  }

  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-line flex items-center gap-2">
        <Heart className="h-4 w-4 text-gold" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">Propinas cobradas</h2>
        <span className="text-xs text-ink-3">
          · asígnalas al barbero que hizo el servicio
        </span>
      </header>

      {error && (
        <p
          role="alert"
          className="px-4 py-2 text-xs text-danger bg-danger/10 border-b border-danger/20"
        >
          {error}
        </p>
      )}

      {/* DataTable consume el chrome canónico (sticky head, zebra/hover por
          tokens). Patrón responsive: columna "Cliente" oculta en <sm
          (teléfono ya cabe junto a la fecha); "Fecha" oculta en <md (el
          barbero suele ver propinas del día/semana en curso). */}
      <DataTable<TipRow>
        ariaLabel="Propinas cobradas"
        rows={rows}
        rowKey={(t) => t.id}
        columns={TIP_COLUMNS({ formatEur, formatDate, assign, savingId, savedId, barberNames })}
      />
    </div>
  )
}

// Builder factory — las columnas necesitan acceso al estado y a los
// handlers de la fila. Encapsulado fuera del JSX para que `DataTable<Row>`
// reciba un array tipado limpio sin closures inline en cada render.
function TIP_COLUMNS({
  formatEur,
  formatDate,
  assign,
  savingId,
  savedId,
  barberNames,
}: {
  formatEur: (cents: number) => string
  formatDate: (iso: string | null) => string
  assign: (tipId: string, value: string) => Promise<void>
  savingId: string | null
  savedId: string | null
  barberNames: string[]
}): Column<TipRow>[] {
  return [
    {
      key: 'date',
      header: 'Fecha',
      className: 'hidden md:table-cell',
      cell: (t) => (
        <span className="text-ink-2 tabular-nums whitespace-nowrap">
          {formatDate(t.paidAt ?? t.createdAt)}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      className: 'hidden sm:table-cell',
      cell: (t) => <span className="text-ink-2 tabular-nums">{t.customerPhone}</span>,
    },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      numeric: true,
      cell: (t) => <span className="font-semibold text-ink">{formatEur(t.amountCents)}</span>,
    },
    {
      key: 'method',
      header: 'Método',
      align: 'center',
      // Filas legacy (paymentMethod NULL) se renderizan como 'card' implícito
      // — antes del split V1 todas las propinas venían por Stripe Checkout.
      cell: (t) => {
        const method = t.paymentMethod ?? 'card'
        if (method === 'cash') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-softer/50 text-brand-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest">
              <Banknote className="h-2.5 w-2.5" aria-hidden="true" />
              Cash
            </span>
          )
        }
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-overlay text-ink-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest">
            <CreditCard className="h-2.5 w-2.5" aria-hidden="true" />
            Card
          </span>
        )
      },
    },
    {
      key: 'barber',
      header: 'Barbero',
      cell: (t) => (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`tip-barber-${t.id}`}>
            Barbero de esta propina
          </label>
          <select
            id={`tip-barber-${t.id}`}
            value={t.barberName ?? UNASSIGNED}
            onChange={(e) => assign(t.id, e.target.value)}
            disabled={savingId === t.id}
            className="bg-surface border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink focus:border-brand outline-none transition-colors disabled:opacity-60"
          >
            <option value={UNASSIGNED}>Sin asignar</option>
            {barberNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {savingId === t.id && (
            <Loader2 className="h-3.5 w-3.5 text-ink-3 animate-spin shrink-0" aria-label="Guardando" />
          )}
          {savedId === t.id && savingId !== t.id && (
            <Check className="h-3.5 w-3.5 text-success shrink-0" aria-label="Guardado" />
          )}
        </div>
      ),
    },
  ]
}
