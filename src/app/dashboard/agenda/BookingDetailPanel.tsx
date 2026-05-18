'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, CheckCircle2, UserX, Undo2, CreditCard, Link as LinkIcon, Loader2, QrCode, CalendarX2, MessageCircle, ShoppingBag } from 'lucide-react';
import AddProductSaleModal from './AddProductSaleModal';
import PaymentMethodPrompt, { type CashPaymentMethod } from '../_components/PaymentMethodPrompt';
import SumupCheckoutPrompt from '../_components/SumupCheckoutPrompt';
import { pushUndoToast } from '../_components/UndoToast';
import { useState, useTransition, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { paymentBadge } from './types';
import type { CalendarEvent } from './types';

interface Props {
  booking: CalendarEvent | null;
  onClose: () => void;
  /**
   * Stripe Connect account state for the current tenant. Drives the gate
   * between "activa cobros" CTA and the real payment link generator.
   */
  stripeConnectStatus: 'none' | 'pending' | 'active' | 'restricted' | string;
  /** Cuando true, al completar se pide método de pago (cash/card/online) y
   *  se alimenta el cuadre del día. Sin esto, comportamiento legacy. */
  cashRegisterEnabled?: boolean;
  /** Cuando true, el barbero tiene SumUp conectado y un Reader pareado.
   *  Al pulsar "Marcar completada" lanzamos cobro en el datáfono en vez
   *  del modal manual cash/card/online. */
  sumupReaderConnected?: boolean;
}

interface PaymentSnapshot {
  id: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled' | string;
  amountCents: number;
  currency: string;
  paymentUrl: string | null;
  paidAt: string | null;
  description: string | null;
  createdAt: string;
}

// Used both for the existing-payment fetch and the newly-created one.
interface PaymentLinkData {
  payment: PaymentSnapshot;
  qrCodeDataUrl: string | null; // only present after generation (not for already-paid rows)
}

const MIN_AMOUNT_EUROS = 0.5;
const MAX_AMOUNT_EUROS = 5000;

export default function BookingDetailPanel({ booking, onClose, stripeConnectStatus, cashRegisterEnabled = false, sumupReaderConnected = false }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Payment state — separate from the no-show state above.
  const [paymentData, setPaymentData] = useState<PaymentLinkData | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [amountEuros, setAmountEuros] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  const isNoShow = booking?.status === 'no_show';
  const isCompleted = booking?.status === 'completed';
  // Solo se completa una cita confirmada (no no-show, no completed, no cancelled).
  const canMarkCompleted = booking?.status === 'confirmed';
  const canMarkNoShow = booking?.status === 'confirmed' || booking?.status === 'no_show';
  const canCancel = booking?.status === 'confirmed' || booking?.status === 'no_show';
  // Ventas de producto solo durante la cita activa: tras completar, la
  // factura ya se ha emitido con los productos vendidos hasta ese momento
  // y nuevas ventas no podrían incluirse sin rectificativa.
  const canSellProduct = booking?.status === 'confirmed';
  const [cancelOpen, setCancelOpen] = useState(false);
  const [productSaleOpen, setProductSaleOpen] = useState(false);
  // Cuántas ventas de producto hay registradas en este booking, para mostrar
  // un badge "X productos vendidos" tras añadir. Se actualiza tras el modal.
  const [productSalesCount, setProductSalesCount] = useState(0);
  const canCharge =
    !!booking &&
    booking.price !== null &&
    (booking.status === 'confirmed' || booking.status === 'no_show');

  const connectActive = stripeConnectStatus === 'active';

  // Reset payment state whenever the booking changes.
  useEffect(() => {
    setPaymentData(null);
    setPaymentError(null);
    setLinkCopied(false);
    if (booking) {
      setAmountEuros(booking.price != null ? String(booking.price) : '');
      const customer = booking.customerName || booking.customerPhone;
      setDescription(`${booking.service} · ${customer}`);
    } else {
      setAmountEuros('');
      setDescription('');
    }
  }, [booking?.id, booking?.price, booking?.service, booking?.customerName, booking?.customerPhone, booking]);

  // Fetch existing payment for this booking on open — so we can surface
  // "already paid" or "pending link" state without the barber clicking.
  useEffect(() => {
    if (!booking || !canCharge || !connectActive) return;
    const controller = new AbortController();
    fetch(`/api/payments/by-booking?bookingId=${encodeURIComponent(booking.id)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data || !data.payment) return;
        setPaymentData({ payment: data.payment, qrCodeDataUrl: null });
      })
      .catch(() => {
        /* aborted or network — ignore silently */
      });
    return () => controller.abort();
  }, [booking, booking?.id, canCharge, connectActive]);

  // Poll a 'pending' payment every ~4s so the UI flips to "paid" without
  // a manual refresh once the customer completes checkout. Stops on unmount
  // or when status transitions away from 'pending'.
  useEffect(() => {
    if (!paymentData || paymentData.payment.status !== 'pending') return;
    const id = paymentData.payment.id;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status && data.status !== paymentData.payment.status) {
          setPaymentData((prev) =>
            prev
              ? {
                  qrCodeDataUrl: prev.qrCodeDataUrl,
                  payment: {
                    ...prev.payment,
                    status: data.status,
                    paidAt: data.paidAt,
                  },
                }
              : prev,
          );
        }
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [paymentData]);

  async function toggleNoShow() {
    if (!booking) return;
    setError(null);
    const wasNoShow = isNoShow;
    const endpoint = wasNoShow ? '/api/bookings/undo-no-show' : '/api/bookings/no-show';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'No se ha podido actualizar. Vuelve a intentarlo.');
        return;
      }
      // Solo ofrecemos toast de undo cuando se ACABA de marcar como no-show
      // (confirmed → no_show). En la dirección inversa (Deshacer no-show) el
      // botón ya es la acción de undo y no tiene sentido apilar otra ventana.
      if (!wasNoShow) {
        const bookingId = booking.id;
        pushUndoToast({
          message: 'Marcado como no vino',
          onUndo: async () => {
            try {
              await fetch('/api/bookings/undo-no-show', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId }),
              });
            } finally {
              startTransition(() => router.refresh());
            }
          },
        });
      }
      startTransition(() => router.refresh());
    } catch {
      setError('Sin conexión. Revisa tu wifi e inténtalo otra vez.');
    }
  }

  // Cierra la cita: dispara la auto-facturación (servicio + productos
  // vendidos durante la cita) en el servidor. Si el tenant tiene caja
  // activa, primero pedimos el método de pago (modal); si no, completamos
  // directo sin método.
  const [methodPromptOpen, setMethodPromptOpen] = useState(false);
  const [methodPending, setMethodPending] = useState(false);
  // SumUp Cloud API: si el barbero tiene Reader pareado, al "Marcar completada"
  // abrimos el prompt de cobro instantáneo en vez del selector manual.
  const [sumupPromptOpen, setSumupPromptOpen] = useState(false);

  async function markCompletedWithMethod(method: CashPaymentMethod | null) {
    if (!booking) return;
    setError(null);
    setMethodPending(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          method ? { status: 'completed', paymentMethod: method } : { status: 'completed' },
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'No se ha podido cerrar la cita. Vuelve a intentarlo.');
        return;
      }
      setMethodPromptOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setError('Sin conexión. Revisa tu wifi e inténtalo otra vez.');
    } finally {
      setMethodPending(false);
    }
  }

  function markCompleted() {
    if (!cashRegisterEnabled) {
      // Path simple: cerramos el panel optimista y programamos la PATCH para
      // dentro de 5s vía toast. Si el barbero pulsa "Deshacer", la PATCH
      // nunca dispara y al re-abrir la cita en agenda sigue confirmada.
      // Si cierra el navegador antes de 5s, el cron safety-net (3d) la
      // cierra automáticamente.
      if (!booking) return;
      const bookingId = booking.id;
      onClose();
      pushUndoToast({
        message: 'Cita cerrada',
        onCommit: async () => {
          try {
            await fetch(`/api/bookings/${bookingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'completed' }),
            });
          } finally {
            startTransition(() => router.refresh());
          }
        },
      });
      return;
    }
    // Con SumUp Reader pareado y price > 0 → flujo instantáneo Cloud API.
    // Sin Reader o sin price → modal manual cash/card/online.
    // Ambos paths involucran input deliberado del barbero (selección de
    // método o cobro real con tarjeta), así que NO añadimos ventana de
    // deshacer — un undo aquí descuadraria caja o reembolsaría el datáfono.
    if (sumupReaderConnected && booking?.price && booking.price > 0) {
      setSumupPromptOpen(true);
    } else {
      setMethodPromptOpen(true);
    }
  }

  const copyPhone = () => {
    if (!booking) return;
    navigator.clipboard.writeText(booking.customerPhone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = () => {
    if (!paymentData?.payment.paymentUrl) return;
    navigator.clipboard.writeText(paymentData.payment.paymentUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const generateLink = useCallback(async () => {
    if (!booking) return;
    setPaymentError(null);
    setPaymentLoading(true);
    try {
      const amountNumber = Number(amountEuros);
      if (!Number.isFinite(amountNumber) || amountNumber < MIN_AMOUNT_EUROS || amountNumber > MAX_AMOUNT_EUROS) {
        setPaymentError(`El importe debe estar entre ${MIN_AMOUNT_EUROS} € y ${MAX_AMOUNT_EUROS} €.`);
        setPaymentLoading(false);
        return;
      }
      const amountCents = Math.round(amountNumber * 100);

      const res = await fetch('/api/payments/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          amountCents,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaymentError(data.error || 'No se pudo generar el link');
        setPaymentLoading(false);
        return;
      }
      setPaymentData({
        qrCodeDataUrl: data.qrCodeDataUrl ?? null,
        payment: {
          id: data.paymentId,
          status: 'pending',
          amountCents: data.amountCents ?? amountCents,
          currency: 'eur',
          paymentUrl: data.paymentUrl,
          paidAt: null,
          description: description.trim() || null,
          createdAt: new Date().toISOString(),
        },
      });
    } catch {
      setPaymentError('Error de red');
    } finally {
      setPaymentLoading(false);
    }
  }, [booking, amountEuros, description]);

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  const sourceLabel = (source: string) =>
    source === 'booksy' ? 'Booksy' : 'WhatsApp Bot';

  // Tono inline (no pill) para el status. 'confirmed' se mezcla con el
  // metadata muteado; 'no_show' / 'cancelled' / 'completed' añaden un
  // toque de color para que el estado sea legible sin sobrecargar.
  const statusToneClass = (status: string): string => {
    switch (status) {
      case 'no_show':
        return 'text-danger font-semibold';
      case 'completed':
        return 'text-success font-semibold';
      case 'cancelled':
        return 'text-ink-3';
      default:
        return 'text-ink-2';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmada';
      case 'no_show':
        return 'No vino';
      case 'completed':
        return 'Completada';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  const alreadyPaid = paymentData?.payment.status === 'succeeded';
  const hasPendingLink = paymentData?.payment.status === 'pending' && paymentData?.payment.paymentUrl;

  return (
    <AnimatePresence>
      {booking && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[var(--color-scrim-light)] lg:hidden"
          />

          <motion.div
            key="panel"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 z-50 h-full w-80 bg-surface border-l border-line flex flex-col shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-line">
              <span className="text-xs uppercase tracking-[0.18em] font-semibold text-ink-2">
                Reserva
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar detalle"
                className="inline-flex items-center justify-center h-11 w-11 -mr-3 rounded-lg hover:bg-overlay text-ink-2 hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Customer — el cliente es el dato más importante del panel.
                  Sube al top con peso visual; source y status quedan como
                  metadata muteada debajo (no pills, solo tipografía). */}
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-ink leading-tight break-words">
                  {booking.customerName?.trim() || 'Sin nombre'}
                </h2>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-ink-2 tabular-nums">{booking.customerPhone}</p>
                  <button
                    type="button"
                    onClick={copyPhone}
                    aria-label="Copiar teléfono"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-overlay text-ink-2 hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-ink-2">
                  {sourceLabel(booking.source)}
                  {' · '}
                  <span className={statusToneClass(booking.status)}>
                    {statusLabel(booking.status)}
                  </span>
                  {booking.source === 'booksy' && (
                    <span className="text-ink-3"> · solo lectura</span>
                  )}
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-line" />

              {/* Service */}
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                  Servicio
                </p>
                <p className="text-sm font-medium text-ink">{booking.service}</p>
              </div>

              {/* Barber */}
              {booking.barber && (
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                    Barbero
                  </p>
                  <p className="text-sm font-medium text-ink-2">{booking.barber}</p>
                  {/* A2: el cliente pidió a este barbero explícitamente
                      (vs auto-asignado). Driven by bookings.barberRequested. */}
                  {booking.barberRequested && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-strong">
                      <span aria-hidden="true">♥</span>
                      Solicitado por el cliente
                    </p>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-line" />

              {/* Date */}
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                  Fecha
                </p>
                <p className="text-sm text-ink-2 capitalize">{formatDate(booking.date)}</p>
              </div>

              {/* Time */}
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                  Hora
                </p>
                <p className="text-sm text-ink-2">
                  {booking.time}
                  <span className="text-ink-3 mx-1.5">·</span>
                  {booking.duration} min
                </p>
              </div>

              {/* Price */}
              {booking.price !== null && (
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                    Precio
                  </p>
                  <p className="text-sm font-semibold text-brand">{booking.price} €</p>
                </div>
              )}

              {/* R6 — método de cobro registrado (display-only). La captura
                  la hace WS-D al completar; aquí solo se refleja. */}
              {(() => {
                const pb = paymentBadge(booking.paymentMethod);
                if (!pb) return null;
                return (
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                      Cobrado
                    </p>
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                      <span
                        className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded bg-success/10 text-xs font-bold"
                        aria-hidden="true"
                      >
                        {pb.glyph}
                      </span>
                      {pb.label}
                    </p>
                  </div>
                );
              })()}

              {/* Marcar como completada — acción principal cuando la cita ha
                  terminado. Dispara auto-facturación en el servidor: la
                  factura incluye el servicio + productos vendidos durante
                  la cita (las ventas con invoiced_at IS NULL). Si la
                  facturación no está activa, simplemente marca el estado.
                  Solo se ofrece para citas en estado `confirmed`. */}
              {canMarkCompleted && (
                <div className="pt-2 border-t border-line space-y-2">
                  <button
                    type="button"
                    onClick={markCompleted}
                    disabled={pending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Marcar como completada
                  </button>
                  <p className="text-xs text-ink-2 leading-relaxed">
                    Tienes 5 segundos para deshacer el cierre.
                  </p>
                  {error && <p className="text-xs text-danger">{error}</p>}
                </div>
              )}

              {/* Cita ya completada — confirmación visual + recordatorio de
                  qué se hizo. No hay acciones disponibles aquí (la factura
                  se rectifica desde /dashboard/caja). */}
              {isCompleted && (
                <div className="pt-2 border-t border-line">
                  <div className="rounded-xl border border-success/30 bg-success/10 p-3 space-y-1">
                    <p className="text-sm font-semibold text-success inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Cita completada
                    </p>
                    <p className="text-xs text-ink-2 leading-relaxed">
                      Si necesitas anular o ajustar la factura, hazlo desde Caja con una rectificativa.
                    </p>
                  </div>
                </div>
              )}

              {/* No-show toggle — works for all booking sources (bot, Booksy,
                  walk-in). Marking no-show also voids the associated invoice
                  in the background (API-side), so the barber only needs one
                  click here to keep both booking and fiscal state consistent. */}
              {canMarkNoShow && (
                <div className="pt-2 border-t border-line space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                    ¿El cliente se presentó?
                  </p>
                  {isNoShow ? (
                    <button
                      type="button"
                      onClick={toggleNoShow}
                      disabled={pending}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-surface border border-line hover:border-brand hover:text-brand px-4 py-2.5 text-sm font-semibold text-ink transition-colors disabled:opacity-60"
                    >
                      <Undo2 className="h-4 w-4" />
                      Sí vino
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={toggleNoShow}
                      disabled={pending}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-danger/10 border border-danger/30 hover:bg-danger/15 px-4 py-2.5 text-sm font-semibold text-danger transition-colors disabled:opacity-60"
                    >
                      <UserX className="h-4 w-4" />
                      No vino
                    </button>
                  )}
                  <p className="text-xs text-ink-2 leading-relaxed">
                    Marca solo si el cliente no se presentó. Tienes 5 segundos para deshacer.
                  </p>
                  {error && <p className="text-xs text-danger">{error}</p>}
                </div>
              )}

              {/* Cancelar reserva — disponible mientras no esté ya cancelada.
                  Abre modal con mensaje editable y toggle WhatsApp. */}
              {canCancel && (
                <div className="pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-surface border border-line hover:border-danger hover:text-danger px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors"
                  >
                    <CalendarX2 className="h-4 w-4" />
                    Cancelar reserva
                  </button>
                </div>
              )}

              {/* Productos vendidos — botón para añadir venta de producto al
                  cobrar el corte (champú, ceras, etc.). La venta se atribuye
                  automáticamente al barbero del booking → alimenta la columna
                  Upsells del desglose por barbero en /dashboard/caja.
                  Solo durante `confirmed` — al completar la factura ya se
                  emite con los productos hasta ese momento, y nuevas ventas
                  necesitarían una rectificativa para incluirse. */}
              {canSellProduct && (
                <div className="pt-2 border-t border-line space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                    Productos
                  </p>
                  <button
                    type="button"
                    onClick={() => setProductSaleOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface hover:border-line-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors"
                  >
                    <ShoppingBag className="h-4 w-4 text-brand" />
                    Añadir venta de producto
                  </button>
                  {productSalesCount > 0 && (
                    <p className="text-xs text-success inline-flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      {productSalesCount} {productSalesCount === 1 ? 'venta registrada' : 'ventas registradas'} en esta cita
                    </p>
                  )}
                </div>
              )}

              {/* Cobrar online — only for chargeable bookings (confirmed or
                  no_show, with a price). Two states:
                    A) Connect not active -> CTA to activate.
                    B) Connect active     -> amount + description + QR flow. */}
              {canCharge && (
                <div className="pt-2 border-t border-line space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                    Cobrar online
                  </p>

                  {!connectActive ? (
                    <div className="rounded-xl border border-line bg-overlay p-3 space-y-2">
                      <p className="text-xs text-ink-2 leading-relaxed">
                        Activa los cobros online para generar enlaces de pago y QR para tus clientes.
                      </p>
                      <Link
                        href="/dashboard/caja"
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors"
                      >
                        <CreditCard className="h-4 w-4" />
                        Activar cobros online
                      </Link>
                    </div>
                  ) : alreadyPaid ? (
                    <div className="rounded-xl border border-success/30 bg-success/10 p-3 space-y-1">
                      <p className="text-sm font-semibold text-success inline-flex items-center gap-1.5">
                        <Check className="h-4 w-4" /> Pagado online
                      </p>
                      <p className="text-xs text-ink-2">
                        {(paymentData!.payment.amountCents / 100).toFixed(2)} € ·{' '}
                        {paymentData!.payment.paidAt
                          ? format(parseISO(paymentData!.payment.paidAt), "d MMM yyyy 'a las' HH:mm", { locale: es })
                          : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {!hasPendingLink && (
                        <>
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="pay-amount" className="text-[11px] font-medium text-ink-2">
                              Importe (€)
                            </label>
                            <input
                              id="pay-amount"
                              type="number"
                              min={MIN_AMOUNT_EUROS}
                              max={MAX_AMOUNT_EUROS}
                              step="0.01"
                              value={amountEuros}
                              onChange={(e) => setAmountEuros(e.target.value)}
                              className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="pay-desc" className="text-[11px] font-medium text-ink-2">
                              Concepto (opcional)
                            </label>
                            <input
                              id="pay-desc"
                              type="text"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              maxLength={200}
                              className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={generateLink}
                            disabled={paymentLoading}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
                          >
                            {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                            Generar link de pago
                          </button>
                        </>
                      )}

                      {hasPendingLink && (
                        <div className="space-y-3">
                          <p className="text-xs text-ink-2 leading-relaxed">
                            Pide al cliente que escanee con la cámara de su móvil. Se actualizará solo cuando pague.
                          </p>

                          {paymentData?.qrCodeDataUrl ? (
                            <div className="flex items-center justify-center rounded-xl border border-line bg-surface p-3">
                              <Image
                                src={paymentData.qrCodeDataUrl}
                                alt="QR de pago"
                                width={240}
                                height={240}
                                unoptimized
                                className="h-60 w-60"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center rounded-xl border border-line bg-overlay p-5 text-xs text-ink-2">
                              QR no disponible en este dispositivo. Comparte el link manualmente.
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <a
                              href={paymentData!.payment.paymentUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-2 text-xs font-medium text-ink-2 transition-colors"
                            >
                              <LinkIcon className="h-3.5 w-3.5" />
                              Abrir link
                            </a>
                            <button
                              type="button"
                              onClick={copyLink}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-2 text-xs font-medium text-ink-2 transition-colors"
                            >
                              {linkCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                              {linkCopied ? 'Copiado' : 'Copiar'}
                            </button>
                          </div>

                          <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 text-warning border border-warning/20 px-2.5 py-1 text-[11px] font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Esperando pago
                          </div>
                        </div>
                      )}

                      {paymentError && <p className="text-xs text-danger">{paymentError}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}

      {booking && cancelOpen && (
        <CancelBookingModal
          booking={booking}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => {
            setCancelOpen(false)
            router.refresh()
            onClose()
          }}
        />
      )}

      {booking && (
        <AddProductSaleModal
          isOpen={productSaleOpen}
          bookingId={booking.id}
          customerName={booking.customerName ?? null}
          barberName={booking.barber ?? null}
          onClose={() => setProductSaleOpen(false)}
          onCreated={() => setProductSalesCount((n) => n + 1)}
        />
      )}

      {booking && (
        <PaymentMethodPrompt
          open={methodPromptOpen}
          onClose={() => setMethodPromptOpen(false)}
          onPick={(m) => void markCompletedWithMethod(m)}
          subtitle={`${booking.service} · ${booking.customerName ?? booking.customerPhone}`}
          pending={methodPending}
        />
      )}

      {booking && booking.price != null && booking.price > 0 && (
        <SumupCheckoutPrompt
          open={sumupPromptOpen}
          bookingId={booking.id}
          amountCents={Math.round(booking.price * 100)}
          subtitle={`${booking.service} · ${booking.customerName ?? booking.customerPhone}`}
          onClose={() => setSumupPromptOpen(false)}
          onSettled={() => {
            // Callback de SumUp ya cerró el booking + cash_movement.
            // Refrescamos parent para verlo.
            startTransition(() => router.refresh());
          }}
          onFallback={() => {
            // Si SumUp falla, abrimos el modal manual cash/card/online.
            setMethodPromptOpen(true);
          }}
        />
      )}
    </AnimatePresence>
  );
}

// -----------------------------------------------------------------------------
// CancelBookingModal — modal de cancelación con mensaje editable + toggle
// para avisar al cliente por WhatsApp. Delega en PATCH /api/bookings/[id]
// que acepta `status: 'cancelled'` + `notify: boolean` + `notifyMessage`.
// -----------------------------------------------------------------------------
function CancelBookingModal({
  booking,
  onClose,
  onCancelled,
}: {
  booking: CalendarEvent
  onClose: () => void
  onCancelled: () => void
}) {
  const firstName = booking.customerName?.split(' ')[0] || 'hola'
  const defaultMessage =
    `Hola ${firstName}, lo siento pero tenemos que cancelar tu cita del ` +
    `${booking.date} a las ${booking.time}. ` +
    `Si quieres reservar otra hora, ¡no dudes en hacerlo! Disculpa las molestias.`

  const [message, setMessage] = useState(defaultMessage)
  const [notify, setNotify] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    setWarning(null)
    try {
      const r = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          notify,
          notifyMessage: notify ? message.trim() : undefined,
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data?.error || 'No se pudo cancelar.')
        setSubmitting(false)
        return
      }
      if (notify && data?.notifyStatus === 'failed') {
        setWarning(
          'Reserva cancelada pero el WhatsApp no se pudo enviar (el cliente puede estar fuera de la ventana de Meta). Avísale tú.',
        )
        // Esperamos un par de segundos para que el warning se lea
        setTimeout(onCancelled, 2400)
        return
      }
      onCancelled()
    } catch {
      setError('Error de red.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--color-scrim-strong)] backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-line flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
            <CalendarX2 className="h-5 w-5 text-danger" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-ink">Cancelar la cita</h3>
            <p className="text-xs text-ink-2 mt-0.5">
              {booking.customerName} · {booking.service} · {booking.date} {booking.time}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="text-ink-3 hover:text-ink p-1 -m-1 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <MessageCircle className="h-3.5 w-3.5" />
                Avisar al cliente por WhatsApp
              </div>
              <p className="text-xs text-ink-2 mt-0.5">
                Enviamos el mensaje de abajo desde tu número.
                {booking.customerPhone && <> Destinatario: {booking.customerPhone}.</>}
              </p>
            </div>
          </label>

          {notify && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-2">Mensaje</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 400))}
                rows={4}
                disabled={submitting}
                className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none resize-none"
              />
              <p className="text-xs text-ink-2 text-right tabular-nums">{message.length}/400</p>
            </div>
          )}

          {error && (
            <p className="text-sm rounded-lg bg-danger/10 border border-danger/30 text-danger px-3 py-2">
              {error}
            </p>
          )}
          {warning && (
            <p className="text-sm rounded-lg bg-warning/10 border border-warning/30 text-warning px-3 py-2">
              {warning}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-overlay/40 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2 hover:text-ink disabled:opacity-60"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || (notify && !message.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-danger hover:bg-danger/90 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cancelar cita
          </button>
        </div>
      </div>
    </div>
  )
}
