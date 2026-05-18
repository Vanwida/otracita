'use client'

import { useState } from 'react'
import {
  Phone,
  Mail,
  Calendar,
  Wallet,
  Heart,
  Star,
  Award,
  Scissors,
  User,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Compass,
} from 'lucide-react'
import CustomerNotesEditor from './CustomerNotesEditor'
import CustomerEmailEditor from './CustomerEmailEditor'
import SourceChip from '@/app/dashboard/_components/SourceChip'
import type { ClientProfileData } from '@/lib/clients/profile'

// -----------------------------------------------------------------------------
// <ClientProfile> — ÚNICO componente de ficha de cliente (fix #1, pedido 3+
// veces). Presentación pura sobre ClientProfileData (cero queries aquí).
//
// Se renderiza en:
//   · variant="page"  → la ruta /dashboard/clientes/[id] (cabecera + tabs).
//   · variant="panel" → overlay desde la agenda (clic en el nombre del
//                        cliente en el detalle de la reserva) y cualquier
//                        otro sitio donde se clique un cliente.
//
// Mismo contenido (info · histórico · lo comprado · citas · notas ·
// atribución · reputación) en los dos modos: NO se duplica UI de cliente
// en ningún sitio. La diferencia entre variantes es solo el chrome
// (ancho, padding, si la cabecera incluye volver a la lista).
// -----------------------------------------------------------------------------

type DetailTab = 'info' | 'citas' | 'notas'
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'citas', label: 'Citas' },
  { key: 'notas', label: 'Notas' },
]

interface Props {
  data: ClientProfileData
  /** 'page' = ficha a pantalla completa · 'panel' = overlay compacto. */
  variant?: 'page' | 'panel'
}

