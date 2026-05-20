'use client'

import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Award, Check, Loader2, CheckCircle2, Info } from 'lucide-react'
import Link from 'next/link'
import { computeBonusProgress, formatBonusValue, type BonusUnit, type BonusKind } from '@/lib/bonuses/progress'
import { FEEDBACK_MS } from '@/lib/ui-timings'
import { BUSINESS_TIMEZONE } from '@/lib/time';

// -----------------------------------------------------------------------------
// BonusTracker — vista única que combina progreso del mes + log diario.
//
// Antes había DOS componentes (BonusMonthSummary server + BonusDayLog client)
// que mostraban la misma matriz bonos × barberos. Duplicaba info + el server
// no se enteraba de los inserts del cliente hasta refrescar página. Aquí
// todo en un solo client component con SWR — al guardar, las entries del
// mes re-fetch solas y el progreso se actualiza al instante.
//
// Layout: UN solo container. Por cada bono, una sección con sus barberos
// en filas (progreso del mes + input del día + chip de estado).
// -----------------------------------------------------------------------------

interface BonusRow {
  id: string
  name: string
  kind: BonusKind
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

interface EntryRow {
  id: string
  bonusId: string
  barberId: string
  value: number
  date: string
}

const bonusesFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ bonuses: BonusRow[] }>)
const barbersFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ barbers: BarberRow[] }>)
const entriesFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ entries: EntryRow[] }>)

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function humanMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

