'use client'

import { useState } from 'react'
import { Search, Loader2, Gift, Plus, Minus, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { LoyaltyProgress, LoyaltyReward } from '@/lib/loyalty/types'
import NumberInput from './NumberInput'

// -----------------------------------------------------------------------------
// LoyaltyCustomerLookup — panel del barbero en /dashboard/fidelidad para
// consultar el saldo de un cliente y canjear/ajustar.
//
// Flujo:
//   1. Barbero introduce teléfono del cliente → fetch /api/loyalty/customer
//   2. Si existe → muestra balance, progress y acciones (canjear / ajustar)
//   3. Si no existe → "aún no ha reservado aquí"
//
// Acciones:
//   · Canjear: POST /api/loyalty/redeem (stamps tienen 1 tier, points tienen N)
//   · Ajuste manual: POST /api/loyalty/adjust con delta +N / -N + nota
//
// Toda la pantalla se invalida (re-fetch) después de una acción para que el
// barbero vea el nuevo saldo inmediatamente.
// -----------------------------------------------------------------------------

interface CustomerLookup {
  found: true
  customer: { id: string; name: string | null; phone: string; totalBookings: number }
  mode: 'stamps' | 'points'
  balance: number
  progress: LoyaltyProgress
  recent: Array<{
    id: string
    delta: number
    reason: string
    note: string | null
    rewardSnapshot: unknown
    createdAt: string
  }>
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'loaded'; data: CustomerLookup }
  | { kind: 'error'; msg: string }

export default function LoyaltyCustomerLookup({ enabled }: { enabled: boolean }) {
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [busy, setBusy] = useState<string | null>(null)

  const lookup = async () => {
    const trimmed = phone.trim()
    if (!trimmed) return
    setState({ kind: 'loading' })
    try {
      const r = await fetch(`/api/loyalty/customer?phone=${encodeURIComponent(trimmed)}`, {
        cache: 'no-store',
      })
      const d = await r.json()
      if (!r.ok) {
        setState({ kind: 'error', msg: d?.error || 'Error desconocido' })
        return
      }
      if (!d.found) {
        setState({ kind: 'not_found' })
        return
      }
      setState({ kind: 'loaded', data: d })
    } catch {
      setState({ kind: 'error', msg: 'Error de red' })
    }
  }

  const refresh = async () => {
    if (state.kind !== 'loaded') return
    // Re-fetch with the same phone.
    try {
      const r = await fetch(
        `/api/loyalty/customer?phone=${encodeURIComponent(state.data.customer.phone)}`,
        { cache: 'no-store' },
      )
      const d = await r.json()
      if (r.ok && d.found) setState({ kind: 'loaded', data: d })
    } catch {
      /* silent */
    }
  }

  const redeem = async (tierIndex?: number) => {
    if (state.kind !== 'loaded') return
    setBusy('redeem')
    try {
      const r = await fetch('/api/loyalty/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: state.data.customer.id, tierIndex }),
      })
      const d = await r.json()
      if (!r.ok) {
        toast.error(d?.error || 'No se pudo canjear')
        return
      }
      toast.success('Canje aplicado')
      await refresh()
    } catch {
      toast.error('Error de red al canjear')
    } finally {
      setBusy(null)
    }
  }

  const adjust = async (delta: number, note: string | null) => {
    if (state.kind !== 'loaded') return
    setBusy('adjust')
    try {
      const r = await fetch('/api/loyalty/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: state.data.customer.id, delta, note }),
      })
      const d = await r.json()
      if (!r.ok) {
        toast.error(d?.error || 'No se pudo ajustar')
        return
      }
      toast.success('Ajuste aplicado')
      await refresh()
    } catch {
      toast.error('Error de red al ajustar')
    } finally {
      setBusy(null)
    }
  }

  if (!enabled) return null

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 mt-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Search className="h-4 w-4 text-brand" />
          Saldo de un cliente
        </h2>
        <p className="text-sm text-ink-2 mt-1">
          Busca por teléfono para ver el saldo, canjear recompensa o hacer un ajuste manual.
        </p>
      </div>

      <form
        className="flex gap-2 mb-5"
        onSubmit={(e) => {
          e.preventDefault()
          lookup()
        }}
      >
        <input
          type="tel"
          placeholder="+34 600 123 456"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="flex-1 bg-surface border border-line rounded-lg px-3 py-2 text-sm focus:border-brand outline-none font-mono"
        />
        <button
          type="submit"
          disabled={state.kind === 'loading' || !phone.trim()}
          className="btn-primary btn-sm"
        >
          {state.kind === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </button>
      </form>

      {state.kind === 'not_found' && (
        <p className="text-sm text-ink-2 rounded-lg border border-line bg-overlay p-3">
          Este número no ha reservado contigo aún. El saldo arranca con la primera visita.
        </p>
      )}

      {state.kind === 'error' && (
        <p className="text-sm text-danger">{state.msg}</p>
      )}

      {state.kind === 'loaded' && (
        <LoadedView
          data={state.data}
          busy={busy}
          onRedeem={redeem}
          onAdjust={adjust}
        />
      )}
    </div>
  )
}

