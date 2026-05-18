'use client'

import { useState } from 'react'
import { Loader2, Check, Heart } from 'lucide-react'

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
  paidAt: string | null
  createdAt: string
}

interface Props {
  tips: TipRow[]
  /** Nombres de los barberos activos del tenant (para el selector). */
  barberNames: string[]
}

function formatEur(cents: number): string {
  const eur = cents / 100
  return Number.isInteger(eur) ? `${eur} €` : `${eur.toFixed(2).replace('.', ',')} €`
}

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
      setTimeout(() => setSavedId((s) => (s === tipId ? null : s)), 2000)
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-overlay border-b border-line">
            <tr className="text-left">
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-ink-2">
                Fecha
              </th>
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-ink-2">
                Cliente
              </th>
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-ink-2 text-right">
                Importe
              </th>
              <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-ink-2">
                Barbero
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-canvas/40 transition-colors">
                <td className="px-4 py-3 text-ink-2 tabular-nums whitespace-nowrap">
                  {formatDate(t.paidAt ?? t.createdAt)}
                </td>
                <td className="px-4 py-3 text-ink-2 tabular-nums">
                  {t.customerPhone}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">
                  {formatEur(t.amountCents)}
                </td>
                <td className="px-4 py-3">
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
                      <Loader2
                        className="h-3.5 w-3.5 text-ink-3 animate-spin shrink-0"
                        aria-label="Guardando"
                      />
                    )}
                    {savedId === t.id && savingId !== t.id && (
                      <Check
                        className="h-3.5 w-3.5 text-success shrink-0"
                        aria-label="Guardado"
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
