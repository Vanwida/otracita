'use client'

import { useState } from 'react'
import { Loader2, Coins, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { SALARY_PRESETS } from '@/lib/payroll/presets'
import type { SalaryType, BarberSalaryProfile, TierBonus } from '@/lib/payroll/types'

// -----------------------------------------------------------------------------
// BarberSalaryEditor — panel inline en BarbersManager para configurar el
// perfil de pago de un barbero. Cuatro presets:
//
//   1. Asalariado (fijo)           — solo base.
//   2. Mixto                       — base + comisiones.
//   3. Autónomo                    — comisiones + alquiler de silla.
//   4. Asalariado + bono por tramos (F1) — base + UN bono por tramo de
//      facturación (el más alto alcanzado, no acumulativo).
//
// El dueño puede dejar el preset elegido pero cambiar cualquier número
// libremente. Los presets son atajos, no jaulas. La sección de tramos
// (F1) solo es visible cuando salaryType === 'salaried_with_tier_bonus'.
// -----------------------------------------------------------------------------

interface Props {
  barberId: string
  initial: BarberSalaryProfile
  onSaved?: () => void
}

const PRESET_ORDER: SalaryType[] = ['fijo', 'mixto', 'autonomo', 'salaried_with_tier_bonus']

// Máximo de tramos editables — coincide con la validación del API.
const MAX_TIERS = 10

export default function BarberSalaryEditor({ barberId, initial, onSaved }: Props) {
  // Mantenemos el state local como euros (más natural para el usuario).
  // Convertimos a cents al guardar.
  const [salaryType, setSalaryType] = useState<SalaryType | null>(initial.salaryType)
  const [baseEur, setBaseEur] = useState<number>(initial.salaryBaseCents / 100)
  const [servicesPct, setServicesPct] = useState<number>(initial.commissionServicesPct)
  const [productsPct, setProductsPct] = useState<number>(initial.commissionProductsPct)
  const [rentEur, setRentEur] = useState<number>(initial.chairRentCents / 100)
  // F1 — Tramos en EUROS para edición. Conversión a cents al guardar.
  const [tiers, setTiers] = useState<{ thresholdEur: number; bonusEur: number }[]>(
    (initial.tierBonuses ?? []).map((t) => ({
      thresholdEur: t.thresholdCents / 100,
      bonusEur: t.bonusCents / 100,
    })),
  )
  const [saving, setSaving] = useState(false)

  const showTiers = salaryType === 'salaried_with_tier_bonus'

  function applyPreset(type: SalaryType) {
    const preset = SALARY_PRESETS[type]
    setSalaryType(type)
    setBaseEur(preset.salaryBaseCents / 100)
    setServicesPct(preset.commissionServicesPct)
    setProductsPct(preset.commissionProductsPct)
    setRentEur(preset.chairRentCents / 100)
    // Si el preset trae tramos de ejemplo, los usamos como punto de partida —
    // salvo que el barbero ya tuviera unos personalizados configurados (para
    // no pisar trabajo del dueño al cambiar de preset y volver).
    if (preset.tierBonuses && preset.tierBonuses.length > 0) {
      // Solo sobreescribimos si el editor no tenía nada — evita pisar config.
      if (tiers.length === 0) {
        setTiers(
          preset.tierBonuses.map((t) => ({
            thresholdEur: t.thresholdCents / 100,
            bonusEur: t.bonusCents / 100,
          })),
        )
      }
    } else {
      // Presets que NO usan tramos no los limpian (los dejamos por si vuelve
      // al preset F1) — el motor los ignora cuando salaryType no es F1.
    }
  }

  function addTier() {
    if (tiers.length >= MAX_TIERS) return
    const last = tiers[tiers.length - 1]
    const nextThreshold = last ? last.thresholdEur + 1000 : 4000
    const nextBonus = last ? last.bonusEur + 100 : 100
    setTiers([...tiers, { thresholdEur: nextThreshold, bonusEur: nextBonus }])
  }

  function removeTier(idx: number) {
    setTiers(tiers.filter((_, i) => i !== idx))
  }

  function updateTier(idx: number, patch: Partial<{ thresholdEur: number; bonusEur: number }>) {
    setTiers(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }

  async function save() {
    setSaving(true)
    try {
      // F1 — Construimos el payload de tramos. Si el barbero NO usa el preset
      // F1, mandamos null para que el storage refleje "sin tramos" (evita
      // confusión: leer un barbero asalariado con tramos en DB sería raro).
      const tierBonusesPayload: TierBonus[] | null = showTiers
        ? tiers.map((t) => ({
            thresholdCents: Math.round(t.thresholdEur * 100),
            bonusCents: Math.round(t.bonusEur * 100),
          }))
        : null
      const res = await fetch(`/api/barbers/${barberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salaryType,
          salaryBaseCents: Math.round(baseEur * 100),
          commissionServicesPct: Math.round(servicesPct),
          commissionProductsPct: Math.round(productsPct),
          chairRentCents: Math.round(rentEur * 100),
          tierBonuses: tierBonusesPayload,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'No se pudo guardar')
        setSaving(false)
        return
      }
      toast.success('Guardado')
      onSaved?.()
    } catch {
      toast.error('Error de red')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <Coins className="h-4 w-4 text-brand" />
        Cómo cobra este barbero
      </div>

      {/* Presets */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-2">
          Empezar con un perfil
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESET_ORDER.map((type) => {
            const preset = SALARY_PRESETS[type]
            const active = salaryType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => applyPreset(type)}
                className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                  active
                    ? 'border-brand bg-brand-softer text-ink'
                    : 'border-line bg-surface hover:border-line-strong text-ink-2 hover:text-ink'
                }`}
              >
                <span className="block text-xs font-semibold">{preset.label}</span>
                <span className="block text-[11px] text-ink-3 leading-snug max-w-[200px]">{preset.description}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Fields */}
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Base mensual (€)"
          value={baseEur}
          onChange={setBaseEur}
          min={0}
          step={50}
          hint="Salario fijo garantizado, antes de comisiones."
        />
        <Field
          label="% sobre sus servicios"
          value={servicesPct}
          onChange={setServicesPct}
          min={0}
          max={100}
          step={5}
          suffix="%"
          hint="De lo que él factura en bookings completados este mes."
        />
        <Field
          label="% sobre productos vendidos"
          value={productsPct}
          onChange={setProductsPct}
          min={0}
          max={100}
          step={5}
          suffix="%"
          hint="De los productos que él vende en mostrador."
        />
        <Field
          label="Alquiler de silla (€/mes)"
          value={rentEur}
          onChange={setRentEur}
          min={0}
          step={25}
          hint="Lo que él PAGA al local cada mes (modelo autónomo). Resta del total."
        />
      </div>

      {/* F1 — Tramos de bono por facturación */}
      {showTiers && (
        <div className="border border-line rounded-xl p-4 bg-canvas">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest font-bold text-ink-3">
                Tramos de bono por facturación
              </p>
              <p className="text-[11px] text-ink-3 mt-1 leading-snug">
                Si alcanza la facturación del tramo, cobra el bono. <strong className="text-ink-2">Solo se paga el bono del tramo más alto alcanzado</strong> — no se suman entre sí. Facturación = servicios + productos (sin propinas).
              </p>
            </div>
            <button
              type="button"
              onClick={addTier}
              disabled={tiers.length >= MAX_TIERS}
              className="text-xs text-brand hover:text-brand-strong font-medium inline-flex items-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" />
              Añadir tramo
            </button>
          </div>

          {tiers.length === 0 ? (
            <p className="text-xs text-ink-3 italic py-3 text-center">
              Sin tramos configurados. Equivale a asalariado puro (solo base).
            </p>
          ) : (
            <div className="space-y-2">
              {tiers.map((tier, i) => (
                <div
                  key={i}
                  className="flex items-end gap-2 bg-surface border border-line rounded-lg p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
                      Si factura (€)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={Number.isFinite(tier.thresholdEur) ? tier.thresholdEur : 0}
                      onChange={(e) => updateTier(i, { thresholdEur: Number(e.target.value) })}
                      className="w-full bg-canvas border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
                      Cobra bono (€)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={Number.isFinite(tier.bonusEur) ? tier.bonusEur : 0}
                      onChange={(e) => updateTier(i, { bonusEur: Number(e.target.value) })}
                      className="w-full bg-canvas border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    className="h-8 w-8 rounded-lg bg-canvas border border-line hover:border-danger text-ink-3 hover:text-danger flex items-center justify-center shrink-0"
                    aria-label="Eliminar tramo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar perfil de pago'}
        </button>
      </div>

      <p className="text-[11px] text-ink-3 leading-relaxed">
        Las propinas <strong className="text-ink-2">siempre van íntegras</strong> al barbero que las recibió. Los bonos cobrados se suman al total automáticamente desde el módulo de bonos.
      </p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  hint,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  hint?: string
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-ink-3 font-semibold mb-1">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
        />
        {suffix && <span className="text-sm text-ink-3 shrink-0">{suffix}</span>}
      </div>
      {hint && <span className="block text-[11px] text-ink-3 mt-1 leading-snug">{hint}</span>}
    </label>
  )
}
