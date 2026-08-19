'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Users, ChevronDown, ChevronUp, BadgeCheck, Loader2 } from 'lucide-react'
import type { PayrollBreakdown, BarberSalaryProfile, BarberMonthRaw } from '@/lib/payroll/types'
import { presetLabel } from '@/lib/payroll/presets'
import { selectNextTier } from '@/lib/payroll/compute'
import Modal from '../_components/Modal'
import { pushUndoToast } from '../_components/UndoToast'

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
  /** Épica Reni #28 parte 3b — ids de propinas CARD pendientes del mes. */
  pendingCardTipIds: string[]
}

type PayoutMethod = 'cash' | 'transfer' | 'card_payroll'

interface PayoutModalState {
  item: PayrollItem
  method: PayoutMethod
  submitting: boolean
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
  const { data, isLoading, mutate } = useSWR(`/api/finanzas/payroll?month=${month}`, fetcher, {
    refreshInterval: 60_000,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [payout, setPayout] = useState<PayoutModalState | null>(null)
  const [payoutError, setPayoutError] = useState<string | null>(null)

  async function confirmPayout() {
    if (!payout || payout.submitting) return
    setPayout({ ...payout, submitting: true })
    setPayoutError(null)
    try {
      const res = await fetch('/api/tips/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipIds: payout.item.pendingCardTipIds,
          method: payout.method,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        updated?: number
        totalCents?: number
      }
      if (!res.ok) {
        setPayout({ ...payout, submitting: false })
        setPayoutError(json.error ?? 'No se pudo marcar el pago.')
        return
      }
      const count = json.updated ?? 0
      const cents = json.totalCents ?? 0
      setPayout(null)
      // Toast informativo — sin undo aquí; el undo vive en /informes/propinas
      // por fila (más claro a la hora de corregir un caso aislado).
      pushUndoToast({
        message: `${count} ${count === 1 ? 'propina marcada' : 'propinas marcadas'} (${formatEuros(cents)})`,
        duration: 3500,
      })
      await mutate()
    } catch {
      setPayout({ ...payout, submitting: false })
      setPayoutError('Error de red. Inténtalo de nuevo.')
    }
  }

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
                      facturación alcanzada, el tramo activo (o "no llegó") y
                      cuánto le falta al siguiente tramo (motivación visible).
                      Si ya está en el último tramo, el indicador se omite. */}
                  {item.salaryType === 'salaried_with_tier_bonus' && (() => {
                    const next = selectNextTier(
                      item.profile.tierBonuses,
                      item.breakdown.facturadoCents,
                    )
                    return (
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

                        {/* Motivación visible — solo si queda un tramo por
                            alcanzar. Si ya está en el último, no mostramos
                            nada (evita ruido). */}
                        {next && (
                          <div className="mt-2.5 pt-2.5 border-t border-line flex items-baseline justify-between gap-2 flex-wrap">
                            <p className="text-[11px] text-ink-3">
                              {item.breakdown.tierBonus ? 'Siguiente tramo' : 'Para activar el primer tramo'}
                            </p>
                            <p className="text-[12px] text-ink-2">
                              le faltan{' '}
                              <strong className="text-ink tabular-nums">
                                {formatEuros(next.remainingCents)}
                              </strong>{' '}
                              para llegar a{' '}
                              <span className="tabular-nums">{formatEuros(next.tier.thresholdCents)}</span>{' '}
                              y cobrar{' '}
                              <strong className="text-brand-strong tabular-nums">
                                +{formatEuros(next.tier.bonusCents)}
                              </strong>
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })()}
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
                    {/* R-T3 — Liquidación distinta de propinas:
                          · CARD = pendiente, se paga al barbero en esta nómina.
                          · CASH = ya entregada en mano al cliente; informativa,
                            NO suma al total (sumarla sería doble-contar). */}
                    <Row
                      label="Propinas card del mes"
                      value={item.breakdown.tipsCardCents}
                      hint="pendientes de pagar al barbero en esta nómina"
                    />
                    {item.breakdown.tipsCashCents > 0 && (
                      <div className="flex items-baseline justify-between gap-3 py-2.5 opacity-60">
                        <div className="min-w-0">
                          <p className="text-sm text-ink-2 truncate">
                            Propinas cash del mes
                            <span
                              className="ml-1.5 inline-flex items-center rounded-full bg-overlay px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-ink-3 align-middle"
                              aria-hidden="true"
                            >
                              Informativo
                            </span>
                          </p>
                          <p className="text-[11px] text-ink-3">
                            ya cobradas en mano por el barbero — no entran al total a pagar
                          </p>
                        </div>
                        <p className="tabular-nums shrink-0 text-ink-2">
                          {formatEuros(item.breakdown.tipsCashCents)}
                        </p>
                      </div>
                    )}
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

                  {/* Épica Reni #28 parte 3b — botón lote "marcar pagadas".
                      Solo aparece si el barbero tiene propinas CARD pendientes
                      del mes (paid_out_at IS NULL). Tras marcar, salen del
                      cálculo de tipsCardCents la siguiente vez que se carga
                      la página (vía SWR mutate). Mobile-first: hit target ≥44px. */}
                  {item.pendingCardTipIds.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-line">
                      <button
                        type="button"
                        onClick={() =>
                          setPayout({
                            item,
                            method: 'card_payroll',
                            submitting: false,
                          })
                        }
                        className="inline-flex items-center justify-center gap-2 min-h-11 w-full sm:w-auto rounded-lg bg-brand-softer text-brand-strong hover:bg-brand-soft px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                        Marcar {item.pendingCardTipIds.length}{' '}
                        {item.pendingCardTipIds.length === 1
                          ? 'propina'
                          : 'propinas'}{' '}
                        como pagadas
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Modal de confirmación lote — selector de método + total a marcar. */}
      {payout && (
        <Modal
          open
          onClose={() => {
            if (payout.submitting) return
            setPayout(null)
            setPayoutError(null)
          }}
          title="Marcar propinas como pagadas"
          subtitle={`${payout.item.barberName} — ${payout.item.pendingCardTipIds.length} ${
            payout.item.pendingCardTipIds.length === 1 ? 'propina' : 'propinas'
          } pendiente${payout.item.pendingCardTipIds.length === 1 ? '' : 's'} (${formatEuros(payout.item.breakdown.tipsCardCents)})`}
          size="md"
          closeOnBackdrop={!payout.submitting}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayout(null)
                  setPayoutError(null)
                }}
                disabled={payout.submitting}
                className="min-h-11 px-3 py-2 rounded-lg text-sm text-ink-2 hover:text-ink hover:bg-overlay transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPayout}
                disabled={payout.submitting}
                className="inline-flex items-center justify-center gap-2 min-h-11 rounded-lg bg-brand text-canvas hover:bg-brand-strong px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {payout.submitting && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Confirmar pago de {formatEuros(payout.item.breakdown.tipsCardCents)}
              </button>
            </div>
          }
        >
          <div className="px-5 py-4">
            <p className="text-sm text-ink-2 mb-3">
              ¿Cómo le pagas las propinas a {payout.item.barberName}?
            </p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Método de pago</legend>
              <PayoutMethodOption
                value="card_payroll"
                current={payout.method}
                onChange={(v) => setPayout({ ...payout, method: v })}
                label="Incluir en la nómina del mes"
                hint="No hay que mover dinero — se le suma al neto que cobra."
                disabled={payout.submitting}
              />
              <PayoutMethodOption
                value="transfer"
                current={payout.method}
                onChange={(v) => setPayout({ ...payout, method: v })}
                label="Transferencia"
                hint="Le harás un Bizum o transferencia aparte."
                disabled={payout.submitting}
              />
              <PayoutMethodOption
                value="cash"
                current={payout.method}
                onChange={(v) => setPayout({ ...payout, method: v })}
                label="Cash en mano"
                hint="Le entregas el efectivo cuando lo veas."
                disabled={payout.submitting}
              />
            </fieldset>

            {payoutError && (
              <p
                role="alert"
                className="mt-3 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2"
              >
                {payoutError}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// Opción radio del modal de payout — diseñada táctil (≥44px) y con hint
// explicativo bajo el label para que el dueño entienda qué pasa después.
function PayoutMethodOption({
  value,
  current,
  onChange,
  label,
  hint,
  disabled,
}: {
  value: PayoutMethod
  current: PayoutMethod
  onChange: (v: PayoutMethod) => void
  label: string
  hint: string
  disabled?: boolean
}) {
  const selected = current === value
  return (
    <label
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors min-h-11 ${
        selected
          ? 'border-brand bg-brand-softer/40 ring-1 ring-brand/30'
          : 'border-line hover:bg-overlay/40'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <input
        type="radio"
        name="payout-method"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-3 mt-0.5">{hint}</span>
      </span>
    </label>
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
