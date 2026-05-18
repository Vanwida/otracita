'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import {
  Percent,
  Award,
  Trophy,
  Lock,
  Loader2,
  Plus,
  ChevronDown,
} from 'lucide-react'
import BonusesManager from '../../_components/BonusesManager'

// -----------------------------------------------------------------------------
// ComisionesClient — las 3 piezas de la pestaña Comisiones.
//
//   R8 · Comisión por servicio  → override del % global por (barbero,servicio)
//   R9 · Tipos de bono          → reusa BonusesManager (ya soporta meta|tramo)
//   R10 · Competición semanal   → CRUD + leaderboard congelado por semana
//
// Pro-gated en bloque (igual que BonusesManager): si no hay `teamBonuses`,
// una sola UpsellCard ligera (sin header — el PageShell ya lo pone).
//
// Tokens y shape calcados de BonusesManager para que la pestaña se sienta
// de la misma familia. Dinero SIEMPRE en cents en la API; el form usa €.
// -----------------------------------------------------------------------------

interface Props {
  enabled: boolean
  serviceNames: string[]
}

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
})

function eur(cents: number): string {
  return EUR.format(cents / 100)
}

export default function ComisionesClient({ enabled, serviceNames }: Props) {
  if (!enabled) return <UpsellCard />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-section)' }}>
      <Section
        icon={Percent}
        title="Comisión por servicio"
        desc="Afina el % de comisión por servicio. Sin override, cada barbero cobra su % global de servicios. Lo que pongas aquí pisa ese global solo en ese servicio."
      >
        <PerServiceCommissions serviceNames={serviceNames} />
      </Section>

      <Section
        icon={Award}
        title="Tipos de bono"
        desc="Mismo catálogo de bonos del local. El tipo decide cómo se paga: «Meta» es todo-o-nada al llegar al objetivo; «Tramo» paga la parte proporcional aunque no se alcance."
        bordered
      >
        <BonusesManager enabled={enabled} />
      </Section>

      <Section
        icon={Trophy}
        title="Competición semanal"
        desc="Pique sano del equipo: cada semana gana quien más factura (o más citas hace). El ganador cobra un fijo; si encadena varias semanas, bono de racha. Pago aparte de la nómina."
        bordered
      >
        <Competitions />
      </Section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Wrapper de bloque — mismo header que /dashboard/equipo (icono + título +
// meta), separador superior opcional.
// -----------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  desc,
  bordered,
  children,
}: {
  icon: typeof Percent
  title: string
  desc: string
  bordered?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={bordered ? 'pt-6 border-t border-line' : undefined}>
      <div className="mb-3">
        <h2
          className="font-semibold text-ink flex items-center gap-2"
          style={{ fontSize: 'var(--text-section-title)' }}
        >
          <Icon className="h-4 w-4 text-brand" />
          {title}
        </h2>
        <p className="text-ink-2 mt-0.5 max-w-2xl" style={{ fontSize: 'var(--text-meta)' }}>
          {desc}
        </p>
      </div>
      {children}
    </section>
  )
}

// -----------------------------------------------------------------------------
// R8 — Comisión por servicio. Una fila desplegable por barbero; dentro,
// un % editable por servicio del catálogo (vacío = usa el % global).
// -----------------------------------------------------------------------------

interface BarberRow {
  id: string
  name: string
  commissionServicesPct: number
}

const barbersFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ barbers: BarberRow[] }>)

