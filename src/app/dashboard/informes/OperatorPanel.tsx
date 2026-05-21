import { Wallet, CalendarCheck, Receipt, Users, UserPlus, Scissors, ShoppingBag, Heart, TrendingUp } from 'lucide-react'
import StatStrip, { type Stat } from '../_components/StatStrip'
import { computeTrend } from '../_components/KpiCard'
import EmptyState from '../_components/EmptyState'
import { loadOperatorMetrics } from './_operator-data'

// -----------------------------------------------------------------------------
// OperatorPanel — la lectura de 10 segundos del Panel de Informes: el dueño
// abre y entiende su negocio del mes sin pensar.
//
// Server component. PURA AGREGACIÓN sobre tablas existentes (vía
// `loadOperatorMetrics`, scoped al tenant por el caller). No es el P&L
// (ese es FinanzasClient, intacto, accesible con el conmutador del Panel);
// esto es el resumen accionable: cuánto entró, de qué, cuántas citas y en
// qué estado, clientes nuevos vs los de siempre.
//
// Tokens-only, sin Fraunce, sin hex. Cabe en viewport (vive en una región
// scroll="region": chrome fijo, este bloque scrollea si hace falta). Estado
// vacío explícito cuando el periodo no tiene actividad.
// -----------------------------------------------------------------------------

interface Props {
  clientId: string
  /** YYYY-MM-DD inclusive. */
  start: string
  /** YYYY-MM-DD exclusive. */
  end: string
  /** Etiqueta legible del mes (ej. "mayo de 2026"). */
  monthLabel: string
}

import { formatCents as formatCentsBase } from '@/lib/format'
function formatCents(cents: number): string {
  return formatCentsBase(cents, { compact: true })
}

// Sparkline — mismo lenguaje visual que el de FinanzasClient (stroke
// var(--color-brand), 2px, redondeado) para coherencia entre Panel y P&L.
function Sparkline({ data, height = 44 }: { data: number[]; height?: number }) {
  if (data.length < 2) return null
  const W = 320
  const H = height
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 8) - 4
    return `${x},${y}`
  })
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Color funcional por estado de cita — color + texto, nunca solo color
// (DESIGN.md). Tokens semánticos existentes.
const STATUS_META: Record<
  string,
  { label: string; dot: string; text: string }
> = {
  completed: { label: 'Completadas', dot: 'bg-success', text: 'text-success' },
  confirmed: { label: 'Confirmadas', dot: 'bg-brand', text: 'text-brand-strong' },
  no_show: { label: 'No-shows', dot: 'bg-danger', text: 'text-danger' },
  cancelled: { label: 'Canceladas', dot: 'bg-ink-3', text: 'text-ink-2' },
}

