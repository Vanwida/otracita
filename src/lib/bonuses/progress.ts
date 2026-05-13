// -----------------------------------------------------------------------------
// Pure helpers para calcular progreso de bonos. Aislados para testear sin
// montar DB.
//
// Modelo:
//   · Un bono = { unit ('units'|'euros'), target, rewardCents }.
//   · Entries del mes = lista de valores. Si unit='euros' los values son cents.
//   · Progreso = sum(entries.value) — ya en la misma unidad que target.
//   · Estado = 'pending' (0 < progress < target) | 'reached' (≥ target) | 'idle' (0).
// -----------------------------------------------------------------------------

export type BonusUnit = 'units' | 'euros'
export type BonusStatus = 'idle' | 'pending' | 'reached'

export interface BonusProgress {
  progress: number
  target: number
  unit: BonusUnit
  pct: number
  status: BonusStatus
  /** Cents a pagar si reached, 0 si no. */
  payoutCents: number
}

export function computeBonusProgress(args: {
  unit: BonusUnit
  target: number
  rewardCents: number
  entries: number[]
}): BonusProgress {
  const progress = args.entries.reduce((acc, v) => acc + v, 0)
  const pct = args.target > 0 ? Math.min(100, Math.round((progress / args.target) * 100)) : 0
  const status: BonusStatus =
    progress === 0 ? 'idle' : progress >= args.target ? 'reached' : 'pending'
  const payoutCents = status === 'reached' ? args.rewardCents : 0
  return {
    progress,
    target: args.target,
    unit: args.unit,
    pct,
    status,
    payoutCents,
  }
}

/** Formatea un valor según la unidad. Para "euros" convierte cents a "12,34 €". */
export function formatBonusValue(value: number, unit: BonusUnit): string {
  if (unit === 'euros') {
    const euros = value / 100
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: euros % 1 === 0 ? 0 : 2,
    }).format(euros)
  }
  return value.toLocaleString('es-ES')
}
