'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Undo2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// UndoToast — toast con ventana de 5s para deshacer una acción optimista.
//
// Por qué existe: el barbero atiende a clientes con dedos sucios y prisa.
// Una pulsación tonta en "Marcar completada" emite una factura legal
// (VeriFactu, hash encadenado). Una en "No vino" anula la factura y suma
// un punto al contador del cliente. Reglas duras de PRODUCT.md:
// "esto funciona, no te marees" — no podemos castigar las pulsaciones
// rápidas. Una ventana de 5s con "Deshacer" lo resuelve sin caer en
// confirms ("are you sure?") que los power-users odian.
//
// Patrones de uso (pattern A vs pattern B):
//
//   Pattern A — "schedule and commit later":
//     pushUndoToast({
//       message: 'Cita cerrada',
//       onCommit: async () => fetch('/api/bookings/...', { method: 'PATCH', ... }),
//     })
//
//     onCommit dispara DESPUÉS de 5s si no hay undo. Si el usuario pulsa
//     "Deshacer", onCommit nunca se ejecuta. El estado en el cliente debe
//     hacer remove optimista (la fila desaparece) y restore on undo.
//
//   Pattern B — "apply now, undo retroactively":
//     pushUndoToast({
//       message: 'Cliente marcado como no-show',
//       onUndo: async () => fetch('/api/bookings/undo-no-show', { method: 'POST', ... }),
//     })
//
//     La acción ya se aplicó al servidor antes de pushUndoToast. Si el
//     usuario pulsa "Deshacer", onUndo dispara un endpoint de reversión.
//
// Pueden coexistir: pasar AMBOS onCommit y onUndo si la lógica lo necesita,
// pero el caso típico es exclusivo (A o B según el endpoint disponible).
//
// Singleton: un toast a la vez. Si llega un push mientras hay uno pendiente,
// el anterior se commitea inmediatamente. Esto previene cuelgues si el
// usuario clickea dos botones en sucesión rápida.
// -----------------------------------------------------------------------------

const DEFAULT_DURATION_MS = 5000

export interface UndoToastOptions {
  /** Mensaje principal del toast — castellano informal, frase corta. */
  message: string
  /** Pattern A: se ejecuta tras `duration` ms si el usuario no deshace. */
  onCommit?: () => void | Promise<void>
  /** Pattern B: se ejecuta si el usuario pulsa "Deshacer". */
  onUndo?: () => void | Promise<void>
  /** Override del default 5000ms. Se ignora si <500ms (sin tiempo a deshacer). */
  duration?: number
}

interface ToastState {
  id: number
  message: string
  startedAt: number
  duration: number
  onCommit?: () => void | Promise<void>
  onUndo?: () => void | Promise<void>
}

type Listener = () => void

let currentToast: ToastState | null = null
let nextId = 1
const listeners = new Set<Listener>()

function emit(next: ToastState | null) {
  currentToast = next
  listeners.forEach((fn) => fn())
}

// Suscripción al singleton via useSyncExternalStore — patrón canónico para
// external stores en React 18+. Evita los warnings de set-state-in-effect.
function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function getSnapshot(): ToastState | null {
  return currentToast
}

// SSR safe: en server no hay store, devolvemos null.
function getServerSnapshot(): ToastState | null {
  return null
}

/**
 * Empuja un toast con ventana de undo. Si ya había un toast pendiente, lo
 * commitea (ejecuta su onCommit) inmediatamente antes de mostrar el nuevo.
 */
export function pushUndoToast(opts: UndoToastOptions): void {
  // Si hay un toast pendiente con onCommit, lo ejecutamos ya — no podemos
  // mantener dos a la vez sin que el usuario se confunda.
  const previous = currentToast
  if (previous?.onCommit) {
    void Promise.resolve(previous.onCommit()).catch(() => {
      // El error de commit del toast anterior no debe tumbar el nuevo flujo.
    })
  }

  const duration = Math.max(500, opts.duration ?? DEFAULT_DURATION_MS)
  emit({
    id: nextId++,
    message: opts.message,
    startedAt: Date.now(),
    duration,
    onCommit: opts.onCommit,
    onUndo: opts.onUndo,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Host — montado UNA vez en dashboard/layout.tsx. Renderiza el toast actual.
// ─────────────────────────────────────────────────────────────────────────────

export function UndoToastHost() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [mounted, setMounted] = useState(false)

  // La barra de progreso se anima vía ref directo (no state) para evitar
  // re-renders cada 50ms. Aceptamos que no sea reactiva al toast inicial:
  // el efecto sincroniza la transformación al montar y en cada tick.
  const progressBarRef = useRef<HTMLSpanElement | null>(null)
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Patrón SSR-safe para portals: server renderiza null, cliente renderiza
    // el toast tras montar. Sin esta gate, hydration mismatch en createPortal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  // Cada vez que cambia el toast actual: limpiar timers, programar nuevos.
  useEffect(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current)
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)

    if (!toast) return

    if (progressBarRef.current) {
      progressBarRef.current.style.transform = 'scaleX(1)'
    }

    commitTimerRef.current = setTimeout(() => {
      const t = currentToast
      if (!t || t.id !== toast.id) return
      void Promise.resolve(t.onCommit?.()).catch(() => {
        // Errores del commit los maneja el caller via su propio state.
        // El toast solo dismissa.
      })
      emit(null)
    }, toast.duration)

    // Tick para actualizar la barra de progreso (cada 50ms) por ref directo.
    tickIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - toast.startedAt
      const remaining = Math.max(0, 1 - elapsed / toast.duration)
      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${remaining})`
      }
    }, 50)

    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current)
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
    }
  }, [toast])

  function handleUndo() {
    if (!toast) return
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current)
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
    void Promise.resolve(toast.onUndo?.()).catch(() => {
      // onUndo errors son responsabilidad del caller.
    })
    emit(null)
  }

  if (!mounted || !toast) return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] max-w-[calc(100vw-2rem)]"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="flex items-center gap-3 bg-surface border border-line rounded-xl shadow-warm-strong pl-4 pr-2 py-2 min-w-[280px]">
        <p className="text-sm text-ink flex-1 truncate font-medium">{toast.message}</p>
        <button
          type="button"
          onClick={handleUndo}
          className="relative inline-flex items-center gap-1.5 rounded-lg bg-brand-softer hover:bg-brand-soft px-3 py-2 text-xs font-bold uppercase tracking-[0.15em] text-brand-strong transition-colors min-h-[40px]"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          Deshacer
          <span
            ref={progressBarRef}
            aria-hidden="true"
            className="absolute -bottom-1 left-1.5 right-1.5 h-0.5 bg-brand rounded-full origin-left motion-reduce:hidden"
            style={{ transform: 'scaleX(1)', transition: 'transform 50ms linear' }}
          />
        </button>
      </div>
    </div>,
    document.body,
  )
}
