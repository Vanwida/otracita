'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Loader2, Mail, MessageCircle } from 'lucide-react'
import NumberInput from './NumberInput'
import { formatCents } from '@/lib/format'
import {
  PAYMENT_METHOD_LABEL,
  isPaymentMethod,
  type PaymentMethod,
} from '@/lib/payments/methods'

// -----------------------------------------------------------------------------
// ChargedReceiptStep — pantalla "Cobrado" tras finalizar el cobro (task #103).
//
// Sustituye al `SuccessStep` mini-splash de ChargeFlow. El barbero termina
// el cobro y aterriza aquí: confirmación visual grande, cambio en vivo si
// pagó en efectivo, recibo plegable con desglose IVA, y acciones para
// enviar el recibo por WhatsApp o email.
//
// Filosofía visual: workwear Patagonia/Carhartt — light, terracota, sin
// gradientes purpura ni Sparkles. Tipografía brand-display para el titular,
// brand-num tabular para los precios. Animación entry sutil (scale 0→1) en
// el check, sin pulse permanente. Reduced-motion respetado vía `motion-safe`.
//
// Datos: una sola llamada GET `/api/bookings/:id/receipt` carga todo
// (booking + customer + invoice + payments + tip + client). Esto evita el
// race con el `paidAt` recién insertado por el endpoint /charge y reduce
// la latencia perceptible.
//
// Acciones:
//   · "Volver al calendario" → cierra el flow (parent onCharged + onClose).
//   · "Enviar por WhatsApp"   → POST /api/bookings/:id/receipt/send {channel:'whatsapp'}
//   · "Enviar por email"      → idem {channel:'email'}
//
// Edge cases:
//   · Sin row de customer (walk-in raro) → email deshabilitado, WhatsApp
//     deshabilitado si tampoco hay phone en bookings.customerPhone.
//   · method='mixed' (fraccionado) → mostrar todos los tramos en el header
//     de método. El input "Recibido" del cambio aplica SOLO al tramo cash.
//   · invoice null → desglose IVA mínimo (sin número de factura). Calcula
//     IVA inferido del bookings.price_cents y el ivaRate del tenant.
// -----------------------------------------------------------------------------

interface ReceiptData {
  booking: {
    id: string
    customerName: string | null
    customerPhone: string
    service: string
    /** CÉNTIMOS (bookings.price_cents). */
    priceCents: number | null
    paymentMethod: string | null
    startsAt: string
    durationMin: number
    barberName: string | null
  }
  customer: { id: string; email: string | null; phone: string } | null
  invoice: {
    id: string
    number: string
    subtotalCents: number
    ivaRate: number
    ivaAmountCents: number
    totalCents: number
    issueDate: string
  } | null
  payments: Array<{
    id: string
    method: string | null
    amountCents: number
    paidAt: string | null
    notes: string | null
  }>
  tip: {
    amountCents: number
    method: string | null
    barberName: string | null
  } | null
  client: {
    businessName: string
    address: string | null
    ivaRate: number
  }
}

interface Props {
  bookingId: string
  /** Total ya cobrado en céntimos. Lo pasa el padre (ChargeFlow) tras el
   *  POST /charge para mostrar el importe inmediatamente sin esperar al
   *  fetch del receipt. */
  totalCents: number
  /** Propina (céntimos) si la hubo en este mismo flow. Null = no se
   *  registró tip inline. */
  tipCents: number | null
  /** Cerrar el flow y volver a la agenda. */
  onDismiss: () => void
}

type SendChannel = 'whatsapp' | 'email'

interface SendState {
  loading: SendChannel | null
  sent: SendChannel | null
  error: string | null
}

