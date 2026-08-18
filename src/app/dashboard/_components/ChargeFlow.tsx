'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  Globe,
  Loader2,
  Smartphone,
  Split,
} from 'lucide-react'
import Modal from './Modal'
import SplitPaymentBuilder from './SplitPaymentBuilder'
import InlineTipPrompt from './InlineTipPrompt'
import ChargedReceiptStep from './ChargedReceiptStep'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from '@/lib/payments/methods'
import type {
  ChargePaymentLine,
  ChargeSuccessResponse,
} from '@/lib/payments/charge-contract'
import { formatCents } from '@/lib/format'

// -----------------------------------------------------------------------------
// ChargeFlow — modal state-machine para el cobro unificado de una cita.
//
// Reemplaza al combo histórico (PaymentMethodPrompt + sección "Cobrar online"
// del BookingDetailPanel). Único botón "Cobrar" en la cita. Lógica:
//
//   1. method-select  → grid de métodos + opción "fraccionado"
//   2. split-builder  → cuando elige fraccionado, sub-componente
//   3. wait-online    → si el cobro incluye `card_online`, QR + poll
//   4. tip-prompt     → "¿propina?" tras cerrar el cobro
//   5. success        → pantalla "Cobrado" (ChargedReceiptStep, task #103):
//                       check + total + recibo plegable + acciones de envío;
//                       se cierra sólo cuando el barbero pulsa "Volver al
//                       calendario", NO con timeout.
//   6. error          → mensaje + "Volver"
//
// El endpoint canónico `POST /api/bookings/:id/charge` recibe N tramos y
// devuelve `requiresOnlineCheckout?` si toca esperar a Stripe. El tip va
// aparte en `POST /api/bookings/:id/tip` para no acoplar payroll a la
// transacción de cobro.
//
// `idempotencyKey` se genera una vez al abrir el modal (useRef estable) y
// se reusa en TODO reintento — si el barbero pulsa Cobrar dos veces, el
// backend lo deduplica (V2 lo persistirá en tabla; V1 confía en disabled+
// spinner + cooldown del browser).
// -----------------------------------------------------------------------------

interface BookingShape {
  id: string
  /** CÉNTIMOS enteros — misma unidad que payments/tips, sin conversión. */
  priceCents: number
  customerName: string | null
  barberId: string | null
  serviceLabel: string
}

interface BarberMin {
  id: string
  displayName: string
}

interface Props {
  booking: BookingShape
  /** Barberos activos del tenant — necesarios para tip si la cita no fija
   *  barbero o queremos permitir cambiar el destinatario. */
  barbers: BarberMin[]
  /** true si el tenant tiene Stripe Connect activo. Sin esto, ocultamos
   *  el método `card_online` del grid y del select de fraccionado. */
  stripeConnectActive: boolean
  /** true si la sesión de caja está abierta hoy. Cuando false (caja activa
   *  pero cerrada), pintamos un warning suave — no bloquea, sólo avisa. */
  cashSessionOpen: boolean
  open: boolean
  onClose: () => void
  /** Llamado tras success completo (cobro confirmado + tip resuelto o
   *  saltado). El padre revalida la vista y cierra el detalle de la cita. */
  onCharged: () => void
}

type Step =
  | { kind: 'method-select' }
  | { kind: 'split-builder' }
  | {
      kind: 'wait-online'
      paymentUrl: string
      qrCodeDataUrl: string
      paymentId: string
    }
  | {
      kind: 'tip-prompt'
      chargedCents: number
      predominantMethod: 'cash' | 'card'
    }
  | { kind: 'success'; totalCents: number; tipCents: number | null }
  | { kind: 'error'; message: string }

// PAYMENT_METHODS canónico mantiene el orden funcional (cash, card_physical,
// bizum, card_online). El icono lo resolvemos local — el icono va atado al
// componente que lo pinta, no al módulo de tipos.
const METHOD_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  card_physical: CreditCard,
  bizum: Smartphone,
  card_online: Globe,
}

