'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Award, Check, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { formatBonusValue, type BonusUnit } from '@/lib/bonuses/progress'

// -----------------------------------------------------------------------------
// BonusDayLog — registro diario de progreso de bonos en /dashboard/caja.
//
// Card colapsable que vive cerca del cierre del día. Lista barberos con
// bonos activos y un input "+X" por bono. Submit envía un array a
// /api/bonuses/entries. La fecha por defecto es hoy (Madrid) pero el dueño
// puede cambiarla si está cerrando caja del día anterior.
//
// Diseño:
//   · Solo barberos con bonos activos aparecen — sin ruido para los demás.
//   · El input vacío o 0 se omite en el submit (saltar bonos sin progreso).
//   · Botón "Guardar progreso" único — un solo round-trip para todo.
//   · Tras guardar, muestra confirmación inline + limpia los inputs.
// -----------------------------------------------------------------------------

interface BonusRow {
  id: string
  barberId: string
  barberName: string
  name: string
  unit: BonusUnit
  target: number
  rewardCents: number
  active: boolean
}

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ bonuses: BonusRow[] }>)

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export default function BonusDayLog() {
  const { data, isLoading } = useSWR('/api/bonuses', fetcher, { refreshInterval: 60_000 })
  const [expanded, setExpanded] = useState(true)
  const [date, setDate] = useState(todayMadrid())
  // Map bonusId → input value en la unidad nativa (units o euros visibles,
  // NO cents). Al submit convertimos euros a cents.
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bonuses = (data?.bonuses ?? []).filter((b) => b.active)

  // Agrupamos bonos por barbero — solo barberos con al menos uno activo.
  const byBarber = new Map<string, { barberName: string; bonuses: BonusRow[] }>()
  for (const b of bonuses) {
    if (!byBarber.has(b.barberId)) {
      byBarber.set(b.barberId, { barberName: b.barberName, bonuses: [] })
    }
    byBarber.get(b.barberId)!.bonuses.push(b)
  }

  if (isLoading) return null
  if (bonuses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-overlay px-5 py-4 text-sm text-ink-2 flex items-start gap-2">
        <Info className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-ink">Bonos del equipo</p>
          <p className="text-xs text-ink-3 mt-0.5">
            Aún no has creado bonos. Hazlo en <strong>Ajustes &gt; Tu barbería &gt; Bonos</strong>.
          </p>
        </div>
      </div>
    )
  }

  async function submit() {
    setError(null)
    const entries: Array<{ bonusId: string; value: number }> = []
    for (const [bonusId, raw] of Object.entries(values)) {
      const parsed = parseFloat(raw.replace(',', '.'))
      if (!Number.isFinite(parsed) || parsed === 0) continue
      const bonus = bonuses.find((b) => b.id === bonusId)
      if (!bonus) continue
      const value = bonus.unit === 'euros' ? Math.round(parsed * 100) : Math.round(parsed)
      entries.push({ bonusId, value })
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
            <p className="font-semibold text-ink text-sm">Bonos del día</p>
            <p className="text-xs text-ink-3 mt-0.5">Suma lo que ha hecho cada barbero hoy</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-ink-3" />
        ) : (
          <ChevronDown className="h-4 w-4 text-ink-3" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-line px-5 py-4 space-y-4">
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
            {Array.from(byBarber.values()).map(({ barberName, bonuses: list }) => (
              <div key={barberName} className="space-y-2">
                <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold">
                  {barberName}
                </p>
                <ul className="space-y-1.5">
                  {list.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-2 flex-wrap text-sm"
                    >
                      <span className="flex-1 min-w-[160px] text-ink">{b.name}</span>
                      <span className="text-[10px] uppercase tracking-widest text-ink-3 shrink-0">
                        objetivo {formatBonusValue(b.target, b.unit)}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-ink-2 text-sm">+</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step={b.unit === 'euros' ? 0.5 : 1}
                          min={0}
                          value={values[b.id] ?? ''}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [b.id]: e.target.value }))
                          }
                          placeholder="0"
                          className="w-20 bg-surface border border-line rounded px-2 py-1 text-sm text-ink tabular-nums focus:border-brand focus:outline-none text-right"
                        />
                        <span className="text-xs text-ink-3 w-12 shrink-0">
                          {b.unit === 'euros' ? '€' : 'uds'}
                        </span>
                      </div>
                    </li>
                  ))}
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
