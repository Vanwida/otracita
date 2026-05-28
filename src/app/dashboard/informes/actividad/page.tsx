export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import { db } from '@/db'
import { bookingEvents, bookings, barbers as barbersTable } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import StatsPeriodTabs from '../../_components/StatsPeriodTabs'
import EmptyState from '../../_components/EmptyState'
import { loadReportContext } from '../_report-data'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'
import {
  bookingEventMeta,
  actorLabelText,
  formatRelativeEs,
} from '@/lib/bookings/event-meta'
import ActivityFilters from './ActivityFilters'

// -----------------------------------------------------------------------------
// /dashboard/informes/actividad — vista GLOBAL de actividad de citas (task
// #107). Reni ve todo lo que pasa con las citas del negocio: creadas, movidas,
// canceladas, no-shows, completadas, cobros, recordatorios. Herramienta
// permanente — sobre todo el sitio donde las CANCELADAS (ocultas del grid de
// la agenda en #108) quedan visibles.
//
// Lista paginada de `booking_events` (todos los bookings del tenant), orden
// desc por fecha. Join a `bookings` para el contexto (cliente, barbero,
// estado actual). Filtros: tipo (?type=), barbero (?barber=), periodo
// (?period= vía StatsPeriodTabs sobre booking_events.created_at).
//
// Multi-tenancy: client de la sesión (loadReportContext). NUNCA del request.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    period?: string
    date?: string
    start?: string
    end?: string
    type?: string
    barber?: string
    page?: string
  }>
}

const PAGE_SIZE = 50

interface ActivityRow {
  id: string
  type: string
  actor: string
  actorLabel: string | null
  summary: string
  createdAt: string
  bookingId: string
  bookingDate: string | null
  bookingStatus: string | null
  customerName: string | null
  customerPhone: string | null
  barberName: string | null
}