/** Decide si la mezcla de métodos cuenta como "cash" o "card" para precarga
 *  del toggle de propina. Si TODO fue cash → cash. Si hubo cualquier no-cash
 *  (tarjeta/bizum/online), default card: la propina por tarjeta es la que
 *  necesita explicitar el barbero, así reducimos pasos en el caso cash. */
function predominantTipMethod(lines: ChargePaymentLine[]): 'cash' | 'card' {
  return lines.every((l) => l.method === 'cash') ? 'cash' : 'card'
}

export default function ChargeFlow({
  booking,
  barbers,
  stripeConnectActive,
  cashSessionOpen,
  open,
  onClose,
  onCharged,
}: Props) {
  const [step, setStep] = useState<Step>({ kind: 'method-select' })
  const [submitting, setSubmitting] = useState(false)
  const [closingWithoutCharge, setClosingWithoutCharge] = useState(false)

  // Idempotency key — estable durante la vida del modal (useRef). Se
  // regenera cada vez que el modal pasa de cerrado→abierto.
  const idempotencyKeyRef = useRef<string>('')

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      idempotencyKeyRef.current = crypto.randomUUID()
      setStep({ kind: 'method-select' })
      setSubmitting(false)
    }
  }, [open])

  const totalCents = booking.priceCents

  // -------------------------------------------------------------------------
  // Cobro nuclear: POST /api/bookings/:id/charge con N tramos.
  // -------------------------------------------------------------------------
  const doCharge = useCallback(
    async (lines: ChargePaymentLine[]) => {
      setSubmitting(true)
      try {
        const res = await fetch(`/api/bookings/${booking.id}/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payments: lines,
            idempotencyKey: idempotencyKeyRef.current,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as
          | ChargeSuccessResponse
          | { error?: string }
        if (!res.ok) {
          const msg =
            (data as { error?: string }).error ||
            'No se pudo cobrar. Inténtalo otra vez.'
          setStep({ kind: 'error', message: msg })
          setSubmitting(false)
          return
        }
        const success = data as ChargeSuccessResponse
        // Si hay tramo online pendiente → esperamos webhook.
        if (success.requiresOnlineCheckout) {
          setStep({
            kind: 'wait-online',
            paymentUrl: success.requiresOnlineCheckout.paymentUrl,
            qrCodeDataUrl: success.requiresOnlineCheckout.qrCodeDataUrl,
            paymentId: success.requiresOnlineCheckout.paymentId,
          })
          setSubmitting(false)
          return
        }
        // Cobro 100% offline: cerrado. Vamos a tip.
        setStep({
          kind: 'tip-prompt',
          chargedCents: success.totalCents,
          predominantMethod: predominantTipMethod(lines),
        })
      } catch {
        setStep({
          kind: 'error',
          message: 'Sin conexión. El cobro no se registró.',
        })
      } finally {
        setSubmitting(false)
      }
    },
    [booking.id],
  )

  // Cobrar con un solo método (atajo del grid).
  const chargeSingleMethod = useCallback(
    (method: PaymentMethod) => {
      const line: ChargePaymentLine = { method, amountCents: totalCents }
      void doCharge([line])
    },
    [totalCents, doCharge],
  )

  // -------------------------------------------------------------------------
  // Poll del pago online — cada FEEDBACK_MS-derived 4s mientras estamos en
  // wait-online. Cuando status==='succeeded' pasamos a tip-prompt.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (step.kind !== 'wait-online') return
    const paymentId = step.paymentId
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/${paymentId}`)
        if (!res.ok) return
        const data = (await res.json()) as { status?: string }
        if (data.status === 'succeeded') {
          setStep({
            kind: 'tip-prompt',
            chargedCents: totalCents,
            predominantMethod: 'card',
          })
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          setStep({
            kind: 'error',
            message: 'El cliente no completó el pago online.',
          })
        }
      } catch {
        /* poll silencioso */
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [step, totalCents])

  // -------------------------------------------------------------------------
  // Tras tip resuelto → step `success` se queda visible. Ya NO se auto-cierra
  // en 2s — la pantalla "Cobrado" (ChargedReceiptStep) es la confirmación
  // canónica (task #103). El usuario decide cuándo volver con "Volver al
  // calendario", que llama a `dismissSuccess` abajo.
  // -------------------------------------------------------------------------
  const dismissSuccess = useCallback(() => {
    onCharged()
    onClose()
  }, [onCharged, onClose])

  // -------------------------------------------------------------------------
  // "Cerrar sin cobrar" — para citas cortesía / gratis: marca completed sin
  // method. Útil cuando el barbero abre Cobrar pero al final no procede.
  // -------------------------------------------------------------------------
  async function closeWithoutCharging() {
    setClosingWithoutCharge(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setStep({
          kind: 'error',
          message: body?.error || 'No se pudo cerrar la cita.',
        })
        setClosingWithoutCharge(false)
        return
      }
      onCharged()
      onClose()
    } catch {
      setStep({
        kind: 'error',
        message: 'Sin conexión. La cita no se cerró.',
      })
      setClosingWithoutCharge(false)
    }
  }

  // Bloquear el cierre por backdrop/ESC mientras estamos a media transacción
  // (charge en curso, esperando Stripe, registrando tip). Evita perder un
  // cobro de Stripe en pending por un swipe accidental.
  const lockBackdrop =
    submitting ||
    step.kind === 'wait-online' ||
    step.kind === 'success' ||
    closingWithoutCharge

  // Visible methods en el grid principal. card_online se oculta sin Connect.
  const gridMethods: PaymentMethod[] = stripeConnectActive
    ? [...PAYMENT_METHODS]
    : PAYMENT_METHODS.filter((m) => m !== 'card_online')

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={`Cobrar ${formatCents(totalCents)}`}
      size="lg"
      zClass="z-[60]"
      closeOnBackdrop={!lockBackdrop}
    >
      {/* Cada step pinta su propio header — más control sobre jerarquía
          y peso visual (ej. tip-prompt prioriza el check verde). */}
      {step.kind === 'method-select' && (
        <MethodSelectStep
          booking={booking}
          totalCents={totalCents}
          methods={gridMethods}
          onPick={chargeSingleMethod}
          onPickSplit={() => setStep({ kind: 'split-builder' })}
          submitting={submitting}
          cashSessionOpen={cashSessionOpen}
          closeWithoutCharge={closeWithoutCharging}
          closingWithoutCharge={closingWithoutCharge}
        />
      )}

      {step.kind === 'split-builder' && (
        <SplitPaymentBuilder
          bookingTotalCents={booking.priceCents}
          stripeConnectActive={stripeConnectActive}
          onSubmit={doCharge}
          onCancel={() => setStep({ kind: 'method-select' })}
        />
      )}

      {step.kind === 'wait-online' && (
        <WaitOnlineStep
          paymentUrl={step.paymentUrl}
          qrCodeDataUrl={step.qrCodeDataUrl}
          onCancel={() => setStep({ kind: 'method-select' })}
        />
      )}

      {step.kind === 'tip-prompt' && (
        <InlineTipPrompt
          bookingId={booking.id}
          chargedCents={step.chargedCents}
          predominantMethod={step.predominantMethod}
          barbers={barbers}
          bookingBarberId={booking.barberId}
          onTipResolved={(tipCents) =>
            setStep({
              kind: 'success',
              totalCents: step.chargedCents,
              tipCents,
            })
          }
        />
      )}

      {step.kind === 'success' && (
        <ChargedReceiptStep
          bookingId={booking.id}
          totalCents={step.totalCents}
          tipCents={step.tipCents}
          onDismiss={dismissSuccess}
        />
      )}

      {step.kind === 'error' && (
        <ErrorStep
          message={step.message}
          onBack={() => setStep({ kind: 'method-select' })}
        />
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function MethodSelectStep({
  booking,
  totalCents,
  methods,
  onPick,
  onPickSplit,
  submitting,
  cashSessionOpen,
  closeWithoutCharge,
  closingWithoutCharge,
}: {
  booking: BookingShape
  totalCents: number
  methods: PaymentMethod[]
  onPick: (m: PaymentMethod) => void
  onPickSplit: () => void
  submitting: boolean
  cashSessionOpen: boolean
  closeWithoutCharge: () => void
  closingWithoutCharge: boolean
}) {
  return (
    <div className="flex flex-col">
      <header className="px-5 py-4 border-b border-line">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
          Cobrar
        </p>
        <p className="text-2xl font-bold text-ink tabular-nums leading-tight mt-0.5">
          {formatCents(totalCents)}
        </p>
        <p className="text-xs text-ink-2 mt-0.5 truncate">
          {booking.serviceLabel} · {booking.customerName?.trim() || 'Sin nombre'}
        </p>
      </header>

      <div className="p-5 space-y-4">
        {!cashSessionOpen && methods.includes('cash') && (
          <div className="flex items-start gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink-2 leading-relaxed">
            <AlertTriangle
              className="h-3.5 w-3.5 text-ink-3 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            La caja de hoy aún no está abierta. Puedes cobrar igual; el
            movimiento se registrará en cuanto la abras.
          </div>
        )}

        <div
          className="grid grid-cols-2 sm:grid-cols-3 gap-2"
          role="group"
          aria-label="Método de cobro"
        >
          {methods.map((m) => (
            <MethodCard
              key={m}
              method={m}
              onClick={() => onPick(m)}
              disabled={submitting}
            />
          ))}
          <MethodCard
            method="__split__"
            label="Fraccionado"
            icon={Split}
            onClick={onPickSplit}
            disabled={submitting}
          />
        </div>

        {submitting && (
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cobrando…
          </p>
        )}

        <div className="pt-1 border-t border-line">
          <button
            type="button"
            onClick={closeWithoutCharge}
            disabled={submitting || closingWithoutCharge}
            className="w-full text-xs text-ink-3 hover:text-ink-2 underline-offset-2 hover:underline transition-colors py-2 disabled:opacity-60"
          >
            {closingWithoutCharge ? 'Cerrando cita…' : 'Cerrar sin cobrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MethodCard({
  method,
  label,
  icon,
  onClick,
  disabled,
}: {
  method: PaymentMethod | '__split__'
  label?: string
  icon?: typeof Banknote
  onClick: () => void
  disabled?: boolean
}) {
  const resolvedLabel =
    label ?? (method !== '__split__' ? PAYMENT_METHOD_LABEL[method] : 'Fraccionado')
  const Icon =
    icon ?? (method !== '__split__' ? METHOD_ICON[method] : Split)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group min-h-[88px] flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface hover:border-brand hover:bg-brand-softer/30 px-3 py-3 text-center transition-colors disabled:opacity-50 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="h-10 w-10 rounded-xl bg-overlay flex items-center justify-center group-hover:bg-surface transition-colors">
        <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
      </div>
      <span className="text-xs font-semibold text-ink leading-tight">
        {resolvedLabel}
      </span>
    </button>
  )
}

function WaitOnlineStep({
  paymentUrl,
  qrCodeDataUrl,
  onCancel,
}: {
  paymentUrl: string
  qrCodeDataUrl: string
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col">
      <header className="px-5 py-4 border-b border-line">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
          Esperando pago
        </p>
        <p className="text-sm text-ink mt-0.5">
          Acerca el QR a la cámara del móvil del cliente o comparte el enlace.
        </p>
      </header>

      <div className="p-5 space-y-4">
        <div className="flex items-center justify-center rounded-2xl border border-line bg-canvas p-4">
          <Image
            src={qrCodeDataUrl}
            alt="QR de pago"
            width={240}
            height={240}
            unoptimized
            className="h-60 w-60"
          />
        </div>

        <a
          href={paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center rounded-xl border border-line bg-surface hover:border-brand hover:text-brand px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors break-all"
        >
          {paymentUrl}
        </a>

        <div className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Comprobando pago cada 4 segundos…
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-2 hover:text-ink transition-colors min-h-[44px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function ErrorStep({
  message,
  onBack,
}: {
  message: string
  onBack: () => void
}) {
  return (
    <div className="flex flex-col p-5 gap-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink">No se pudo cobrar</p>
          <p className="text-sm text-ink-2 mt-0.5 leading-relaxed">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="w-full inline-flex items-center justify-center rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors min-h-[44px]"
      >
        Volver
      </button>
    </div>
  )
}
