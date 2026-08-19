'use client'

import { useState } from 'react'
import {
  Loader2,
  Check,
  Heart,
  Banknote,
  CreditCard,
  CircleDot,
  CheckCircle2,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import DataTable, { type Column } from '@/app/dashboard/_components/DataTable'
import Modal from '@/app/dashboard/_components/Modal'
import { formatCents } from '@/lib/format'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// TipsList — listado de propinas cobradas con asignación de barbero (fix #7)
// y estado de liquidación al barbero (épica Reni #28 parte 3b).
//
// Cada fila muestra:
//   · Fecha · Cliente · Importe · Método (cash/card)
//   · Estado pago al barbero: "Pendiente" (paid_out_at IS NULL) o "Pagada"
//     (con fecha + tooltip con método + email del jefe que la marcó).
//   · Barbero (select reasignable)
//   · Acción icon-only: marcar pagada (abre mini-modal) o deshacer pago.
//
// Guardado vía:
//   · PATCH /api/tips/[id]         → reasignar barbero (legacy).
//   · POST /api/tips/payout        → marcar pagada (un id por fila).
//   · POST /api/tips/payout/undo   → deshacer.
//
// Optimista con rollback si la API falla, mismo patrón que la reasignación
// de barbero. La idempotencia la garantiza el endpoint (re-marcar una ya
// pagada → 409, deshacer una ya pendiente → updated:0 sin error).
// -----------------------------------------------------------------------------

export interface TipRow {
  id: string
  amountCents: number
  customerPhone: string
  barberName: string | null
  /**
   * Método de pago. Filas legacy pre-V1 vienen con NULL y se renderizan como
   * 'card' implícito (todas eran Stripe Checkout antes del split Reni V1).
   */
  paymentMethod: 'cash' | 'card' | null
  paidAt: string | null
  createdAt: string
  /** Épica Reni #28 parte 3b — estado de liquidación al barbero. */
  paidOutAt: string | null
  paidOutMethod: 'cash' | 'transfer' | 'card_payroll' | null
  paidOutByEmail: string | null
}

interface Props {
  tips: TipRow[]
  /** Nombres de los barberos activos del tenant (para el selector). */
  barberNames: string[]
}

// `formatEur` antes definido localmente — ahora consume el formatter
// compartido (`@/lib/format`, opt `compact`). UI densa de propinas → omitimos
// los ",00" cuando es entero (3 € en vez de 3,00 €) para encajar más filas
// en pantalla. Fuente única para todo el dashboard.
const formatEur = (cents: number) => formatCents(cents, { compact: true })

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso))
}

const PAYOUT_METHOD_LABEL: Record<
  NonNullable<TipRow['paidOutMethod']>,
  string
> = {
  cash: 'cash en mano',
  transfer: 'transferencia',
  card_payroll: 'en su nómina',
}

const UNASSIGNED = '__none__'

type PayoutMethod = 'cash' | 'transfer' | 'card_payroll'

interface PayoutModalState {
  tip: TipRow
  method: PayoutMethod
  submitting: boolean
}

