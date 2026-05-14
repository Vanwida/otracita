'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Award, Check, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import Link from 'next/link'
import { formatBonusValue, type BonusUnit } from '@/lib/bonuses/progress'

// -----------------------------------------------------------------------------
// BonusDayLog — log diario del progreso del equipo hacia los bonos del local.
//
// Modelo: el local tiene un catálogo de bonos. Cualquier barbero puede sumar
// progreso a cualquier bono. Aquí, el dueño al cierre teclea por cada bono
// activo cuánto ha sumado cada barbero ese día.
//
// Layout:
//   [Bono "Reseñas Google" (obj 20, +50€)]
//     · Reni:   [+3]
//     · Carlos: [+2]
//   [Bono "Upsell productos" (obj 300€, +30€)]
//     · Reni:   [+12€]
//     · Carlos: [+24€]
//
// Submit envía todas las entries en una sola request a /api/bonuses/entries.
// Las celdas vacías o a 0 se omiten.
// -----------------------------------------------------------------------------

interface BonusRow {
  id: string
  name: string
  unit: BonusUnit
  target: number
  rewardCents: number
  active: boolean
}

interface BarberRow {
  id: string
  name: string
  active: boolean
}

const bonusesFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ bonuses: BonusRow[] }>)
const barbersFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ barbers: BarberRow[] }>)

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export default function BonusDayLog() {
  const { data: bonusesData, isLoading: loadingBonuses } = useSWR('/api/bonuses', bonusesFetcher, {
    refreshInterval: 60_000,
  })
  const { data: barbersData, isLoading: loadingBarbers } = useSWR('/api/barbers', barbersFetcher)

  const [expanded, setExpanded] = useState(true)
  const [date, setDate] = useState(todayMadrid())
  // Clave compuesta `${bonusId}|${barberId}` → input value (string).
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (loadingBonuses || loadingBarbers) return null

  const bonuses = (bonusesData?.bonuses ?? []).filter((b) => b.active)
  const barbers = (barbersData?.barbers ?? []).filter((b) => b.active)

  if (bonuses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-overlay px-5 py-4 text-sm text-ink-2 flex items-start gap-2">
        <Info className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-ink">Bonos del equipo</p>
          <p className="text-xs text-ink-3 mt-0.5">
            No hay bonos activos. Crea el catálogo en{' '}
            <Link
              href="/dashboard/negocio?tab=bonuses"
              className="text-brand hover:text-brand-strong font-medium"
            >
              Ajustes &gt; Tu barbería &gt; Bonos
            </Link>
            .
          </p>
        </div>
      </div>
    )
  }

  if (barbers.length === 0) {
    return null
  }

  async function submit() {
    setError(null)
    const entries: Array<{ bonusId: string; barberId: string; value: number }> = []
    for (const [key, raw] of Object.entries(values)) {
      const parsed = parseFloat(raw.replace(',', '.'))
      if (!Number.isFinite(parsed) || parsed === 0) continue
      const [bonusId, barberId] = key.split('|')
      const bonus = bonuses.find((b) => b.id === bonusId)
      if (!bonus) continue
      const value = bonus.unit === 'euros' ? Math.round(parsed * 100) : Math.round(parsed)
      entries.push({ bonusId, barberId, value })
    }
    if (entries.length === 0) {
      setError('Pon algún valor antes de guardar.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/bonuses/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, entries }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar')
        setSubmitting(false)
        return
      }
      setSavedAt(new Date())
      setValues({})
      setTimeout(() => setSavedAt(null), 4000)
    } catch {
      setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 hover:bg-overlay/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand-softer text-brand-strong flex items-center justify-center">
            <Award className="h-4 w-4" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-ink text-sm">Progreso del día</p>
            <p className="text-xs text-ink-3 mt-0.5">Cuánto ha sumado cada barbero a cada bono</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-ink-3" /> : <ChevronDown className="h-4 w-4 text-ink-3" />}
      </button>

      {expanded && (
        <div className="border-t border-line px-5 py-4 space-y-5">
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <span>Día:</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayMadrid()}
              className="bg-surface border border-line rounded px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <div className="space-y-4">
            {bonuses.map((bonus) => (
              <div key={bonus.id} className="rounded-xl border border-line overflow-hidden">
                <div className="px-3 py-2 bg-overlay/40 border-b border-line flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-medium text-ink text-sm">{bonus.name}</p>
                    <span className="text-[11px] text-ink-3">
                      objetivo {formatBonusValue(bonus.target, bonus.unit)}
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-3">
                    recompensa <strong className="text-ink-2">{formatBonusValue(bonus.rewardCents, 'euros')}</strong>
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {barbers.map((barber) => {
                    const key = `${bonus.id}|${barber.id}`
                    return (
                      <li key={barber.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                        <span className="flex-1 text-ink-2 truncate">{barber.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-ink-2">+</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step={bonus.unit === 'euros' ? 0.5 : 1}
                            min={0}
                            value={values[key] ?? ''}
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [key]: e.target.value }))
                            }
                            placeholder="0"
                            className="w-20 bg-surface border border-line rounded px-2 py-1 text-sm text-ink tabular-nums focus:border-brand focus:outline-none text-right"
                          />
                          <span className="text-xs text-ink-3 w-8 shrink-0">
                            {bonus.unit === 'euros' ? '€' : 'uds'}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
            {savedAt && (
              <span className="inline-flex items-center gap-1.5 text-xs text-success">
                <Check className="h-3.5 w-3.5" />
                Guardado
              </span>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="btn-primary text-sm"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar progreso'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
