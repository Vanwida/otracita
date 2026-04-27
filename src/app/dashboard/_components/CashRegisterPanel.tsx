'use client'

import { useEffect, useState, useTransition } from 'react'
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
  X,
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

// -----------------------------------------------------------------------------
// CashRegisterPanel — UI de "Caja del día" en /dashboard/caja.
//
// Vive solo si client.cashRegisterEnabled === true. Renderiza:
//
//   1. Estado actual (abierta/cerrada) + apertura
//   2. Saldos esperados en tiempo real por método (cash/card/online)
//   3. Lista de movimientos del día
//   4. Form manual para apuntes (gasto, retirada, propina cash, aporte)
//   5. Modales de Abrir caja y Cerrar caja
//
// Polling: refrescamos /api/cash/current cada 15s para que las ventas
// nuevas (booking completed o product sale) aparezcan sin recargar.
// -----------------------------------------------------------------------------

interface SessionState {
  id: string
  openingCents: number
  openedAt: string
  openedByEmail: string
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
}

export default function CashRegisterPanel() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
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

  if (loading) {
    return (
      <section className="bg-surface border border-line rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 text-ink-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando caja…
        </div>
      </section>
    )
  }

  const session = data?.session ?? null

  if (!session) {
    return (
      <section className="bg-surface border border-line rounded-2xl p-5 md:p-6 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-ink uppercase tracking-widest mb-0.5">
              Caja del día
            </h2>
            <p className="text-xs text-ink-3">
              No hay caja abierta. Ábrela al empezar la jornada para llevar el cuadre.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpenModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors"
          >
            <Unlock className="h-4 w-4" />
            Abrir caja
          </button>
        </div>

        <OpenCashModal
          open={openModalOpen}
          onClose={() => setOpenModalOpen(false)}
          onOpened={refresh}
        />
      </section>
    )
  }

  const expected = data?.expected ?? { cashExpectedCents: 0, cardExpectedCents: 0, onlineExpectedCents: 0 }
  const movements = data?.movements ?? []

  return (
    <section className="bg-surface border border-line rounded-2xl mb-6 overflow-hidden">
      {/* Cabecera con estado abierto + acciones */}
      <header className="px-5 py-4 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-ink uppercase tracking-widest mb-0.5 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
            Caja abierta
          </h2>
          <p className="text-xs text-ink-3">
            Desde las {format(parseISO(session.openedAt), 'HH:mm', { locale: es })} ·
            apertura {(session.openingCents / 100).toFixed(2)} €
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMovementModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:border-line-strong px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Apunte
          </button>
          <button
            type="button"
            onClick={() => setCloseModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink/90 hover:bg-ink px-3 py-1.5 text-xs font-semibold text-surface transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            Cerrar caja
          </button>
        </div>
      </header>

      {/* Saldos esperados por método */}
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-line">
        <ExpectedCard
          icon={Banknote}
          label="Efectivo"
          amount={expected.cashExpectedCents}
          hint={`Apertura ${(session.openingCents / 100).toFixed(2)} € + ventas`}
        />
        <ExpectedCard
          icon={CreditCard}
          label="Tarjeta"
          amount={expected.cardExpectedCents}
          hint="Total datáfono esperado"
        />
        <ExpectedCard
          icon={Globe}
          label="Online"
          amount={expected.onlineExpectedCents}
          hint="Stripe (informativo)"
        />
      </div>

      {/* Lista de movimientos */}
      <div className="px-5 py-4">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-2">
          Movimientos del día ({movements.length})
        </h3>
        {movements.length === 0 ? (
          <p className="text-xs text-ink-3 italic">Sin movimientos todavía. Las ventas y apuntes aparecerán aquí.</p>
        ) : (
          <ul className="divide-y divide-line">
            {movements.map((m) => (
              <MovementRowItem key={m.id} movement={m} />
            ))}
          </ul>
        )}
      </div>

      {/* Modales */}
      <CloseCashModal
        open={closeModalOpen}
        session={session}
        expected={expected}
        onClose={() => setCloseModalOpen(false)}
        onClosed={refresh}
      />
      <NewMovementModal
        open={movementModalOpen}
        onClose={() => setMovementModalOpen(false)}
        onCreated={refresh}
      />
    </section>
  )
}

// -----------------------------------------------------------------------------
// Subcomponentes
// -----------------------------------------------------------------------------

interface ExpectedCardProps {
  icon: typeof Banknote
  label: string
  amount: number
  hint: string
}

function ExpectedCard({ icon: Icon, label, amount, hint }: ExpectedCardProps) {
  return (
    <div className="rounded-xl border border-line bg-overlay/40 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-ink-3" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
          {label}
        </span>
      </div>
      <p className="text-2xl font-semibold text-ink tabular-nums">
        {(amount / 100).toFixed(2)} €
      </p>
      <p className="text-[11px] text-ink-3 mt-0.5">{hint}</p>
    </div>
  )
}