export default function TipsList({ tips, barberNames }: Props) {
  const [rows, setRows] = useState<TipRow[]>(tips)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [payout, setPayout] = useState<PayoutModalState | null>(null)
  const [payoutError, setPayoutError] = useState<string | null>(null)
  const [undoingId, setUndoingId] = useState<string | null>(null)

  async function assign(tipId: string, value: string) {
    const barberName = value === UNASSIGNED ? null : value
    const prev = rows
    // Optimista.
    setRows((r) =>
      r.map((t) => (t.id === tipId ? { ...t, barberName } : t)),
    )
    setSavingId(tipId)
    setSavedId(null)
    try {
      const res = await fetch(`/api/tips/${tipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barberName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRows(prev) // rollback
        toast.error(data?.error || 'No se pudo asignar la propina.')
        return
      }
      setSavedId(tipId)
      toast.success('Propina asignada')
      setTimeout(() => setSavedId((s) => (s === tipId ? null : s)), FEEDBACK_MS.copied)
    } catch {
      setRows(prev)
      toast.error('Error de red. La propina no se asignó.')
    } finally {
      setSavingId(null)
    }
  }

  async function confirmPayout() {
    if (!payout || payout.submitting) return
    const { tip, method } = payout
    setPayout({ ...payout, submitting: true })
    setPayoutError(null)
    try {
      const res = await fetch('/api/tips/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipIds: [tip.id], method }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setPayout({ ...payout, submitting: false })
        setPayoutError(data.error ?? 'No se pudo marcar el pago.')
        return
      }
      // Optimista: pinta como pagada AHORA (servidor ya respondió ok).
      const now = new Date().toISOString()
      setRows((r) =>
        r.map((t) =>
          t.id === tip.id
            ? {
                ...t,
                paidOutAt: now,
                paidOutMethod: method,
                paidOutByEmail: t.paidOutByEmail ?? 'tú',
              }
            : t,
        ),
      )
      setPayout(null)
      toast.success('Propina marcada como pagada')
    } catch {
      setPayout({ ...payout, submitting: false })
      setPayoutError('Error de red. Inténtalo de nuevo.')
    }
  }

  async function undoPayout(tipId: string) {
    const prev = rows
    setUndoingId(tipId)
    // Optimista.
    setRows((r) =>
      r.map((t) =>
        t.id === tipId
          ? { ...t, paidOutAt: null, paidOutMethod: null, paidOutByEmail: null }
          : t,
      ),
    )
    try {
      const res = await fetch('/api/tips/payout/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipIds: [tipId] }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setRows(prev)
        toast.error(data.error ?? 'No se pudo deshacer el pago.')
        return
      }
      toast.success('Pago deshecho')
    } catch {
      setRows(prev)
      toast.error('Error de red. No se pudo deshacer.')
    } finally {
      setUndoingId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-xl p-6 text-center text-sm text-ink-3">
        Aún no hay propinas cobradas.
      </div>
    )
  }

  return (
    <>
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-line flex items-center gap-2">
          <Heart className="h-4 w-4 text-gold" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink">Propinas cobradas</h2>
          <span className="text-xs text-ink-3">
            · asígnalas al barbero y márcalas como pagadas cuando se las hayas entregado
          </span>
        </header>

        {/* DataTable consume el chrome canónico (sticky head, zebra/hover por
            tokens). Patrón responsive: columna "Cliente" oculta en <sm
            (teléfono ya cabe junto a la fecha); "Fecha" oculta en <md (el
            barbero suele ver propinas del día/semana en curso). */}
        <DataTable<TipRow>
          ariaLabel="Propinas cobradas"
          rows={rows}
          rowKey={(t) => t.id}
          columns={TIP_COLUMNS({
            formatEur,
            formatDate,
            assign,
            savingId,
            savedId,
            barberNames,
            onMarkPaid: (tip) =>
              setPayout({
                tip,
                method: tip.paymentMethod === 'cash' ? 'cash' : 'card_payroll',
                submitting: false,
              }),
            onUndoPayout: undoPayout,
            undoingId,
          })}
        />
      </div>

      {/* Mini-modal de método para una sola fila. Mismo lenguaje que el
          modal lote en /informes/nominas (método + confirmación). */}
      {payout && (
        <Modal
          open
          onClose={() => {
            if (payout.submitting) return
            setPayout(null)
            setPayoutError(null)
          }}
          title="Marcar propina como pagada"
          subtitle={`${formatEur(payout.tip.amountCents)} · ${payout.tip.barberName ?? 'sin asignar'}`}
          size="md"
          closeOnBackdrop={!payout.submitting}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayout(null)
                  setPayoutError(null)
                }}
                disabled={payout.submitting}
                className="min-h-11 px-3 py-2 rounded-lg text-sm text-ink-2 hover:text-ink hover:bg-overlay transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPayout}
                disabled={payout.submitting}
                className="inline-flex items-center justify-center gap-2 min-h-11 rounded-lg bg-brand text-canvas hover:bg-brand-strong px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {payout.submitting && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Confirmar
              </button>
            </div>
          }
        >
          <div className="px-5 py-4 space-y-2">
            <p className="text-sm text-ink-2 mb-3">
              ¿Cómo le pagas esta propina al barbero?
            </p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Método de pago</legend>
              {/* card_payroll solo si la propina es card (regla del endpoint). */}
              {payout.tip.paymentMethod !== 'cash' && (
                <PayoutMethodOption
                  value="card_payroll"
                  current={payout.method}
                  onChange={(v) => setPayout({ ...payout, method: v })}
                  label="Incluir en la nómina del mes"
                  hint="Se sumará al neto que cobra el barbero a fin de mes."
                  disabled={payout.submitting}
                />
              )}
              <PayoutMethodOption
                value="transfer"
                current={payout.method}
                onChange={(v) => setPayout({ ...payout, method: v })}
                label="Transferencia"
                hint="Le harás un Bizum o transferencia aparte."
                disabled={payout.submitting}
              />
              <PayoutMethodOption
                value="cash"
                current={payout.method}
                onChange={(v) => setPayout({ ...payout, method: v })}
                label="Cash en mano"
                hint="Le entregas el efectivo cuando lo veas."
                disabled={payout.submitting}
              />
            </fieldset>

            {payoutError && (
              <p
                role="alert"
                className="mt-3 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2"
              >
                {payoutError}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

// Opción radio del mini-modal — espejo del de Payroll.tsx (mismo lenguaje
// visual y de copy). Vive aquí en local para no acoplar componentes de UI
// distintos a un primitivo compartido prematuro.
function PayoutMethodOption({
  value,
  current,
  onChange,
  label,
  hint,
  disabled,
}: {
  value: PayoutMethod
  current: PayoutMethod
  onChange: (v: PayoutMethod) => void
  label: string
  hint: string
  disabled?: boolean
}) {
  const selected = current === value
  return (
    <label
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors min-h-11 ${
        selected
          ? 'border-brand bg-brand-softer/40 ring-1 ring-brand/30'
          : 'border-line hover:bg-overlay/40'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <input
        type="radio"
        name="payout-method-row"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-3 mt-0.5">{hint}</span>
      </span>
    </label>
  )
}

// Builder factory — las columnas necesitan acceso al estado y a los
// handlers de la fila. Encapsulado fuera del JSX para que `DataTable<Row>`
// reciba un array tipado limpio sin closures inline en cada render.
function TIP_COLUMNS({
  formatEur,
  formatDate,
  assign,
  savingId,
  savedId,
  barberNames,
  onMarkPaid,
  onUndoPayout,
  undoingId,
}: {
  formatEur: (cents: number) => string
  formatDate: (iso: string | null) => string
  assign: (tipId: string, value: string) => Promise<void>
  savingId: string | null
  savedId: string | null
  barberNames: string[]
  onMarkPaid: (tip: TipRow) => void
  onUndoPayout: (tipId: string) => Promise<void>
  undoingId: string | null
}): Column<TipRow>[] {
  return [
    {
      key: 'date',
      header: 'Fecha',
      className: 'hidden md:table-cell',
      cell: (t) => (
        <span className="text-ink-2 tabular-nums whitespace-nowrap">
          {formatDate(t.paidAt ?? t.createdAt)}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      className: 'hidden sm:table-cell',
      cell: (t) => <span className="text-ink-2 tabular-nums">{t.customerPhone}</span>,
    },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      numeric: true,
      cell: (t) => <span className="font-semibold text-ink">{formatEur(t.amountCents)}</span>,
    },
    {
      key: 'method',
      header: 'Método',
      align: 'center',
      // Filas legacy (paymentMethod NULL) se renderizan como 'card' implícito
      // — antes del split V1 todas las propinas venían por Stripe Checkout.
      // R-T3: el `title` aclara la diferencia de liquidación (cash = ya
      // entregada en mano; card = pendiente vía nómina).
      cell: (t) => {
        const method = t.paymentMethod ?? 'card'
        if (method === 'cash') {
          return (
            <span
              title="Entregada en mano al barbero por el cliente"
              className="inline-flex items-center gap-1 rounded-full bg-brand-softer/50 text-brand-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
            >
              <Banknote className="h-2.5 w-2.5" aria-hidden="true" />
              Cash
            </span>
          )
        }
        return (
          <span
            title="Cobrada por la barbería; pendiente de pagar al barbero"
            className="inline-flex items-center gap-1 rounded-full bg-overlay text-ink-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
          >
            <CreditCard className="h-2.5 w-2.5" aria-hidden="true" />
            Card
          </span>
        )
      },
    },
    {
      // Épica Reni #28 parte 3b — estado de liquidación al barbero.
      key: 'payout-status',
      header: 'Estado pago',
      align: 'center',
      cell: (t) => {
        if (t.paidOutAt) {
          const methodLabel = t.paidOutMethod
            ? PAYOUT_METHOD_LABEL[t.paidOutMethod]
            : '—'
          const byEmail = t.paidOutByEmail ?? '—'
          return (
            <span
              title={`Pagada al barbero (${methodLabel}) por ${byEmail}`}
              className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
            >
              <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
              {formatShortDate(t.paidOutAt)}
            </span>
          )
        }
        return (
          <span
            title="Aún no marcada como pagada al barbero"
            className="inline-flex items-center gap-1 rounded-full bg-overlay text-ink-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
          >
            <CircleDot className="h-2.5 w-2.5" aria-hidden="true" />
            Pendiente
          </span>
        )
      },
    },
    {
      key: 'barber',
      header: 'Barbero',
      cell: (t) => (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`tip-barber-${t.id}`}>
            Barbero de esta propina
          </label>
          <select
            id={`tip-barber-${t.id}`}
            value={t.barberName ?? UNASSIGNED}
            onChange={(e) => assign(t.id, e.target.value)}
            disabled={savingId === t.id}
            className="bg-surface border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink focus:border-brand outline-none transition-colors disabled:opacity-60"
          >
            <option value={UNASSIGNED}>Sin asignar</option>
            {barberNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {savingId === t.id && (
            <Loader2 className="h-3.5 w-3.5 text-ink-3 animate-spin shrink-0" aria-label="Guardando" />
          )}
          {savedId === t.id && savingId !== t.id && (
            <Check className="h-3.5 w-3.5 text-success shrink-0" aria-label="Guardado" />
          )}
        </div>
      ),
    },
    {
      // Acción icon-only por fila. Hit target ≥44px vía padding p-2.5 (el
      // botón completo mide 36px, queda dentro del row height). Mobile-first.
      key: 'action',
      header: '',
      align: 'right',
      cell: (t) => {
        if (t.paidOutAt) {
          return (
            <button
              type="button"
              onClick={() => onUndoPayout(t.id)}
              disabled={undoingId === t.id}
              title="Deshacer el pago al barbero"
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-ink-3 hover:text-ink-2 hover:bg-overlay transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              aria-label="Deshacer pago al barbero"
            >
              {undoingId === t.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="h-3.5 w-3.5" />
              )}
            </button>
          )
        }
        // Pendiente: solo permitimos marcar si tiene barbero asignado (es
        // raro marcar como pagada sin saber a quién, y el endpoint igual la
        // marca pero la auditoría queda manca). UX: deshabilitamos con
        // tooltip explicativo en vez de ocultar (descubrible).
        const disabled = !t.barberName
        return (
          <button
            type="button"
            onClick={() => onMarkPaid(t)}
            disabled={disabled}
            title={
              disabled
                ? 'Asigna primero un barbero a esta propina'
                : 'Marcar como pagada al barbero'
            }
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-brand hover:bg-brand-softer/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label="Marcar propina como pagada"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )
      },
    },
  ]
}
