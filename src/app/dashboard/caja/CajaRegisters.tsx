'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  Banknote,
  Check,
  CreditCard,
  Globe,
  Lock,
  Unlock,
  Plus,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  Heart,
  Sliders,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import Modal from '../_components/Modal'
import {
  MOVEMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  isIncoming,
  type MovementKind,
  type PaymentMethod,
} from '@/lib/cash/compute'
import type { CashClosingSnapshot, MovementBreakdown } from '@/lib/cash/breakdown'
import DataPanel from '../_components/DataPanel'
import DataTable, { type Column } from '../_components/DataTable'
import StatusBadge from '../_components/StatusBadge'
import ClosingReport from './ClosingReport'

// -----------------------------------------------------------------------------
// CajaRegisters — "Cajas registradoras" con estructura Booksy (UI0).
//
// Reemplaza la card aislada `CashRegisterPanel` por el panel de control de
// dos columnas del screenshot 10.06.29:
//
//   IZQUIERDA  · lista cronológica de cajas (histórico de cash_sessions):
//                fecha + apertura + total + badge ABIERTO/CERRADO. La sesión
//                abierta (si la hay) va arriba, seleccionada por defecto.
//   DERECHA    · DataPanel acoplado con el detalle del registro seleccionado:
//                TOTAL grande + estado + acciones, meta de apertura, tabs
//                TRANSACCIONES/RESUMEN, tabla de movimientos con badge
//                PAGADO, y barra de acción inferior (Apunte / Cerrar / PDF).
//
// LÓGICA DE SERVIDOR INTACTA: la sesión abierta sigue refrescándose vía
// GET /api/cash/current cada 15s; abrir/cerrar/apuntar usan exactamente los
// mismos endpoints (/api/cash/open|close|movements) y payloads que antes.
// El histórico de sesiones cerradas lo pasa el server (read-only) en
// `history` — no se añade lógica de negocio nueva.
// -----------------------------------------------------------------------------

interface SessionState {
  id: string
  openingCents: number
  openedAt: string
  openedByEmail: string
  /** Sesión cerrada cuya saldo se arrastró como apertura (task #91). Null
   *  en la primera sesión del cliente o cuando el barbero abrió manual sin
   *  aceptar la sugerencia. */
  openingCarriedFromSessionId: string | null
  /** Snapshot del valor SUGERIDO de carryover al abrir (independiente de
   *  lo que el barbero realmente metió en openingCents — para auditoría). */
  openingCarriedCents: number | null
  /** Motivo libre cuando el barbero modificó el carryover sugerido. */
  openingManualAdjustmentReason: string | null
}

interface MovementRow {
  id: string
  kind: MovementKind
  method: PaymentMethod
  amountCents: number
  notes: string | null
  createdAt: string
}

interface ExpectedState {
  cashExpectedCents: number
  cardExpectedCents: number
  onlineExpectedCents: number
}

interface ApiResponse {
  session: SessionState | null
  movements: MovementRow[]
  expected: ExpectedState | null
  breakdown: MovementBreakdown | null
}

/** Fila de histórico de caja cerrada — la pasa el server (read-only). */
export interface ClosedRegister {
  id: string
  openingCents: number
  openedAt: string
  closedAt: string
  closingCentsExpected: number | null
  closingCentsCounted: number | null
  cashDescuadreCents: number | null
  cardTerminalExpectedCents: number | null
  cardDescuadreCents: number | null
  /** Snapshot completo del desglose tal cual lo vio el barbero al cerrar.
   *  Null en sesiones cerradas antes de la migración 0046 (legacy). */
  closingSnapshot: CashClosingSnapshot | null
  /** Carryover info (task #91) — null en sesiones pre-migración 0057. */
  openingCarriedFromSessionId: string | null
  openingCarriedCents: number | null
  openingManualAdjustmentReason: string | null
}

interface Props {
  history: ClosedRegister[]
}

type Selected =
  | { kind: 'open' }
  | { kind: 'closed'; id: string }