function PerServiceCommissions({ serviceNames }: { serviceNames: string[] }) {
  const { data, isLoading } = useSWR('/api/barbers', barbersFetcher)
  const barbers = data?.barbers ?? []
  const [openId, setOpenId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-ink-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Cargando equipo...
      </div>
    )
  }

  if (serviceNames.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-xl px-4 py-8 text-center text-sm text-ink-3">
        No hay servicios en tu catálogo todavía. Añádelos en{' '}
        <Link href="/dashboard/negocio" className="text-brand hover:text-brand-strong font-medium">
          Negocio
        </Link>{' '}
        y vuelve aquí para afinar comisiones por servicio.
      </div>
    )
  }

  if (barbers.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-xl px-4 py-8 text-center text-sm text-ink-3">
        Sin barberos en el equipo. Añade barberos en la pestaña Empleados.
      </div>
    )
  }

  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <ul className="divide-y divide-line">
        {barbers.map((barber) => (
          <li key={barber.id}>
            <button
              type="button"
              onClick={() => setOpenId(openId === barber.id ? null : barber.id)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-overlay transition-colors"
              aria-expanded={openId === barber.id}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-ink truncate">{barber.name}</span>
                <span className="text-[11px] text-ink-3 shrink-0">
                  global {barber.commissionServicesPct}%
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-ink-3 shrink-0 transition-transform ${
                  openId === barber.id ? 'rotate-180' : ''
                }`}
              />
            </button>
            {openId === barber.id && (
              <BarberOverrides
                barberId={barber.id}
                globalPct={barber.commissionServicesPct}
                serviceNames={serviceNames}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const overridesFetcher = (url: string) =>
  fetch(url).then(
    (r) => r.json() as Promise<{ overrides: { serviceName: string; pct: number }[] }>,
  )

function BarberOverrides({
  barberId,
  globalPct,
  serviceNames,
}: {
  barberId: string
  globalPct: number
  serviceNames: string[]
}) {
  const key = `/api/commissions/per-service?barberId=${encodeURIComponent(barberId)}`
  const { data, mutate, isLoading } = useSWR(key, overridesFetcher)
  // Mapa serviceName → pct (string para permitir input vacío = "usa global").
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const initial: Record<string, string> = {}
  for (const o of data?.overrides ?? []) initial[o.serviceName] = String(o.pct)
  const values = draft ?? initial

  function set(service: string, raw: string) {
    const next = { ...values }
    if (raw === '') delete next[service]
    else next[service] = raw
    setDraft(next)
  }

  async function save() {
    setSaving(true)
    setError(null)
    const overrides = Object.entries(values)
      .map(([serviceName, pctRaw]) => ({ serviceName, pct: Number(pctRaw) }))
      .filter((o) => Number.isFinite(o.pct))
    const res = await fetch('/api/commissions/per-service', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barberId, overrides }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'No se pudo guardar')
      return
    }
    setDraft(null)
    setSavedAt(Date.now())
    mutate()
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 text-center text-xs text-ink-3 bg-overlay">
        <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
        Cargando comisiones...
      </div>
    )
  }

  return (
    <div className="px-4 py-4 bg-overlay border-t border-line">
      <div className="space-y-2">
        {serviceNames.map((service) => {
          const v = values[service] ?? ''
          return (
            <div key={service} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-ink-2 truncate">{service}</span>
              <label className="flex items-center gap-1 text-xs text-ink-3">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={v}
                  onChange={(e) => set(service, e.target.value)}
                  placeholder={`${globalPct}`}
                  className="w-20 bg-surface border border-line rounded px-2 py-1 text-sm text-ink tabular-nums text-right focus:border-brand focus:outline-none"
                />
                <span>%</span>
              </label>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-ink-3 mt-3">
        Vacío = usa el {globalPct}% global del barbero en ese servicio.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/20 text-danger text-xs rounded-lg px-3 py-2 mt-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || draft === null}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar comisiones'}
        </button>
        {savedAt && draft === null && (
          <span className="text-xs text-success">Guardado</span>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// R10 — Competición semanal. Lista de competiciones + leaderboard de la
// semana actual. El payout es standalone (no nómina) — solo informativo.
// -----------------------------------------------------------------------------

interface Competition {
  id: string
  name: string
  metric: 'revenue' | 'bookings'
  rewardCentsPerWeek: number
  streakWeeksForBonus: number
  streakBonusCents: number
  active: boolean
}

const compsFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ competitions: Competition[] }>)

function Competitions() {
  const { data, mutate, isLoading } = useSWR('/api/competitions', compsFetcher, {
    refreshInterval: 60_000,
  })
  const comps = data?.competitions ?? []
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function archive(id: string, active: boolean) {
    const res = await fetch('/api/competitions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active }),
    })
    if (res.ok) mutate()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-ink-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Cargando competiciones...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-danger/10 border border-danger/20 text-danger text-xs rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {comps.length === 0 && !adding ? (
        <div className="bg-surface border border-line rounded-xl px-4 py-10 text-center text-sm text-ink-3">
          Sin competiciones. Crea la primera con &ldquo;Nueva competición&rdquo;.
        </div>
      ) : (
        <div className="space-y-3">
          {comps.map((c) => (
            <CompetitionCard key={c.id} comp={c} onArchive={archive} />
          ))}
        </div>
      )}

      {adding ? (
        <AddCompetitionForm
          onCancel={() => setAdding(false)}
          onCreated={() => {
            setAdding(false)
            mutate()
          }}
          onError={setError}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-strong"
        >
          <Plus className="h-4 w-4" />
          Nueva competición
        </button>
      )}
    </div>
  )
}

interface LeaderboardEntry {
  barberId: string
  barberName: string
  value: number
  rank: number
  isWinner: boolean
}

interface LeaderboardResponse {
  competition: { metric: 'revenue' | 'bookings' }
  week: { start: string; end: string; closed: boolean }
  leaderboard: LeaderboardEntry[]
  winner: {
    barberId: string | null
    metricValue: number | null
    frozen: boolean
    rewardCents: number
    streakBonusCents: number
  }
}

const lbFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<LeaderboardResponse>)

function CompetitionCard({
  comp,
  onArchive,
}: {
  comp: Competition
  onArchive: (id: string, active: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const { data } = useSWR(
    open ? `/api/competitions/leaderboard?competitionId=${comp.id}` : null,
    lbFetcher,
  )

  function fmtMetric(v: number): string {
    return comp.metric === 'revenue' ? eur(v) : `${v} citas`
  }

  return (
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {comp.name}
            {!comp.active && (
              <span className="ml-2 text-[10px] uppercase tracking-widest text-ink-3">
                archivada
              </span>
            )}
          </p>
          <p className="text-[11px] text-ink-3 mt-0.5">
            {comp.metric === 'revenue' ? 'Más facturación' : 'Más citas'} · gana{' '}
            {eur(comp.rewardCentsPerWeek)}/sem
            {comp.streakBonusCents > 0 &&
              ` · racha ${comp.streakWeeksForBonus} sem = +${eur(comp.streakBonusCents)}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs font-medium text-brand hover:text-brand-strong"
          >
            {open ? 'Ocultar' : 'Ver semana'}
          </button>
          <button
            type="button"
            onClick={() => onArchive(comp.id, !comp.active)}
            className="text-xs text-ink-3 hover:text-ink"
          >
            {comp.active ? 'Archivar' : 'Reactivar'}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 py-4 bg-overlay border-t border-line">
          {!data ? (
            <div className="text-center text-xs text-ink-3 py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />
              Cargando clasificación...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-ink-3">
                  Semana {data.week.start} → {data.week.end}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-widest font-bold ${
                    data.week.closed ? 'text-ink-3' : 'text-brand-strong'
                  }`}
                >
                  {data.week.closed ? 'Cerrada' : 'En curso'}
                </span>
              </div>

              {data.leaderboard.length === 0 ? (
                <p className="text-xs text-ink-3 text-center py-3">Sin barberos activos.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.leaderboard.map((e) => (
                    <li
                      key={e.barberId}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${
                        e.isWinner ? 'bg-brand-softer' : 'bg-surface'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-xs tabular-nums text-ink-3 w-4">{e.rank}</span>
                        <span className="text-sm text-ink truncate">{e.barberName}</span>
                        {e.isWinner && (
                          <Trophy className="h-3.5 w-3.5 text-brand shrink-0" />
                        )}
                      </span>
                      <span className="text-sm tabular-nums text-ink-2 shrink-0">
                        {fmtMetric(e.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {data.winner.barberId && (
                <div className="mt-3 pt-3 border-t border-line text-xs text-ink-2">
                  Premio: <strong className="text-ink">{eur(data.winner.rewardCents)}</strong>
                  {data.winner.streakBonusCents > 0 && (
                    <>
                      {' '}
                      + racha{' '}
                      <strong className="text-ink">{eur(data.winner.streakBonusCents)}</strong>
                    </>
                  )}
                  {data.winner.frozen ? (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-ink-3">
                      congelado
                    </span>
                  ) : (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-ink-3">
                      provisional
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AddCompetitionForm({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel: () => void
  onCreated: () => void
  onError: (msg: string | null) => void
}) {
  const [name, setName] = useState('')
  const [metric, setMetric] = useState<'revenue' | 'bookings'>('revenue')
  const [reward, setReward] = useState<number>(25)
  const [streakWeeks, setStreakWeeks] = useState<number>(4)
  const [streakBonus, setStreakBonus] = useState<number>(100)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!name.trim()) {
      onError('Pon un nombre a la competición')
      return
    }
    setSubmitting(true)
    onError(null)
    try {
      const res = await fetch('/api/competitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          metric,
          rewardCentsPerWeek: Math.round(reward * 100),
          streakWeeksForBonus: Math.round(streakWeeks),
          streakBonusCents: Math.round(streakBonus * 100),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        onError(j.error ?? 'No se pudo crear')
        setSubmitting(false)
        return
      }
      onCreated()
    } catch {
      onError('Error de red')
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-brand-softer/30 border border-line rounded-xl p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
            Nombre
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Reto del mes"
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            autoFocus
          />
        </label>

        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
            Métrica
          </span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as 'revenue' | 'bookings')}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          >
            <option value="revenue">Más facturación</option>
            <option value="bookings">Más citas</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
            Premio semanal (€)
          </span>
          <input
            type="number"
            min={0}
            step={5}
            value={reward}
            onChange={(e) => setReward(Number(e.target.value))}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
              Racha (sem)
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={streakWeeks}
              onChange={(e) => setStreakWeeks(Number(e.target.value))}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
              Bono racha (€)
            </span>
            <input
              type="number"
              min={0}
              step={5}
              value={streakBonus}
              onChange={(e) => setStreakBonus(Number(e.target.value))}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn-primary text-sm"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear competición'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm text-ink-2 hover:text-ink"
          disabled={submitting}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Upsell ligero (sin header — el PageShell del layout ya lo pone). Mismo
// patrón que BonusesManager.UpsellCard para consistencia visual.
// -----------------------------------------------------------------------------

function UpsellCard() {
  return (
    <div className="bg-overlay border border-dashed border-line rounded-xl p-6 flex items-start gap-3">
      <Lock className="h-5 w-5 text-ink-3 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-4 w-4 text-brand" />
          <p className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
            Comisiones y bonos del equipo
          </p>
          <span className="text-[10px] uppercase tracking-widest font-bold text-brand-strong bg-brand-softer px-1.5 py-0.5 rounded">
            Pro
          </span>
        </div>
        <p className="text-sm text-ink-2 mb-3 max-w-2xl">
          Afina comisiones por servicio, elige cómo se pagan los bonos y monta una
          competición semanal del equipo con bono de racha. Todo manual y simple.
        </p>
        <Link
          href="/dashboard/mi-plan"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong"
        >
          Ver Mi plan →
        </Link>
      </div>
    </div>
  )
}