export default function ChargedReceiptStep({
  bookingId,
  totalCents,
  tipCents,
  onDismiss,
}: Props) {
  const [data, setData] = useState<ReceiptData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [received, setReceived] = useState<number | null>(totalCents / 100)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [send, setSend] = useState<SendState>({
    loading: null,
    sent: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/receipt`)
        if (!res.ok) {
          if (!cancelled) setLoadError('No se pudo cargar el recibo.')
          return
        }
        const json = (await res.json()) as ReceiptData
        if (cancelled) return
        setData(json)
        // Pre-rellenar "Recibido" al total cash si hay tramo en efectivo.
        const cashCents = json.payments
          .filter((p) => p.method === 'cash')
          .reduce((sum, p) => sum + p.amountCents, 0)
        if (cashCents > 0) {
          setReceived(cashCents / 100)
        }
      } catch {
        if (!cancelled) setLoadError('Sin conexión. Recibo no disponible.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookingId])

  // ── Derivados ──────────────────────────────────────────────────────────
  const cashCents = useMemo(
    () =>
      (data?.payments ?? [])
        .filter((p) => p.method === 'cash')
        .reduce((sum, p) => sum + p.amountCents, 0),
    [data],
  )
  const hasCash = cashCents > 0

  const changeCents = useMemo(() => {
    if (!hasCash || received === null) return 0
    const receivedCents = Math.round(received * 100)
    return Math.max(0, receivedCents - cashCents)
  }, [hasCash, received, cashCents])

  // Método humano-legible para el sub-hero. Si hay >1 método → "Pago
  // fraccionado" + sub-línea con cada tramo. Si sólo uno, el label canónico.
  const methodSummary = useMemo(() => {
    const rows = data?.payments ?? []
    if (rows.length === 0) return ''
    const methods = new Set(rows.map((p) => p.method ?? ''))
    if (methods.size === 1) {
      const m = [...methods][0]
      if (m && isPaymentMethod(m as string)) {
        return PAYMENT_METHOD_LABEL[m as PaymentMethod]
      }
      return 'Pagado'
    }
    return 'Pago fraccionado'
  }, [data])

  const splitLines = useMemo(() => {
    const rows = data?.payments ?? []
    if (rows.length <= 1) return []
    return rows
      .map((p) => {
        const m = p.method && isPaymentMethod(p.method) ? p.method : null
        const label = m ? PAYMENT_METHOD_LABEL[m] : 'Pago'
        return `${label}: ${formatCents(p.amountCents)}`
      })
      .join(' · ')
  }, [data])

  // IVA: si hay invoice, usamos sus cents tal cual. Si no, fallback al
  // booking.priceCents + ivaRate del tenant (precio retail español incluye IVA).
  const breakdown = useMemo(() => {
    if (!data) return null
    if (data.invoice) {
      return {
        subtotalCents: data.invoice.subtotalCents,
        ivaRate: data.invoice.ivaRate,
        ivaAmountCents: data.invoice.ivaAmountCents,
        totalCents: data.invoice.totalCents,
        number: data.invoice.number,
        issueDate: data.invoice.issueDate,
      }
    }
    // Fallback inferido — precio incluye IVA, base = total / (1 + iva/100)
    const total = totalCents
    const rate = data.client.ivaRate
    const subtotal = Math.round(total / (1 + rate / 100))
    return {
      subtotalCents: subtotal,
      ivaRate: rate,
      ivaAmountCents: total - subtotal,
      totalCents: total,
      number: null,
      issueDate: data.booking.startsAt.slice(0, 10),
    }
  }, [data, totalCents])

  // ── Acciones de envío ──────────────────────────────────────────────────
  async function sendReceipt(channel: SendChannel) {
    setSend({ loading: channel, sent: null, error: null })
    try {
      const res = await fetch(`/api/bookings/${bookingId}/receipt/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok) {
        setSend({
          loading: null,
          sent: null,
          error: json.error || 'No se pudo enviar.',
        })
        return
      }
      setSend({ loading: null, sent: channel, error: null })
    } catch {
      setSend({
        loading: null,
        sent: null,
        error: 'Sin conexión. Recibo no enviado.',
      })
    }
  }

  // ── Disponibilidad de canales ──────────────────────────────────────────
  const hasPhone = !!data?.booking.customerPhone?.trim()
  const hasEmail = !!data?.customer?.email?.trim()

  // Render -----------------------------------------------------------------
  return (
    <div className="flex flex-col px-5 py-8 sm:py-10 gap-7 text-center">
      {/* ── Hero: check + título + total ────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-20 w-20 rounded-full bg-success/15 flex items-center justify-center motion-safe:animate-[receipt-check-in_260ms_ease-out_both]"
          aria-hidden="true"
        >
          <Check className="h-11 w-11 text-success" strokeWidth={2.5} />
        </div>

        <h2
          className="font-brand-display text-ink leading-[0.95] tracking-tight"
          style={{ fontSize: 'clamp(2.25rem,5.5vw,3.5rem)' }}
        >
          Cobrado
        </h2>

        <p
          className="font-brand-num tabular-nums text-ink"
          style={{ fontSize: 'clamp(1.5rem,3.5vw,2.25rem)' }}
        >
          <span className="text-brand">·</span>{' '}
          {formatCents(totalCents)}
        </p>

        {tipCents !== null && tipCents > 0 && (
          <p className="text-sm font-medium text-brand-strong tabular-nums">
            + propina {formatCents(tipCents)}
          </p>
        )}
      </div>

      {/* ── Línea contexto (servicio · cliente · hora) ──────────────────── */}
      {data && (
        <p className="text-sm sm:text-base text-ink-2 leading-relaxed">
          {data.booking.customerName?.trim() || 'Cliente'}
          {' · '}
          {data.booking.service}
          {' · '}
          {formatStartsAt(data.booking.startsAt)}
        </p>
      )}

      {!data && !loadError && (
        <p className="inline-flex items-center justify-center gap-2 text-xs text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando recibo…
        </p>
      )}
      {loadError && (
        <p className="text-xs text-danger">{loadError}</p>
      )}

      {/* ── Cambio (solo si hay tramo cash) ─────────────────────────────── */}
      {data && hasCash && (
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <label className="flex flex-col items-start gap-1 text-left">
            <span className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
              Recibido
            </span>
            <div className="relative">
              <NumberInput
                value={received}
                onValueChange={setReceived}
                min={cashCents / 100}
                decimals={2}
                aria-label="Importe recibido en efectivo"
                className="w-32 rounded-xl border border-line bg-surface text-ink text-lg font-brand-num tabular-nums px-3 py-2.5 pr-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
              <span
                className="absolute inset-y-0 right-3 flex items-center text-ink-3 text-sm pointer-events-none"
                aria-hidden="true"
              >
                €
              </span>
            </div>
          </label>

          <div
            className={
              'flex flex-col items-start gap-1 text-left rounded-xl px-4 py-2.5 min-w-[8rem] ' +
              (changeCents > 0
                ? 'bg-brand-softer text-brand-strong'
                : 'bg-overlay text-ink-3')
            }
          >
            <span className="text-[11px] font-bold uppercase tracking-widest">
              Cambio
            </span>
            <span className="text-lg font-brand-num tabular-nums">
              {changeCents > 0 ? formatCents(changeCents) : 'Sin cambio'}
            </span>
          </div>
        </div>
      )}

      {/* ── Recibo plegable ─────────────────────────────────────────────── */}
      {data && breakdown && (
        <details
          className="group rounded-xl border border-line bg-surface text-left mx-auto w-full max-w-md"
          onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded-xl">
            <span className="text-sm font-medium text-ink-2">
              {breakdown.number
                ? `Recibo nº ${breakdown.number}`
                : 'Ver desglose IVA'}
            </span>
            <ChevronDown
              className={
                'h-4 w-4 text-ink-3 transition-transform ' +
                (detailsOpen ? 'rotate-180' : '')
              }
              aria-hidden="true"
            />
          </summary>
          <dl className="px-4 pb-4 pt-1 text-sm grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-ink-2 tabular-nums">
            <dt>Fecha</dt>
            <dd className="text-ink text-right">
              {formatStartsAt(data.booking.startsAt)}
            </dd>

            {data.booking.customerName && (
              <>
                <dt>Cliente</dt>
                <dd className="text-ink text-right truncate">
                  {data.booking.customerName}
                </dd>
              </>
            )}

            <dt>Servicio</dt>
            <dd className="text-ink text-right">{data.booking.service}</dd>

            {data.booking.barberName && (
              <>
                <dt>Profesional</dt>
                <dd className="text-ink text-right">{data.booking.barberName}</dd>
              </>
            )}

            <dt className="pt-2 border-t border-line/60">Base imponible</dt>
            <dd className="pt-2 border-t border-line/60 text-ink text-right">
              {formatCents(breakdown.subtotalCents)}
            </dd>

            <dt>IVA {breakdown.ivaRate} %</dt>
            <dd className="text-ink text-right">
              {formatCents(breakdown.ivaAmountCents)}
            </dd>

            <dt className="pt-2 border-t border-line/60 font-semibold text-ink">
              Total
            </dt>
            <dd className="pt-2 border-t border-line/60 font-semibold text-ink text-right">
              {formatCents(breakdown.totalCents)}
            </dd>

            <dt>Método</dt>
            <dd className="text-ink text-right">
              {methodSummary}
              {splitLines && (
                <div className="text-xs text-ink-3 mt-0.5">{splitLines}</div>
              )}
            </dd>

            {data.tip && data.tip.amountCents > 0 && (
              <>
                <dt>Propina</dt>
                <dd className="text-brand-strong text-right tabular-nums">
                  + {formatCents(data.tip.amountCents)}
                </dd>
              </>
            )}
          </dl>
        </details>
      )}

      {/* ── Footer: acciones ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={onDismiss}
          className="w-full inline-flex items-center justify-center rounded-xl bg-brand hover:bg-brand-strong px-4 py-3 text-base font-semibold text-brand-ink transition-colors min-h-[48px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Volver al calendario
        </button>

        {(hasPhone || hasEmail) && (
          <div className="grid grid-cols-2 gap-2">
            <SendButton
              icon={MessageCircle}
              label="WhatsApp"
              disabled={!hasPhone}
              disabledHint={!hasPhone ? 'Sin teléfono' : undefined}
              loading={send.loading === 'whatsapp'}
              sent={send.sent === 'whatsapp'}
              onClick={() => sendReceipt('whatsapp')}
            />
            <SendButton
              icon={Mail}
              label="Email"
              disabled={!hasEmail}
              disabledHint={!hasEmail ? 'Sin email' : undefined}
              loading={send.loading === 'email'}
              sent={send.sent === 'email'}
              onClick={() => sendReceipt('email')}
            />
          </div>
        )}

        {send.error && (
          <p
            className="text-xs text-danger text-center"
            role="alert"
            aria-live="polite"
          >
            {send.error}
          </p>
        )}
      </div>

      {/* Keyframe inline para la entrada del check. Tailwind no tiene un
          util de scale-in con bounce-out tan simple; un @keyframes local lo
          resuelve sin añadir clases globales que sólo se usen aquí. */}
      <style>{`
        @keyframes receipt-check-in {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function SendButton({
  icon: Icon,
  label,
  disabled,
  disabledHint,
  loading,
  sent,
  onClick,
}: {
  icon: typeof Mail
  label: string
  disabled?: boolean
  disabledHint?: string
  loading?: boolean
  sent?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading || sent}
      title={disabledHint}
      aria-label={
        disabled && disabledHint ? `${label} — ${disabledHint}` : `Enviar por ${label}`
      }
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface hover:border-brand hover:text-brand px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-ink-2"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : sent ? (
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {sent ? 'Enviado' : label}
    </button>
  )
}

// Formatea YYYY-MM-DDTHH:MM:SS local → "27 may, 15:30" (es-ES, sin año si es
// del año en curso). Calculado en cliente para usar la locale del browser.
function formatStartsAt(iso: string): string {
  // El backend ya nos pasa fecha local separada — montamos un Date local
  // (sin "Z") para que toLocaleString lo trate como hora local.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
  const time = d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date}, ${time}`
}