export default function CajaRegisters({ history }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Selected>({ kind: 'open' })
  const [openModalOpen, setOpenModalOpen] = useState(false)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [movementModalOpen, setMovementModalOpen] = useState(false)

  async function fetchCurrent() {
    try {
      const res = await fetch('/api/cash/current', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as ApiResponse
      setData(json)
    } catch {
      // ignore — siguiente poll lo intentará otra vez
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchCurrent()
    const id = setInterval(fetchCurrent, 15_000)
    return () => clearInterval(id)
  }, [])

  function refresh() {
    void fetchCurrent()
    startTransition(() => router.refresh())
  }

  const session = data?.session ?? null
  const expected = data?.expected ?? null
  const movements = data?.movements ?? []
  const breakdown = data?.breakdown ?? null

  // Total esperado de la jornada = efectivo (que ya incluye la apertura) +
  // tarjeta + online. computeExpectedClosing en el server ya suma la
  // apertura dentro de cashExpectedCents, así que NO la volvemos a sumar.
  const openTotalCents = useMemo(() => {
    if (!expected) return 0
    return (
      expected.cashExpectedCents +
      expected.cardExpectedCents +
      expected.onlineExpectedCents
    )
  }, [expected])

  // Si la sesión abierta desaparece (se cerró) y estábamos en 'open',
  // saltamos al registro más reciente del histórico.
  useEffect(() => {
    if (!loading && !session && selected.kind === 'open' && history.length > 0) {
      setSelected({ kind: 'closed', id: history[0].id })
    }
  }, [loading, session, selected, history])

  const selectedClosed =
    selected.kind === 'closed'
      ? history.find((h) => h.id === selected.id) ?? null
      : null

  return (
    <section>
      <header className="mb-3 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2
            className="font-semibold text-ink"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            Cajas registradoras
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink-2">
            El cuadre de hoy y el histórico de cierres.
          </p>
        </div>
        {!session && !loading && (
          <button
            type="button"
            onClick={() => setOpenModalOpen(true)}
            className="btn-primary"
          >
            <Unlock className="h-4 w-4" />
            Abrir caja
          </button>
        )}
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(260px,340px)_1fr] lg:items-start">
        {/* ── Columna izquierda: lista de cajas ─────────────────────── */}
        <RegisterList
          loading={loading}
          session={session}
          openTotalCents={openTotalCents}
          history={history}
          selected={selected}
          onSelect={setSelected}
        />

        {/* ── Columna derecha: detalle del registro seleccionado ────── */}
        <div className="lg:sticky lg:top-[calc(var(--space-section)+1px)]">
          {selected.kind === 'open' ? (
            <OpenRegisterPanel
              loading={loading}
              session={session}
              expected={expected}
              movements={movements}
              breakdown={breakdown}
              openTotalCents={openTotalCents}
              onOpenRegister={() => setOpenModalOpen(true)}
              onNewMovement={() => setMovementModalOpen(true)}
              onCloseRegister={() => setCloseModalOpen(true)}
            />
          ) : selectedClosed ? (
            <ClosedRegisterPanel register={selectedClosed} />
          ) : (
            <DataPanel title="Sin registro">
              <p className="px-[var(--space-card)] py-8 text-center text-[0.8125rem] text-ink-2">
                Selecciona una caja de la lista.
              </p>
            </DataPanel>
          )}
        </div>
      </div>

      {/* Modales — payloads idénticos a la versión anterior. */}
      <OpenCashModal
        open={openModalOpen}
        onClose={() => setOpenModalOpen(false)}
        onOpened={() => {
          setSelected({ kind: 'open' })
          refresh()
        }}
      />
      {session && expected && (
        <CloseCashModal
          open={closeModalOpen}
          session={session}
          expected={expected}
          breakdown={breakdown}
          onClose={() => setCloseModalOpen(false)}
          onClosed={refresh}
        />
      )}
      <NewMovementModal
        open={movementModalOpen}
        onClose={() => setMovementModalOpen(false)}
        onCreated={refresh}
      />
    </section>
  )
}

// -----------------------------------------------------------------------------
// RegisterList — columna izquierda: filas de caja (abierta + histórico).
// -----------------------------------------------------------------------------

function RegisterList({
  loading,
  session,
  openTotalCents,
  history,
  selected,
  onSelect,
}: {
  loading: boolean
  session: SessionState | null
  openTotalCents: number
  history: ClosedRegister[]
  selected: Selected
  onSelect: (s: Selected) => void
}) {
  const hasAny = session || history.length > 0
  return (
    <div className="panel">
      <ul className="divide-y divide-line" role="list">
        {session && (
          <RegisterRow
            active={selected.kind === 'open'}
            onClick={() => onSelect({ kind: 'open' })}
            dateLabel={format(parseISO(session.openedAt), "d MMM", { locale: es })}
            byLine={`Apertura ${euros(session.openingCents)}`}
            totalCents={openTotalCents}
            status="open"
          />
        )}
        {history.map((h) => (
          <RegisterRow
            key={h.id}
            active={selected.kind === 'closed' && selected.id === h.id}
            onClick={() => onSelect({ kind: 'closed', id: h.id })}
            dateLabel={format(parseISO(h.openedAt), 'd MMM', { locale: es })}
            byLine={`Apertura ${euros(h.openingCents)}`}
            totalCents={h.closingCentsExpected ?? 0}
            status="closed"
          />
        ))}
        {!hasAny && (
          <li className="px-[var(--space-card)] py-8 text-center">
            <p className="text-[0.8125rem] text-ink-2">
              {loading ? 'Cargando…' : 'Aún no has abierto ninguna caja.'}
            </p>
          </li>
        )}
      </ul>
    </div>
  )
}

function RegisterRow({
  active,
  onClick,
  dateLabel,
  byLine,
  totalCents,
  status,
}: {
  active: boolean
  onClick: () => void
  dateLabel: string
  byLine: string
  totalCents: number
  status: 'open' | 'closed'
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full items-center gap-3 px-[var(--space-card)] py-3 text-left transition-colors min-h-[48px] ${
          active
            ? 'bg-brand-softer border-l-2 border-brand'
            : 'border-l-2 border-transparent hover:bg-[var(--row-hover)]'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] font-medium text-ink leading-tight">
            {dateLabel}
          </p>
          <p className="mt-0.5 text-[0.75rem] text-ink-2 truncate">{byLine}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[0.9375rem] font-bold text-ink tabular-nums leading-tight">
            {euros(totalCents)}
          </p>
          <div className="mt-1 flex justify-end">
            <StatusBadge variant={status} hideIcon />
          </div>
        </div>
      </button>
    </li>
  )
}

// -----------------------------------------------------------------------------
// OpenRegisterPanel — detalle de la caja ABIERTA (live, polling).
// -----------------------------------------------------------------------------

