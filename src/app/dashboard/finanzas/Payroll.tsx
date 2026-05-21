'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Users, ChevronDown, ChevronUp } from 'lucide-react'
import type { PayrollBreakdown, BarberSalaryProfile, BarberMonthRaw } from '@/lib/payroll/types'
import { presetLabel } from '@/lib/payroll/presets'

// -----------------------------------------------------------------------------
// Payroll — card en /dashboard/finanzas mostrando la nómina computada del
// mes para cada barbero configurado. Por defecto colapsado por barbero;
// click abre el desglose (base + comisiones + propinas + bonos − alquiler).
//
// Pro feature (gateada arriba en la página). Si el dueño no tiene barberos
// con perfil configurado, no aparece la card.
// -----------------------------------------------------------------------------

interface PayrollItem {
  barberId: string
  barberName: string
  salaryType: BarberSalaryProfile['salaryType']
  profile: BarberSalaryProfile
  raw: BarberMonthRaw
  breakdown: PayrollBreakdown
}

interface Props {
  /** YYYY-MM. Lo recibe del page para sincronizarse con el filtro de mes. */
  month: string
}

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ month: string; items: PayrollItem[] }>)

function formatEuros(cents: number): string {
  const euros = cents / 100
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: euros % 1 === 0 ? 0 : 2,
  }).format(euros)
}

export default function Payroll({ month }: Props) {
  const { data, isLoading } = useSWR(`/api/finanzas/payroll?month=${month}`, fetcher, {
    refreshInterval: 60_000,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) return null

  const items = data?.items ?? []
  if (items.length === 0) return null

  const totalCents = items.reduce((acc, i) => acc + i.breakdown.totalCents, 0)

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand-softer text-brand-strong flex items-center justify-center">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-ink text-sm">Nóminas del equipo</p>
            <p className="text-xs text-ink-3 mt-0.5">Lo que cobra cada barbero este mes — calculado a partir de servicios, productos, propinas y bonos.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">Total a pagar</p>
          <p className="text-lg font-bold text-ink tabular-nums">{formatEuros(totalCents)}</p>
        </div>
      </div>

      <ul className="divide-y divide-line">
        {items.map((item) => {
          const open = expandedId === item.barberId
          return (
            <li key={item.barberId}>
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : item.barberId)}
                className="w-full px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-overlay/30 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-medium text-ink text-sm">{item.barberName}</p>
                    {item.salaryType && (
                      <span className="text-[10px] uppercase tracking-widest text-ink-3">
                        {presetLabel(item.salaryType)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-3 mt-0.5">
                    Servicios {formatEuros(item.raw.servicesRevenueCents)}
                    {item.raw.productsRevenueCents > 0 && <> · productos {formatEuros(item.raw.productsRevenueCents)}</>}
                    {item.raw.tipsCents > 0 && <> · propinas {formatEuros(item.raw.tipsCents)}</>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-base font-bold tabular-nums ${
                      item.breakdown.totalCents < 0 ? 'text-danger' : 'text-ink'
                    }`}
                  >
                    {formatEuros(item.breakdown.totalCents)}
                  </p>
                </div>
                {open ? (
                  <ChevronUp className="h-4 w-4 text-ink-3 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-ink-3 shrink-0" />
                )}
              </button>

              {open && (
                <div className="px-5 pb-4 border-t border-line bg-overlay/20">
                  {/* F1 — Si usa "salaried_with_tier_bonus", banner con la
                      facturación alcanzada y el tramo activo (o "no llegó"). */}
                  {item.salaryType === 'salaried_with_tier_bonus' && (
                    <div className="mt-3 mb-1 rounded-lg border border-line bg-canvas px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">Facturación del mes</p>
                          <p className="text-base font-bold text-ink tabular-nums mt-0.5">
                            {formatEuros(item.breakdown.facturadoCents)}
                          </p>
                          <p className="text-[11px] text-ink-3 mt-0.5">servicios + productos (sin propinas)</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">Tramo activado</p>
                          {item.breakdown.tierBonus ? (
                            <>
                              <p className="text-base font-bold text-brand-strong tabular-nums mt-0.5">
                                +{formatEuros(item.breakdown.tierBonus.bonusCents)}
                              </p>
                              <p className="text-[11px] text-ink-3 mt-0.5">
                                desde {formatEuros(item.breakdown.tierBonus.thresholdCents)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-base font-bold text-ink-3 tabular-nums mt-0.5">—</p>
                              <p className="text-[11px] text-ink-3 mt-0.5">no alcanzó ningún tramo</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <dl className="divide-y divide-line text-sm">
                    <Row label="Base" value={item.breakdown.baseCents} />
                    <Row
                      label={`Comisión servicios (${item.profile.commissionServicesPct}%)`}
                      value={item.breakdown.commissionServicesCents}
                      hint={`sobre ${formatEuros(item.raw.servicesRevenueCents)} facturados`}
                    />
                    <Row
                      label={`Comisión productos (${item.profile.commissionProductsPct}%)`}
                      value={item.breakdown.commissionProductsCents}
                      hint={`sobre ${formatEuros(item.raw.productsRevenueCents)} vendidos`}
                    />
                    <Row label="Propinas" value={item.breakdown.tipsCents} hint="íntegras al barbero" />
                    <Row label="Bonos cobrados" value={item.breakdown.bonusesPayoutCents} />
                    {item.breakdown.tierBonus && (
                      <Row
                        label="Bono por tramo de facturación"
                        value={item.breakdown.tierBonus.bonusCents}
                        hint={`alcanzó ${formatEuros(item.breakdown.tierBonus.thresholdCents)}`}
                      />
                    )}
                    {item.breakdown.chairRentCents > 0 && (
                      <Row
                        label="Alquiler de silla"
                        value={-item.breakdown.chairRentCents}
                        emphasizeNegative
                      />
                    )}
                    <div className="flex items-baseline justify-between gap-3 pt-3 pb-1">
                      <span className="text-sm font-semibold text-ink">Total</span>
                      <span
                        className={`text-lg font-bold tabular-nums ${
                          item.breakdown.totalCents < 0 ? 'text-danger' : 'text-ink'
                        }`}
                      >
                        {formatEuros(item.breakdown.totalCents)}
                      </span>
                    </div>
                  </dl>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Row({
  label,
  value,
  hint,
  emphasizeNegative,
}: {
  label: string
  value: number
  hint?: string
  emphasizeNegative?: boolean
}) {
  if (value === 0) return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-ink-2 truncate">{label}</p>
        {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
      </div>
      <p
        className={`tabular-nums shrink-0 ${
          emphasizeNegative && value < 0 ? 'text-danger' : value < 0 ? 'text-ink-2' : 'text-ink'
        }`}
      >
        {formatEuros(value)}
      </p>
    </div>
  )
}
