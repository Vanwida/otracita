'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, UserX, AlertCircle, Loader2 } from 'lucide-react'
import PaymentMethodPrompt, { type CashPaymentMethod } from './PaymentMethodPrompt'

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
// -----------------------------------------------------------------------------

export interface PendingClosureBooking {
  id: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  customerName: string | null
  customerPhone: string
  service: string
  barber: string | null
}

interface Props {
  bookings: PendingClosureBooking[]
  todayStr: string // YYYY-MM-DD
  yesterdayStr: string // YYYY-MM-DD
  /** Cuando true, al "Completada" pedimos método de pago para alimentar caja. */
  cashRegisterEnabled?: boolean
}

export default function PendingClosureList({ bookings, todayStr, yesterdayStr, cashRegisterEnabled = false }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Tracks ids being processed para mostrar spinner sin bloquear el resto.
  const [busyId, setBusyId] = useState<string | null>(null)
  // Filas que ya hemos resuelto en este render (optimistic). Tras refresh
  // del server este state se reinicia con la nueva lista.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [errorId, setErrorId] = useState<{ id: string; message: string } | null>(null)
  // Para el modal de método cuando hay caja activa.
  const [pendingClosureBooking, setPendingClosureBooking] = useState<PendingClosureBooking | null>(null)

  const visible = bookings.filter((b) => !removedIds.has(b.id))
  if (visible.length === 0) return null

  async function patchComplete(b: PendingClosureBooking, method: CashPaymentMethod | null) {
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
        const body = await res.json().catch(() => ({}))
        setErrorId({ id: b.id, message: body.error || 'No se pudo cerrar.' })
        return
      }
      setRemovedIds((prev) => {
        const next = new Set(prev)
        next.add(b.id)
        return next
      })
      setPendingClosureBooking(null)
      startTransition(() => router.refresh())
    } catch {
      setErrorId({ id: b.id, message: 'Error de red' })
    } finally {
      setBusyId(null)
    }
  }

  function markCompleted(b: PendingClosureBooking) {
    if (cashRegisterEnabled) {
      setPendingClosureBooking(b)
    } else {
      void patchComplete(b, null)
    }
  }

  async function markNoShow(b: PendingClosureBooking) {
    setBusyId(b.id)
    setErrorId(null)
    try {
      const res = await fetch('/api/bookings/no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorId({ id: b.id, message: body.error || 'No se pudo marcar como no-show.' })
        return
      }
      setRemovedIds((prev) => {
        const next = new Set(prev)
        next.add(b.id)
        return next
      })
      startTransition(() => router.refresh())
    } catch {
      setErrorId({ id: b.id, message: 'Error de red' })
    } finally {
      setBusyId(null)
    }
  }

  function dayLabel(date: string): string {
    if (date === yesterdayStr) return 'Ayer'
    if (date === todayStr) return 'Hoy'
    // Anteayer (rango de la query) — calculamos diff para etiquetar.
    return 'Anteayer'
  }

  return (
    <section className="mb-6 bg-warning/5 border border-warning/30 rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <AlertCircle className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">
          Citas por cerrar
        </h2>
      </div>
      <p className="text-xs text-ink-3 mb-3 leading-relaxed">
        Marca si vinieron o no. Al completar se emite la factura con servicio + productos vendidos.
      </p>

      <PaymentMethodPrompt
        open={pendingClosureBooking !== null}
        onClose={() => setPendingClosureBooking(null)}
        onPick={(m) => pendingClosureBooking && void patchComplete(pendingClosureBooking, m)}
        subtitle={
          pendingClosureBooking
            ? `${pendingClosureBooking.service} · ${pendingClosureBooking.customerName ?? pendingClosureBooking.customerPhone}`
            : undefined
        }
        pending={busyId !== null && busyId === pendingClosureBooking?.id}
      />

      <ul className="space-y-2">
        {visible.map((b) => {
          const isBusy = busyId === b.id
          const customerLine = b.customerName?.trim() || b.customerPhone
          const barberLine = b.barber ? ` · ${b.barber}` : ''
          const error = errorId?.id === b.id ? errorId.message : null
          return (
            <li
              key={b.id}
              className="rounded-xl bg-surface border border-line p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">
                  <span className="text-ink-3 font-normal mr-1.5">{dayLabel(b.date)} · {b.time}</span>
                  {customerLine}
                </p>
                <p className="text-xs text-ink-3 truncate">
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
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand hover:bg-brand-strong px-3 py-1.5 text-xs font-semibold text-brand-ink transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Completada
                </button>
                <button
                  type="button"
                  onClick={() => markNoShow(b)}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface hover:border-danger hover:text-danger px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  <UserX className="h-3.5 w-3.5" />
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
