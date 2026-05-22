'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, CreditCard, UserX, AlertCircle, Loader2 } from 'lucide-react'
import ChargeFlow from './ChargeFlow'
import { pushUndoToast } from './UndoToast'
import { formatCents } from '@/lib/format'

// -----------------------------------------------------------------------------
// PendingClosureList — citas confirmadas de días pasados sin cerrar.
//
// Vive en /dashboard como sección destacada (encima del AttentionPanel).
// Permite al barbero cerrar al final del día (o al día siguiente) sin
// tener que ir a agenda y abrir una a una. Cada fila tiene 2 botones:
//
//   · "Cobrar"    → abre ChargeFlow (motor unificado de cobro de la épica
//                    Reni). Selección de método/fraccionado + propina inline.
//                    Al éxito: optimistic remove de la fila + router.refresh.
//   · "Completar" → cuando la cita no tiene precio (cortesía/gratis): PATCH
//                    directo /api/bookings/[id] { status: 'completed' } con
//                    ventana de undo 5s (mismo patrón legacy).
//   · "No vino"   → POST /api/bookings/no-show. Marca no-show, anula factura
//                    si la hubiera, suma al contador del cliente.
//
// Tras cada acción, hacemos optimistic remove + router.refresh para
// mantener KPIs y AttentionPanel sincronizados.
// -----------------------------------------------------------------------------

export interface PendingClosureBooking {
  id: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  customerName: string | null
  customerPhone: string
  service: string
  barber: string | null
  /** ID del barbero (para atribuir propina). Null si no asignado. */
  barberId?: string | null
  /** Precio en EUROS (foot-gun del schema). Null si la cita no tiene precio. */
  price: number | null
}

interface BarberMin {
  id: string
  displayName: string
}

interface Props {
  bookings: PendingClosureBooking[]
  todayStr: string // YYYY-MM-DD
  yesterdayStr: string // YYYY-MM-DD
  /** Barberos activos — para atribuir tip en ChargeFlow cuando la cita no
   *  tiene barbero fijo. Si no se pasan, el tip prompt forzará al barbero
   *  a elegir uno (o la cita ya tiene barberId). */
  barbers?: BarberMin[]
  /** Tenant tiene Stripe Connect activo → método `card_online` visible. */
  stripeConnectActive?: boolean
  /** Sesión de caja abierta hoy → suprime warning "caja cerrada". */
  cashSessionOpen?: boolean
}

export default function PendingClosureList({
  bookings,
  todayStr,
  yesterdayStr,
  barbers = [],
  stripeConnectActive = false,
  cashSessionOpen = true,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [errorId, setErrorId] = useState<{ id: string; message: string } | null>(null)
  const [chargeBooking, setChargeBooking] = useState<PendingClosureBooking | null>(null)

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

  // Cierre sin cobro (cita cortesía / gratis). Mantiene la ventana de
  // deshacer del flow legacy: si el barbero se equivoca, 5s para revertir.
  function closeFree(b: PendingClosureBooking) {
    removeOptimistic(b.id)
    pushUndoToast({
      message: 'Cita cerrada',
      onCommit: async () => {
        try {
          const res = await fetch(`/api/bookings/${b.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' }),
          })
          if (!res.ok) {
            restoreOptimistic(b.id)
            const body = await res.json().catch(() => ({}))
            setErrorId({
              id: b.id,
              message: body.error || 'No se pudo cerrar la cita.',
            })
            return
          }
          startTransition(() => router.refresh())
        } catch {
          restoreOptimistic(b.id)
          setErrorId({
            id: b.id,
            message: 'Sin conexión. Revisa tu wifi e inténtalo otra vez.',
          })
        }
      },
      onUndo: () => restoreOptimistic(b.id),
    })
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
        Cobra o marca quién no vino. Las acciones sin cobro tienen 5 segundos para deshacerse.
      </p>

      {/* ChargeFlow — único motor de cobro. Reutiliza la lógica del panel
          de agenda; aquí se invoca para cerrar una cita desde Inicio sin
          tener que entrar a su detalle. */}
      {chargeBooking && chargeBooking.price !== null && chargeBooking.price > 0 && (
        <ChargeFlow
          booking={{
            id: chargeBooking.id,
            price: chargeBooking.price,
            customerName: chargeBooking.customerName,
            barberId: chargeBooking.barberId ?? null,
            serviceLabel: chargeBooking.service,
          }}
          barbers={barbers}
          stripeConnectActive={stripeConnectActive}
          cashSessionOpen={cashSessionOpen}
          open={chargeBooking !== null}
          onClose={() => setChargeBooking(null)}
          onCharged={() => {
            const id = chargeBooking.id
            removeOptimistic(id)
            setChargeBooking(null)
            startTransition(() => router.refresh())
          }}
        />
      )}

      <ul className="space-y-2">
        {visible.map((b) => {
          const isBusy = busyId === b.id
          const customerLine = b.customerName?.trim() || b.customerPhone
          const barberLine = b.barber ? ` · ${b.barber}` : ''
          const error = errorId?.id === b.id ? errorId.message : null
          const hasPrice = b.price !== null && b.price > 0
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
                  {hasPrice && (
                    <>
                      <span className="text-ink-3 mx-1">·</span>
                      <span className="tabular-nums text-ink">
                        {formatCents(Math.round((b.price ?? 0) * 100))}
                      </span>
                    </>
                  )}
                </p>
                {error && <p className="text-xs text-danger mt-1">{error}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasPrice ? (
                  <button
                    type="button"
                    onClick={() => setChargeBooking(b)}
                    disabled={isBusy}
                    className="btn-primary btn-sm"
                  >
                    {isBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Cobrar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => closeFree(b)}
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
                )}
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