function LoadedView({
  data,
  busy,
  onRedeem,
  onAdjust,
}: {
  data: CustomerLookup
  busy: string | null
  onRedeem: (tierIndex?: number) => void
  onAdjust: (delta: number, note: string | null) => void
}) {
  const { customer, balance, progress, mode, recent } = data
  const [adjustDelta, setAdjustDelta] = useState('1')
  const [adjustNote, setAdjustNote] = useState('')

  return (
    <div className="space-y-5">
      {/* Header cliente + balance */}
      <div className="flex items-center justify-between gap-4 rounded-xl bg-canvas border border-line p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink truncate">{customer.name || 'Sin nombre'}</p>
          <p className="text-xs text-ink-3 font-mono">{customer.phone}</p>
          <p className="text-xs text-ink-3 mt-0.5">{customer.totalBookings} reservas totales</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-ink tabular-nums leading-none" style={{ fontSize: 'var(--text-figure)' }}>{balance}</p>
          <p className="text-xs uppercase tracking-widest font-bold text-ink-3">
            {mode === 'stamps' ? 'sellos' : 'puntos'}
          </p>
        </div>
      </div>

      {/* Progress + canjear */}
      {progress.mode === 'stamps' && (
        <StampsCanje progress={progress} busy={busy === 'redeem'} onRedeem={() => onRedeem()} />
      )}
      {progress.mode === 'points' && (
        <PointsCanje progress={progress} busy={busy === 'redeem'} onRedeem={onRedeem} />
      )}

      {/* Ajuste manual */}
      <details className="rounded-xl border border-line bg-overlay">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink-2 hover:text-ink">
          Ajuste manual (regalo, corrección…)
        </summary>
        <div className="border-t border-line p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdjustDelta(String(-Math.abs(Number(adjustDelta) || 1)))}
              className="rounded-lg border border-line p-2 hover:bg-surface"
              aria-label="Restar"
            >
              <Minus className="h-4 w-4" />
            </button>
            {/* state sigue siendo string: los botones ± y el apply
                (Number.parseInt) operan sobre el string sin cambios.
                Sin min/max — el delta admite negativos (restar). */}
            <NumberInput
              value={adjustDelta === '' ? null : Number(adjustDelta)}
              onValueChange={(n) => setAdjustDelta(n === null ? '' : String(n))}
              decimals={0}
              aria-label="Ajuste de saldo (positivo regala, negativo resta)"
              className="w-24 bg-surface border border-line rounded-lg px-3 py-2 text-sm font-mono text-center"
            />
            <button
              type="button"
              onClick={() => setAdjustDelta(String(Math.abs(Number(adjustDelta) || 1)))}
              className="rounded-lg border border-line p-2 hover:bg-surface"
              aria-label="Sumar"
            >
              <Plus className="h-4 w-4" />
            </button>
            <span className="text-xs text-ink-3">
              (positivo = regalar, negativo = restar)
            </span>
          </div>
          <input
            type="text"
            placeholder="Motivo (opcional)"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy === 'adjust'}
            onClick={() => {
              const d = Number.parseInt(adjustDelta, 10)
              if (!Number.isInteger(d) || d === 0) return
              onAdjust(d, adjustNote.trim() || null)
              setAdjustNote('')
            }}
            className="btn-primary btn-sm"
          >
            {busy === 'adjust' && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar ajuste
          </button>
        </div>
      </details>

      {/* Histórico */}
      {recent.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest font-bold text-ink-3 mb-2">
            Últimos movimientos
          </p>
          <ul className="space-y-1 text-sm">
            {recent.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5"
              >
                <div className="min-w-0">
                  <span className="text-ink-2">{reasonLabel(row.reason)}</span>
                  {row.note && (
                    <span className="text-ink-3 text-xs ml-2 italic truncate">
                      · {row.note}
                    </span>
                  )}
                  <div className="text-xs text-ink-3">{formatDate(row.createdAt)}</div>
                </div>
                <span
                  className={`font-mono tabular-nums ${
                    row.delta > 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {row.delta > 0 ? '+' : ''}
                  {row.delta}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StampsCanje({
  progress,
  busy,
  onRedeem,
}: {
  progress: Extract<LoyaltyProgress, { mode: 'stamps' }>
  busy: boolean
  onRedeem: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-ink-2 mb-1">
        <span>
          {progress.earned} / {progress.needed} sellos
        </span>
        {progress.canRedeem && (
          <span className="uppercase tracking-widest font-bold text-brand">
            Listo para canjear
          </span>
        )}
      </div>
      <div className="h-2 rounded-full bg-overlay overflow-hidden">
        <div
          className="h-full bg-brand transition-all"
          style={{ width: `${Math.round(progress.progress * 100)}%` }}
        />
      </div>
      {progress.canRedeem && (
        <button
          type="button"
          onClick={onRedeem}
          disabled={busy}
          className="btn-primary btn-sm mt-3"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
          Canjear: <RewardLabel reward={progress.reward} />
        </button>
      )}
    </div>
  )
}

function PointsCanje({
  progress,
  busy,
  onRedeem,
}: {
  progress: Extract<LoyaltyProgress, { mode: 'points' }>
  busy: boolean
  onRedeem: (tierIndex: number) => void
}) {
  return (
    <div>
      <div className="text-xs text-ink-2 mb-1">
        {progress.nextTier
          ? `Siguiente recompensa: ${progress.nextTier.pointsCost} pts (te faltan ${progress.nextTier.pointsCost - progress.balance})`
          : 'Todas las recompensas están disponibles'}
      </div>
      <div className="h-2 rounded-full bg-overlay overflow-hidden">
        <div
          className="h-full bg-brand transition-all"
          style={{ width: `${Math.round(progress.progress * 100)}%` }}
        />
      </div>
      <div className="mt-3 space-y-2">
        {progress.tiers.map((t, i) => (
          <div
            key={i}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              t.canRedeem ? 'border-brand bg-brand-softer' : 'border-line bg-overlay'
            }`}
          >
            <span className="text-sm">
              <RewardLabel reward={t.reward} />{' '}
              <span className="text-ink-3">· {t.pointsCost} pts</span>
            </span>
            <button
              type="button"
              onClick={() => onRedeem(i)}
              disabled={!t.canRedeem || busy}
              className="btn-primary btn-sm disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Canjear
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function RewardLabel({ reward }: { reward: LoyaltyReward }) {
  if (reward.type === 'service') {
    return <>{reward.serviceName || 'un servicio'} gratis</>
  }
  if (reward.type === 'discount_amount') {
    return <>{((reward.cents ?? 0) / 100).toFixed(2)} € de descuento</>
  }
  if (reward.type === 'discount_pct') {
    if (reward.pct === 100) return <>servicio gratis</>
    return <>{reward.pct} % de descuento</>
  }
  return null
}

function reasonLabel(reason: string): string {
  if (reason === 'booking_completed') return 'Visita completada'
  if (reason === 'redeem') return 'Canje'
  if (reason === 'adjustment_manual') return 'Ajuste manual'
  if (reason === 'expired') return 'Caducidad'
  return reason
}

function formatDate(s: string): string {
  try {
    const d = new Date(s)
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return s
  }
}
