'use client'

import { Banknote, CreditCard, Globe, Loader2, ArrowLeft } from 'lucide-react'
import Modal from './Modal'

// -----------------------------------------------------------------------------
// PaymentMethodPrompt — modal pequeño para elegir cash/card/online al
// completar una cita cuando el barbero tiene caja efectivo activa.
//
// Reusable en BookingDetailPanel (agenda) y PendingClosureList (Inicio).
// El parent controla la visibilidad y maneja el confirm.
// -----------------------------------------------------------------------------

export type CashPaymentMethod = 'cash' | 'card' | 'online'

interface Props {
  open: boolean
  onClose: () => void
  /** Llamada cuando el barbero elige un método. */
  onPick: (method: CashPaymentMethod) => void
  /** Texto secundario opcional (cliente / servicio). */
  subtitle?: string
  /** Estado de loading mientras el parent procesa la confirmación. */
  pending?: boolean
}

export default function PaymentMethodPrompt({ open, onClose, onPick, subtitle, pending }: Props) {
  // ESC + scrim-close los gestiona Modal; closeOnBackdrop={!pending}
  // preserva el guard de "no cerrar mientras procesa el cobro".
  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="¿Cómo se cobró?"
      size="sm"
      zClass="z-[60]"
      closeOnBackdrop={!pending}
    >
        {/* Header propio (mayúsculas tracking, estilo prompt de cobro). */}
        <div className="px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-ink uppercase tracking-widest">
            ¿Cómo se cobró?
          </h3>
          {subtitle && <p className="text-xs text-ink-3 mt-0.5 truncate">{subtitle}</p>}
        </div>

        <div className="p-4 grid grid-cols-1 gap-2">
          <MethodButton
            icon={Banknote}
            label="Efectivo"
            description="Dinero en mano, va al cajón."
            onClick={() => onPick('cash')}
            disabled={pending}
          />
          <MethodButton
            icon={CreditCard}
            label="Tarjeta"
            description="Cobrado con datáfono físico."
            onClick={() => onPick('card')}
            disabled={pending}
          />
          <MethodButton
            icon={Globe}
            label="Online"
            description="Stripe / link de pago."
            onClick={() => onPick('online')}
            disabled={pending}
          />
        </div>

        {/* Volver — A3: salir del prompt SIN cobrar para corregir
            precio/servicio antes de confirmar. Distinto de la X (que es
            "cerrar"): este botón es la acción explícita de retroceso que
            pidió Reni. Deshabilitado mientras se procesa el cobro. */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-2 hover:text-ink hover:border-line-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver
          </button>
        </div>

        {pending && (
          <div className="px-5 pb-4 flex items-center gap-2 text-xs text-ink-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cerrando cita…
          </div>
        )}
    </Modal>
  )
}

interface MethodButtonProps {
  icon: typeof Banknote
  label: string
  description: string
  onClick: () => void
  disabled?: boolean
}

function MethodButton({ icon: Icon, label, description, onClick, disabled }: MethodButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface hover:border-brand hover:bg-brand-softer/20 px-4 py-3 text-left transition-colors disabled:opacity-50 disabled:cursor-wait"
    >
      <div className="h-9 w-9 rounded-lg bg-overlay flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-brand" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-[11px] text-ink-3 truncate">{description}</p>
      </div>
    </button>
  )
}
