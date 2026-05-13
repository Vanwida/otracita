'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, UserX, AlertCircle, Loader2 } from 'lucide-react'
import PaymentMethodPrompt, { type CashPaymentMethod } from './PaymentMethodPrompt'
import SumupCheckoutPrompt from './SumupCheckoutPrompt'
import { pushUndoToast } from './UndoToast'

// -----------------------------------------------------------------------------
// PendingClosureList — citas confirmadas de días pasados sin cerrar.
//
// Vive en /dashboard como sección destacada (encima del AttentionPanel).
// Permite al barbero cerrar al final del día (o al día siguiente) sin
// tener que ir a agenda y abrir una a una. Cada fila tiene 2 botones:
//
//   · "Completada"  → PATCH /api/bookings/[id] { status: 'completed' }
//                    Dispara auto-facturación en background (servicio +
//                    productos vendidos durante la cita).
//   · "No vino"     → POST /api/bookings/no-show
//                    Marca no-show, anula factura si la hubiera, suma al
//                    contador del cliente (reputation).
//
// Tras cada acción, hacemos optimistic remove de la fila local + router.refresh
// en background para que la lista del servidor se mantenga sincronizada
// con KPIs y AttentionPanel.
//
// Ventana de deshacer (5s) — añadida por /impeccable harden:
//   · Path simple "Completada" (sin caja efectivo) → la PATCH se programa
//     para dentro de 5s. La fila desaparece optimista; si el barbero
//     pulsa "Deshacer" en el toast, la PATCH nunca se llama y la fila
//     vuelve. Si cierra el navegador antes de 5s, la acción se pierde —
//     el cron safety-net (3d) la cierra automáticamente.
//   · Path "No vino" → la POST se llama inmediatamente (servidor anula la
//     factura, suma no-show al contador). Toast ofrece deshacer vía
//     /api/bookings/undo-no-show, que revierte status, restaura factura y
//     resta no-show del cliente.
//   · Caja efectivo (modal) y SumUp (datáfono) → sin ventana de deshacer.
//     El barbero ya hizo input deliberado (eligió método o cobró tarjeta);
//     un undo aquí descuadraria caja o reembolsaría una tarjeta real.
// -----------------------------------------------------------------------------

export interface PendingClosureBooking {
  id: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  customerName: string | null
  customerPhone: string
  service: string
  barber: string | null
  /** Precio en EUROS (foot-gun del schema). Null si la cita no tiene precio. */
  price: number | null
}

interface Props {
  bookings: PendingClosureBooking[]
  todayStr: string // YYYY-MM-DD
  yesterdayStr: string // YYYY-MM-DD
  /** Cuando true, al "Completada" pedimos método de pago para alimentar caja. */
  cashRegisterEnabled?: boolean
  /** SumUp+Reader pareados → cobro instantáneo Cloud API en vez de modal manual. */
  sumupReaderConnected?: boolean
}