function MovementRowItem({ movement: m }: { movement: MovementRow }) {
  const incoming = isIncoming(m.kind)
  const sign = incoming ? '+' : '−'
  const tone = incoming ? 'text-ink' : 'text-danger'
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink truncate">
          <span className="text-ink-3 font-normal mr-1.5">
            {format(parseISO(m.createdAt), 'HH:mm')}
          </span>
          {MOVEMENT_KIND_LABELS[m.kind]}
        </p>
        <p className="text-[11px] text-ink-3 truncate">
          {PAYMENT_METHOD_LABELS[m.method]}
          {m.notes ? ` · ${m.notes}` : ''}
        </p>
      </div>
      <span className={`tabular-nums font-semibold ${tone}`}>
        {sign}{(m.amountCents / 100).toFixed(2)} €
      </span>
    </li>
  )
}

// -----------------------------------------------------------------------------
// Modales — abrir caja, cerrar caja, nuevo apunte manual
// -----------------------------------------------------------------------------

function ModalShell({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface border border-line rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink uppercase tracking-widest">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-overlay text-ink-3 hover:text-ink-2 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function OpenCashModal({
  open,
  onClose,
  onOpened,
}: {
  open: boolean
  onClose: () => void
  onOpened: () => void
}) {
  const [openingEur, setOpeningEur] = useState('50')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const opening = Number(openingEur)
    if (!Number.isFinite(opening) || opening < 0 || opening > 10000) {
      setError('Importe inválido (0 – 10.000 €)')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/cash/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingCents: Math.round(opening * 100) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'No se pudo abrir la caja')
        return
      }
      // Si /open hizo backfill de citas/ventas previas a la apertura,
      // aprovechamos el response para informarlo en consola — la UI
      // se refresca al volver al panel y muestra los movimientos.
      const data = await res.json().catch(() => null)
      if (data?.backfilled) {
        const { bookings: nb, productSales: nps } = data.backfilled as {
          bookings: number
          productSales: number
        }
        if (nb + nps > 0) {
          console.info(
            `[caja] Backfill: ${nb} bookings + ${nps} ventas importados al cuadre del día.`,
          )
        }
      }
      onOpened()
      onClose()
    } catch {
      setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Abrir caja del día">
      <p className="text-xs text-ink-3 mb-3 leading-relaxed">
        Cuánto dinero hay en el cajón al empezar (cambio inicial).
      </p>
      <label className="text-[11px] font-medium text-ink-2">Apertura (€)</label>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={openingEur}
        onChange={(e) => setOpeningEur(e.target.value)}
        autoFocus
        className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors tabular-nums"
      />
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
        Abrir caja
      </button>
    </ModalShell>
  )
}