export default function BonusTracker() {
  const today = todayMadrid()
  const month = today.slice(0, 7)
  const entriesUrl = `/api/bonuses/entries?month=${month}`

  const { data: bonusesData, isLoading: lb } = useSWR('/api/bonuses', bonusesFetcher, {
    refreshInterval: 60_000,
  })
  const { data: barbersData, isLoading: lbb } = useSWR('/api/barbers', barbersFetcher)
  const { data: entriesData, isLoading: le, mutate: mutateEntries } = useSWR(
    entriesUrl,
    entriesFetcher,
  )

  const [date, setDate] = useState(today)
  // Inputs del día: `${bonusId}|${barberId}` → string
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (lb || lbb || le) return null

  const bonuses = (bonusesData?.bonuses ?? []).filter((b) => b.active)
  const barbers = (barbersData?.barbers ?? []).filter((b) => b.active)
  const entries = entriesData?.entries ?? []

  if (bonuses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-overlay px-5 py-4 text-sm text-ink-2 flex items-start gap-2">
        <Info className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-ink">Bonos del equipo</p>
          <p className="text-xs text-ink-3 mt-0.5">
            No hay bonos definidos. Crea el catálogo en{' '}
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

  if (barbers.length === 0) return null

  // Map progreso del mes por (bonusId, barberId) → suma de values.
  const progressMap = new Map<string, number>()
  for (const e of entries) {
    const key = `${e.bonusId}|${e.barberId}`
    progressMap.set(key, (progressMap.get(key) ?? 0) + e.value)
  }

  // Total comprometido = suma de recompensas de combinaciones (bono, barbero)
  // que ya han llegado al target.
  let totalPayoutCents = 0
  for (const bonus of bonuses) {
    for (const barber of barbers) {
      const progress = progressMap.get(`${bonus.id}|${barber.id}`) ?? 0
      const r = computeBonusProgress({
        unit: bonus.unit,
        kind: bonus.kind,
        target: bonus.target,
        rewardCents: bonus.rewardCents,
        entries: [progress],
      })
      totalPayoutCents += r.payoutCents
    }
  }

  async function submit() {
    setError(null)
    const toSend: Array<{ bonusId: string; barberId: string; value: number }> = []
    for (const [key, raw] of Object.entries(values)) {
      const parsed = parseFloat(raw.replace(',', '.'))
      if (!Number.isFinite(parsed) || parsed === 0) continue
      const [bonusId, barberId] = key.split('|')
      const bonus = bonuses.find((b) => b.id === bonusId)
      if (!bonus) continue
      const value = bonus.unit === 'euros' ? Math.round(parsed * 100) : Math.round(parsed)
      toSend.push({ bonusId, barberId, value })
    }
    if (toSend.length === 0) {
      setError('Pon algún valor antes de guardar.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/bonuses/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, entries: toSend }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar')
        setSubmitting(false)
        return
      }
      // Refresh entries del mes — SWR re-fetch + progreso actualizado al instante.
      await mutateEntries()
      // Si el mes consultado por algún otro componente es el mismo, también.
      globalMutate(entriesUrl)
      setSavedAt(new Date())
      setValues({})
      // Antes 3000ms (outlier sin justificar). Bajado a FEEDBACK_MS.saved
      // (2500) — consistencia con el resto del dashboard.
      setTimeout(() => setSavedAt(null), FEEDBACK_MS.saved)
    } catch {
      setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand-softer text-brand-strong flex items-center justify-center">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-ink text-sm">Bonos · {humanMonth(month)}</p>
            <p className="text-xs text-ink-3 mt-0.5">Progreso del mes + log del día</p>
          </div>
        </div>
        {totalPayoutCents > 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">
              Comprometido
            </p>
            <p className="text-lg font-bold text-success tabular-nums">
              {formatBonusValue(totalPayoutCents, 'euros')}
            </p>
          </div>
        )}
      </div>

      {/* Date selector — visible siempre */}
      <div className="px-5 py-3 border-b border-line bg-overlay/30 flex items-center gap-3 text-xs">
        <span className="text-ink-3 font-semibold uppercase tracking-widest">Día</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={today}
          className="bg-surface border border-line rounded px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none"
        />
        <span className="text-ink-3">
          Los valores que añadas a continuación se imputan a este día.
        </span>
      </div>

      {/* Bonos · cada uno con su lista de barberos */}
      <div className="divide-y divide-line">
        {bonuses.map((bonus) => (
          <div key={bonus.id} className="px-5 py-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
              <p className="font-medium text-ink text-sm">{bonus.name}</p>
              <p className="text-[11px] text-ink-3">
                objetivo {formatBonusValue(bonus.target, bonus.unit)} · recompensa {formatBonusValue(bonus.rewardCents, 'euros')}
              </p>
            </div>

            <ul className="space-y-2.5">
              {barbers.map((barber) => {
                const progress = progressMap.get(`${bonus.id}|${barber.id}`) ?? 0
                const summary = computeBonusProgress({
                  unit: bonus.unit,
                  kind: bonus.kind,
                  target: bonus.target,
                  rewardCents: bonus.rewardCents,
                  entries: [progress],
                })
                const reached = summary.status === 'reached'
                const key = `${bonus.id}|${barber.id}`

                return (
                  <li key={barber.id} className="grid grid-cols-[1fr_auto] gap-3 items-center md:grid-cols-[160px_1fr_auto_auto]">
                    {/* Nombre */}
                    <span className="text-sm text-ink-2 truncate">{barber.name}</span>

                    {/* Progreso visual — solo en md+ ; en móvil va en su propia fila debajo */}
                    <div className="hidden md:flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-overlay overflow-hidden min-w-[80px]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${summary.pct}%`,
                            backgroundColor: reached ? 'var(--color-success)' : 'var(--color-brand)',
                          }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-ink-2 w-20 text-right shrink-0">
                        {formatBonusValue(summary.progress, bonus.unit)}
                        <span className="text-ink-3"> / {formatBonusValue(bonus.target, bonus.unit)}</span>
                      </span>
                    </div>

                    {/* Input del día */}
                    <div className="flex items-center gap-1 justify-self-end">
                      <span className="text-ink-3 text-xs">+</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={bonus.unit === 'euros' ? 0.5 : 1}
                        min={0}
                        value={values[key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                        placeholder="0"
                        className="w-20 bg-surface border border-line rounded px-2 py-1 text-sm text-ink tabular-nums focus:border-brand focus:outline-none text-right"
                      />
                      <span className="text-xs text-ink-3 w-6 shrink-0">
                        {bonus.unit === 'euros' ? '€' : 'uds'}
                      </span>
                    </div>

                    {/* Estado: reached o pct */}
                    <div className="justify-self-end col-start-2 md:col-start-auto">
                      {reached ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
                          <CheckCircle2 className="h-3 w-3" />
                          Cobra {formatBonusValue(bonus.rewardCents, 'euros')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-overlay text-ink-3 border border-line px-2 py-0.5 text-[11px] tabular-nums whitespace-nowrap">
                          {summary.pct}%
                        </span>
                      )}
                    </div>

                    {/* Progreso visual — solo en móvil, fila completa */}
                    <div className="col-span-2 md:hidden flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-overlay overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${summary.pct}%`,
                            backgroundColor: reached ? 'var(--color-success)' : 'var(--color-brand)',
                          }}
                        />
                      </div>
                      <span className="tabular-nums text-[11px] text-ink-3 shrink-0">
                        {formatBonusValue(summary.progress, bonus.unit)} / {formatBonusValue(bonus.target, bonus.unit)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer — error + status + submit */}
      <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3 flex-wrap">
        {error ? (
          <p className="text-xs text-danger flex-1">{error}</p>
        ) : savedAt ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Guardado · progreso actualizado
          </span>
        ) : (
          <span className="text-xs text-ink-3">Añade unidades en cada barbero y guarda.</span>
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
  )
}
