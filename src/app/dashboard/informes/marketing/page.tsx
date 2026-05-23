export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { Send, CalendarCheck, Star, MessageSquare } from 'lucide-react'
import { db } from '@/db'
import { promoPushes, ratings, bookings } from '@/db/schema'
import { sql } from 'drizzle-orm'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import StatsPeriodTabs from '../../_components/StatsPeriodTabs'
import StatStrip, { type Stat } from '../../_components/StatStrip'
import DataTable, { type Column } from '../../_components/DataTable'
import ReportLayout from '../_components/ReportLayout'
import { MARKETING_RAIL } from '../_components/report-rail-config'
import EmptyState from '../../_components/EmptyState'
import { loadReportContext } from '../_report-data'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'
import { getSourceMeta } from '@/lib/sources'
import {
  getClientSourceBreakdown,
  sumSourceBreakdown,
} from '@/lib/marketing/sources-breakdown'
import { parseIsoDate } from '@/lib/dashboard/period'
import Link from 'next/link'

// -----------------------------------------------------------------------------
// /dashboard/informes/marketing — pestaña MARKETING del área Informes.
//
// Reemplaza el placeholder "Próximamente" (dead-end que rompe la confianza
// en una prueba de 14 días) con el reporte REAL de lo que hace el barbero
// para que vuelvan: promos contextuales enviadas vs reservas atribuibles, y
// resumen de reseñas/ratings recogidas por el bot.
//
// NO es Booksy Boost (anuncios pagados de la competencia en tu perfil) —
// eso es anti-marca por PRODUCT.md. Es la EFICACIA de las herramientas que
// otracita ya da: ¿la promo de huecos trajo reservas? ¿qué nota te ponen?
//
// Pura agregación sobre tablas existentes (promo_pushes / ratings / bookings
// vía la ventana de atribución), cero schema nuevo. Tenant resuelto de la
// sesión (loadReportContext). Periodo por `?period=` (StatsPeriodTabs).
//
// Atribución de promo→reserva: una reserva cuenta como atribuible si el
// mismo teléfono tiene una reserva creada DESPUÉS del push y dentro de la
// ventana de atribución. Estimación honesta, no exacta — el barbero
// entiende "le mandé hueco y vino", no causalidad perfecta.
// -----------------------------------------------------------------------------

// Ventana de atribución promo→reserva: la promo ofrece un hueco concreto;
// si el cliente reserva dentro de los N días siguientes al push lo
// contamos como traído por la promo. 7 días = ~1 ciclo de decisión.
const PROMO_ATTRIB_DAYS = 7

interface PageProps {
  searchParams: Promise<{ period?: string; date?: string; start?: string; end?: string }>
}

interface PromoRow {
  name: string
  phone: string
  discountPct: number
  channel: string
  sentAt: string
  booked: boolean
}

const CHANNEL_LABEL: Record<string, string> = {
  push: 'App',
  whatsapp: 'WhatsApp',
  none: 'Sin canal',
}

function formatDateTime(iso: string): string {
  const dt = new Date(iso)
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt)
}