function OpenRegisterPanel({
  loading,
  session,
  expected,
  movements,
  breakdown,
  openTotalCents,
  onOpenRegister,
  onNewMovement,
  onCloseRegister,
}: {
  loading: boolean
  session: SessionState | null
  expected: ExpectedState | null
  movements: MovementRow[]
  breakdown: MovementBreakdown | null
  openTotalCents: number
  onOpenRegister: () => void
  onNewMovement: () => void
  onCloseRegister: () => void
}) {
  const [tab, setTab] = useState<'tx' | 'resumen'>('tx')

  if (loading && !session) {
    return (
      <DataPanel title="Caja del día">
        <div className="flex items-center gap-2 px-[var(--space-card)] py-8 text-[0.8125rem] text-ink-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando caja…
        </div>
      </DataPanel>
    )
  }

  if (!session || !expected) {
    return (
      <DataPanel title="Caja del día" headerAside={<StatusBadge variant="closed" label="Sin abrir" />}>
        <div className="px-[var(--space-card)] py-8">
          <p className="text-[0.8125rem] text-ink-2 leading-relaxed mb-4">
            No hay caja abierta. Ábrela al empezar la jornada para llevar el
            cuadre del efectivo y el datáfono.
          </p>
          <button type="button" onClick={onOpenRegister} className="btn-primary">
            <Unlock className="h-4 w-4" />
            Abrir caja
          </button>
        </div>
      </DataPanel>
    )
  }

  return (
    <DataPanel
      title={
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: 'var(--text-figure)' }}
        >
          {euros(openTotalCents)}
        </span>
      }
      meta={
        <>
          Abierta a las {format(parseISO(session.openedAt), 'HH:mm', { locale: es })} ·
          apertura {euros(session.openingCents)}
          {session.openingCarriedFromSessionId && (
            <span className="text-ink-2"> · arrastrada del cierre anterior</span>
          )}
          {!session.openingCarriedFromSessionId &&
            session.openingCarriedCents !== null &&
            session.openingCarriedCents !== session.openingCents && (
              <span className="text-ink-2">
                {' '}
                · ajuste manual (sugerido {euros(session.openingCarriedCents)})
              </span>
            )}
        </>
      }
      headerAside={<StatusBadge variant="open" />}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNewMovement}
            className="inline-flex flex-1 items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface text-ink border border-line hover:border-line-strong hover:bg-overlay transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Apunte
          </button>
          <button
            type="button"
            onClick={onCloseRegister}
            className="inline-flex flex-1 items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl text-sm font-semibold bg-ink text-surface hover:bg-ink/90 transition-colors"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            Cerrar caja
          </button>
        </div>
      }
    >
      {/* Tabs TRANSACCIONES / RESUMEN — segmented control del sistema. */}
      <div className="px-[var(--space-card)] pt-3">
        <div
          role="tablist"
          aria-label="Vista del registro"
          className="inline-flex items-center gap-1 bg-overlay border border-line rounded-control p-1"
        >
          <TabButton active={tab === 'tx'} onClick={() => setTab('tx')}>
            Transacciones
          </TabButton>
          <TabButton active={tab === 'resumen'} onClick={() => setTab('resumen')}>
            Resumen
          </TabButton>
        </div>
      </div>

      {tab === 'tx' ? (
        <div className="mt-3">
          <MovementsTable movements={movements} />
        </div>
      ) : (
        <div className="px-[var(--space-card)] py-4">
          {breakdown ? (
            <ClosingReport
              openingCents={session.openingCents}
              openedAt={session.openedAt}
              openedByEmail={session.openedByEmail}
              cashExpectedCents={expected.cashExpectedCents}
              cardExpectedCents={expected.cardExpectedCents}
              onlineExpectedCents={expected.onlineExpectedCents}
              totals={breakdown.totals}
              byMethod={breakdown.byMethod}
              byKind={breakdown.byKind}
              byBarber={breakdown.byBarber}
              byPaymentDetail={breakdown.byPaymentDetail}
              movements={breakdown.movements}
              unknownMethodCount={breakdown.unknownMethodCount}
            />
          ) : (
            <ExpectedSummary session={session} expected={expected} />
          )}
        </div>
      )}
    </DataPanel>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active ? 'bg-surface shadow-sm text-ink' : 'text-ink-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function MovementsTable({ movements }: { movements: MovementRow[] }) {
  const columns: Column<MovementRow>[] = [
    {
      key: 'time',
      header: 'Hora',
      numeric: true,
      cell: (m) => (
        <span className="text-ink-2">{format(parseISO(m.createdAt), 'HH:mm')}</span>
      ),
    },
    {
      key: 'concept',
      header: 'Concepto',
      cell: (m) => (
        <div className="min-w-0">
          <p className="font-medium text-ink truncate">
            {MOVEMENT_KIND_LABELS[m.kind]}
          </p>
          {m.notes && (
            <p className="text-[0.6875rem] text-ink-2 truncate">{m.notes}</p>
          )}
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Método',
      className: 'hidden sm:table-cell',
      cell: (m) => (
        <span className="text-ink-2">{PAYMENT_METHOD_LABELS[m.method]}</span>
      ),
    },
    {
      key: 'state',
      header: 'Estado',
      align: 'center',
      cell: (m) => (
        <StatusBadge variant={isIncoming(m.kind) ? 'paid' : 'void'} hideIcon />
      ),
    },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      numeric: true,
      cell: (m) => {
        const incoming = isIncoming(m.kind)
        return (
          <span className={`font-semibold ${incoming ? 'text-ink' : 'text-danger'}`}>
            {incoming ? '+' : '−'}
            {euros(m.amountCents)}
          </span>
        )
      },
    },
  ]
  return (
    <DataTable
      ariaLabel="Movimientos del día"
      columns={columns}
      rows={movements}
      rowKey={(m) => m.id}
      emptyLabel="Sin movimientos todavía. Las ventas y apuntes aparecerán aquí."
    />
  )
}

