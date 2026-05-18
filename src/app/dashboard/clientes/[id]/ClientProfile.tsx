'use client'

import { useMemo, useState } from 'react'
import {
  Phone,
  Mail,
  Star,
  Award,
  Scissors,
  User,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Compass,
  RotateCw,
} from 'lucide-react'
import CustomerNotesEditor from './CustomerNotesEditor'
import CustomerEmailEditor from './CustomerEmailEditor'
import SourceChip from '@/app/dashboard/_components/SourceChip'
import type {
  ClientProfileData,
  ClientProfileBooking,
} from '@/lib/clients/profile'

// -----------------------------------------------------------------------------
// <ClientProfile> — ÚNICO componente de ficha de cliente (fix #1, pedido 3+
// veces). Presentación pura sobre ClientProfileData (cero queries aquí).
//
// IA CALCADA DE BOOKSY (goal rector — el barbero que viene de Booksy lo
// reconoce sin pensar; solo cambian los colores). Screenshots
// 10.04.36 / .41 / .46:
//   · Cabecera: avatar (iniciales) + nombre + teléfono.
//   · Tira de 4 KPIs horizontales.
//   · Tabs: CITAS · FIDELIDAD · INFORMACIÓN DEL CLIENTE  (mayúsculas).
//   · CITAS → sub-tabs "Próximas (N)" / "Pasadas (N)", lista con bloque
//     de fecha a la izquierda + servicio + precio + acción "Repetir".
//   · INFORMACIÓN DEL CLIENTE → contacto + origen + notas privadas.
//   · FIDELIDAD → saldo de sellos/puntos.
//
// Se renderiza en variant="page" (ruta) y variant="panel" (overlay desde
// la agenda). Misma IA en ambos: cero UI de cliente duplicada.
// -----------------------------------------------------------------------------

type DetailTab = 'citas' | 'fidelidad' | 'info'
// Etiquetas EXACTAS de Booksy (mayúsculas, "INFORMACIÓN DEL CLIENTE").
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'citas', label: 'CITAS' },
  { key: 'fidelidad', label: 'FIDELIDAD' },
  { key: 'info', label: 'INFORMACIÓN DEL CLIENTE' },
]

interface Props {
  data: ClientProfileData
  /** 'page' = ficha a pantalla completa · 'panel' = overlay compacto. */
  variant?: 'page' | 'panel'
}

