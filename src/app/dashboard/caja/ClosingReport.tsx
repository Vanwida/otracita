'use client'

import * as React from 'react'
import {
  Banknote,
  CreditCard,
  Globe,
  Smartphone,
  ShoppingBag,
  CalendarCheck,
  Heart,
  Receipt,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sliders,
  CornerDownLeft,
  User,
  AlertTriangle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  MOVEMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  isIncoming,
  type MovementKind,
  type PaymentMethod,
} from '@/lib/cash/compute'
import type {
  BarberMethodSummaryRow,
  KindSummaryRow,
  MethodSummaryRow,
  MovementListItem,
  PaymentMethodDetail,
  PaymentMethodDetailRow,
} from '@/lib/cash/breakdown'

// -----------------------------------------------------------------------------
// ClosingReport — bloque reutilizable que renderiza el desglose completo de
// una sesión de caja (vivo o histórico). Lo usan:
//
//   · OpenRegisterPanel / tab "Resumen" — vista live mientras la caja sigue
//     abierta. El barbero puede pulsar Cerrar caja sabiendo qué hay.
//   · CloseCashModal — espejo del mismo report dentro del flujo de cierre,
//     para que Reni vea TODO el día en la misma pantalla antes de pulsar.
//
// Pure UI: recibe el desglose ya construido (server) y un set de props para
// el header (opening, expected, etc). No fetch propio. Sin estado salvo
// expand/collapse del listado de movimientos.
// -----------------------------------------------------------------------------

export interface ClosingReportProps {
  /** Apertura del cajón (cambio inicial declarado). */
  openingCents: number
  /** Hora de apertura ISO. */
  openedAt: string
  /** Email de quien abrió. */
  openedByEmail: string
  /** Esperado al cierre, ya con apertura sumada al efectivo. */
  cashExpectedCents: number
  cardExpectedCents: number
  onlineExpectedCents: number
  /** Sub-totales globales. */
  totals: {
    incomingCents: number
    outgoingCents: number
    netCents: number
  }
  byMethod: MethodSummaryRow[]
  byKind: KindSummaryRow[]
  byBarber: BarberMethodSummaryRow[]
  byPaymentDetail: PaymentMethodDetailRow[]
  movements: MovementListItem[]
  /** Cuántos movimientos tienen método legacy/NULL — bloquea cierre si > 0. */
  unknownMethodCount: number
}

const METHOD_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  online: Globe,
}

const KIND_ICON: Record<MovementKind, typeof Banknote> = {
  booking: CalendarCheck,
  product_sale: ShoppingBag,
  tip_cash: Heart,
  expense: Receipt,
  withdrawal: ArrowUpFromLine,
  deposit: ArrowDownToLine,
  adjustment: Sliders,
  refund: CornerDownLeft,
}

const PAYMENT_DETAIL_LABELS: Record<PaymentMethodDetail, string> = {
  cash: 'Efectivo',
  card_physical: 'Tarjeta (datáfono)',
  bizum: 'Bizum',
  card_online: 'Online (Stripe)',
  mixed: 'Pago fraccionado',
  unknown: 'Sin detalle',
}

const PAYMENT_DETAIL_ICON: Record<PaymentMethodDetail, typeof Banknote> = {
  cash: Banknote,
  card_physical: CreditCard,
  bizum: Smartphone,
  card_online: Globe,
  mixed: Receipt,
  unknown: Receipt,
}