function CloseCashModal({
  open,
  expected,
  onClose,
  onClosed,
}: {
  open: boolean
  /** Reservada para futura UX (mostrar opening al cerrar). */
  session: SessionState
  expected: ExpectedState
  onClose: () => void
  onClosed: () => void
}) {
  const [cashCounted, setCashCounted] = useState('')
  const [cardCounted, setCardCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tras cierre exitoso pasamos a "success" — mostramos resumen + botón
  // descarga de PDF + opción de salir. Hasta que el usuario cierre el
  // modal explícitamente, el panel padre no refresca (no perdemos el id).
  const [closed, setClosed] = useState<null | {
    sessionId: string
    cashExpected: number
    cashCounted: number
    cashDescuadre: number | null
    cardExpected: number
    cardCounted: number | null
    cardDescuadre: number | null
  }>(null)

  // Sugerimos los expected en los inputs al abrir el modal.
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
        setError(body.error || 'No se pudo cerrar la caja')
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
    } catch {
      setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  function finish() {
    onClosed()
    onClose()
  }

  // Pantalla de éxito tras el cierre — resumen + descarga PDF.
  if (closed) {
    return (
      <ModalShell open={open} onClose={finish} title="Caja cerrada">
        <div className="space-y-4">
          <div className="rounded-xl border border-success/30 bg-success/10 p-3">
            <p className="text-sm font-semibold text-success inline-flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Cierre registrado
            </p>
            <p className="text-[11px] text-ink-3 mt-0.5">
              Guarda el reporte para tu archivo o pásaselo al gestor si hay descuadre.
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
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors"
          >
            <Receipt className="h-4 w-4" />
            Descargar reporte PDF
          </a>

          <button
            type="button"
            onClick={finish}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface hover:border-line-strong px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors"
          >
            Hecho
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Cerrar caja del día">
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-overlay/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-1">Esperado</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-3">Efectivo</span>
              <span className="tabular-nums font-medium text-ink">
                {(expected.cashExpectedCents / 100).toFixed(2)} €
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-3">Tarjeta</span>
              <span className="tabular-nums font-medium text-ink">
                {(expected.cardExpectedCents / 100).toFixed(2)} €
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-ink-2">Efectivo contado en cajón (€)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cashCounted}
            onChange={(e) => setCashCounted(e.target.value)}
            autoFocus
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors tabular-nums"
          />
          {cashDescuadre !== null && (
            <p className={`text-[11px] mt-1 ${cashDescuadre === 0 ? 'text-success' : 'text-warning'}`}>
              {cashDescuadre === 0
                ? '✓ Cuadra exacto'
                : `Descuadre: ${cashDescuadre > 0 ? '+' : ''}${(cashDescuadre / 100).toFixed(2)} €`}
            </p>
          )}
        </div>

        <div>
          <label className="text-[11px] font-medium text-ink-2">
            Total datáfono / TPV (€) <span className="text-ink-3">— opcional</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cardCounted}
            onChange={(e) => setCardCounted(e.target.value)}
            placeholder="Si tienes datáfono, mete el total que dice"
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors tabular-nums placeholder:text-ink-3"
          />
          {cardDescuadre !== null && (
            <p className={`text-[11px] mt-1 ${cardDescuadre === 0 ? 'text-success' : 'text-warning'}`}>
              {cardDescuadre === 0
                ? '✓ Cuadra con la app'
                : `Descuadre: ${cardDescuadre > 0 ? '+' : ''}${(cardDescuadre / 100).toFixed(2)} €`}
            </p>
          )}
        </div>

        <div>
          <label className="text-[11px] font-medium text-ink-2">Notas (opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors resize-none"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ink/90 hover:bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-colors disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Cerrar caja
        </button>
      </div>
    </ModalShell>
  )
}

function ClosedSummaryRow({
  label,
  expectedCents,
  countedCents,
  descuadreCents,
}: {
  label: string
  expectedCents: number
  countedCents: number | null
  descuadreCents: number | null
}) {
  const tone =
    descuadreCents === null
      ? 'text-ink-3'
      : descuadreCents === 0
      ? 'text-success'
      : 'text-warning'
  const descuadreLabel =
    descuadreCents === null
      ? '—'
      : descuadreCents === 0
      ? 'Cuadra'
      : `${descuadreCents > 0 ? '+' : ''}${(descuadreCents / 100).toFixed(2)} €`
  return (
    <div className="rounded-xl border border-line bg-overlay/40 p-3 grid grid-cols-3 gap-2 text-xs">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">{label}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] text-ink-3">Esperado</p>
        <p className="tabular-nums text-ink">{(expectedCents / 100).toFixed(2)} €</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] text-ink-3">Contado</p>
        <p className="tabular-nums text-ink">
          {countedCents === null ? '—' : `${(countedCents / 100).toFixed(2)} €`}
        </p>
        <p className={`tabular-nums text-[11px] mt-0.5 font-semibold ${tone}`}>{descuadreLabel}</p>
      </div>
    </div>
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
  { kind: 'expense', label: 'Gasto', description: 'Pagado a proveedor / café / consumible', defaultMethod: 'cash', icon: Receipt },
  { kind: 'withdrawal', label: 'Retirada', description: 'Sacar dinero del cajón al banco / bolsillo', defaultMethod: 'cash', icon: ArrowUpFromLine },
  { kind: 'deposit', label: 'Aporte', description: 'Meter cambio extra al cajón', defaultMethod: 'cash', icon: ArrowDownToLine },
  { kind: 'tip_cash', label: 'Propina (efectivo)', description: 'El cliente dejó propina en mano', defaultMethod: 'cash', icon: Heart },
  { kind: 'adjustment', label: 'Ajuste', description: 'Corrección manual del cuadre', defaultMethod: 'cash', icon: Sliders },
]

function NewMovementModal({ open, onClose, onCreated }: NewMovementModalProps) {
  const [kind, setKind] = useState<MovementKind>('expense')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [amountEur, setAmountEur] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setKind('expense')
      setMethod('cash')
      setAmountEur('')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function submit() {
    setError(null)
    const amount = Number(amountEur)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Importe inválido')
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
        setError(body.error || 'No se pudo registrar el apunte')
        return
      }
      onCreated()
      onClose()
    } catch {
      setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Nuevo apunte de caja">
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-medium text-ink-2 mb-1 block">Tipo</label>
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
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    selected
                      ? 'border-brand bg-brand-softer/40 text-ink'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                  }`}
                >
                  <opt.icon className="h-3.5 w-3.5 text-brand shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold">{opt.label}</p>
                    <p className="text-[11px] text-ink-3 truncate">{opt.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-ink-2 mb-1 block">Método</label>
          <div className="flex gap-1 bg-overlay border border-line rounded-lg p-1">
            {(['cash', 'card', 'online'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  method === m ? 'bg-surface shadow-sm text-ink' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-ink-2">Importe (€)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amountEur}
            onChange={(e) => setAmountEur(e.target.value)}
            autoFocus
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors tabular-nums"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-ink-2">Notas (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Concepto del apunte"
            className="mt-1 w-full bg-overlay border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors placeholder:text-ink-3"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Registrar apunte
        </button>
      </div>
    </ModalShell>
  )
}
