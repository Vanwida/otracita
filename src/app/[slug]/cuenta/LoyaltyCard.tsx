'use client'

import { useEffect, useState } from 'react'
import { Gift, Loader2, Check, History, Sparkles, ArrowDownRight } from 'lucide-react'
import type { LoyaltyProgress, LoyaltyReward } from '@/lib/loyalty/types'
// Note: LoyaltyProgress comes from compute.ts; re-imported here via types
// (importable as values would break client bundle tree-shaking with Drizzle).

// -----------------------------------------------------------------------------
// LoyaltyCard — "tarjeta de fidelidad" del cliente PWA. Vive embebida en
// /[slug]/cuenta (pestaña Perfil) y replica visualmente un carnet:
//
//   · Cabecera tipo tarjeta (marca + título)
//   · Indicador principal:
//       - modo stamps → grid de sellos (círculos rellenos / vacíos)
//       - modo points → balance grande + barra hasta el siguiente premio
//   · Resumen "te faltan X" + recompensa que viene
//   · Sección "Movimientos recientes" — últimas 10 entradas del ledger
//     (humanizadas: "Hace 3 días — +1 sello" / "Canjeado — corte gratis")
//
// El canje se hace en tienda. Aquí solo se visualiza el estado y se le pide
// al cliente que muestre la pantalla al barbero cuando esté listo.
//
// Sin loyalty activo en la barbería → null. Cliente nuevo (sin customer row)
// → tarjeta vacía con CTA "Reserva tu primera cita".
// -----------------------------------------------------------------------------

interface Props {
  slug: string
}

interface LedgerEntry {
  id: string
  delta: number
  reason: string
  rewardSnapshot: LoyaltyReward | null
  createdAt: string
}

interface LoyaltyResponse {
  loggedIn: boolean
  enabled: boolean
  mode?: 'stamps' | 'points'
  balance?: number
  progress?: LoyaltyProgress
  recent?: LedgerEntry[]
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

