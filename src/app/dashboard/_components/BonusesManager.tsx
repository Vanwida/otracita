'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2, Award, Loader2, Lock } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useConfirm } from './ConfirmDialog'

// -----------------------------------------------------------------------------
// BonusesManager — configuración del catálogo de bonos del local.
//
// Modelo: el local define UN catálogo de bonos. Cualquier barbero del
// equipo puede acumular progreso hacia cualquier bono activo. Aquí solo
// se gestiona el catálogo; el progreso por barbero se introduce desde
// /dashboard/caja al cierre del día.
//
// Manual-only v1. 4 campos por bono (name, unit, target, reward).
// -----------------------------------------------------------------------------

interface BonusRow {
  id: string
  name: string
  unit: 'units' | 'euros'
  target: number
  rewardCents: number
  active: boolean
}

interface Props {
  enabled: boolean
}

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ bonuses: BonusRow[] }>)

export default function BonusesManager({ enabled }: Props) {
  if (!enabled) return <UpsellCard />
  return <BonusesManagerInner />
}

function BonusesManagerInner() {
  const { data, mutate, isLoading } = useSWR('/api/bonuses', fetcher, {
    refreshInterval: 30_000,
  })
  const list = data?.bonuses ?? []
  const [adding, setAdding] = useState(false)
  const confirm = useConfirm()

  async function deleteBonus(id: string) {
    const ok = await confirm({
      title: '¿Eliminar este bono?',
      message: 'Se borra también el histórico de progreso.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    const res = await fetch(`/api/bonuses/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'No se pudo eliminar')
      return
    }
    toast.success('Bono eliminado')
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2 max-w-2xl">
        Define los bonos que ofreces al equipo. Cualquier barbero puede llegar al
        objetivo y cobrar la recompensa. El progreso de cada uno se introduce
        desde <strong>Caja</strong> al cierre del día.
      </p>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {list.length === 0 && !adding ? (
          <div className="px-4 py-10 text-center text-sm text-ink-3">
            Sin bonos definidos. Crea el primero con &ldquo;Añadir bono&rdquo;.
          </div>
        ) : (
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
        {adding && (
          <AddBonusForm
            onCancel={() => setAdding(false)}
            onCreated={() => {
              setAdding(false)
              toast.success('Bono creado')
              mutate()
            }}
            onError={(msg) => msg && toast.error(msg)}
          />
        )}
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-strong"
        >
          <Plus className="h-4 w-4" />
          Añadir bono
        </button>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Fila editable. La unidad NO se cambia post-creación: cambiarla invalidaría
// las entries históricas. Si se equivocan, borran y crean.
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
    if (res.ok) {
      toast.success('Guardado')
      onChange()
    } else {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'No se pudo guardar')
    }
  }

  return (
    <li className="px-4 py-3 flex flex-wrap items-center gap-2 md:gap-3">
      <label className="flex-1 min-w-[200px]">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== bonus.name && patch({ name })}
          placeholder="Nombre del bono"
          className="w-full bg-transparent text-sm text-ink font-medium border-b border-transparent hover:border-line focus:border-brand focus:outline-none py-1"
        />
      </label>

      <span className="text-[10px] uppercase tracking-widest text-ink-3 shrink-0">{bonus.unit === 'units' ? 'uds' : '€'}</span>

      <label className="flex items-center gap-1 text-xs text-ink-2">
        objetivo
        <input
          type="number"
          min={1}
          step={bonus.unit === 'euros' ? 0.5 : 1}
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
// Form inline para crear. 4 campos. Defaults: "Reseñas Google, unidades, 20 → 50€".
// -----------------------------------------------------------------------------

function AddBonusForm({
  onCancel,
  onCreated,
  onError,
}: {
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
          name: name.trim(),
          unit,
          target: unit === 'euros' ? Math.round(target * 100) : Math.round(target),
          rewardCents: Math.round(reward * 100),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        onError(j.error ?? 'No se pudo crear el bono')
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
            step={unit === 'euros' ? 0.5 : 1}
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

function UpsellCard() {
  return (
    <div className="bg-overlay border border-dashed border-line rounded-xl p-6 flex items-start gap-3">
      <Lock className="h-5 w-5 text-ink-3 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Award className="h-4 w-4 text-brand" />
          <p className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>Bonos del equipo</p>
          <span className="text-[10px] uppercase tracking-widest font-bold text-brand-strong bg-brand-softer px-1.5 py-0.5 rounded">Pro</span>
        </div>
        <p className="text-sm text-ink-2 mb-3 max-w-2xl">
          Define bonos del local (reseñas, ventas, cortes…) y mide en caja qué barbero ha
          llegado al objetivo cada mes. Manual y simple — sin reglas complejas.
        </p>
        <Link href="/dashboard/mi-plan" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong">
          Ver Suscripción →
        </Link>
      </div>
    </div>
  )
}