function ExpectedSummary({
  session,
  expected,
}: {
  session: SessionState
  expected: ExpectedState
}) {
  const rows: { icon: typeof Banknote; label: string; cents: number; hint: string }[] = [
    {
      icon: Banknote,
      label: 'Efectivo',
      cents: expected.cashExpectedCents,
      hint: `Apertura ${euros(session.openingCents)} + ventas`,
    },
    {
      icon: CreditCard,
      label: 'Tarjeta',
      cents: expected.cardExpectedCents,
      hint: 'Total datáfono esperado',
    },
    {
      icon: Globe,
      label: 'Online',
      cents: expected.onlineExpectedCents,
      hint: 'Stripe (informativo)',
    },
  ]
  return (
    <dl className="divide-y divide-line">
      {rows.map((r) => {
        const Icon = r.icon
        return (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="h-4 w-4 text-ink-2 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[0.8125rem] font-medium text-ink">{r.label}</dt>
                <p className="text-[0.6875rem] text-ink-2 truncate">{r.hint}</p>
              </div>
            </div>
            <dd className="text-[0.9375rem] font-bold text-ink tabular-nums shrink-0">
              {euros(r.cents)}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// -----------------------------------------------------------------------------
// ClosedRegisterPanel — detalle de una caja CERRADA (snapshot del server).
// -----------------------------------------------------------------------------

function ClosedRegisterPanel({ register: r }: { register: ClosedRegister }) {
  const cashDescuadre = r.cashDescuadreCents
  const cardDescuadre = r.cardDescuadreCents
  const snap = r.closingSnapshot
  return (
    <DataPanel
      title={
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: 'var(--text-figure)' }}
        >
          {euros(snap?.totalExpectedCents ?? r.closingCentsExpected ?? 0)}
        </span>
      }
      meta={
        <>
          {format(parseISO(r.openedAt), "d MMM yyyy", { locale: es })} ·
          cerrada a las {format(parseISO(r.closedAt), 'HH:mm', { locale: es })}
          {r.openingCarriedFromSessionId && (
            <span className="text-ink-2">
              {' '}
              · apertura arrastrada ({euros(r.openingCents)})
            </span>
          )}
          {!r.openingCarriedFromSessionId &&
            r.openingCarriedCents !== null &&
            r.openingCarriedCents !== r.openingCents && (
              <span className="text-ink-2">
                {' '}
                · apertura con ajuste manual (sugerido{' '}
                {euros(r.openingCarriedCents)})
              </span>
            )}
          {r.openingManualAdjustmentReason && (
            <span className="text-ink-2">
              {' '}
              · motivo: {r.openingManualAdjustmentReason}
            </span>
          )}
        </>
      }
      headerAside={<StatusBadge variant="closed" />}
      footer={
        <a
          href={`/api/cash/sessions/${r.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface text-ink border border-line hover:border-line-strong hover:bg-overlay transition-colors"
        >
          <Receipt className="h-4 w-4" aria-hidden="true" />
          Descargar reporte PDF
        </a>
      }
    >
      <div className="px-[var(--space-card)] py-4 space-y-3">
        <ClosedSummaryRow
          label="Efectivo"
          expectedCents={r.closingCentsExpected}
          countedCents={r.closingCentsCounted}
          descuadreCents={cashDescuadre}
        />
        <ClosedSummaryRow
          label="Tarjeta (datáfono)"
          expectedCents={r.cardTerminalExpectedCents}
          countedCents={null}
          descuadreCents={cardDescuadre}
        />

        {/* Snapshot completo del cierre — sólo sesiones cerradas POST 0046.
            Las legacy (snapshot === null) siguen viendo el resumen mínimo. */}
        {snap && (
          <ClosingReport
            openingCents={snap.openingCents}
            openedAt={r.openedAt}
            openedByEmail={snap.closedByEmail ?? '—'}
            cashExpectedCents={snap.cashExpectedCents}
            cardExpectedCents={snap.cardExpectedCents}
            onlineExpectedCents={snap.onlineExpectedCents}
            totals={snap.totals}
            byMethod={snap.byMethod}
            byKind={snap.byKind}
            byBarber={snap.byBarber}
            byPaymentDetail={snap.byPaymentDetail}
            movements={snap.movements}
            unknownMethodCount={0}
          />
        )}
      </div>
    </DataPanel>
  )
}

function ClosedSummaryRow({
  label,
  expectedCents,
  countedCents,
  descuadreCents,
}: {
  label: string
  expectedCents: number | null
  countedCents: number | null
  descuadreCents: number | null
}) {
  const tone =
    descuadreCents === null
      ? 'text-ink-2'
      : descuadreCents === 0
      ? 'text-success'
      : 'text-warning'
  const descuadreLabel =
    descuadreCents === null
      ? '—'
      : descuadreCents === 0
      ? 'Cuadra'
      : `${descuadreCents > 0 ? '+' : ''}${euros(descuadreCents)}`
  return (
    <div className="rounded-control border border-line bg-overlay/40 px-3 py-2.5">
      <p className="text-[0.625rem] uppercase tracking-[0.1em] text-ink-2 font-semibold mb-1.5">
        {label}
      </p>
      <div className="grid grid-cols-3 gap-2 text-[0.75rem]">
        <div>
          <p className="text-ink-2">Esperado</p>
          <p className="tabular-nums text-ink font-medium">
            {expectedCents === null ? '—' : euros(expectedCents)}
          </p>
        </div>
        <div>
          <p className="text-ink-2">Contado</p>
          <p className="tabular-nums text-ink font-medium">
            {countedCents === null ? '—' : euros(countedCents)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-ink-2">Descuadre</p>
          <p className={`tabular-nums font-semibold ${tone}`}>{descuadreLabel}</p>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Céntimos → "1.234,56 €" (convención castellana). */
function euros(cents: number): string {
  return `${(cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

// -----------------------------------------------------------------------------
// Modales — abrir caja, cerrar caja, nuevo apunte. Payloads y endpoints
// IDÉNTICOS a la versión CashRegisterPanel previa (lógica de negocio
// intacta); solo el chrome se alinea al lenguaje denso.
// -----------------------------------------------------------------------------

function ModalShell({
  open,
  onClose,
  title,
  size = 'md',
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** Ancho — usar 'xl' para flujos con tabla/reporte interno (cierre caja). */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
}) {
  // Adaptador fino sobre el primitivo canónico Modal (#55). Conserva la
  // firma local (open/onClose/title/children) para no tocar a sus
  // consumidores en este archivo; el header en MAYÚSCULAS tracking se
  // pinta como hijo (el title plano del primitivo no es uppercase).
  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={title}
      size={size}
      zClass="z-[60]"
    >
      <div className="px-5 py-4 border-b border-line">
        <h3 className="text-sm font-semibold text-ink uppercase tracking-[0.08em]">
          {title}
        </h3>
      </div>
      <div className="p-5">{children}</div>
    </Modal>
  )
}

/** Respuesta de GET /api/cash/last-closing — sugerencia de carryover. */
interface CarryoverSuggestion {
  sessionId: string
  closedAt: string
  closingCents: number
}

/** Umbral relativo a partir del cual avisamos al barbero de discrepancia
 *  contra el carryover sugerido. 20% es un equilibrio: deja pasar ajustes
 *  pequeños del cajón pero detecta cuando se introduce un valor MUY distinto
 *  (típico foot-gun: meter el opening del día anterior + ventas por error). */
const CARRYOVER_WARN_THRESHOLD = 0.20

function OpenCashModal({
  open,
  onClose,
  onOpened,
}: {
  open: boolean
  onClose: () => void
  onOpened: () => void
}) {
  const [carryover, setCarryover] = useState<CarryoverSuggestion | null>(null)
  const [loadingCarryover, setLoadingCarryover] = useState(false)
  const [openingEur, setOpeningEur] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al abrir el modal: fetch del último cierre para pre-llenar el input.
  // Si no hay cierre previo (primera apertura) el input arranca vacío y
  // mostramos copy de "Primera apertura".
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingCarryover(true)
    setError(null)
    setAdjustmentReason('')
    void (async () => {
      try {
        const res = await fetch('/api/cash/last-closing', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) {
            setCarryover(null)
            setOpeningEur('')
          }
          return
        }
        const json = (await res.json()) as { carryover: CarryoverSuggestion | null }
        if (cancelled) return
        if (json.carryover) {
          setCarryover(json.carryover)
          setOpeningEur((json.carryover.closingCents / 100).toFixed(2))
        } else {
          setCarryover(null)
          setOpeningEur('')
        }
      } catch {
        if (!cancelled) {
          setCarryover(null)
          setOpeningEur('')
        }
      } finally {
        if (!cancelled) setLoadingCarryover(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const openingNum = Number(openingEur)
  const openingCents = Number.isFinite(openingNum) ? Math.round(openingNum * 100) : null

  // Detecta si el barbero modificó la sugerencia de carryover. Si carryover
  // es null (primera apertura) no aplica.
  const matchesCarryover =
    carryover !== null && openingCents !== null && openingCents === carryover.closingCents

  // Warning de discrepancia: solo si hay carryover Y el valor introducido
  // difiere en >20% del sugerido. Evita falsos positivos en cifras muy
  // pequeñas (de 0€ a 10€ es 100% relativo pero solo 10€ — sigue siendo
  // útil avisar para que el barbero confirme).
  const diffWarn = useMemo(() => {
    if (!carryover || openingCents === null) return false
    if (openingCents === carryover.closingCents) return false
    const base = Math.max(carryover.closingCents, 1)
    const rel = Math.abs(openingCents - carryover.closingCents) / base
    return rel > CARRYOVER_WARN_THRESHOLD
  }, [carryover, openingCents])

  async function submit() {
    setError(null)
    if (openingCents === null || openingCents < 0 || openingCents > 1_000_000) {
      setError('Importe inválido (0 – 10.000 €)')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/cash/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingCents,
          // Sólo enlazamos a la sesión arrastrada si el barbero ACEPTÓ
          // la sugerencia (mismo valor). Si la modificó, no creamos el
          // vínculo formal — el server snapshoteará `openingCarriedCents`
          // igualmente desde la última cerrada para auditoría.
          carriedFromSessionId:
            carryover && matchesCarryover ? carryover.sessionId : null,
          manualAdjustmentReason:
            carryover && !matchesCarryover && adjustmentReason.trim() !== ''
              ? adjustmentReason.trim()
              : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body.error || 'No se pudo abrir la caja'
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success('Caja abierta')
      // El backfill (bookings + ventas existentes del día absorbidos al
      // abrir caja) se refleja al barbero vía el revalidate de SWR en
      // `onOpened`. Antes había aquí un `console.info` con el conteo —
      // quitado: CLAUDE.md global ("No console.* en prod"). Si vuelve a
      // hacer falta como señal de telemetría, integrar con el logger del
      // proyecto (no `console`).
      onOpened()
      onClose()
    } catch {
      const msg = 'Error de red'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Abrir caja del día">
      {/* Carryover info — banner con el saldo arrastrado del último cierre.
          Si no hay carryover (primera apertura) mostramos copy distinto. */}
      <div className="mb-3">
        {loadingCarryover ? (
          <div className="rounded-control border border-line bg-overlay/40 px-3 py-2.5 flex items-center gap-2 text-xs text-ink-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Buscando cierre anterior…
          </div>
        ) : carryover ? (
          <div className="rounded-control border border-brand/30 bg-brand-softer/40 px-3 py-2.5">
            <p className="text-[0.6875rem] uppercase tracking-[0.08em] font-semibold text-ink-2 mb-0.5">
              Saldo arrastrado
            </p>
            <p className="text-[0.8125rem] text-ink leading-relaxed">
              <span className="font-bold tabular-nums">
                {euros(carryover.closingCents)}
              </span>{' '}
              del cierre del{' '}
              {format(parseISO(carryover.closedAt), "d 'de' MMMM", { locale: es })}
              .
            </p>
            <p className="text-[0.6875rem] text-ink-2 mt-1 leading-relaxed">
              Lo que quedó físicamente en el cajón. Modifica si retiraste o
              añadiste efectivo desde entonces.
            </p>
          </div>
        ) : (
          <p className="text-[0.8125rem] text-ink-2 leading-relaxed">
            Primera apertura. Cuánto dinero hay en el cajón al empezar
            (cambio inicial).
          </p>
        )}
      </div>

      <label
        htmlFor="caja-opening"
        className="text-xs font-medium text-ink-2"
      >
        Apertura (€)
      </label>
      <input
        id="caja-opening"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={openingEur}
        onChange={(e) => setOpeningEur(e.target.value)}
        autoFocus
        className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:border-brand outline-none transition-colors tabular-nums"
      />

      {/* Warning de discrepancia grande contra el carryover. */}
      {diffWarn && carryover && (
        <p className="text-xs text-warning mt-2 leading-relaxed">
          Esperábamos {euros(carryover.closingCents)} del cierre anterior.
          Confirma que ese es el efectivo real en el cajón antes de continuar.
        </p>
      )}

      {/* Motivo libre cuando el barbero modificó el carryover sugerido.
          Solo aparece si HAY carryover y el valor no coincide — evita
          ruido en primera apertura. */}
      {carryover && !matchesCarryover && openingCents !== null && (
        <div className="mt-3">
          <label
            htmlFor="caja-adjustment-reason"
            className="text-xs font-medium text-ink-2"
          >
            Motivo del ajuste{' '}
            <span className="text-ink-2">(opcional)</span>
          </label>
          <input
            id="caja-adjustment-reason"
            type="text"
            value={adjustmentReason}
            onChange={(e) => setAdjustmentReason(e.target.value)}
            maxLength={500}
            placeholder="Retiré 50€ al banco, ajuste por arqueo…"
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:border-brand outline-none transition-colors placeholder:text-ink-2"
          />
        </div>
      )}

      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting || loadingCarryover}
        className="btn-primary mt-4 w-full"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Unlock className="h-4 w-4" />
        )}
        Abrir caja
      </button>
    </ModalShell>
  )
}

function CloseCashModal({
  open,
  session,
  expected,
  breakdown,
  onClose,
  onClosed,
}: {
  open: boolean
  session: SessionState
  expected: ExpectedState
  breakdown: MovementBreakdown | null
  onClose: () => void
  onClosed: () => void
}) {
  const [cashCounted, setCashCounted] = useState('')
  const [cardCounted, setCardCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState<null | {
    sessionId: string
    cashExpected: number
    cashCounted: number
    cashDescuadre: number | null
    cardExpected: number
    cardCounted: number | null
    cardDescuadre: number | null
  }>(null)

  useEffect(() => {
    if (open) {
      setCashCounted((expected.cashExpectedCents / 100).toFixed(2))
      setCardCounted('')
      setNotes('')
      setError(null)
      setClosed(null)
    }
  }, [open, expected.cashExpectedCents])

  const cashCountedNum = Number(cashCounted)
  const cardCountedNum = cardCounted.trim() === '' ? null : Number(cardCounted)
  const cashDescuadre = Number.isFinite(cashCountedNum)
    ? Math.round(cashCountedNum * 100) - expected.cashExpectedCents
    : null
  const cardDescuadre =
    cardCountedNum !== null && Number.isFinite(cardCountedNum)
      ? Math.round(cardCountedNum * 100) - expected.cardExpectedCents
      : null

  async function submit() {
    setError(null)
    if (!Number.isFinite(cashCountedNum) || cashCountedNum < 0) {
      setError('Importe contado inválido')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/cash/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closingCentsCounted: Math.round(cashCountedNum * 100),
          cardTerminalCountedCents:
            cardCountedNum !== null && Number.isFinite(cardCountedNum)
              ? Math.round(cardCountedNum * 100)
              : null,
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body.error || 'No se pudo cerrar la caja'
        setError(msg)
        toast.error(msg)
        return
      }
      const data = (await res.json()) as {
        session: { id: string }
        summary: {
          cashExpectedCents: number
          cashCountedCents: number
          cashDescuadreCents: number | null
          cardExpectedCents: number
          cardCountedCents: number | null
          cardDescuadreCents: number | null
        }
      }
      setClosed({
        sessionId: data.session.id,
        cashExpected: data.summary.cashExpectedCents,
        cashCounted: data.summary.cashCountedCents,
        cashDescuadre: data.summary.cashDescuadreCents,
        cardExpected: data.summary.cardExpectedCents,
        cardCounted: data.summary.cardCountedCents,
        cardDescuadre: data.summary.cardDescuadreCents,
      })
      toast.success('Caja cerrada')
    } catch {
      const msg = 'Error de red'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function finish() {
    onClosed()
    onClose()
  }

  if (closed) {
    return (
      <ModalShell open={open} onClose={finish} title="Caja cerrada" size="xl">
        <div className="space-y-4">
          <div className="rounded-xl border border-success/30 bg-success/10 p-3">
            <p className="text-sm font-semibold text-success inline-flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Cierre registrado
            </p>
            <p className="text-xs text-ink-2 mt-0.5">
              Guarda el reporte para tu archivo o pásaselo al gestor si hay
              descuadre.
            </p>
          </div>

          <ClosedSummaryRow
            label="Efectivo"
            expectedCents={closed.cashExpected}
            countedCents={closed.cashCounted}
            descuadreCents={closed.cashDescuadre}
          />
          <ClosedSummaryRow
            label="Tarjeta (datáfono)"
            expectedCents={closed.cardExpected}
            countedCents={closed.cardCounted}
            descuadreCents={closed.cardDescuadre}
          />

          <a
            href={`/api/cash/sessions/${closed.sessionId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full"
          >
            <Receipt className="h-4 w-4" />
            Descargar reporte PDF
          </a>

          <button
            type="button"
            onClick={finish}
            className="btn-secondary w-full"
          >
            Hecho
          </button>
        </div>
      </ModalShell>
    )
  }

  // Bloqueamos el cierre si hay movimientos con método legacy/NULL — el
  // cuadre saldría torcido (ya lo blindamos también server-side en
  // /api/cash/close, pero la UI da el feedback inmediato).
  const blocked = (breakdown?.unknownMethodCount ?? 0) > 0

  return (
    <ModalShell open={open} onClose={onClose} title="Cerrar caja del día" size="xl">
      <div className="space-y-4">
        {/* Reporte completo del día — Reni quiere ver TODO antes de pulsar
            "Cerrar caja". Mismo componente que la pestaña Resumen del panel
            principal (single source of truth). Si por algún motivo la API
            no devolvió breakdown (race condition con polling), caemos a un
            placeholder mínimo en lugar de petar. */}
        {breakdown ? (
          <ClosingReport
            openingCents={session.openingCents}
            openedAt={session.openedAt}
            openedByEmail={session.openedByEmail}
            cashExpectedCents={expected.cashExpectedCents}
            cardExpectedCents={expected.cardExpectedCents}
            onlineExpectedCents={expected.onlineExpectedCents}
            totals={breakdown.totals}
            byMethod={breakdown.byMethod}
            byKind={breakdown.byKind}
            byBarber={breakdown.byBarber}
            byPaymentDetail={breakdown.byPaymentDetail}
            movements={breakdown.movements}
            unknownMethodCount={breakdown.unknownMethodCount}
          />
        ) : (
          <div className="rounded-xl border border-line bg-overlay/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-2 mb-1">
              Esperado
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-2">Efectivo</span>
                <span className="tabular-nums font-medium text-ink">
                  {euros(expected.cashExpectedCents)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-2">Tarjeta</span>
                <span className="tabular-nums font-medium text-ink">
                  {euros(expected.cardExpectedCents)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="caja-cash-counted"
            className="text-xs font-medium text-ink-2"
          >
            Efectivo contado en cajón (€)
          </label>
          <input
            id="caja-cash-counted"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cashCounted}
            onChange={(e) => setCashCounted(e.target.value)}
            autoFocus
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:border-brand outline-none transition-colors tabular-nums"
          />
          {cashDescuadre !== null && (
            <p
              className={`text-xs mt-1 ${
                cashDescuadre === 0 ? 'text-success' : 'text-warning'
              }`}
            >
              {cashDescuadre === 0
                ? 'Cuadra exacto'
                : `Descuadre: ${cashDescuadre > 0 ? '+' : ''}${euros(cashDescuadre)}`}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="caja-card-counted"
            className="text-xs font-medium text-ink-2"
          >
            Total datáfono / TPV (€){' '}
            <span className="text-ink-2">(opcional)</span>
          </label>
          <input
            id="caja-card-counted"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cardCounted}
            onChange={(e) => setCardCounted(e.target.value)}
            placeholder="Si tienes datáfono, mete el total que dice"
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:border-brand outline-none transition-colors tabular-nums placeholder:text-ink-2"
          />
          {cardDescuadre !== null && (
            <p
              className={`text-xs mt-1 ${
                cardDescuadre === 0 ? 'text-success' : 'text-warning'
              }`}
            >
              {cardDescuadre === 0
                ? 'Cuadra con la app'
                : `Descuadre: ${cardDescuadre > 0 ? '+' : ''}${euros(cardDescuadre)}`}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="caja-close-notes"
            className="text-xs font-medium text-ink-2"
          >
            Notas (opcional)
          </label>
          <textarea
            id="caja-close-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:border-brand outline-none transition-colors resize-none"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || blocked}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-ink text-surface hover:bg-ink/90 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {blocked ? 'Corrige movimientos antes de cerrar' : 'Cerrar caja'}
        </button>
      </div>
    </ModalShell>
  )
}

interface NewMovementModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const MOVEMENT_KINDS_FOR_MANUAL: Array<{
  kind: Exclude<MovementKind, 'booking' | 'product_sale'>
  label: string
  description: string
  defaultMethod: PaymentMethod
  icon: typeof Banknote
}> = [
  {
    kind: 'expense',
    label: 'Gasto',
    description: 'Pagado a proveedor / café / consumible',
    defaultMethod: 'cash',
    icon: Receipt,
  },
  {
    kind: 'withdrawal',
    label: 'Retirada',
    description: 'Sacar dinero del cajón al banco / bolsillo',
    defaultMethod: 'cash',
    icon: ArrowUpFromLine,
  },
  {
    kind: 'deposit',
    label: 'Aporte',
    description: 'Meter cambio extra al cajón',
    defaultMethod: 'cash',
    icon: ArrowDownToLine,
  },
  {
    kind: 'tip_cash',
    label: 'Propina (efectivo)',
    description: 'El cliente dejó propina en mano',
    defaultMethod: 'cash',
    icon: Heart,
  },
  {
    kind: 'adjustment',
    label: 'Ajuste',
    description: 'Corrección manual del cuadre',
    defaultMethod: 'cash',
    icon: Sliders,
  },
]

interface BarberOption {
  id: string
  name: string
  active: boolean
}

const barberOptionsFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ barbers: BarberOption[] }>)

function NewMovementModal({ open, onClose, onCreated }: NewMovementModalProps) {
  const [kind, setKind] = useState<MovementKind>('expense')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [amountEur, setAmountEur] = useState('')
  const [notes, setNotes] = useState('')
  const [barberId, setBarberId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Barberos activos del tenant — necesarios para el selector de tip_cash
  // (Reni V1: la propina es 100% del barbero, atribuirla es obligatorio).
  // SWR solo dispara cuando el modal está abierto para no fetchear de más.
  const { data: barbersData, isLoading: loadingBarbers } = useSWR(
    open ? '/api/barbers' : null,
    barberOptionsFetcher,
  )
  const activeBarbers = useMemo(
    () => (barbersData?.barbers ?? []).filter((b) => b.active),
    [barbersData],
  )

  useEffect(() => {
    if (open) {
      setKind('expense')
      setMethod('cash')
      setAmountEur('')
      setNotes('')
      setBarberId('')
      setError(null)
    }
  }, [open])

  // Cuando entra a tip_cash, prefill al primer barbero si solo hay 1 (caso
  // Solo) — ahorra un click. Con equipo (≥2) lo deja vacío para forzar
  // decisión consciente.
  useEffect(() => {
    if (kind === 'tip_cash' && barberId === '' && activeBarbers.length === 1) {
      setBarberId(activeBarbers[0].id)
    }
  }, [kind, barberId, activeBarbers])

  async function submit() {
    setError(null)
    const amount = Number(amountEur)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Importe inválido')
      return
    }

    // Propina cash → endpoint dedicado que crea tip + cash_movement atómico.
    if (kind === 'tip_cash') {
      if (!barberId) {
        setError('Elige el barbero de la propina')
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch('/api/tips/cash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCents: Math.round(amount * 100),
            barberId,
            notes: notes.trim() || undefined,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const msg = body.error || 'No se pudo registrar la propina'
          setError(msg)
          toast.error(msg)
          return
        }
        toast.success('Propina registrada')
        onCreated()
        onClose()
      } catch {
        const msg = 'Error de red'
        setError(msg)
        toast.error(msg)
      } finally {
        setSubmitting(false)
      }
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/cash/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          method,
          amountCents: Math.round(amount * 100),
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body.error || 'No se pudo registrar el apunte'
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success('Apunte registrado')
      onCreated()
      onClose()
    } catch {
      const msg = 'Error de red'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Nuevo apunte de caja">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-ink-2 mb-1">Tipo</p>
          <div className="grid grid-cols-1 gap-1.5">
            {MOVEMENT_KINDS_FOR_MANUAL.map((opt) => {
              const selected = kind === opt.kind
              return (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => {
                    setKind(opt.kind)
                    setMethod(opt.defaultMethod)
                  }}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    selected
                      ? 'border-brand bg-brand-softer/40 text-ink'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                  }`}
                >
                  <opt.icon className="h-3.5 w-3.5 text-brand shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold">{opt.label}</p>
                    <p className="text-[0.6875rem] text-ink-2 truncate">
                      {opt.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {kind === 'tip_cash' ? (
          // Propina en cash → barbero obligatorio (100% suya). El método es
          // siempre 'cash' (no se muestran tabs — la propia opción ya lo dice).
          <div>
            <label
              htmlFor="caja-movement-barber"
              className="text-xs font-medium text-ink-2"
            >
              Barbero <span className="text-danger">*</span>
            </label>
            <select
              id="caja-movement-barber"
              value={barberId}
              onChange={(e) => setBarberId(e.target.value)}
              disabled={loadingBarbers}
              className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:border-brand outline-none transition-colors disabled:opacity-60"
            >
              <option value="">
                {loadingBarbers ? 'Cargando equipo…' : 'Elige barbero'}
              </option>
              {activeBarbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {activeBarbers.length === 0 && !loadingBarbers && (
              <p className="mt-1 text-[10px] text-ink-3">
                Crea un barbero en Equipo antes de registrar propinas en efectivo.
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium text-ink-2 mb-1">Método</p>
            <div className="flex gap-1 bg-overlay border border-line rounded-lg p-1">
              {(['cash', 'card', 'online'] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    method === m
                      ? 'bg-surface shadow-sm text-ink'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {PAYMENT_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="caja-movement-amount"
            className="text-xs font-medium text-ink-2"
          >
            Importe (€)
          </label>
          <input
            id="caja-movement-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amountEur}
            onChange={(e) => setAmountEur(e.target.value)}
            autoFocus
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:border-brand outline-none transition-colors tabular-nums"
          />
        </div>

        <div>
          <label
            htmlFor="caja-movement-notes"
            className="text-xs font-medium text-ink-2"
          >
            Notas (opcional)
          </label>
          <input
            id="caja-movement-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Concepto del apunte"
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:border-brand outline-none transition-colors placeholder:text-ink-2"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn-primary w-full"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Registrar apunte
        </button>
      </div>
    </ModalShell>
  )
}