export default async function InformesActividadPage({ searchParams }: PageProps) {
  const lockOverlay = await renderAdminLockGuard('informes')
  if (lockOverlay) return lockOverlay

  const params = await searchParams
  const { client, periodLabel, periodStartIso, periodEndIso } =
    await loadReportContext(params)

  // Filtros (de la URL). type/barber se validan; page se acota.
  const typeFilter = params.type?.trim() || null
  const barberFilter = params.barber?.trim() || null
  const pageNum = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)
  const offset = (pageNum - 1) * PAGE_SIZE

  // Barberos activos para el filtro (canonical table; nunca booksyServices).
  const barberRows = await db
    .select({ id: barbersTable.id, name: barbersTable.name })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))

  // Límite inferior de fecha: periodStartIso o "el principio de los tiempos".
  const createdLo = periodStartIso ?? '0001-01-01'

  // Eventos + contexto del booking. WHERE construido con condiciones SQL —
  // createdAt es timestamptz; comparar contra una fecha YYYY-MM-DD castea OK.
  const typeCond = typeFilter
    ? sql`AND e.type = ${typeFilter}`
    : sql``
  const barberCond = barberFilter
    ? sql`AND b.barber_id = ${barberFilter}`
    : sql``

  const rowsRaw = (await db
    .execute(sql`
      SELECT
        e.id            AS id,
        e.type          AS type,
        e.actor         AS actor,
        e.actor_label   AS actor_label,
        e.summary       AS summary,
        e.created_at    AS created_at,
        e.booking_id    AS booking_id,
        b.date          AS booking_date,
        b.status        AS booking_status,
        b.customer_name AS customer_name,
        b.customer_phone AS customer_phone,
        b.barber        AS barber_name
      FROM ${bookingEvents} e
      LEFT JOIN ${bookings} b ON b.id = e.booking_id
      WHERE e.client_id = ${client.id}
        AND e.created_at >= ${createdLo}
        AND e.created_at < ${periodEndIso}
        ${typeCond}
        ${barberCond}
      ORDER BY e.created_at DESC
      LIMIT ${PAGE_SIZE + 1}
      OFFSET ${offset}
    `)
    .then(
      (r) =>
        (r as unknown as { rows: Record<string, unknown>[] }).rows ?? [],
    )) as Record<string, unknown>[]

  // PAGE_SIZE + 1 truco: si vino una fila extra, hay página siguiente.
  const hasNext = rowsRaw.length > PAGE_SIZE
  const pageRows = rowsRaw.slice(0, PAGE_SIZE)

  const rows: ActivityRow[] = pageRows.map((r) => ({
    id: String(r.id),
    type: String(r.type),
    actor: String(r.actor),
    actorLabel: (r.actor_label as string | null) ?? null,
    summary: String(r.summary),
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    bookingId: String(r.booking_id),
    bookingDate: (r.booking_date as string | null) ?? null,
    bookingStatus: (r.booking_status as string | null) ?? null,
    customerName: (r.customer_name as string | null) ?? null,
    customerPhone: (r.customer_phone as string | null) ?? null,
    barberName: (r.barber_name as string | null) ?? null,
  }))

  // Querystring base para los enlaces de paginación (conserva filtros+periodo).
  const buildPageHref = (target: number) => {
    const qp = new URLSearchParams()
    if (params.period) qp.set('period', params.period)
    if (params.date) qp.set('date', params.date)
    if (params.start) qp.set('start', params.start)
    if (params.end) qp.set('end', params.end)
    if (typeFilter) qp.set('type', typeFilter)
    if (barberFilter) qp.set('barber', barberFilter)
    if (target > 1) qp.set('page', String(target))
    const q = qp.toString()
    return q ? `/dashboard/informes/actividad?${q}` : '/dashboard/informes/actividad'
  }

  const hasData = rows.length > 0

  return (
    <AreaShell
      area="informes"
      action={
        <Suspense>
          <StatsPeriodTabs defaultPeriod="month" />
        </Suspense>
      }
    >
      <AreaContent scroll="region" maxWidth="6xl">
        <div className="space-y-4">
          <Suspense>
            <ActivityFilters
              barbers={barberRows}
              activeType={typeFilter}
              activeBarberId={barberFilter}
            />
          </Suspense>

          {!hasData ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <EmptyState
                icon={Activity}
                title="Sin actividad en este periodo"
                description={`No hay eventos registrados en este ${periodLabel} con los filtros actuales. Prueba otro periodo o quita los filtros.`}
              />
            </div>
          ) : (
            <section className="panel overflow-hidden">
              <ul className="divide-y divide-line">
                {rows.map((ev) => {
                  const meta = bookingEventMeta(ev.type)
                  const Icon = meta.Icon
                  // Enlace al detalle: si la cita conserva fecha, abrimos la
                  // agenda en ese día (CalendarView lee ?date=). Si no hay
                  // fecha (booking borrado, raro), la fila no enlaza.
                  const href = ev.bookingDate
                    ? `/dashboard/agenda?date=${ev.bookingDate}`
                    : null
                  const customer = ev.customerName?.trim() || ev.customerPhone || 'Cliente'
                  const inner = (
                    <div className="flex items-center gap-3 px-[var(--space-card)] py-3">
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.toneBg}`}
                        aria-hidden="true"
                      >
                        <Icon className={`h-4 w-4 ${meta.toneText}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8125rem] text-ink">
                          {ev.summary}
                        </p>
                        <p className="truncate text-[0.6875rem] text-ink-3">
                          {customer}
                          {ev.barberName && (
                            <>
                              <span className="mx-1" aria-hidden="true">·</span>
                              {ev.barberName}
                            </>
                          )}
                          <span className="mx-1" aria-hidden="true">·</span>
                          {actorLabelText(ev.actor, ev.actorLabel)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[0.6875rem] tabular-nums text-ink-3 text-right">
                        {formatRelativeEs(ev.createdAt)}
                      </span>
                    </div>
                  )
                  return (
                    <li key={ev.id}>
                      {href ? (
                        <Link
                          href={href}
                          className="block transition-colors hover:bg-[var(--row-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  )
                })}
              </ul>

              {/* Paginación — prev/next por offset. */}
              {(pageNum > 1 || hasNext) && (
                <div className="flex items-center justify-between gap-3 border-t border-line px-[var(--space-card)] py-3">
                  {pageNum > 1 ? (
                    <Link
                      href={buildPageHref(pageNum - 1)}
                      className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink transition-colors"
                    >
                      ← Anteriores
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-[0.6875rem] text-ink-3 tabular-nums">
                    Página {pageNum}
                  </span>
                  {hasNext ? (
                    <Link
                      href={buildPageHref(pageNum + 1)}
                      className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink transition-colors"
                    >
                      Siguientes →
                    </Link>
                  ) : (
                    <span />
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </AreaContent>
    </AreaShell>
  )
}