export default async function OperatorPanel({
  clientId,
  start,
  end,
  monthLabel,
}: Props) {
  const m = await loadOperatorMetrics(clientId, start, end)

  const hasActivity = m.ingresosTotalCents > 0 || m.totalCitas > 0

  if (!hasActivity) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <EmptyState
          icon={TrendingUp}
          title="Sin datos en este periodo"
          description={`No hay citas ni ingresos en ${monthLabel}. Cambia de mes con las flechas del Detalle financiero o espera a las primeras citas.`}
        />
      </div>
    )
  }

  // Tendencia de ingresos vs el periodo anterior comparable (mismo total
  // serv+prod+prop, calculado en _operator-data → manzanas con manzanas).
  const trend = computeTrend(m.ingresosTotalCents, m.prevIngresosTotalCents)

  const ticketMedioCents =
    m.statusBreakdown[0].count > 0
      ? Math.round(m.serviciosCents / m.statusBreakdown[0].count)
      : 0

  const clientesTotal = m.clientesNuevos + m.clientesRecurrentes
  const nuevosPct =
    clientesTotal > 0
      ? Math.round((m.clientesNuevos / clientesTotal) * 100)
      : 0
  // F5 Reni: tendencia de clientes NUEVOS vs el mismo periodo anterior.
  // Muestra ±% en la nueva tile dedicada — el barbero necesita saber si
  // está captando más caras nuevas o solo fidelizando las de siempre.
  const nuevosTrend = computeTrend(m.clientesNuevos, m.prevClientesNuevos)

  const stats: Stat[] = [
    {
      label: `Ingresos · ${monthLabel}`,
      value: formatCents(m.ingresosTotalCents),
      icon: Wallet,
      trend,
      hint: 'Servicios + productos + propinas',
    },
    {
      label: 'Citas completadas',
      value: m.statusBreakdown[0].count.toLocaleString('es-ES'),
      icon: CalendarCheck,
      hint:
        m.totalCitas > 0
          ? `${m.statusBreakdown[0].pct}% de ${m.totalCitas} citas`
          : undefined,
    },
    {
      label: 'Ticket medio',
      value: ticketMedioCents > 0 ? formatCents(ticketMedioCents) : '—',
      icon: Receipt,
      hint: 'Por servicio completado',
    },
    {
      label: 'Clientes nuevos',
      value: m.clientesNuevos.toLocaleString('es-ES'),
      icon: UserPlus,
      trend: nuevosTrend,
      hint:
        m.prevClientesNuevos !== null
          ? `vs ${m.prevClientesNuevos.toLocaleString('es-ES')} el mes anterior`
          : 'primera cita registrada en este periodo',
    },
    {
      label: 'Clientes',
      value: clientesTotal.toLocaleString('es-ES'),
      icon: Users,
      hint:
        clientesTotal > 0
          ? `${nuevosPct}% nuevos · ${100 - nuevosPct}% recurrentes`
          : undefined,
    },
  ]

  // Reparto de ingresos por tipo, para las barras de proporción.
  const tipos = [
    { key: 'servicios', label: 'Servicios', icon: Scissors, cents: m.serviciosCents },
    { key: 'productos', label: 'Productos', icon: ShoppingBag, cents: m.productosCents },
    { key: 'propinas', label: 'Propinas', icon: Heart, cents: m.propinasCents },
  ]
  const ingresosBase = m.ingresosTotalCents || 1

  return (
    <div className="space-y-5">
      {/* Tira de KPIs — el titular del periodo. */}
      <StatStrip stats={stats} ariaLabel={`Resumen de ${monthLabel}`} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Ingresos por tipo. */}
        <section className="panel">
          <header
            className="border-b border-line px-[var(--space-card)] py-3"
            style={{ background: 'var(--table-head-bg)' }}
          >
            <h2 className="text-[0.8125rem] font-semibold text-ink">
              Ingresos por tipo
            </h2>
            <p className="mt-0.5 text-[0.75rem] text-ink-2">
              De dónde viene el dinero este periodo.
            </p>
          </header>
          <ul className="divide-y divide-line">
            {tipos.map((t) => {
              const Icon = t.icon
              const pct = Math.round((t.cents / ingresosBase) * 100)
              return (
                <li
                  key={t.key}
                  className="flex items-center gap-3 px-[var(--space-card)] py-3"
                >
                  <Icon
                    className="h-4 w-4 shrink-0 text-ink-2"
                    aria-hidden="true"
                  />
                  <span className="w-20 shrink-0 text-[0.8125rem] text-ink-2">
                    {t.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-overlay">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[0.8125rem] tabular-nums text-ink">
                    {formatCents(t.cents)}
                    <span className="ml-1 text-[0.6875rem] text-ink-3">
                      {pct}%
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Citas por estado. */}
        <section className="panel">
          <header
            className="border-b border-line px-[var(--space-card)] py-3"
            style={{ background: 'var(--table-head-bg)' }}
          >
            <h2 className="text-[0.8125rem] font-semibold text-ink">
              Citas por estado
            </h2>
            <p className="mt-0.5 text-[0.75rem] text-ink-2">
              {m.totalCitas.toLocaleString('es-ES')} citas en total este periodo.
            </p>
          </header>
          <ul className="divide-y divide-line">
            {m.statusBreakdown.map((s) => {
              const meta = STATUS_META[s.status]
              return (
                <li
                  key={s.status}
                  className="flex items-center gap-3 px-[var(--space-card)] py-3"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-[0.8125rem] text-ink">
                    {meta.label}
                  </span>
                  <span
                    className={`text-[0.8125rem] font-semibold tabular-nums ${meta.text}`}
                  >
                    {s.count.toLocaleString('es-ES')}
                  </span>
                  <span className="w-12 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-2">
                    {s.pct}%
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      {/* Evolución de ingresos por servicios — últimos 12 meses. */}
      {m.trend.length >= 2 && (
        <section className="panel">
          <header className="flex items-baseline justify-between gap-3 border-b border-line px-[var(--space-card)] py-3">
            <h2 className="text-[0.8125rem] font-semibold text-ink">
              Evolución de ingresos
            </h2>
            <p className="text-[0.75rem] text-ink-2">
              Servicios · últimos {m.trend.length} meses
            </p>
          </header>
          <div className="px-[var(--space-card)] py-4">
            <Sparkline data={m.trend.map((p) => p.cents)} />
            <div className="mt-1 flex items-baseline justify-between text-[0.6875rem] text-ink-3">
              <span>{m.trend[0].month}</span>
              <span>{m.trend[m.trend.length - 1].month}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
