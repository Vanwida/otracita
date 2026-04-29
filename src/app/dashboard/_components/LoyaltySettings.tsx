'use client'

import { useState, useTransition } from 'react'
import { Gift, Check, Loader2, Plus, X, Info } from 'lucide-react'
import DropdownMenu from '@/components/DropdownMenu'
import type {
  LoyaltyConfig,
  LoyaltyPointsConfig,
  LoyaltyReward,
  LoyaltyRewardType,
  LoyaltyStampsConfig,
} from '@/lib/loyalty/types'
import {
  DEFAULT_STAMPS_CONFIG,
  DEFAULT_POINTS_CONFIG,
} from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// LoyaltySettings — panel de config en /dashboard/fidelidad. 100 % configurable
// por el barbero dentro de 2 modos (stamps/points). Self-saves vía PATCH
// /api/loyalty/config (mismo patrón que TipsSettings).
//
// Estado local:
//   · enabled — toggle maestro
//   · mode — 'stamps' | 'points' (radio)
//   · stamps — config del modo sellos (siempre en memoria aunque el modo activo sea points)
//   · points — config del modo puntos (íd.)
// Al guardar, sólo mandamos la config del modo activo. Al cambiar de modo,
// no perdemos la config del otro — sigue viva en local por si el barbero
// vuelve.
// -----------------------------------------------------------------------------

export interface LoyaltyInitial {
  enabled: boolean
  mode: 'stamps' | 'points'
  config: LoyaltyConfig | null
}

interface Props {
  initial: LoyaltyInitial
  availableServices: string[]
}

