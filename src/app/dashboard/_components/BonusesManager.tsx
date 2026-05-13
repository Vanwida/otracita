'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2, Award, Loader2, AlertTriangle, Lock } from 'lucide-react'
import Link from 'next/link'

// -----------------------------------------------------------------------------
// BonusesManager — UI para configurar bonos del equipo. Pertenece al tab
// "Bonos" dentro de /dashboard/negocio.
//
// Estructura: barberos como secciones, cada uno con sus bonos en filas.
// El form de "Añadir bono" es inline por barbero — el dueño elige a quién
// le crea el bono sin un selector global.
//
// Manual-only v1: cada bono tiene 4 campos (nombre, unit, objetivo,
// recompensa). No hay tipos predefinidos ni auto-tracking.
// -----------------------------------------------------------------------------

interface BarberRow {
  id: string
  name: string
}

interface BonusRow {
  id: string
  barberId: string
  barberName: string
  name: string
  unit: 'units' | 'euros'
  target: number
  rewardCents: number
  active: boolean
}

interface Props {
  /** Si el tier no incluye teamBonuses, mostramos solo el upsell. */
  enabled: boolean
}

const bonusesFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ bonuses: BonusRow[] }>)
const barbersFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ barbers: BarberRow[] }>)

export default function BonusesManager({ enabled }: Props) {
  if (!enabled) return <UpsellCard />

  return <BonusesManagerInner />
}

function BonusesManagerInner() {
  const { data: bonusesData, mutate, isLoading } = useSWR('/api/bonuses', bonusesFetcher, {
    refreshInterval: 30_000,
  })
  const { data: barbersData } = useSWR('/api/barbers', barbersFetcher)

  const bonuses = bonusesData?.bonuses ?? []
  const barbers = barbersData?.barbers ?? []

  const [addingForBarberId, setAddingForBarberId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bonusesByBarber = new Map<string, BonusRow[]>()
  for (const b of bonuses) {
    if (!bonusesByBarber.has(b.barberId)) bonusesByBarber.set(b.barberId, [])
    bonusesByBarber.get(b.barberId)!.push(b)
  }

  async function deleteBonus(id: string) {
    setError(null)
    const res = await fetch(`/api/bonuses/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo eliminar')
      return
    }
    mutate()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-ink-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Cargando bonos...
      </div>
    )
  }

  if (barbers.length === 0) {
    return (
      <div className="bg-overlay border border-line rounded-xl p-6 text-center">
        <AlertTriangle className="h-5 w-5 text-ink-3 mx-auto mb-2" />
        <p className="text-sm text-ink-2 mb-1">No tienes barberos configurados todavía.</p>
        <p className="text-xs text-ink-3">
          Crea tu equipo en la pestaña <strong>Equipo</strong> y vuelve aquí para asignar bonos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="text-sm text-ink-2 max-w-2xl">
        Define los bonos que ofreces a cada miembro del equipo. A final del día desde Caja,
        sumas lo que ha hecho cada uno. A fin de mes ves quién llega al objetivo y cobra.
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 text-danger text-xs rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {barbers.map((barber) => {
          const list = bonusesByBarber.get(barber.id) ?? []
          const isAdding = addingForBarberId === barber.id

          return (
            <div key={barber.id} className="bg-surface border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-overlay/50 border-b border-line flex items-center justify-between">
                <p className="font-display text-sm font-semibold text-ink">{barber.name}</p>
                {!isAdding && (
                  <button
                    type="button"
                    onClick={() => setAddingForBarberId(barber.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-strong"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Añadir bono
                  </button>
                )}
              </div>

              {list.length === 0 && !isAdding && (
                <p className="px-4 py-5 text-xs text-ink-3 text-center">
                  Sin bonos. Crea uno con &ldquo;Añadir bono&rdquo;.
                </p>
              )}

              {list.length > 0 && (
                <ul className="divide-y divide-line">
                  {list.map((bonus) => (
                    <BonusRowItem
                      key={bonus.id}
                      bonus={bonus}
                      onDelete={() => deleteBonus(bonus.id)}
                      onChange={() => mutate()}
                    />
                  ))}
                </ul>
              )}

              {isAdding && (
                <AddBonusForm
                  barberId={barber.id}
                  onCancel={() => setAddingForBarberId(null)}
                  onCreated={() => {
                    setAddingForBarberId(null)
                    mutate()
                  }}
                  onError={setError}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// BonusRowItem — fila de un bono. Edición inline simple (nombre + target +
// reward + activo). El unit no se cambia post-creación: cambiar de units a
// euros invalidaría las entries existentes. Si se equivocan, borran y crean.
// -----------------------------------------------------------------------------

function BonusRowItem({
  bonus,
  onDelete,
  onChange,
}: {
  bonus: BonusRow
  onDelete: () => void
  onChange: () => void
}) {
  const [name, setName] = useState(bonus.name)
  const [target, setTarget] = useState<number>(bonus.unit === 'euros' ? bonus.target / 100 : bonus.target)
  const [rewardEuros, setRewardEuros] = useState<number>(bonus.rewardCents / 100)
  const [active, setActive] = useState(bonus.active)
  const [saving, setSaving] = useState(false)

  async function patch(updates: Record<string, unknown>) {
    setSaving(true)
    const res = await fetch(`/api/bonuses/${bonus.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setSaving(false)
    if (res.ok) onChange()
  }

  return (
    <li className="px-4 py-3 flex flex-wrap items-center gap-2 md:gap-3">
      <label className="flex-1 min-w-[160px]">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== bonus.name && patch({ name })}
          placeholder="Nombre del bono"
          className="w-full bg-transparent text-sm text-ink font-medium border-b border-transparent hover:border-line focus:border-brand focus:outline-none py-1"
        />
      </label>

      <span className="text-[10px] uppercase tracking-widest text-ink-3 shrink-0">{bonus.unit === 'units' ? 'unidades' : 'euros'}</span>

      <label className="flex items-center gap-1 text-xs text-ink-2">
        objetivo
        <input
          type="number"
          min={1}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          onBlur={() => {
            const newTarget = bonus.unit === 'euros' ? Math.round(target * 100) : Math.round(target)
            if (newTarget !== bonus.target) patch({ target: newTarget })
          }}
          className="w-20 bg-surface border border-line rounded px-2 py-1 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
        />
        {bonus.unit === 'euros' && <span className="text-ink-3">€</span>}
      </label>

      <label className="flex items-center gap-1 text-xs text-ink-2">
        recompensa
        <input
          type="number"
          min={0}
          step={0.5}
          value={rewardEuros}
          onChange={(e) => setRewardEuros(Number(e.target.value))}
          onBlur={() => {
            const newCents = Math.round(rewardEuros * 100)
            if (newCents !== bonus.rewardCents) patch({ rewardCents: newCents })
          }}
          className="w-20 bg-surface border border-line rounded px-2 py-1 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
        />
        <span className="text-ink-3">€</span>
      </label>

      <label className="inline-flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked)
            patch({ active: e.target.checked })
          }}
          className="accent-brand"
        />
        Activo
      </label>

      <button
        type="button"
        onClick={onDelete}
        aria-label="Eliminar bono"
        className="p-1.5 text-ink-3 hover:text-danger transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {saving && <Loader2 className="h-3 w-3 animate-spin text-ink-3" />}
    </li>
  )
}