export default function ClientProfile({ data, variant = 'page' }: Props) {
  // Booksy abre la ficha en CITAS (es lo que el barbero mira al instante).
  const [tab, setTab] = useState<DetailTab>('citas')
  const [citasView, setCitasView] = useState<'proximas' | 'pasadas'>('proximas')
  const { customer, stats } = data

  const loyaltyUnit = data.loyaltyMode === 'points' ? 'puntos' : 'sellos'

  // Próximas vs Pasadas (Booksy parte el historial en dos sub-pestañas).
  // "Próxima" = confirmada y aún no pasada; el resto va a Pasadas.
  const todayIso = new Date().toISOString().slice(0, 10)
  const bookings = data.bookings
  const { proximas, pasadas } = useMemo(() => {
    const up: ClientProfileBooking[] = []
    const past: ClientProfileBooking[] = []
    for (const b of bookings) {
      if (b.status === 'confirmed' && b.date >= todayIso) up.push(b)
      else past.push(b)
    }
    // Próximas en orden ascendente (la más cercana primero, como Booksy).
    up.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    return { proximas: up, pasadas: past }
  }, [bookings, todayIso])

  const visibleBookings = citasView === 'proximas' ? proximas : pasadas

  return (
    <div className="w-full">
      {/* Cabecera — avatar + nombre + teléfono (Booksy: centrado en el
          panel, alineado a la izquierda en página). */}
      <div
        className={`bg-surface border border-line rounded-2xl p-5 mb-4 flex gap-4 ${
          variant === 'panel'
            ? 'flex-col items-center text-center'
            : 'items-start flex-wrap'
        }`}
      >
        <div className="h-16 w-16 rounded-full bg-brand-softer text-brand-strong flex items-center justify-center text-2xl font-bold shrink-0">
          {(customer.name?.[0] ?? customer.phone[0]).toUpperCase()}
        </div>
        <div className={`min-w-0 ${variant === 'panel' ? '' : 'flex-1'}`}>
          <h2
            className="font-semibold text-ink leading-tight"
            style={{ fontSize: 'var(--text-page-title)' }}
          >
            {customer.name || 'Sin nombre'}
          </h2>
          <p
            className={`text-sm text-ink-2 flex items-center gap-1.5 mt-1 ${
              variant === 'panel' ? 'justify-center' : ''
            }`}
          >
            <Phone className="h-3.5 w-3.5 text-ink-3" />
            {customer.phone}
          </p>
          <div
            className={`mt-2 flex ${variant === 'panel' ? 'justify-center' : ''}`}
          >
            <ReputationBadge reputation={customer.reputation} />
          </div>
        </div>
      </div>

      {/* Tira de 4 KPIs horizontales (Booksy 10.04.36: fila de números
          grandes con label corto debajo). Datos reales de otracita. */}
      <div className="grid grid-cols-4 gap-px bg-line rounded-xl overflow-hidden border border-line mb-4">
        <Kpi value={`${stats.spentEur.toFixed(0)}€`} label="Gastado" />
        <Kpi value={String(stats.completedCount)} label="Citas" />
        <Kpi
          value={String(customer.noShows)}
          label="No-shows"
          tone={customer.noShows > 0 ? 'danger' : 'default'}
        />
        <Kpi
          value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—'}
          label="Nota"
        />
      </div>

      {/* Tabs CITAS · FIDELIDAD · INFORMACIÓN DEL CLIENTE (Booksy exacto). */}
      <div
        role="tablist"
        aria-label="Secciones de la ficha"
        className="flex items-stretch gap-4 border-b border-line mb-5 overflow-x-auto"
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
              className={`relative whitespace-nowrap pb-2.5 pt-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] transition-colors ${
                active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {dt.label}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-colors ${
                  active ? 'bg-brand' : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* ── CITAS ─────────────────────────────────────────────────────── */}
      {tab === 'citas' && (
        <section className="mb-6">
          {/* Sub-tabs Próximas / Pasadas con contador, igual que Booksy. */}
          <div className="flex items-center gap-4 mb-4">
            {(
              [
                ['proximas', 'Próximas', proximas.length],
                ['pasadas', 'Pasadas', pasadas.length],
              ] as const
            ).map(([key, label, count]) => {
              const active = citasView === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCitasView(key)}
                  className={`text-sm font-medium transition-colors ${
                    active
                      ? 'text-ink'
                      : 'text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {label}{' '}
                  <span
                    className={`tabular-nums ${
                      active ? 'text-brand-strong' : 'text-ink-3'
                    }`}
                  >
                    ({count})
                  </span>
                </button>
              )
            })}
          </div>

          {visibleBookings.length === 0 ? (
            <div className="bg-surface border border-line rounded-xl p-6 text-center text-sm text-ink-3">
              {citasView === 'proximas'
                ? 'No tiene próximas reservas.'
                : 'Aún no tiene reservas pasadas.'}
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleBookings.map((b) => (
                <li
                  key={b.id}
                  className="bg-surface border border-line rounded-xl p-3 flex items-center gap-3"
                >
                  {/* Bloque de fecha a la izquierda (Booksy: día + mes). */}
                  <DateBlock date={b.date} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink text-sm truncate">
                      {b.service}
                    </p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {b.time}
                      {b.barber && <span> · {b.barber}</span>}
                    </p>
                    <BookingStatusLabel status={b.status} />
                  </div>
                  <div className="text-right shrink-0">
                    {b.price !== null && b.price !== undefined && b.price > 0 && (
                      <p className="font-semibold text-ink text-sm tabular-nums">
                        {b.price} €
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── FIDELIDAD ─────────────────────────────────────────────────── */}
      {tab === 'fidelidad' && (
        <section className="mb-6">
          {data.loyaltyMode ? (
            <div className="bg-surface border border-line rounded-xl p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gold-soft text-ink flex items-center justify-center shrink-0">
                <Award className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold">
                  Saldo en {loyaltyUnit}
                </p>
                <p className="text-2xl font-bold text-ink tabular-nums leading-tight">
                  {Math.max(0, stats.loyaltyBalance)}
                </p>
                <p className="text-xs text-ink-3 mt-0.5">
                  {stats.completedCount}{' '}
                  {stats.completedCount === 1 ? 'servicio' : 'servicios'} ·{' '}
                  {stats.tipsEur > 0
                    ? `${stats.tipsEur.toFixed(2)} € en propinas`
                    : 'sin propinas'}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-line rounded-xl p-6 text-center text-sm text-ink-3">
              La fidelidad no está activada para esta barbería.
            </div>
          )}
        </section>
      )}

      {/* ── INFORMACIÓN DEL CLIENTE ───────────────────────────────────── */}
      {tab === 'info' && (
        <>
          {/* Contacto */}
          <div className="bg-surface border border-line rounded-xl p-5 mb-4 space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-2">
              Contacto
            </p>
            <p className="text-sm text-ink-2 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-ink-3" />
              {customer.phone}
            </p>
            {customer.email && (
              <p className="text-sm text-ink-2 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-ink-3" />
                <a
                  href={`mailto:${customer.email}`}
                  className="hover:text-brand transition-colors break-all"
                >
                  {customer.email}
                </a>
              </p>
            )}
            <p className="text-xs text-ink-3">
              Cliente desde {formatDate(customer.createdAt)}
            </p>
          </div>

          {/* Servicio / barbero favorito */}
          <div
            className={`grid gap-3 mb-4 ${
              variant === 'panel' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
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
          </div>

          {customer.firstSource && (
            <AttributionSection
              firstSource={customer.firstSource}
              firstCampaign={customer.firstSourceCampaign}
              firstCapturedAt={customer.firstSourceCapturedAt}
              recentBookings={data.recentAttribution}
            />
          )}

          {/* Email editable */}
          <div className="mb-4">
            <CustomerEmailEditor
              customerId={customer.id}
              initialEmail={customer.email ?? ''}
            />
          </div>

          {/* Notas privadas del barbero */}
          <div className="mb-4">
            <CustomerNotesEditor
              customerId={customer.id}
              initialNotes={customer.barberNotes ?? ''}
            />
          </div>

          {/* Reseñas dejadas */}
          {data.ratings.length > 0 && (
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
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes + helpers
// ─────────────────────────────────────────────────────────────────────────────

function Kpi({
  value,
  label,
  tone = 'default',
}: {
  value: string
  label: string
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="bg-surface px-2 py-3 text-center">
      <p
        className={`text-xl font-bold tabular-nums leading-none ${
          tone === 'danger' ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold mt-1.5 truncate">
        {label}
      </p>
    </div>
  )
}

function DateBlock({ date }: { date: string }) {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  const month = new Intl.DateTimeFormat('es-ES', { month: 'short' })
    .format(dt)
    .replace('.', '')
  return (
    <div className="h-12 w-12 rounded-lg bg-overlay flex flex-col items-center justify-center shrink-0">
      <span className="text-base font-bold text-ink leading-none tabular-nums">
        {d}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-ink-3 font-semibold mt-0.5">
        {month}
      </span>
    </div>
  )
}

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
    <section className="mb-4">
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

function Insight({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Scissors
  label: string
  value: string
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-overlay text-ink-2">
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

function BookingStatusLabel({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; className: string; Icon: typeof CheckCircle2 }
  > = {
    completed: { label: 'Hecha', className: 'text-success', Icon: CheckCircle2 },
    confirmed: { label: 'Confirmada', className: 'text-ink-2', Icon: RotateCw },
    cancelled: { label: 'Cancelada', className: 'text-ink-3', Icon: XCircle },
    no_show: { label: 'No vino', className: 'text-danger', Icon: AlertTriangle },
  }
  const m = map[status] ?? {
    label: status,
    className: 'text-ink-3',
    Icon: RotateCw,
  }
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-semibold ${m.className}`}
    >
      <m.Icon className="h-3 w-3" aria-hidden="true" />
      {m.label}
    </span>
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