export default async function InformesMarketingPage({ searchParams }: PageProps) {
  const lockOverlay = await renderAdminLockGuard('informes')
  if (lockOverlay) return lockOverlay

  const params = await searchParams
  const { client, periodLabel, periodStartIso, periodEndIso } =
    await loadReportContext(params)

  const dateLo = periodStartIso ?? '0001-01-01'

  // ── Promos enviadas en el periodo + si el cliente reservó después del
  //    push dentro de la ventana de atribución (EXISTS a bookings por
  //    teléfono). promo_pushes.created_at y bookings.created_at son
  //    timestamptz → comparación directa por instante.
  const promoRows =
    (await db
      .execute(sql`
    SELECT
      pp.customer_phone AS phone,
      COALESCE(pp.customer_name, pp.customer_phone) AS name,
      pp.discount_pct AS discount_pct,
      pp.channel AS channel,
      pp.created_at AS sent_at,
      EXISTS (
        SELECT 1 FROM bookings bk
        WHERE bk.client_id = ${client.id}
          AND bk.customer_phone = pp.customer_phone
          AND bk.created_at >= pp.created_at
          AND bk.created_at < pp.created_at + (${PROMO_ATTRIB_DAYS} || ' days')::interval
      ) AS booked
    FROM ${promoPushes} pp
    WHERE pp.client_id = ${client.id}
      AND pp.created_at >= ${dateLo}::date
      AND pp.created_at < ${periodEndIso}::date
    ORDER BY pp.created_at DESC
    LIMIT 100
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                phone: string
                name: string
                discount_pct: number
                channel: string
                sent_at: string
                booked: boolean
              }[]
            }
          ).rows,
      )) ?? []

  const promos: PromoRow[] = promoRows.map((r) => ({
    name: r.name,
    phone: r.phone,
    discountPct: Number(r.discount_pct),
    channel: r.channel,
    sentAt: new Date(r.sent_at).toISOString(),
    booked: r.booked === true,
  }))

  const promosSent = promos.length
  const promosBooked = promos.filter((p) => p.booked).length
  const promoConvPct =
    promosSent > 0 ? Math.round((promosBooked / promosSent) * 100) : 0

  // ── Resumen de reseñas en el periodo: cuántas, nota media, distribución
  //    1-5, y por canal (WhatsApp vs PWA).
  const [reviewRow] =
    (await db
      .execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COALESCE(AVG(rating), 0) AS avg_rating,
      COUNT(*) FILTER (WHERE rating = 5)::int AS r5,
      COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
      COUNT(*) FILTER (WHERE rating = 3)::int AS r3,
      COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
      COUNT(*) FILTER (WHERE rating = 1)::int AS r1,
      COUNT(*) FILTER (WHERE channel = 'whatsapp')::int AS via_whatsapp,
      COUNT(*) FILTER (WHERE channel = 'pwa')::int AS via_pwa
    FROM ${ratings}
    WHERE client_id = ${client.id}
      AND created_at >= ${dateLo}::date
      AND created_at < ${periodEndIso}::date
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                total: number
                avg_rating: string | number
                r5: number
                r4: number
                r3: number
                r2: number
                r1: number
                via_whatsapp: number
                via_pwa: number
              }[]
            }
          ).rows,
      )) ?? []

  const reviewTotal = Number(reviewRow?.total ?? 0)
  const avgRating = Number(reviewRow?.avg_rating ?? 0)
  const dist = [
    { stars: 5, count: Number(reviewRow?.r5 ?? 0) },
    { stars: 4, count: Number(reviewRow?.r4 ?? 0) },
    { stars: 3, count: Number(reviewRow?.r3 ?? 0) },
    { stars: 2, count: Number(reviewRow?.r2 ?? 0) },
    { stars: 1, count: Number(reviewRow?.r1 ?? 0) },
  ]
  const viaWhatsapp = Number(reviewRow?.via_whatsapp ?? 0)
  const viaPwa = Number(reviewRow?.via_pwa ?? 0)

  // ── Últimas reseñas con comentario (las que el barbero quiere leer).
  const recentRows =
    (await db
      .execute(sql`
    SELECT
      COALESCE(customer_name, customer_phone) AS name,
      barber_name,
      rating,
      comment,
      channel,
      created_at
    FROM ${ratings}
    WHERE client_id = ${client.id}
      AND created_at >= ${dateLo}::date
      AND created_at < ${periodEndIso}::date
      AND comment IS NOT NULL AND length(trim(comment)) > 0
    ORDER BY created_at DESC
    LIMIT 8
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                name: string
                barber_name: string | null
                rating: number
                comment: string
                channel: string
                created_at: string
              }[]
            }
          ).rows,
      )) ?? []

  const recentReviews = recentRows.map((r) => ({
    name: r.name,
    barberName: r.barber_name,
    rating: Number(r.rating),
    comment: r.comment,
    channel: r.channel,
    createdAt: new Date(r.created_at).toISOString(),
  }))

  // ── F3 Reni — Origen de clientes en el periodo.
  // Por reserva no-cancelada cuya `date` cae en el periodo, el canal
  // EFECTIVO es:
  //   1) `source_manual` si el barbero lo marcó (override explícito al
  //      cerrar la cita: "¿de dónde te conoció?" + chip)
  //   2) si no, `referrer_source` (atribución pasiva por UTM/referrer
  //      capturada al crear la reserva desde PWA/web)
  //   3) si tampoco hay → null (no se cuenta como "atribuido")
  // Implementado con COALESCE(source_manual, referrer_source). El barbero ve
  // un único ranking; el contador `manual_count` revela cuántas vienen del
  // override manual (señal de adopción de la feature F3).
  const sourceRows =
    (await db
      .execute(sql`
    SELECT
      COALESCE(source_manual, referrer_source) AS source,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE source_manual IS NOT NULL)::int AS manual_count
    FROM ${bookings}
    WHERE client_id = ${client.id}
      AND date >= ${dateLo}
      AND date < ${periodEndIso}
      AND status <> 'cancelled'
    GROUP BY COALESCE(source_manual, referrer_source)
    ORDER BY count DESC
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: { source: string | null; count: number; manual_count: number }[]
            }
          ).rows,
      )) ?? []

  const sourceAttributed = sourceRows
    .filter((r) => r.source !== null && r.source !== '')
    .map((r) => ({
      source: r.source as string,
      count: Number(r.count),
      manualCount: Number(r.manual_count),
    }))
  const sourceUnattributed = Number(
    sourceRows.find((r) => r.source === null || r.source === '')?.count ?? 0,
  )
  const sourceAttributedTotal = sourceAttributed.reduce(
    (a, b) => a + b.count,
    0,
  )
  const sourceMaxCount = Math.max(1, ...sourceAttributed.map((r) => r.count))
  const sourceManualTotal = sourceAttributed.reduce(
    (a, b) => a + b.manualCount,
    0,
  )

  // ── #41 — Clientes NUEVOS por canal de captación (first-touch sobre
  //    `customers.first_source`). Es la misma señal que alimenta los chips
  //    de filtrado en /dashboard/clientes (agente #40). Aquí la mostramos
  //    como ranking para que el barbero decida en qué canal invertir.
  //
  //    Distinción vs el panel "Origen de clientes" que ya existe:
  //      · Aquí cuento CLIENTES (uno por persona) cuyo first-touch cayó en
  //        el periodo. Mide adquisición pura.
  //      · El panel "Origen de clientes" (F3 Reni) cuenta CITAS atribuidas
  //        en el periodo (un cliente recurrente suma N citas). Mide
  //        actividad por canal.
  //    Las dos vistas son complementarias y se leen de un vistazo.
  //
  //    Periodo: si `period=lifetime` (periodStartIso null) → sin ventana.
  //    Si hay periodo, restringe por `first_source_captured_at >= start`.
  const newClientsSince = periodStartIso ? parseIsoDate(periodStartIso) : null
  const newClientsBreakdown = await getClientSourceBreakdown(client.id, {
    since: newClientsSince ?? undefined,
  })
  const newClientsTotal = sumSourceBreakdown(newClientsBreakdown)
  const newClientsTop = newClientsBreakdown.slice(0, 8)
  const newClientsMaxCount = Math.max(1, ...newClientsTop.map((r) => r.count))

  const hasData =
    promosSent > 0 ||
    reviewTotal > 0 ||
    sourceAttributedTotal > 0 ||
    newClientsTotal > 0

  const stats: Stat[] = [
    {
      label: `Promos · ${periodLabel}`,
      value: promosSent.toLocaleString('es-ES'),
      icon: Send,
      hint: promosSent > 0 ? 'Avisos de hueco enviados' : undefined,
    },
    {
      label: 'Trajeron reserva',
      value: promosSent > 0 ? `${promoConvPct}%` : '—',
      icon: CalendarCheck,
      hint:
        promosSent > 0
          ? `${promosBooked} de ${promosSent} reservaron`
          : 'Sin promos en el periodo',
    },
    {
      label: 'Reseñas',
      value: reviewTotal.toLocaleString('es-ES'),
      icon: MessageSquare,
      hint: reviewTotal > 0 ? `${viaWhatsapp} bot · ${viaPwa} app` : undefined,
    },
    {
      label: 'Nota media',
      value: reviewTotal > 0 ? avgRating.toFixed(1) : '—',
      icon: Star,
      hint: reviewTotal > 0 ? `Sobre ${reviewTotal} reseñas` : 'Sin reseñas aún',
    },
  ]

  const distMax = Math.max(1, ...dist.map((d) => d.count))

  const promoColumns: Column<PromoRow>[] = [
    {
      key: 'name',
      header: 'Cliente',
      cell: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    {
      key: 'discount',
      header: 'Descuento',
      align: 'right',
      numeric: true,
      className: 'hidden sm:table-cell',
      cell: (r) => <span className="text-ink-2">{r.discountPct}%</span>,
    },
    {
      key: 'channel',
      header: 'Canal',
      className: 'hidden md:table-cell',
      cell: (r) => (
        <span className="text-ink-2">
          {CHANNEL_LABEL[r.channel] ?? r.channel}
        </span>
      ),
    },
    {
      key: 'sent',
      header: 'Enviada',
      align: 'right',
      numeric: true,
      cell: (r) => (
        <span className="text-ink-2 tabular-nums">
          {formatDateTime(r.sentAt)}
        </span>
      ),
    },
    {
      key: 'booked',
      header: 'Reservó',
      align: 'right',
      cell: (r) =>
        r.booked ? (
          <span className="inline-flex items-center gap-1 text-success font-semibold">
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Sí
          </span>
        ) : (
          <span className="text-ink-3">No</span>
        ),
    },
  ]

  return (
    <AreaShell
      area="informes"
      action={
        <Suspense>
          <StatsPeriodTabs />
        </Suspense>
      }
    >
      <AreaContent scroll="region" maxWidth="7xl">
        {!hasData ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState
              icon={Send}
              title="Sin actividad de marketing"
              description={`En este ${periodLabel} no se enviaron promos ni se recogieron reseñas. Activa las promos de huecos en Marketing y el bot pedirá la reseña tras cada cita.`}
            />
          </div>
        ) : (
          <ReportLayout rail={MARKETING_RAIL}>
            <StatStrip
              stats={stats}
              ariaLabel={`Resumen de marketing · ${periodLabel}`}
            />

            {/* #41 — ¿De dónde vienen tus clientes? Ranking por canal del
                first-touch del cliente (no del booking). Cada fila es Link a
                /dashboard/clientes?source=<canal> → deep-link al filtro
                multi-select de la lista (chips agente #40). */}
            {newClientsTotal > 0 && (
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    ¿De dónde vienen tus clientes?
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    {newClientsTotal}{' '}
                    {newClientsTotal === 1
                      ? 'cliente nuevo'
                      : 'clientes nuevos'}{' '}
                    en este {periodLabel}. Toca un canal para ver la lista
                    filtrada.
                  </p>
                </header>
                <ul className="divide-y divide-line">
                  {newClientsTop.map((row) => {
                    const meta = getSourceMeta(row.source)
                    const ChannelIcon = meta.Icon
                    const widthPct = Math.max(
                      2,
                      Math.round((row.count / newClientsMaxCount) * 100),
                    )
                    return (
                      <li key={row.source}>
                        <Link
                          href={`/dashboard/clientes?source=${encodeURIComponent(row.source)}`}
                          className="flex items-center gap-3 px-[var(--space-card)] py-2.5 transition-colors hover:bg-overlay focus:bg-overlay focus:outline-none"
                          aria-label={`Ver ${row.count} clientes de ${meta.label}`}
                        >
                          <span className="flex w-32 shrink-0 items-center gap-1.5 truncate text-[0.8125rem] text-ink">
                            <ChannelIcon
                              className="h-3.5 w-3.5 shrink-0 text-ink-2"
                              aria-hidden="true"
                            />
                            <span className="truncate">{meta.label}</span>
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-overlay">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <span className="w-24 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-2">
                            {row.count}{' '}
                            <span className="text-ink-3">({row.pct}%)</span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                <p className="border-t border-line px-[var(--space-card)] py-2 text-[0.6875rem] text-ink-3">
                  Cuenta clientes nuevos (uno por persona) por canal de
                  first-touch. El panel inferior &laquo;Origen de
                  clientes&raquo; cuenta citas atribuidas en el periodo.
                </p>
              </section>
            )}

            {/* F3 Reni — Origen de clientes (override manual + atribución
                pasiva). Pinta UNA tira ordenada por canal efectivo. */}
            {sourceAttributedTotal > 0 && (
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Origen de clientes
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    {sourceAttributedTotal}{' '}
                    {sourceAttributedTotal === 1
                      ? 'cita atribuida'
                      : 'citas atribuidas'}
                    {sourceManualTotal > 0 && (
                      <>
                        {' '}
                        · {sourceManualTotal}{' '}
                        {sourceManualTotal === 1 ? 'marcada' : 'marcadas'} a
                        mano al cerrar la cita
                      </>
                    )}
                    {sourceUnattributed > 0 && (
                      <>
                        {' '}
                        · {sourceUnattributed} sin atribuir
                      </>
                    )}
                  </p>
                </header>
                <ul className="divide-y divide-line">
                  {sourceAttributed.map((row) => {
                    const meta = getSourceMeta(row.source)
                    const SourceIcon = meta.Icon
                    const sharePct =
                      sourceAttributedTotal > 0
                        ? Math.round((row.count / sourceAttributedTotal) * 100)
                        : 0
                    const widthPct = Math.max(
                      2,
                      Math.round((row.count / sourceMaxCount) * 100),
                    )
                    return (
                      <li
                        key={row.source}
                        className="flex items-center gap-3 px-[var(--space-card)] py-2.5"
                      >
                        <span className="flex w-32 shrink-0 items-center gap-1.5 truncate text-[0.8125rem] text-ink">
                          <SourceIcon className="h-3.5 w-3.5 shrink-0 text-ink-2" aria-hidden="true" />
                          <span className="truncate">{meta.label}</span>
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-overlay">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-2">
                          {row.count}{' '}
                          <span className="text-ink-3">({sharePct}%)</span>
                        </span>
                        {row.manualCount > 0 && (
                          <span
                            className="w-16 shrink-0 text-right text-[0.6875rem] tabular-nums text-ink-3"
                            title={`${row.manualCount} marcadas a mano al cerrar la cita`}
                          >
                            {row.manualCount} ✋
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <p className="border-t border-line px-[var(--space-card)] py-2 text-[0.6875rem] text-ink-3">
                  Pregunta al cliente al cerrar la cita y marca el origen
                  desde el panel de detalle. Si no marcas, contamos la
                  atribución automática (UTM / referrer).
                </p>
              </section>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Distribución de reseñas. */}
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Cómo te puntúan
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    {reviewTotal > 0
                      ? `${reviewTotal} reseñas · nota media ${avgRating.toFixed(1)}`
                      : 'Aún no hay reseñas en este periodo.'}
                  </p>
                </header>
                {reviewTotal > 0 ? (
                  <ul className="divide-y divide-line">
                    {dist.map((d) => {
                      const pct =
                        reviewTotal > 0
                          ? Math.round((d.count / reviewTotal) * 100)
                          : 0
                      const widthPct = Math.max(
                        2,
                        Math.round((d.count / distMax) * 100),
                      )
                      return (
                        <li
                          key={d.stars}
                          className="flex items-center gap-3 px-[var(--space-card)] py-2.5"
                        >
                          <span className="flex w-12 shrink-0 items-center gap-1 text-[0.8125rem] tabular-nums text-ink">
                            {d.stars}
                            <Star
                              className="h-3 w-3 text-warning"
                              style={{ fill: 'var(--color-warning)' }}
                              aria-hidden="true"
                            />
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-overlay">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <span className="w-16 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-2">
                            {d.count}{' '}
                            <span className="text-ink-3">({pct}%)</span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="px-[var(--space-card)] py-6 text-center text-[0.8125rem] text-ink-3">
                    El bot pide la reseña tras cada cita completada.
                  </p>
                )}
              </section>

              {/* Eficacia de las promos. */}
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    ¿Funcionan las promos?
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    Avisos de hueco que acabaron en reserva (≤
                    {PROMO_ATTRIB_DAYS} días).
                  </p>
                </header>
                {promosSent > 0 ? (
                  <div className="px-[var(--space-card)] py-5">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-bold text-ink tabular-nums leading-none"
                        style={{ fontSize: 'var(--text-figure)' }}
                      >
                        {promoConvPct}%
                      </span>
                      <span className="text-[0.8125rem] text-ink-2">
                        de conversión
                      </span>
                    </div>
                    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-overlay">
                      <div
                        className="h-full bg-success"
                        style={{ width: `${promoConvPct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[0.75rem] text-ink-2">
                      <span>
                        <span className="font-semibold text-ink">
                          {promosBooked}
                        </span>{' '}
                        reservaron
                      </span>
                      <span>
                        <span className="font-semibold text-ink">
                          {promosSent - promosBooked}
                        </span>{' '}
                        sin reserva
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="px-[var(--space-card)] py-6 text-center text-[0.8125rem] text-ink-3">
                    No enviaste promos en este periodo.
                  </p>
                )}
              </section>
            </div>

            {/* Promos enviadas — log detallado. */}
            {promosSent > 0 && (
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Promos enviadas
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    A quién avisaste de un hueco y si reservó.
                  </p>
                </header>
                <DataTable
                  columns={promoColumns}
                  rows={promos}
                  rowKey={(r) => `${r.phone}-${r.sentAt}`}
                  ariaLabel="Promos enviadas"
                  emptyLabel="Sin promos en este periodo"
                />
              </section>
            )}

            {/* Últimas reseñas con comentario. */}
            {recentReviews.length > 0 && (
              <section className="panel">
                <header
                  className="border-b border-line px-[var(--space-card)] py-3"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <h2 className="text-[0.8125rem] font-semibold text-ink">
                    Lo que dicen tus clientes
                  </h2>
                  <p className="mt-0.5 text-[0.75rem] text-ink-2">
                    Últimas reseñas con comentario.
                  </p>
                </header>
                <ul className="divide-y divide-line">
                  {recentReviews.map((r, i) => (
                    <li
                      key={`${r.name}-${r.createdAt}-${i}`}
                      className="px-[var(--space-card)] py-3"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex items-center gap-0.5 shrink-0">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                className="h-3.5 w-3.5"
                                style={{
                                  color:
                                    n <= r.rating
                                      ? 'var(--color-warning)'
                                      : 'var(--color-line)',
                                  fill:
                                    n <= r.rating
                                      ? 'var(--color-warning)'
                                      : 'transparent',
                                }}
                                strokeWidth={1.5}
                                aria-hidden="true"
                              />
                            ))}
                          </span>
                          <span className="text-[0.8125rem] font-medium text-ink truncate">
                            {r.name}
                          </span>
                        </div>
                        <span className="text-[0.75rem] text-ink-3 shrink-0">
                          {formatDateTime(r.createdAt)}
                          {r.barberName && <span> · {r.barberName}</span>}
                        </span>
                      </div>
                      <p
                        className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2"
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {r.comment}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </ReportLayout>
        )}
      </AreaContent>
    </AreaShell>
  )
}