export default function ClientProfile({ data, variant = 'page' }: Props) {
  const [tab, setTab] = useState<DetailTab>('info')
  const { customer, stats } = data

  const loyaltyUnit = data.loyaltyMode === 'points' ? 'puntos' : 'sellos'

  return (
    <div className="w-full">
      {/* Header — datos básicos + reputación */}
      <div className="bg-surface border border-line rounded-2xl p-5 mb-6 flex items-start gap-4 flex-wrap">
        <div className="h-14 w-14 rounded-2xl bg-brand-softer text-brand-strong flex items-center justify-center text-xl font-bold shrink-0">
          {(customer.name?.[0] ?? customer.phone[0]).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2
            className="font-semibold text-ink leading-tight"
            style={{ fontSize: 'var(--text-page-title)' }}
          >
            {customer.name || 'Sin nombre'}
          </h2>
          <p className="text-sm text-ink-2 flex items-center gap-1.5 mt-1">
            <Phone className="h-3.5 w-3.5 text-ink-3" />
            {customer.phone}
          </p>
          {customer.email && (
            <p className="text-sm text-ink-2 flex items-center gap-1.5 mt-1">
              <Mail className="h-3.5 w-3.5 text-ink-3" />
              <a
                href={`mailto:${customer.email}`}
                className="hover:text-brand transition-colors break-all"
              >
                {customer.email}
              </a>
            </p>
          )}
          <p className="text-xs text-ink-3 mt-1">
            Cliente desde {formatDate(customer.createdAt)}
          </p>
        </div>
        <ReputationBadge reputation={customer.reputation} />
      </div>

      {/* Pestañas internas de la ficha (Booksy 09.53.25). En panel/overlay
          el botón atrás del navegador no aplica → estado local en vez de
          <Link> con URL; mismo set de tabs en ambos modos. */}
      <div
        role="tablist"
        aria-label="Secciones de la ficha"
        className="flex items-stretch gap-1 border-b border-line mb-6 overflow-x-auto"
      >
        {DETAIL_TABS.map((dt) => {
          const active = dt.key === tab
          return (
            <button
              key={dt.key}
              type="button"
              onClick={() => setTab(dt.key)}
              role="tab"
              aria-selected={active}
              className={`relative whitespace-nowrap px-3 pb-2.5 pt-1 text-[0.8125rem] font-medium transition-colors ${
                active ? 'font-semibold text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {dt.label}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors ${
                  active ? 'bg-brand' : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* ── Pestaña INFO ──────────────────────────────────────────────── */}
      {tab === 'info' && (
        <>
          <div
            className={`grid gap-3 mb-6 ${
              variant === 'panel'
                ? 'grid-cols-2'
                : 'grid-cols-2 md:grid-cols-4'
            }`}
          >
            <Stat
              icon={Wallet}
              label="Gastado"
              value={stats.spentEur > 0 ? `${stats.spentEur.toFixed(0)} €` : '—'}
              hint={
                stats.completedCount > 0
                  ? `${stats.completedCount} servicios`
                  : undefined
              }
            />
            <Stat
              icon={Calendar}
              label="Ticket medio"
              value={
                stats.completedCount > 0
                  ? `${stats.avgTicketEur.toFixed(2)} €`
                  : '—'
              }
            />
            <Stat
              icon={Heart}
              label="Propinas"
              value={stats.tipsEur > 0 ? `${stats.tipsEur.toFixed(2)} €` : '—'}
            />
            <Stat
              icon={Star}
              label="Nota media"
              value={
                stats.avgRating !== null
                  ? `${stats.avgRating.toFixed(1)} / 5`
                  : '—'
              }
              hint={
                stats.ratingCount > 0
                  ? `${stats.ratingCount} ${
                      stats.ratingCount === 1 ? 'reseña' : 'reseñas'
                    }`
                  : undefined
              }
            />
          </div>

          <div
            className={`grid gap-3 mb-6 ${
              variant === 'panel' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'
            }`}
          >
            <Insight
              icon={Scissors}
              label="Servicio favorito"
              value={data.topService ?? '—'}
            />
            <Insight
              icon={User}
              label="Barbero favorito"
              value={data.topBarber ?? '—'}
            />
            {data.loyaltyMode ? (
              <Insight
                icon={Award}
                label={`Saldo en ${loyaltyUnit}`}
                value={String(Math.max(0, stats.loyaltyBalance))}
              />
            ) : (
              <Insight
                icon={AlertTriangle}
                label="No-shows"
                value={String(customer.noShows)}
                tone={customer.noShows > 0 ? 'danger' : 'default'}
              />
            )}
          </div>

          {customer.firstSource && (
            <AttributionSection
              firstSource={customer.firstSource}
              firstCampaign={customer.firstSourceCampaign}
              firstCapturedAt={customer.firstSourceCapturedAt}
              recentBookings={data.recentAttribution}
            />
          )}

          <div className="mb-6">
            <CustomerEmailEditor
              customerId={customer.id}
              initialEmail={customer.email ?? ''}
            />
          </div>
        </>
      )}

      {/* ── Pestaña NOTAS ─────────────────────────────────────────────── */}
      {tab === 'notas' && (
        <>
          <div className="mb-6">
            <CustomerNotesEditor
              customerId={customer.id}
              initialNotes={customer.barberNotes ?? ''}
            />
          </div>

          {data.ratings.length > 0 ? (
            <section className="mb-6">
              <h3
                className="font-semibold text-ink mb-3"
                style={{ fontSize: 'var(--text-section-title)' }}
              >
                Reseñas dejadas
              </h3>
              <ul className="space-y-2">
                {data.ratings.map((r) => (
                  <li
                    key={r.id}
                    className="bg-surface border border-line rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Stars value={r.rating} />
                      <p className="text-xs text-ink-3">
                        {formatDate(r.createdAt)}
                        {r.barberName && <span> · {r.barberName}</span>}
                      </p>
                    </div>
                    {r.comment && (
                      <p
                        className="mt-2 text-sm text-ink-2 leading-relaxed"
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {r.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-ink-3">
              Este cliente todavía no ha dejado ninguna reseña.
            </p>
          )}
        </>
      )}

      {/* ── Pestaña CITAS ─────────────────────────────────────────────── */}
      {tab === 'citas' && (
        <section className="mb-6">
          <h3
            className="font-semibold text-ink mb-3"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            Historial de reservas
          </h3>
          {data.bookings.length === 0 ? (
            <div className="bg-surface border border-line rounded-xl p-6 text-center text-sm text-ink-3">
              Aún no tiene reservas registradas.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.bookings.map((b) => (
                <li
                  key={b.id}
                  className="bg-surface border border-line rounded-xl p-4 flex items-start gap-3"
                >
                  <BookingStatusIcon status={b.status} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink text-sm">
                      {b.service}
                      {b.barber && (
                        <span className="text-ink-3 font-normal"> · {b.barber}</span>
                      )}
                    </p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {formatBookingDate(b.date, b.time)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {b.price !== null && b.price !== undefined && b.price > 0 && (
                      <p className="font-medium text-ink text-sm tabular-nums">
                        {b.price} €
                      </p>
                    )}
                    <BookingStatusLabel status={b.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes + helpers (idénticos a los que vivían inline en la ruta).
// ─────────────────────────────────────────────────────────────────────────────

interface AttributionSectionProps {
  firstSource: string
  firstCampaign: string | null
  firstCapturedAt: string | null
  recentBookings: ClientProfileData['recentAttribution']
}

function AttributionSection({
  firstSource,
  firstCampaign,
  firstCapturedAt,
  recentBookings,
}: AttributionSectionProps) {
  const hasLastTouchData = recentBookings.some((b) => b.referrerSource !== null)

  return (
    <section className="mb-6">
      <div className="bg-surface border border-line rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Compass className="h-4 w-4 text-ink-3" />
          <h3
            className="font-semibold text-ink"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            Atribución
          </h3>
        </div>

        <div className="mb-4 pb-4 border-b border-line">
          <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-2">
            Cómo llegó la primera vez
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SourceChip source={firstSource} />
            {firstCampaign && (
              <span className="text-xs text-ink-2">
                Campaña:{' '}
                <span className="font-medium text-ink">{firstCampaign}</span>
              </span>
            )}
            {firstCapturedAt && (
              <span className="text-xs text-ink-3">
                · {formatDate(firstCapturedAt)}
              </span>
            )}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-2">
            Origen de cada reserva (últimas {recentBookings.length})
          </p>
          {!hasLastTouchData ? (
            <p className="text-xs text-ink-3">
              No se capturó origen en reservas recientes. Cualquier reserva
              nueva desde tu link público con UTM lo guardará automáticamente.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentBookings.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-xs">
                  <span className="text-ink-3 w-20 shrink-0 tabular-nums">
                    {formatBookingDateShort(b.date)}
                  </span>
                  {b.referrerSource ? (
                    <>
                      <SourceChip source={b.referrerSource} size="xs" />
                      {b.referrerCampaign && (
                        <span className="text-ink-3 truncate">
                          · {b.referrerCampaign}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-3">Sin origen</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function formatBookingDateShort(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return date
  return `${m[3]}/${m[2]}`
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-ink-3" />
        <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold truncate">
          {label}
        </p>
      </div>
      <p className="text-lg md:text-xl font-bold text-ink tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-ink-3 mt-1">{hint}</p>}
    </div>
  )
}

function Insight({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Scissors
  label: string
  value: string
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 md:p-4 flex items-center gap-3">
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          tone === 'danger'
            ? 'bg-danger/10 text-danger'
            : 'bg-overlay text-ink-2'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold">
          {label}
        </p>
        <p className="text-sm font-semibold text-ink truncate">{value}</p>
      </div>
    </div>
  )
}

function ReputationBadge({
  reputation,
}: {
  reputation: 'good' | 'warning' | 'blocked'
}) {
  const styles =
    reputation === 'blocked'
      ? 'bg-danger/10 text-danger border-danger/20'
      : reputation === 'warning'
        ? 'bg-warning/10 text-warning border-warning/20'
        : 'bg-success/10 text-success border-success/20'
  const label =
    reputation === 'blocked'
      ? 'Bloqueado'
      : reputation === 'warning'
        ? 'Aviso'
        : 'Buena reputación'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}
    >
      {label}
    </span>
  )
}

function BookingStatusIcon({ status }: { status: string }) {
  if (status === 'completed')
    return <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
  if (status === 'cancelled')
    return <XCircle className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
  if (status === 'no_show')
    return <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
  return <Calendar className="h-4 w-4 text-brand mt-0.5 shrink-0" />
}

function BookingStatusLabel({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: 'Hecha', className: 'text-success' },
    confirmed: { label: 'Confirmada', className: 'text-ink-2' },
    cancelled: { label: 'Cancelada', className: 'text-ink-3' },
    no_show: { label: 'No-show', className: 'text-danger' },
  }
  const m = map[status] ?? { label: status, className: 'text-ink-3' }
  return (
    <p
      className={`text-[10px] uppercase tracking-widest font-semibold mt-0.5 ${m.className}`}
    >
      {m.label}
    </p>
  )
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        return (
          <Star
            key={n}
            className="h-3.5 w-3.5"
            style={{
              color: filled ? 'var(--color-warning)' : 'var(--color-line)',
              fill: filled ? 'var(--color-warning)' : 'transparent',
            }}
            strokeWidth={1.5}
          />
        )
      })}
    </div>
  )
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dt)
}

function formatBookingDate(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(dt)
  return `${formatted} · ${time}`
}