export default function PendingClosureList({
  bookings,
  todayStr,
  yesterdayStr,
  cashRegisterEnabled = false,
  sumupReaderConnected = false,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [errorId, setErrorId] = useState<{ id: string; message: string } | null>(null)
  const [pendingClosureBooking, setPendingClosureBooking] = useState<PendingClosureBooking | null>(null)
  const [sumupBooking, setSumupBooking] = useState<PendingClosureBooking | null>(null)

  const visible = bookings.filter((b) => !removedIds.has(b.id))
  if (visible.length === 0) return null

  function removeOptimistic(id: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  function restoreOptimistic(id: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function patchComplete(
    b: PendingClosureBooking,
    method: CashPaymentMethod | null,
    opts: { skipOptimisticRemove?: boolean } = {},
  ) {
    setBusyId(b.id)
    setErrorId(null)
    try {
      const res = await fetch(`/api/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          method ? { status: 'completed', paymentMethod: method } : { status: 'completed' },
        ),
      })
      if (!res.ok) {
        if (opts.skipOptimisticRemove) {
          // El toast ya quitó la fila optimista. Restaurar para que el
          // barbero vea el error y pueda reintentar.
          restoreOptimistic(b.id)
        }
        const body = await res.json().catch(() => ({}))
        setErrorId({ id: b.id, message: body.error || 'No se ha podido cerrar la cita. Vuelve a intentarlo.' })
        return
      }
      if (!opts.skipOptimisticRemove) {
        removeOptimistic(b.id)
      }
      setPendingClosureBooking(null)
      startTransition(() => router.refresh())
    } catch {
      if (opts.skipOptimisticRemove) restoreOptimistic(b.id)
      setErrorId({ id: b.id, message: 'Sin conexión. Revisa tu wifi e inténtalo otra vez.' })
    } finally {
      setBusyId(null)
    }
  }

  function markCompleted(b: PendingClosureBooking) {
    if (!cashRegisterEnabled) {
      // Path simple: optimistic remove + commit en 5s vía toast.
      removeOptimistic(b.id)
      pushUndoToast({
        message: 'Cita cerrada',
        onCommit: () => patchComplete(b, null, { skipOptimisticRemove: true }),
        onUndo: () => restoreOptimistic(b.id),
      })
      return
    }
    if (sumupReaderConnected && b.price && b.price > 0) {
      setSumupBooking(b)
    } else {
      setPendingClosureBooking(b)
    }
  }

  async function markNoShow(b: PendingClosureBooking) {
    setBusyId(b.id)
    setErrorId(null)
    removeOptimistic(b.id)
    try {
      const res = await fetch('/api/bookings/no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id }),
      })
      if (!res.ok) {
        restoreOptimistic(b.id)
        const body = await res.json().catch(() => ({}))
        setErrorId({ id: b.id, message: body.error || 'No se ha podido marcar. Vuelve a intentarlo.' })
        return
      }
      pushUndoToast({
        message: 'Marcado como no vino',
        onUndo: async () => {
          restoreOptimistic(b.id)
          try {
            await fetch('/api/bookings/undo-no-show', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: b.id }),
            })
          } finally {
            startTransition(() => router.refresh())
          }
        },
      })
      startTransition(() => router.refresh())
    } catch {
      restoreOptimistic(b.id)
      setErrorId({ id: b.id, message: 'Sin conexión. Revisa tu wifi e inténtalo otra vez.' })
    } finally {
      setBusyId(null)
    }
  }

  function dayLabel(date: string): string {
    if (date === yesterdayStr) return 'Ayer'
    if (date === todayStr) return 'Hoy'
    return 'Anteayer'
  }

  return (
    <section className="mb-6 bg-surface border border-line rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <AlertCircle className="h-4 w-4 text-ink-2" aria-hidden="true" />
        <h2 className="text-xs font-semibold text-ink uppercase tracking-[0.18em]">
          Citas por cerrar
        </h2>
      </div>
      <p className="text-xs text-ink-2 mb-4 leading-relaxed">
        Marca quién vino y quién no. Tienes 5 segundos para deshacer cada acción.
      </p>

      <PaymentMethodPrompt
        open={pendingClosureBooking !== null}
        onClose={() => setPendingClosureBooking(null)}
        onPick={(m) => pendingClosureBooking && void patchComplete(pendingClosureBooking, m)}
        subtitle={
          pendingClosureBooking
            ? `${pendingClosureBooking.service}. ${pendingClosureBooking.customerName ?? pendingClosureBooking.customerPhone}`
            : undefined
        }
        pending={busyId !== null && busyId === pendingClosureBooking?.id}
      />

      {sumupBooking && sumupBooking.price != null && sumupBooking.price > 0 && (
        <SumupCheckoutPrompt
          open={sumupBooking !== null}
          bookingId={sumupBooking.id}
          amountCents={Math.round(sumupBooking.price * 100)}
          subtitle={`${sumupBooking.service}. ${sumupBooking.customerName ?? sumupBooking.customerPhone}`}
          onClose={() => setSumupBooking(null)}
          onSettled={() => {
            const id = sumupBooking.id
            removeOptimistic(id)
            startTransition(() => router.refresh())
          }}
          onFallback={() => {
            setPendingClosureBooking(sumupBooking)
            setSumupBooking(null)
          }}
        />
      )}

      <ul className="space-y-2">
        {visible.map((b) => {
          const isBusy = busyId === b.id
          const customerLine = b.customerName?.trim() || b.customerPhone
          const barberLine = b.barber ? ` · ${b.barber}` : ''
          const error = errorId?.id === b.id ? errorId.message : null
          return (
            <li
              key={b.id}
              className="rounded-xl bg-canvas border border-line p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">
                  <span className="text-ink-2 font-normal mr-1.5">{dayLabel(b.date)} · {b.time}</span>
                  {customerLine}
                </p>
                <p className="text-xs text-ink-2 truncate">
                  {b.service}
                  {barberLine}
                </p>
                {error && <p className="text-xs text-danger mt-1">{error}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => markCompleted(b)}
                  disabled={isBusy}
                  className="btn-primary btn-sm"
                >
                  {isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Completada
                </button>
                <button
                  type="button"
                  onClick={() => markNoShow(b)}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface hover:border-danger hover:text-danger px-3 py-2 text-xs font-semibold text-ink-2 transition-colors disabled:opacity-60 disabled:cursor-wait min-h-[40px]"
                >
                  <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                  No vino
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