export default function LoyaltySettings({ initial, availableServices }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [mode, setMode] = useState<'stamps' | 'points'>(initial.mode)

  // Inicializa cada modo. Si el initial coincide con el modo, úsalo; si no,
  // arranca del default. Ambos viven siempre en estado para no perder datos
  // al alternar entre radio buttons.
  const [stamps, setStamps] = useState<LoyaltyStampsConfig>(
    initial.config?.mode === 'stamps'
      ? (initial.config as LoyaltyStampsConfig)
      : DEFAULT_STAMPS_CONFIG,
  )
  const [points, setPoints] = useState<LoyaltyPointsConfig>(
    initial.config?.mode === 'points'
      ? (initial.config as LoyaltyPointsConfig)
      : DEFAULT_POINTS_CONFIG,
  )

  const [saving, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSave = () => {
    setError(null)
    setSaved(false)
    const config = mode === 'stamps' ? stamps : points
    startTransition(async () => {
      try {
        const res = await fetch('/api/loyalty/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loyaltyEnabled: enabled, loyaltyMode: mode, config }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data?.error || 'No se pudo guardar')
          return
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch {
        setError('Error de red')
      }
    })
  }

  const active = mode === 'stamps' ? stamps : points

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
      {/* Header + toggle maestro */}
      <div className="flex items-start justify-between gap-4 border-b border-line pb-5 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Gift className="h-4 w-4 text-brand" />
            Activar tarjeta de fidelidad
          </h2>
          <p className="text-sm text-ink-2 mt-1">
            Cuando está activa, tus clientes ven su progreso en la app y el bot puede
            avisarles cuando les falta poco para una recompensa.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-ink">{enabled ? 'Activa' : 'Inactiva'}</span>
        </label>
      </div>

      {/* Selector de modo */}
      <fieldset className={enabled ? '' : 'opacity-60 pointer-events-none'}>
        <legend className="text-xs uppercase tracking-widest font-bold text-ink-3 mb-3">
          Sistema
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <ModeCard
            active={mode === 'stamps'}
            onSelect={() => setMode('stamps')}
            title="Tarjeta de sellos"
            hint='"Al 10º corte, uno gratis". 1 visita = 1 sello.'
          />
          <ModeCard
            active={mode === 'points'}
            onSelect={() => setMode('points')}
            title="Puntos por euro"
            hint="1 € gastado = X puntos, canjeables por descuento o servicio"
          />
        </div>

        {/* Config específico del modo */}
        {mode === 'stamps' ? (
          <StampsEditor value={stamps} onChange={setStamps} services={availableServices} />
        ) : (
          <PointsEditor value={points} onChange={setPoints} services={availableServices} />
        )}

        {/* Config común: minPrice + caducidad + servicios elegibles */}
        <CommonEditor
          value={active}
          onChange={(next) => {
            if (mode === 'stamps') setStamps({ ...stamps, ...next })
            else setPoints({ ...points, ...next })
          }}
          services={availableServices}
        />
      </fieldset>

      {/* Save bar */}
      <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-line">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            Guardado
          </span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar
        </button>
      </div>
    </div>
  )
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function ModeCard({
  active,
  onSelect,
  title,
  hint,
}: {
  active: boolean
  onSelect: () => void
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-xl border p-4 transition-colors ${
        active
          ? 'border-brand bg-brand-softer'
          : 'border-line hover:border-line-strong bg-surface'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${
            active ? 'border-brand bg-brand' : 'border-line'
          }`}
        />
        <span className="font-semibold text-sm text-ink">{title}</span>
      </div>
      <p className="text-xs text-ink-2 mt-1 ml-6">{hint}</p>
    </button>
  )
}

function StampsEditor({
  value,
  onChange,
  services,
}: {
  value: LoyaltyStampsConfig
  onChange: (v: LoyaltyStampsConfig) => void
  services: string[]
}) {
  return (
    <div className="space-y-4 mb-6">
      <div className="max-w-xs">
        <label className="text-xs text-ink-2 block mb-1.5">
          ¿Cuántos sellos para la recompensa?
        </label>
        <input
          type="number"
          min={2}
          max={50}
          value={value.stampsNeeded}
          onChange={(e) =>
            onChange({
              ...value,
              stampsNeeded: Math.max(2, Math.min(50, Number.parseInt(e.target.value, 10) || 10)),
            })
          }
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
        />
        <p className="text-xs text-ink-3 mt-1">Entre 2 y 50 sellos.</p>
      </div>

      <RewardEditor
        value={value.reward}
        onChange={(r) => onChange({ ...value, reward: r })}
        services={services}
      />
    </div>
  )
}

function PointsEditor({
  value,
  onChange,
  services,
}: {
  value: LoyaltyPointsConfig
  onChange: (v: LoyaltyPointsConfig) => void
  services: string[]
}) {
  const addTier = () => {
    const lastCost = value.redeemTiers[value.redeemTiers.length - 1]?.pointsCost ?? 100
    onChange({
      ...value,
      redeemTiers: [
        ...value.redeemTiers,
        {
          pointsCost: lastCost + 100,
          reward: { type: 'discount_amount', cents: 500 },
        },
      ],
    })
  }
  const removeTier = (idx: number) => {
    if (value.redeemTiers.length <= 1) return
    onChange({
      ...value,
      redeemTiers: value.redeemTiers.filter((_, i) => i !== idx),
    })
  }

  return (
    <div className="space-y-5 mb-6">
      <div className="max-w-xs">
        <label className="text-xs text-ink-2 block mb-1.5">Puntos por cada 1 €</label>
        <input
          type="number"
          min={0.1}
          max={100}
          step={0.1}
          value={value.euroToPoints}
          onChange={(e) =>
            onChange({
              ...value,
              euroToPoints: Math.max(0.1, Math.min(100, Number.parseFloat(e.target.value) || 1)),
            })
          }
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
        />
        <p className="text-xs text-ink-3 mt-1">
          Típico: 1 pt/€ o 10 pts/€. Si un cliente gasta 15 € y tienes 1 pt/€, gana 15 pts.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs uppercase tracking-widest font-bold text-ink-3">
            Recompensas canjeables
          </label>
          <button
            type="button"
            onClick={addTier}
            className="text-xs text-brand hover:text-brand-strong font-medium inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Añadir nivel
          </button>
        </div>
        <div className="space-y-3">
          {value.redeemTiers.map((tier, i) => (
            <div
              key={i}
              className="border border-line rounded-xl p-3 bg-canvas relative"
            >
              {value.redeemTiers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-surface border border-line hover:border-danger text-ink-3 hover:text-danger flex items-center justify-center"
                  aria-label="Eliminar nivel"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <div className="mb-3 max-w-xs">
                <label className="text-xs text-ink-2 block mb-1.5">Cuesta (puntos)</label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={tier.pointsCost}
                  onChange={(e) => {
                    const next = [...value.redeemTiers]
                    next[i] = {
                      ...tier,
                      pointsCost: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                    }
                    onChange({ ...value, redeemTiers: next })
                  }}
                  className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
                />
              </div>
              <RewardEditor
                value={tier.reward}
                onChange={(r) => {
                  const next = [...value.redeemTiers]
                  next[i] = { ...tier, reward: r }
                  onChange({ ...value, redeemTiers: next })
                }}
                services={services}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RewardEditor({
  value,
  onChange,
  services,
}: {
  value: LoyaltyReward
  onChange: (r: LoyaltyReward) => void
  services: string[]
}) {
  const setType = (type: LoyaltyRewardType) => {
    if (type === 'service') {
      onChange({ type: 'service', serviceName: services[0] ?? '' })
    } else if (type === 'discount_amount') {
      onChange({ type: 'discount_amount', cents: 500 })
    } else {
      onChange({ type: 'discount_pct', pct: 100 })
    }
  }

  return (
    <div>
      <label className="text-xs text-ink-2 block mb-1.5">Recompensa</label>
      <div className="flex flex-wrap gap-2 mb-2">
        <Pill active={value.type === 'service'} onClick={() => setType('service')} label="Un servicio gratis" />
        <Pill
          active={value.type === 'discount_amount'}
          onClick={() => setType('discount_amount')}
          label="Descuento en €"
        />
        <Pill
          active={value.type === 'discount_pct'}
          onClick={() => setType('discount_pct')}
          label="Descuento en %"
        />
      </div>
      {value.type === 'service' && (
        <>
          {services.length === 0 ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-ink-2 flex items-start gap-2">
              <Info className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              Aún no tienes servicios registrados. Añádelos en{' '}
              <span className="font-semibold">Mi negocio</span> para poder regalarlos.
            </div>
          ) : (
            <div className="max-w-xs">
              <DropdownMenu
                label="Servicio"
                fullWidth
                selected={value.serviceName ?? services[0]}
                options={services.map((s) => ({ value: s, label: s }))}
                onSelect={(s) => onChange({ type: 'service', serviceName: s })}
              />
            </div>
          )}
        </>
      )}
      {value.type === 'discount_amount' && (
        <div className="flex items-center gap-2 max-w-xs">
          <input
            type="number"
            min={1}
            max={1000}
            value={((value.cents ?? 0) / 100).toFixed(2)}
            onChange={(e) =>
              onChange({
                type: 'discount_amount',
                cents: Math.round((Number.parseFloat(e.target.value) || 0) * 100),
              })
            }
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
          />
          <span className="text-sm text-ink-2">€</span>
        </div>
      )}
      {value.type === 'discount_pct' && (
        <div className="flex items-center gap-2 max-w-xs">
          <input
            type="number"
            min={1}
            max={100}
            value={value.pct ?? 0}
            onChange={(e) =>
              onChange({
                type: 'discount_pct',
                pct: Math.max(1, Math.min(100, Number.parseInt(e.target.value, 10) || 1)),
              })
            }
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
          />
          <span className="text-sm text-ink-2">%</span>
          {value.pct === 100 && (
            <span className="text-xs text-ink-3">= servicio gratis</span>
          )}
        </div>
      )}
    </div>
  )
}

// Campos comunes a ambos modos (stamps / points). Se aceptan por separado
// para no perder el discriminante de unión al hacer spread en setStamps/setPoints.
type CommonFields = Pick<
  LoyaltyConfig,
  'eligibleServiceNames' | 'minPriceCents' | 'expirationMonths'
>

function CommonEditor({
  value,
  onChange,
  services,
}: {
  value: LoyaltyConfig
  onChange: (patch: Partial<CommonFields>) => void
  services: string[]
}) {
  const allEligible =
    !value.eligibleServiceNames || value.eligibleServiceNames.length === 0
  return (
    <div className="space-y-5 mt-6 border-t border-line pt-5">
      <div>
        <label className="text-xs uppercase tracking-widest font-bold text-ink-3 block mb-2">
          Servicios que cuentan
        </label>
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={allEligible}
              onChange={() => onChange({ eligibleServiceNames: null })}
            />
            <span className="text-sm text-ink">Todos los servicios suman</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!allEligible}
              onChange={() => onChange({ eligibleServiceNames: [services[0] ?? ''] })}
              disabled={services.length === 0}
            />
            <span className="text-sm text-ink">Sólo algunos servicios</span>
          </label>
          {!allEligible && services.length > 0 && (
            <div className="ml-6 space-y-1.5">
              {services.map((s) => {
                const checked = (value.eligibleServiceNames ?? []).includes(s)
                return (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const curr = new Set(value.eligibleServiceNames ?? [])
                        if (e.target.checked) curr.add(s)
                        else curr.delete(s)
                        onChange({
                          eligibleServiceNames: Array.from(curr),
                        })
                      }}
                    />
                    <span className="text-ink">{s}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-xs">
        <label className="text-xs text-ink-2 block mb-1.5">
          Precio mínimo del booking (€) para sumar
        </label>
        <input
          type="number"
          min={0}
          max={1000}
          value={((value.minPriceCents ?? 0) / 100).toFixed(2)}
          onChange={(e) =>
            onChange({
              minPriceCents: Math.round((Number.parseFloat(e.target.value) || 0) * 100),
            })
          }
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none"
        />
        <p className="text-xs text-ink-3 mt-1">Evita que reservas triviales generen recompensas.</p>
      </div>

      <div className="max-w-xs">
        <label className="text-xs text-ink-2 block mb-1.5">Caducidad</label>
        <DropdownMenu
          label="Caducidad"
          fullWidth
          selected={value.expirationMonths == null ? 'never' : String(value.expirationMonths)}
          options={[
            { value: 'never', label: 'Nunca caducan' },
            { value: '6', label: '6 meses sin usar' },
            { value: '12', label: '12 meses sin usar' },
            { value: '24', label: '24 meses sin usar' },
          ]}
          onSelect={(v) =>
            onChange({
              expirationMonths: v === 'never' ? null : Number.parseInt(v, 10),
            })
          }
        />
      </div>
    </div>
  )
}

function Pill({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
        active
          ? 'bg-brand text-brand-ink border-brand'
          : 'bg-surface text-ink-2 border-line hover:border-line-strong'
      }`}
    >
      {label}
    </button>
  )
}