  const { mode, balance = 0, progress, recent = [], newCustomer } = state

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-line)',
      }}
    >
      {/* ── Cabecera tipo carnet ─────────────────────────────────────── */}
      <div
        className="px-5 pt-5 pb-4 relative"
        style={{
          background: 'linear-gradient(135deg, var(--accent-soft) 0%, transparent 100%)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Gift className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.15em]"
              style={{ color: 'var(--accent-strong)' }}
            >
              Tarjeta de fidelidad
            </p>
            <p
              className="font-display text-base font-bold"
              style={{ color: 'var(--theme-ink)' }}
            >
              {newCustomer
                ? 'Empieza en tu próxima visita'
                : mode === 'stamps'
                  ? 'Visita tras visita'
                  : 'Cada euro suma'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Indicador principal ──────────────────────────────────────── */}
      <div className="px-5 py-5">
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

      {/* ── Historial reciente ───────────────────────────────────────── */}
      {recent.length > 0 && (
        <div
          className="px-5 py-4"
          style={{ borderTop: '1px solid var(--theme-line)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <History className="h-3.5 w-3.5" style={{ color: 'var(--theme-ink-3)' }} />
            <p
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--theme-ink-3)' }}
            >
              Movimientos recientes
            </p>
          </div>
          <ul className="space-y-2.5">
            {recent.map((e) => (
              <LedgerRow key={e.id} entry={e} mode={mode} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Vista de sellos ────────────────────────────────────────────────────────
function StampsView({ p }: { p: StampsProg }) {
  // Mostramos exactamente `needed` sellos. Rellenamos los primeros `earned`.
  // Si needed es muy alto (>20) hacemos un fallback a barra para no romper
  // el layout en móvil — pero en la práctica el cap del config es 50.
  const useStampGrid = p.needed <= 20

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-3xl font-display font-bold tabular-nums"
            style={{ color: 'var(--theme-ink)' }}
          >
            {p.earned}
          </span>
          <span
            className="text-base font-medium tabular-nums"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            / {p.needed}
          </span>
        </div>
        {p.canRedeem ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest rounded-full px-2.5 py-1"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Sparkles className="h-3 w-3" />
            ¡Listo!
          </span>
        ) : (
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            te faltan {p.needed - p.earned}
          </span>
        )}
      </div>

      {useStampGrid ? (
        <StampGrid earned={p.earned} needed={p.needed} />
      ) : (
        <ProgressBar progress={p.progress} />
      )}

      <p className="text-xs mt-4" style={{ color: 'var(--theme-ink-2)' }}>
        {p.canRedeem ? (
          <>Tu próxima visita: <RewardLabel reward={p.reward} /></>
        ) : (
          <>Al completar: <RewardLabel reward={p.reward} /></>
        )}
      </p>

      {p.canRedeem && (
        <div
          className="mt-3 rounded-lg px-3 py-2.5 text-xs font-semibold flex items-start gap-2"
          style={{
            background: 'var(--accent-soft)',
            color: 'var(--accent-strong)',
          }}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>Muéstrale esta pantalla al barbero en tu próxima visita.</span>
        </div>
      )}
    </div>
  )
}

// Grid de sellos físicos — el efecto "carnet con huecos" que pide la feature.
// Layout: grid CSS responsive, máximo 5 por fila para que en cualquier móvil
// se vea claro.
function StampGrid({ earned, needed }: { earned: number; needed: number }) {
  const stamps = Array.from({ length: needed }, (_, i) => i < earned)
  const cols = Math.min(needed, 5)
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {stamps.map((filled, i) => (
        <div
          key={i}
          className="aspect-square rounded-full flex items-center justify-center transition-colors"
          style={
            filled
              ? {
                  background: 'var(--accent)',
                  color: 'var(--accent-ink)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                }
              : {
                  background: 'var(--theme-overlay)',
                  border: '1px dashed var(--theme-line)',
                  color: 'var(--theme-ink-3)',
                }
          }
        >
          {filled ? (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          ) : (
            <span className="text-[10px] font-mono opacity-60">{i + 1}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div
      className="h-2 rounded-full overflow-hidden"
      style={{ background: 'var(--theme-overlay)' }}
    >
      <div
        className="h-full transition-all"
        style={{
          width: `${Math.round(progress * 100)}%`,
          background: 'var(--accent)',
        }}
      />
    </div>
  )
}

// ─── Vista de puntos ────────────────────────────────────────────────────────
function PointsView({ p, balance }: { p: PointsProg; balance: number }) {
  const redeemable = p.tiers.filter((t) => t.canRedeem)
  const locked = p.tiers.filter((t) => !t.canRedeem)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-3xl font-display font-bold tabular-nums"
            style={{ color: 'var(--theme-ink)' }}
          >
            {balance}
          </span>
          <span
            className="text-base font-medium"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            pts
          </span>
        </div>
        {p.nextTier && (
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            te faltan {p.nextTier.pointsCost - balance} pts
          </span>
        )}
      </div>

      <ProgressBar progress={p.progress} />

      {redeemable.length > 0 && (
        <div className="mt-4 space-y-2">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--accent-strong)' }}
          >
            Puedes canjear
          </p>
          {redeemable.map((t, i) => (
            <div
              key={i}
              className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
              style={{ background: 'var(--accent-soft)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--accent-strong)' }}>
                <RewardLabel reward={t.reward} />
              </span>
              <span
                className="text-xs font-mono tabular-nums"
                style={{ color: 'var(--accent-strong)' }}
              >
                {t.pointsCost} pts
              </span>
            </div>
          ))}
          <p
            className="text-xs mt-1 flex items-start gap-1.5"
            style={{ color: 'var(--theme-ink-2)' }}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
            <span>Muéstrale esta pantalla al barbero en tu próxima visita.</span>
          </p>
        </div>
      )}

      {locked.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            Próximas recompensas
          </p>
          {locked.map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 text-xs"
              style={{ color: 'var(--theme-ink-2)' }}
            >
              <span>
                <RewardLabel reward={t.reward} />
              </span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--theme-ink-3)' }}>
                {t.pointsCost} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Historial ──────────────────────────────────────────────────────────────
function LedgerRow({
  entry,
  mode,
}: {
  entry: LedgerEntry
  mode: 'stamps' | 'points' | undefined
}) {
  const unit = mode === 'points' ? 'pts' : entry.delta === 1 || entry.delta === -1 ? 'sello' : 'sellos'
  const isEarn = entry.delta > 0
  const label = describeReason(entry.reason, entry.rewardSnapshot, mode)
  return (
    <li className="flex items-center gap-3">
      <div
        className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
        style={
          isEarn
            ? { background: 'var(--accent-soft)', color: 'var(--accent-strong)' }
            : { background: 'var(--theme-overlay)', color: 'var(--theme-ink-3)' }
        }
      >
        {isEarn ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold truncate"
          style={{ color: 'var(--theme-ink)' }}
        >
          {label}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--theme-ink-3)' }}>
          {formatRelative(entry.createdAt)}
        </p>
      </div>
      <span
        className="text-sm font-mono tabular-nums font-semibold shrink-0"
        style={{ color: isEarn ? 'var(--accent-strong)' : 'var(--theme-ink-2)' }}
      >
        {isEarn ? '+' : ''}
        {Math.abs(entry.delta)} {unit}
      </span>
    </li>
  )
}

function describeReason(
  reason: string,
  snapshot: LoyaltyReward | null,
  mode: 'stamps' | 'points' | undefined,
): string {
  switch (reason) {
    case 'booking_completed':
      return mode === 'points' ? 'Visita completada' : 'Visita — sello ganado'
    case 'redeem':
      if (snapshot) {
        if (snapshot.type === 'service' && snapshot.serviceName) {
          return `Canjeado: ${snapshot.serviceName} gratis`
        }
        if (snapshot.type === 'discount_amount' && snapshot.cents != null) {
          return `Canjeado: ${(snapshot.cents / 100).toFixed(2)} € descuento`
        }
        if (snapshot.type === 'discount_pct' && snapshot.pct != null) {
          return snapshot.pct === 100
            ? 'Canjeado: servicio gratis'
            : `Canjeado: ${snapshot.pct} % descuento`
        }
      }
      return 'Canjeado'
    case 'adjustment_manual':
      return 'Ajuste del barbero'
    case 'expired':
      return 'Caducado'
    default:
      return 'Movimiento'
  }
}

// Formato relativo en español. Para distancias > 30 días, mostramos fecha
// corta (ej "12 mar"). Evitamos importar date-fns para mantener el bundle
// PWA ligero — esto es 25 líneas de lógica.
function formatRelative(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - then.getTime()) / 1000))
  if (diffSec < 60) return 'Justo ahora'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `Hace ${diffHr} h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'Ayer'
  if (diffDay < 7) return `Hace ${diffDay} días`
  if (diffDay < 30) {
    const wks = Math.floor(diffDay / 7)
    return wks === 1 ? 'Hace 1 sem' : `Hace ${wks} sem`
  }
  // Fecha corta en es-ES (ej. "12 mar"). Intl normaliza independientemente
  // del locale del navegador.
  return then.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// ─── Reward label compartido ────────────────────────────────────────────────
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