export default function ClosingReport(props: ClosingReportProps) {
  const {
    openingCents,
    openedAt,
    openedByEmail,
    cashExpectedCents,
    cardExpectedCents,
    onlineExpectedCents,
    totals,
    byMethod,
    byKind,
    byBarber,
    byPaymentDetail,
    movements,
    unknownMethodCount,
  } = props

  const totalExpected =
    cashExpectedCents + cardExpectedCents + onlineExpectedCents

  // Sólo mostramos la tabla por barbero si hay ≥2 filas (con 1 es ruido).
  const showBarberSection = byBarber.length >= 2

  return (
    <div className="space-y-4">
      {/* ── 0. Apertura ─────────────────────────────────────────────── */}
      <Section title="Apertura" subtitle="Cambio declarado al abrir la sesión">
        <div className="grid grid-cols-2 gap-2 text-[0.8125rem]">
          <Cell label="Fondo inicial" value={euros(openingCents)} bold />
          <Cell
            label="Hora apertura"
            value={`${format(parseISO(openedAt), 'HH:mm', { locale: es })} · ${openedByEmail}`}
          />
        </div>
      </Section>

      {/* ── 1. Totales globales (chip grande) ───────────────────────── */}
      <Section title="Resumen del día">
        <div className="grid grid-cols-3 gap-2">
          <BigStat
            label="Ingresos"
            value={euros(totals.incomingCents)}
            tone="success"
          />
          <BigStat
            label="Egresos"
            value={euros(totals.outgoingCents)}
            tone="warning"
          />
          <BigStat
            label="Neto en caja"
            value={euros(totalExpected)}
            tone="ink"
          />
        </div>
      </Section>

      {/* ── 2. Por método de pago ───────────────────────────────────── */}
      <Section
        title="Por método de pago"
        subtitle="Lo que tiene que haber en el cajón, datáfono y Stripe"
      >
        <dl className="divide-y divide-line">
          {byMethod.map((row) => {
            const Icon = METHOD_ICON[row.method]
            const expectedCents =
              row.method === 'cash'
                ? cashExpectedCents
                : row.method === 'card'
                  ? cardExpectedCents
                  : onlineExpectedCents
            return (
              <div
                key={row.method}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className="h-4 w-4 text-ink-2 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <dt className="text-[0.8125rem] font-medium text-ink">
                      {PAYMENT_METHOD_LABELS[row.method]}
                    </dt>
                    <p className="text-[0.6875rem] text-ink-2">
                      {row.count} {row.count === 1 ? 'movimiento' : 'movimientos'}
                      {row.outgoingCents > 0 ? (
                        <>
                          {' '}· entró {euros(row.incomingCents)} · salió{' '}
                          {euros(row.outgoingCents)}
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <dd className="text-[0.9375rem] font-bold text-ink tabular-nums shrink-0">
                  {euros(expectedCents)}
                </dd>
              </div>
            )
          })}
        </dl>

        {/* Granularidad fina: card_physical / bizum / card_online / mixed.
            Sólo si hay ≥1 detalle distinto a 'unknown' — si todo es legacy,
            no aporta. */}
        {byPaymentDetail.filter((d) => d.method !== 'unknown').length > 0 && (
          <details className="mt-3 group">
            <summary className="cursor-pointer text-[0.6875rem] uppercase tracking-[0.08em] text-ink-2 font-semibold hover:text-ink select-none">
              Detalle por canal de cobro ({byPaymentDetail.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {byPaymentDetail.map((d) => {
                const Icon = PAYMENT_DETAIL_ICON[d.method]
                return (
                  <li
                    key={d.method}
                    className="flex items-center justify-between gap-2 text-[0.75rem]"
                  >
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {PAYMENT_DETAIL_LABELS[d.method]}
                      <span className="text-ink-3">({d.count})</span>
                    </span>
                    <span className="tabular-nums font-medium text-ink">
                      {euros(d.totalCents)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </details>
        )}
      </Section>

      {/* ── 3. Por tipo de movimiento ───────────────────────────────── */}
      {byKind.length > 0 && (
        <Section
          title="Por tipo de operación"
          subtitle="Bookings, productos, propinas, gastos…"
        >
          <ul className="divide-y divide-line">
            {byKind.map((row) => {
              const Icon = KIND_ICON[row.kind]
              const incoming = isIncoming(row.kind)
              return (
                <li
                  key={row.kind}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon
                      className="h-3.5 w-3.5 text-ink-2 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-[0.8125rem] text-ink">
                      {MOVEMENT_KIND_LABELS[row.kind]}
                    </span>
                    <span className="text-[0.6875rem] text-ink-3">
                      ({row.count})
                    </span>
                  </div>
                  <span
                    className={`text-[0.8125rem] font-semibold tabular-nums ${
                      incoming ? 'text-ink' : 'text-danger'
                    }`}
                  >
                    {incoming ? '+' : '−'}
                    {euros(Math.abs(row.netCents))}
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {/* ── 4. Por barbero ──────────────────────────────────────────── */}
      {showBarberSection && (
        <Section
          title="Por barbero"
          subtitle="Cuánto ha generado cada uno, separado por método"
        >
          <div className="overflow-x-auto -mx-[var(--space-card)]">
            <table className="w-full text-[0.75rem]">
              <thead>
                <tr className="text-left text-ink-3 uppercase tracking-[0.08em] text-[0.625rem]">
                  <th className="px-[var(--space-card)] py-1.5 font-semibold">Barbero</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Efectivo</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Tarjeta</th>
                  <th className="px-2 py-1.5 font-semibold text-right">Online</th>
                  <th className="px-[var(--space-card)] py-1.5 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byBarber.map((row) => (
                  <tr key={row.barberId ?? '__unassigned__'}>
                    <td className="px-[var(--space-card)] py-2 text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-3 w-3 text-ink-3" aria-hidden="true" />
                        {row.barberName ?? (row.barberId ? 'Barbero' : 'Sin asignar')}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-2">
                      {row.cashCents === 0 ? '—' : euros(row.cashCents)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-2">
                      {row.cardCents === 0 ? '—' : euros(row.cardCents)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-2">
                      {row.onlineCents === 0 ? '—' : euros(row.onlineCents)}
                    </td>
                    <td className="px-[var(--space-card)] py-2 text-right tabular-nums font-semibold text-ink">
                      {euros(row.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── 5. Movimientos individuales (scroll) ────────────────────── */}
      <Section
        title={`Movimientos del día (${movements.length})`}
        subtitle="Hora · tipo · barbero · referencia · importe"
      >
        {movements.length === 0 ? (
          <p className="text-[0.75rem] text-ink-3 py-2">
            Sin movimientos todavía.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto -mx-[var(--space-card)] border-t border-line">
            <ul className="divide-y divide-line">
              {movements.map((m) => {
                const Icon = KIND_ICON[m.kind]
                const incoming = m.signedAmountCents >= 0
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 px-[var(--space-card)] py-2 hover:bg-overlay/40"
                  >
                    <span className="text-[0.6875rem] tabular-nums text-ink-3 shrink-0 w-10">
                      {format(parseISO(m.createdAt), 'HH:mm')}
                    </span>
                    <Icon
                      className="h-3.5 w-3.5 text-ink-2 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.75rem] text-ink truncate">
                        <span className="font-medium">
                          {MOVEMENT_KIND_LABELS[m.kind]}
                        </span>
                        {m.referenceLabel && (
                          <span className="text-ink-2"> · {m.referenceLabel}</span>
                        )}
                        {!m.referenceLabel && m.notes && (
                          <span className="text-ink-2"> · {m.notes}</span>
                        )}
                      </p>
                      <p className="text-[0.625rem] text-ink-3 truncate">
                        {m.barberName ?? 'Sin asignar'} ·{' '}
                        {PAYMENT_METHOD_LABELS[m.method] ?? m.method}
                      </p>
                    </div>
                    <span
                      className={`text-[0.8125rem] font-semibold tabular-nums shrink-0 ${
                        incoming ? 'text-ink' : 'text-danger'
                      }`}
                    >
                      {incoming ? '+' : '−'}
                      {euros(Math.abs(m.signedAmountCents))}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Section>

      {/* ── Warning: legacy method NULL ─────────────────────────────── */}
      {unknownMethodCount > 0 && (
        <div className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle
            className="h-4 w-4 text-warning shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="text-[0.75rem] text-ink leading-relaxed">
            Hay {unknownMethodCount}{' '}
            {unknownMethodCount === 1 ? 'movimiento' : 'movimientos'} sin método
            de pago registrado. Corrígelos antes de cerrar caja para que el
            cuadre sea preciso.
          </div>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers de chrome — sin estado, sin lógica.
// -----------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-control border border-line bg-surface px-[var(--space-card)] py-3">
      <header className="mb-2">
        <h4 className="text-[0.625rem] uppercase tracking-[0.1em] text-ink-2 font-semibold">
          {title}
        </h4>
        {subtitle && (
          <p className="text-[0.6875rem] text-ink-3 mt-0.5">{subtitle}</p>
        )}
      </header>
      {children}
    </section>
  )
}

function Cell({
  label,
  value,
  bold,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
}) {
  return (
    <div>
      <p className="text-[0.6875rem] text-ink-3">{label}</p>
      <p
        className={`tabular-nums ${
          bold ? 'text-ink font-semibold' : 'text-ink-2'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function BigStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'success' | 'warning' | 'ink'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : 'text-ink'
  return (
    <div className="rounded-control border border-line bg-overlay/40 px-3 py-2.5">
      <p className="text-[0.625rem] uppercase tracking-[0.08em] text-ink-2 font-semibold">
        {label}
      </p>
      <p className={`tabular-nums font-bold mt-0.5 ${toneClass} text-base`}>
        {value}
      </p>
    </div>
  )
}

/** Céntimos → "1.234,56 €" (convención castellana). */
function euros(cents: number): string {
  return `${(cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}
