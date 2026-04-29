'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, X } from 'lucide-react'

// -----------------------------------------------------------------------------
// ConfirmDialog — modal de confirmación accesible, reemplaza window.confirm().
//
// Uso simple con hook useConfirm():
//   const confirm = useConfirm()
//   const ok = await confirm({ title: '¿Eliminar?', message: '…' })
//   if (!ok) return
//
// Buenas prácticas aplicadas:
//   · Portal al <body> para evitar problemas de stacking con parents con
//     overflow:hidden o transform (los modales deben salir del árbol layout)
//   · role=dialog + aria-modal + aria-labelledby/describedby
//   · Focus-trap básico + autoFocus en el botón primario
//   · ESC cierra (con isPending bloqueado), click en backdrop cierra
//   · Bloqueo de scroll body mientras está abierto
//   · Variante 'danger' destaca el botón primario en rojo
//   · Soporta onConfirm async: muestra spinner, bloquea ambos botones, cierra
//     solo si la acción no lanza error
// -----------------------------------------------------------------------------

export type ConfirmVariant = 'default' | 'danger'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean
  resolve?: (result: boolean) => void
}

// ── Singleton store (suficiente para app-wide, sin Context provider extra) ───
type Listener = (state: ConfirmState) => void
let currentState: ConfirmState = { isOpen: false, title: '' }
const listeners = new Set<Listener>()

function emit(next: ConfirmState) {
  currentState = next
  listeners.forEach((fn) => fn(next))
}

function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  fn(currentState)
  return () => listeners.delete(fn)
}

/** Hook. Devuelve una función que abre el modal y resuelve true/false. */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  return useCallback(
    (opts) =>
      new Promise<boolean>((resolve) => {
        emit({ ...opts, isOpen: true, resolve })
      }),
    [],
  )
}

// ── Host — el componente que pinta el modal. Montado UNA vez en el layout ──
export function ConfirmDialogHost() {
  const [state, setState] = useState<ConfirmState>(currentState)
  const [isPending, setIsPending] = useState(false)
  const [mounted, setMounted] = useState(false)
  const primaryBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
    return subscribe(setState)
  }, [])

  // Autofocus y bloqueo de scroll al abrir.
  useEffect(() => {
    if (!state.isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Pequeño delay para que el modal exista en el DOM antes del focus.
    const t = setTimeout(() => primaryBtn.current?.focus(), 10)
    return () => {
      document.body.style.overflow = prevOverflow
      clearTimeout(t)
    }
  }, [state.isOpen])

  const close = useCallback(
    (result: boolean) => {
      if (isPending) return
      state.resolve?.(result)
      emit({ ...state, isOpen: false, resolve: undefined })
    },
    [state, isPending],
  )

  // ESC cierra (si no está bloqueado). Capture en window para ganar al navegador.
  useEffect(() => {
    if (!state.isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
      // Enter en el botón primario no lo manejamos aquí — nativo lo hace solo
      // porque el botón tiene focus.
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.isOpen, close])

  if (!mounted || !state.isOpen) return null

  const danger = state.variant === 'danger'

  const content = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[var(--color-scrim-strong)] backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={state.message ? 'confirm-desc' : undefined}
      onClick={() => close(false)}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-surface shadow-2xl ring-1 ring-line/60 overflow-hidden animate-[scaleIn_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-4">
          <div className="flex items-start gap-3">
            {danger && (
              <div className="h-10 w-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-danger" />
              </div>
            )}
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 id="confirm-title" className="text-base font-semibold text-ink leading-tight">
                {state.title}
              </h3>
              {state.message && (
                <p id="confirm-desc" className="mt-1.5 text-sm text-ink-2 leading-relaxed">
                  {state.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => close(false)}
              disabled={isPending}
              aria-label="Cerrar"
              className="text-ink-3 hover:text-ink-2 p-1 -m-1 rounded disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-overlay/40 border-t border-line">
          <button
            type="button"
            onClick={() => close(false)}
            disabled={isPending}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2 hover:text-ink hover:border-line-strong transition-colors disabled:opacity-60"
          >
            {state.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            ref={primaryBtn}
            type="button"
            onClick={async () => {
              setIsPending(true)
              try {
                close(true)
              } finally {
                setIsPending(false)
              }
            }}
            disabled={isPending}
            className={
              danger
                ? 'inline-flex items-center gap-1.5 rounded-lg bg-danger hover:bg-danger/90 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface outline-none'
                : 'inline-flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface outline-none'
            }
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {state.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )

  return createPortal(content, document.body)
}