// -----------------------------------------------------------------------------
// AddBonusForm — form inline para crear un bono. 4 campos. Defaults
// pensados para el caso típico: "20 reseñas → 50€".
// -----------------------------------------------------------------------------

function AddBonusForm({
  barberId,
  onCancel,
  onCreated,
  onError,
}: {
  barberId: string
  onCancel: () => void
  onCreated: () => void
  onError: (msg: string | null) => void
}) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<'units' | 'euros'>('units')
  const [target, setTarget] = useState<number>(20)
  const [reward, setReward] = useState<number>(50)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!name.trim()) {
      onError('Pon un nombre al bono')
      return
    }
    setSubmitting(true)
    onError(null)
    try {
      const res = await fetch('/api/bonuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barberId,
          name: name.trim(),
          unit,
          target: unit === 'euros' ? Math.round(target * 100) : Math.round(target),
          rewardCents: Math.round(reward * 100),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        onError(data.error ?? 'No se pudo crear el bono')
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
    <div className="px-4 py-4 bg-brand-softer/30 border-t border-line">
      <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">Nombre del bono</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Reseñas Google"
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            autoFocus
          />
        </label>

        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">Se mide en</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'units' | 'euros')}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          >
            <option value="units">Unidades</option>
            <option value="euros">Euros</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
            Objetivo {unit === 'euros' ? '(€)' : ''}
          </span>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">Recompensa (€)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={reward}
            onChange={(e) => setReward(Number(e.target.value))}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-sm text-ink-2 hover:text-ink"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="btn-primary text-sm"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear bono'}
          </button>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Upsell — para tiers Solo. Coherente con el patrón de finanzas/marketing.
// -----------------------------------------------------------------------------

function UpsellCard() {
  return (
    <div className="bg-overlay border border-dashed border-line rounded-xl p-6 flex items-start gap-3">
      <Lock className="h-5 w-5 text-ink-3 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Award className="h-4 w-4 text-brand" />
          <p className="font-display text-base font-semibold text-ink">Bonos del equipo</p>
          <span className="text-[10px] uppercase tracking-widest font-bold text-brand-strong bg-brand-softer px-1.5 py-0.5 rounded">Pro</span>
        </div>
        <p className="text-sm text-ink-2 mb-3 max-w-2xl">
          Configura bonos por barbero (reseñas, productos vendidos, asistencia…). En caja sumas
          lo que ha hecho cada uno; a fin de mes ves quién llega al objetivo y cobra.
        </p>
        <Link href="/dashboard/mi-plan" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong">
          Ver Mi plan →
        </Link>
      </div>
    </div>
  )
}
