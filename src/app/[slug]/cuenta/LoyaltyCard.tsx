'use client'

import { useEffect, useState } from 'react'
import { Gift, Loader2 } from 'lucide-react'
import type { LoyaltyProgress, LoyaltyReward } from '@/lib/loyalty/types'
// Note: LoyaltyProgress comes from compute.ts; re-imported here via types
// (importable as values would break client bundle tree-shaking with Drizzle).

// -----------------------------------------------------------------------------
// LoyaltyCard — tarjeta que se muestra en /[slug]/cuenta (home view del
// cliente loggeado). Fetch a /api/app/loyalty?slug=... y dibuja:
//   · Barra de progreso hacia la siguiente recompensa
//   · Balance (sellos o puntos)
//   · Recompensas disponibles (si las hay) con "Muéstralo al barbero" como
//     acción pasiva — el barbero canjea físicamente.
//
// Si la barbería no tiene loyalty activo, no renderiza nada (null).
// Si el usuario es "newCustomer" (nunca reservó aquí), renderiza un CTA suave.
// -----------------------------------------------------------------------------

interface Props {
  slug: string
}

interface LoyaltyResponse {
  loggedIn: boolean
  enabled: boolean
  mode?: 'stamps' | 'points'
  balance?: number
  progress?: LoyaltyProgress
  newCustomer?: boolean
}

// Re-declaramos la shape de progress para el componente sin importar compute.ts
// (que importa Drizzle). Mantenemos consistencia con compute.ts.
type StampsProg = Extract<LoyaltyProgress, { mode: 'stamps' }>
type PointsProg = Extract<LoyaltyProgress, { mode: 'points' }>

export default function LoyaltyCard({ slug }: Props) {
  const [state, setState] = useState<LoyaltyResponse | 'loading' | 'hidden'>('loading')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/app/loyalty?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: LoyaltyResponse) => {
        if (cancelled) return
        if (!d?.enabled) setState('hidden')
        else setState(d)
      })
      .catch(() => {
        if (!cancelled) setState('hidden')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (state === 'hidden') return null

  if (state === 'loading') {
    return (
      <div
        className="rounded-2xl p-5 flex items-center gap-3"
        style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-line)' }}
      >
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--theme-ink-3)' }} />
        <span className="text-sm" style={{ color: 'var(--theme-ink-3)' }}>
          Cargando tu tarjeta…
        </span>
      </div>
    )
  }

  const { mode, balance = 0, progress, newCustomer } = state

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-line)',
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
        >
          <Gift className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-base font-bold" style={{ color: 'var(--theme-ink)' }}>
            Tu tarjeta
          </p>
          <p className="text-xs" style={{ color: 'var(--theme-ink-3)' }}>
            {newCustomer
              ? 'Empezarás a sumar en tu próxima visita'
              : mode === 'stamps'
                ? 'Visita tras visita, más cerca de tu recompensa'
                : 'Cada euro cuenta hacia tu recompensa'}
          </p>
        </div>
      </div>

      {mode === 'stamps' && progress?.mode === 'stamps' ? (
        <StampsView p={progress} />
      ) : mode === 'points' && progress?.mode === 'points' ? (
        <PointsView p={progress} balance={balance} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--theme-ink-2)' }}>
          Reserva tu primera cita para empezar tu tarjeta.
        </p>
      )}
    </div>
  )
}

function StampsView({ p }: { p: StampsProg }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-2xl font-display font-bold" style={{ color: 'var(--theme-ink)' }}>
          {p.earned}
          <span
            className="text-base font-medium ml-1"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            / {p.needed}
          </span>
        </span>
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{
            color: p.canRedeem ? 'var(--accent)' : 'var(--theme-ink-3)',
          }}
        >
          {p.canRedeem ? '¡Listo para canjear!' : `te faltan ${p.needed - p.earned}`}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--theme-overlay)' }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${Math.round(p.progress * 100)}%`,
            background: 'var(--accent)',
          }}
        />
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--theme-ink-2)' }}>
        Cuando completes la tarjeta: <RewardLabel reward={p.reward} />
      </p>
      {p.canRedeem && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold"
          style={{
            background: 'var(--accent-soft)',
            color: 'var(--accent-strong)',
          }}
        >
          Muéstrale esta pantalla al barbero en tu próxima visita para canjear.
        </div>
      )}
    </div>
  )
}

function PointsView({ p, balance }: { p: PointsProg; balance: number }) {
  const redeemable = p.tiers.filter((t) => t.canRedeem)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-2xl font-display font-bold" style={{ color: 'var(--theme-ink)' }}>
          {balance}
          <span
            className="text-base font-medium ml-1"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            puntos
          </span>
        </span>
        {p.nextTier && (
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            te faltan {p.nextTier.pointsCost - balance} pts
          </span>
        )}
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--theme-overlay)' }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${Math.round(p.progress * 100)}%`,
            background: 'var(--accent)',
          }}
        />
      </div>

      {redeemable.length > 0 && (
        <div className="mt-4 space-y-2">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--accent)' }}
          >
            Puedes canjear
          </p>
          {redeemable.map((t, i) => (
            <div
              key={i}
              className="rounded-lg px-3 py-2 flex items-center justify-between gap-3"
              style={{ background: 'var(--accent-soft)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--accent-strong)' }}>
                <RewardLabel reward={t.reward} />
              </span>
              <span className="text-xs font-mono" style={{ color: 'var(--accent-strong)' }}>
                {t.pointsCost} pts
              </span>
            </div>
          ))}
          <p className="text-xs mt-2" style={{ color: 'var(--theme-ink-2)' }}>
            Muéstrale esta pantalla al barbero en tu próxima visita para canjear.
          </p>
        </div>
      )}

      {redeemable.length === 0 && p.nextTier && (
        <p className="text-xs mt-3" style={{ color: 'var(--theme-ink-2)' }}>
          Siguiente recompensa: <RewardLabel reward={p.nextTier.reward} /> por {p.nextTier.pointsCost} pts
        </p>
      )}
    </div>
  )
}

function RewardLabel({ reward }: { reward: LoyaltyReward }) {
  if (reward.type === 'service') {
    return <span>{reward.serviceName || 'un servicio'} gratis</span>
  }
  if (reward.type === 'discount_amount') {
    return <span>{((reward.cents ?? 0) / 100).toFixed(2)} € de descuento</span>
  }
  if (reward.type === 'discount_pct') {
    if (reward.pct === 100) return <span>servicio gratis</span>
    return <span>{reward.pct} % de descuento</span>
  }
  return null
}
