'use client'

import { useState } from 'react'
import { Check, Loader2, Coins } from 'lucide-react'
import { SALARY_PRESETS } from '@/lib/payroll/presets'
import type { SalaryType, BarberSalaryProfile } from '@/lib/payroll/types'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// BarberSalaryEditor — panel inline en BarbersManager para configurar el
// perfil de pago de un barbero. Tres pasos:
//
//   1. Elegir preset (Asalariado / Mixto / Autónomo) — rellena defaults.
//   2. Ajustar los 4 campos numéricos si hace falta.
//   3. Guardar — PATCH a /api/barbers/[id].
//
// El dueño puede dejar el preset elegido pero cambiar cualquier número
// libremente. Los presets son atajos, no jaulas.
// -----------------------------------------------------------------------------

interface Props {
  barberId: string
  initial: BarberSalaryProfile
  onSaved?: () => void
}

const PRESET_ORDER: SalaryType[] = ['fijo', 'mixto', 'autonomo']

export default function BarberSalaryEditor({ barberId, initial, onSaved }: Props) {
  // Mantenemos el state local como euros (más natural para el usuario).
  // Convertimos a cents al guardar.
  const [salaryType, setSalaryType] = useState<SalaryType | null>(initial.salaryType)
  const [baseEur, setBaseEur] = useState<number>(initial.salaryBaseCents / 100)
  const [servicesPct, setServicesPct] = useState<number>(initial.commissionServicesPct)
  const [productsPct, setProductsPct] = useState<number>(initial.commissionProductsPct)
  const [rentEur, setRentEur] = useState<number>(initial.chairRentCents / 100)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  function applyPreset(type: SalaryType) {
    const preset = SALARY_PRESETS[type]
    setSalaryType(type)
    setBaseEur(preset.salaryBaseCents / 100)
    setServicesPct(preset.commissionServicesPct)
    setProductsPct(preset.commissionProductsPct)
    setRentEur(preset.chairRentCents / 100)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/barbers/${barberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salaryType,
          salaryBaseCents: Math.round(baseEur * 100),
          commissionServicesPct: Math.round(servicesPct),
          commissionProductsPct: Math.round(productsPct),
          chairRentCents: Math.round(rentEur * 100),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar')
        setSaving(false)
        return
      }
      setSavedAt(new Date())
      setTimeout(() => setSavedAt(null), FEEDBACK_MS.saved)
      onSaved?.()
    } catch {
      setError('Error de red')
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
