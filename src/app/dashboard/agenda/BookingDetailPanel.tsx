'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, CheckCircle2, UserX, Undo2, CreditCard, Link as LinkIcon, Loader2, QrCode, CalendarX2, MessageCircle, ShoppingBag, Pencil, Plus, Trash2, FileWarning } from 'lucide-react';
import AddProductSaleModal from './AddProductSaleModal';
import PaymentMethodPrompt, { type CashPaymentMethod } from '../_components/PaymentMethodPrompt';
import SumupCheckoutPrompt from '../_components/SumupCheckoutPrompt';
import RectificativaModal from '../facturas/_components/RectificativaModal';
import NumberInput from '../_components/NumberInput';
import { pushUndoToast } from '../_components/UndoToast';
import { computeBookingSnapshot, type BookingServiceLine } from '@/lib/bookings/duration';
import ClientProfile from '../clientes/[id]/ClientProfile';
import type { ClientProfileData } from '@/lib/clients/profile';
import { useState, useTransition, useEffect, useCallback, Fragment } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { paymentBadge } from './types';
import type { CalendarEvent, Barber } from './types';

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
  /** Equipo activo — para el selector de barbero del editor "mover cita"
   *  (R3: mover sin entrar en Horarios y cambios). */
  barbers?: Barber[];
  /** Se invoca tras un movimiento exitoso (date/time/barber). El padre
   *  revalida la agenda. */
  onMoved?: () => void;
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

export default function BookingDetailPanel({ booking, onClose, stripeConnectStatus, cashRegisterEnabled = false, sumupReaderConnected = false, barbers = [], onMoved }: Props) {
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
  // A3 — Booksy es solo-lectura (sus citas se gestionan en Booksy). La
  // edición libre solo aplica ANTES de cerrar la cita (confirmed/no_show):
  // no hay documento fiscal todavía. Tras completar → rectificativa.
  const isBooksy = booking?.source === 'booksy';
  const canEditFreely =
    !isBooksy &&
    (booking?.status === 'confirmed' || booking?.status === 'no_show');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [productSaleOpen, setProductSaleOpen] = useState(false);
  // Editor "mover cita" (R3): mover día/hora/barbero sin salir del panel.
  // Solo para citas confirmadas (las completadas/canceladas no se mueven).
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState('');
  const [moveTime, setMoveTime] = useState('');
  const [moveBarberId, setMoveBarberId] = useState<string>('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const canMove = booking?.status === 'confirmed' && booking?.source !== 'booksy';

  // Sembrar el editor con los valores actuales cada vez que cambia la
  // reserva o se abre el editor.
  useEffect(() => {
    if (booking) {
      setMoveDate(booking.date);
      setMoveTime(booking.time);
      setMoveBarberId(booking.barberId ?? '');
      setMoveOpen(false);
      setMoveError(null);
    }
  }, [booking?.id, booking]);

  async function submitMove() {
    if (!booking) return;
    setMoving(true);
    setMoveError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: moveDate,
          time: moveTime,
          barberId: moveBarberId === '' ? null : moveBarberId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMoveError(
          body?.error ||
            (res.status === 409
              ? 'Ese hueco ya está ocupado.'
              : 'No se pudo mover la cita.'),
        );
        setMoving(false);
        return;
      }
      setMoveOpen(false);
      onMoved?.();
      onClose();
    } catch {
      setMoveError('Sin conexión. La cita no se movió.');
    } finally {
      setMoving(false);
    }
  }

  // A3 — editar servicio/precio. Antes de completar = edición libre (modal
  // propio). Después de completar = rectificativa (factura sellada nunca se
  // muta). `editOpen` abre el modal pre-completion; `rectificativa` guarda la
  // factura encontrada para abrir RectificativaModal post-completion.
  const [editOpen, setEditOpen] = useState(false);
  const [rectInvoice, setRectInvoice] = useState<{
    id: string;
    number: string;
    subtotalCents: number;
    totalCents: number;
    ivaRate: number;
    status: string;
  } | null>(null);
  const [rectLoading, setRectLoading] = useState(false);
  const [rectError, setRectError] = useState<string | null>(null);
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
    // A3 — cierra cualquier modal de edición/rectificativa al cambiar de cita.
    setEditOpen(false);
    setRectInvoice(null);
    setRectError(null);
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

  // A3 post-completion: localiza la factura de la cita cerrada y abre el
  // modal de rectificativa. Nunca toca la factura original (createRectificativa
  // emite un documento nuevo que la sustituye legalmente y la sella en
  // VeriFactu con su propia huella).
  const openRectificativa = useCallback(async () => {
    if (!booking) return;
    setRectError(null);
    setRectLoading(true);
    try {
      const res = await fetch(
        `/api/invoices/by-booking?bookingId=${encodeURIComponent(booking.id)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRectError(data.error || 'No se pudo cargar la factura.');
        return;
      }
      if (!data.invoice) {
        setRectError(
          'Esta cita no tiene factura emitida (puede que la facturación no esté activa). No hay nada que rectificar.',
        );
        return;
      }
      if (data.invoice.status === 'rectified') {
        setRectError('Esta factura ya tiene una rectificativa emitida.');
        return;
      }
      setRectInvoice(data.invoice);
    } catch {
      setRectError('Error de red.');
    } finally {
      setRectLoading(false);
    }
  }, [booking]);

  // Ficha de cliente en overlay (fix #1) — al clicar el nombre del cliente
  // se abre <ClientProfile> (el MISMO componente que /clientes/[id]) sin
  // salir de la agenda. Datos vía /api/customers/[id]/profile?phone=…
  // (loadClientProfile, fuente única). Cero UI de cliente duplicada.
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState<ClientProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Resetea la ficha al cambiar de reserva (evita ver el cliente anterior).
  useEffect(() => {
    setProfileOpen(false);
    setProfileData(null);
    setProfileError(null);
  }, [booking?.id]);

  const openClientProfile = useCallback(async () => {
    if (!booking) return;
    setProfileOpen(true);
    // Si ya lo cargamos para esta reserva, no re-pedimos.
    if (profileData) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const res = await fetch(
        `/api/customers/by-phone/profile?phone=${encodeURIComponent(booking.customerPhone)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(
          data?.error ||
            (res.status === 404
              ? 'Este cliente todavía no tiene ficha.'
              : 'No se pudo cargar la ficha.'),
        );
        return;
      }
      setProfileData(data.profile as ClientProfileData);
    } catch {
      setProfileError('Error de red.');
    } finally {
      setProfileLoading(false);
    }
  }, [booking, profileData]);

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
    <>
      {/* AnimatePresence solo envuelve el panel deslizante: sus hijos
          directos DEBEN llevar key única. Antes envolvía también los dos
          modales sin key → React/framer veía varios hijos con key ``
          ("two children with the same key"). Los modales son siblings,
          no entran/salen con la animación del panel. */}
      <AnimatePresence>
      {booking && (
        <Fragment key="detail">
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
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            // Ancho tipo Booksy (panel de detalle ~440px, no la columna
            // estrecha de 320 de antes — se perdía información y obligaba a
            // scrollear). max-w-[90vw] lo mantiene dentro del viewport en
            // pantallas pequeñas; x:'100%' hace el slide independiente del
            // ancho concreto.
            className="fixed right-0 top-0 z-50 h-full w-[440px] max-w-[90vw] bg-surface border-l border-line flex flex-col shadow-xl"
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
                {/* Nombre del cliente → abre su ficha completa (fix #1).
                    El mismo <ClientProfile> que /clientes/[id], en overlay,
                    sin salir de la agenda. */}
                <button
                  type="button"
                  onClick={openClientProfile}
                  className="group text-left -m-1 p-1 rounded-lg hover:bg-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand transition-colors"
                  aria-label={`Ver ficha de ${booking.customerName?.trim() || 'este cliente'}`}
                >
                  <span className="text-xl font-semibold text-ink leading-tight break-words group-hover:text-brand transition-colors">
                    {booking.customerName?.trim() || 'Sin nombre'}
                  </span>
                  <span className="block text-[11px] font-medium text-ink-3 group-hover:text-brand-strong transition-colors">
                    Ver ficha del cliente →
                  </span>
                </button>
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

              {/* Mover cita (R3) — editar día/hora/barbero sin entrar en
                  "Horarios y cambios". Solo citas confirmadas no-Booksy.
                  Reusa PATCH /api/bookings/[id] con re-validación de solape. */}
              {canMove && (
                <div className="pt-1">
                  {!moveOpen ? (
                    <button
                      type="button"
                      onClick={() => setMoveOpen(true)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface hover:border-line-strong px-4 py-2.5 text-sm font-medium text-ink-2 hover:text-ink transition-colors"
                    >
                      Mover cita
                    </button>
                  ) : (
                    <div className="rounded-xl border border-line bg-overlay/40 p-3 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                        Mover cita
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="move-date" className="text-[11px] font-medium text-ink-2">
                          Fecha
                        </label>
                        <input
                          id="move-date"
                          type="date"
                          value={moveDate}
                          onChange={(e) => setMoveDate(e.target.value)}
                          className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="move-time" className="text-[11px] font-medium text-ink-2">
                          Hora
                        </label>
                        <input
                          id="move-time"
                          type="time"
                          step={300}
                          value={moveTime}
                          onChange={(e) => setMoveTime(e.target.value)}
                          className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                        />
                      </div>
                      {barbers.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="move-barber" className="text-[11px] font-medium text-ink-2">
                            Barbero
                          </label>
                          <select
                            id="move-barber"
                            value={moveBarberId}
                            onChange={(e) => setMoveBarberId(e.target.value)}
                            className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                          >
                            <option value="">Cualquiera</option>
                            {barbers.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {moveError && <p className="text-xs text-danger">{moveError}</p>}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setMoveOpen(false);
                            setMoveError(null);
                          }}
                          disabled={moving}
                          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink disabled:opacity-60"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={submitMove}
                          disabled={moving || !moveDate || !moveTime}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand hover:bg-brand-strong px-3 py-2 text-xs font-semibold text-brand-ink disabled:opacity-60 transition-colors"
                        >
                          {moving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

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

              {/* A3 — editar servicio/precio ANTES de cerrar la cita. Sin
                  documento fiscal aún → edición libre (PUT services). Tras
                  completar, este botón desaparece y se ofrece la
                  rectificativa (bloque isCompleted abajo). */}
              {canEditFreely && (
                <div className="pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface hover:border-brand hover:text-brand px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar servicio o precio
                  </button>
                </div>
              )}

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

              {/* Cita ya completada — la factura está sellada en VeriFactu y
                  NUNCA se muta. A3: "Editar venta" emite una rectificativa
                  (createRectificativa) que la sustituye legalmente. */}
              {isCompleted && (
                <div className="pt-2 border-t border-line space-y-2">
                  <div className="rounded-xl border border-success/30 bg-success/10 p-3 space-y-1">
                    <p className="text-sm font-semibold text-success inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Cita completada
                    </p>
                    <p className="text-xs text-ink-2 leading-relaxed">
                      La factura ya está emitida. Para corregir el importe o el
                      servicio se emite una rectificativa — la original no se
                      modifica.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openRectificativa}
                    disabled={rectLoading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface hover:border-brand hover:text-brand px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors disabled:opacity-60"
                  >
                    {rectLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileWarning className="h-4 w-4" />
                    )}
                    Editar venta (rectificativa)
                  </button>
                  {rectError && (
                    <p className="text-xs text-danger leading-relaxed">{rectError}</p>
                  )}
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
                            <NumberInput
                              id="pay-amount"
                              value={amountEuros === '' ? null : Number(amountEuros)}
                              onValueChange={(n) =>
                                setAmountEuros(n === null ? '' : String(n))
                              }
                              min={MIN_AMOUNT_EUROS}
                              max={MAX_AMOUNT_EUROS}
                              decimals={2}
                              step="0.01"
                              aria-label="Importe a cobrar en euros"
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
        </Fragment>
      )}
      </AnimatePresence>

      {/* Modales — siblings del panel, FUERA de AnimatePresence. No
          comparten su key-set (cada uno gestiona su propio open/close);
          meterlos dentro provocaba la colisión de key vacía. */}
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

      {/* A3 pre-completion — edición libre de servicio/precio/extras. */}
      {booking && editOpen && (
        <EditServiceModal
          booking={booking}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* A3 post-completion — rectificativa de la factura sellada. La
          original NUNCA se muta; createRectificativa emite un documento
          nuevo que la sustituye y la sella en VeriFactu. RectificativaModal
          navega a la factura nueva al confirmar. */}
      {rectInvoice && (
        <RectificativaModal
          originalInvoiceId={rectInvoice.id}
          originalNumber={rectInvoice.number}
          originalSubtotalCents={rectInvoice.subtotalCents}
          originalTotalCents={rectInvoice.totalCents}
          originalIvaRate={rectInvoice.ivaRate}
          onClose={() => setRectInvoice(null)}
        />
      )}

      {/* Ficha de cliente en overlay (fix #1) — slide-over sobre el panel
          de detalle. Mismo <ClientProfile> que /clientes/[id], variant
          panel. z-[60] para quedar sobre el panel de detalle (z-50). */}
      <AnimatePresence>
        {profileOpen && booking && (
          <Fragment key="client-profile">
            <motion.div
              key="cp-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProfileOpen(false)}
              className="fixed inset-0 z-[60] bg-[var(--color-scrim-light)]"
            />
            <motion.div
              key="cp-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="fixed right-0 top-0 z-[60] h-full w-[480px] max-w-[94vw] bg-canvas border-l border-line flex flex-col shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-label="Ficha del cliente"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface shrink-0">
                <span className="text-xs uppercase tracking-[0.18em] font-semibold text-ink-2">
                  Ficha del cliente
                </span>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  aria-label="Cerrar ficha"
                  className="inline-flex items-center justify-center h-11 w-11 -mr-3 rounded-lg hover:bg-overlay text-ink-2 hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {profileLoading ? (
                  <div className="flex items-center justify-center py-16 text-ink-3">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  </div>
                ) : profileError ? (
                  <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-2">
                    {profileError}
                  </div>
                ) : profileData ? (
                  <ClientProfile data={profileData} variant="panel" />
                ) : null}
              </div>
            </motion.div>
          </Fragment>
        )}
      </AnimatePresence>
    </>
  );
}

// -----------------------------------------------------------------------------
// EditServiceModal — A3 antes de completar. Edita el servicio principal, su
// precio/duración y los servicios extra (R7). No hay documento fiscal todavía
// → es edición libre vía PUT /api/bookings/[id]/services, que reescribe el
// snapshot bookings.duration = principal + suma(extras) (mismo helper que
// create.ts, evita el foot-gun de solape). Campos numéricos = NumberInput
// (R11): se pueden dejar vacíos sin que salten a 0.
// -----------------------------------------------------------------------------
function EditServiceModal({
  booking,
  onClose,
  onSaved,
}: {
  booking: CalendarEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [service, setService] = useState(booking.service);
  const [price, setPrice] = useState<number | null>(booking.price);
  const [duration, setDuration] = useState<number | null>(booking.duration);
  const [extras, setExtras] = useState<BookingServiceLine[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precarga los servicios extra existentes para que editar no los borre.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/bookings/${booking.id}/services`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { extraServices?: BookingServiceLine[] }) => {
        if (Array.isArray(d.extraServices)) setExtras(d.extraServices);
      })
      .catch(() => {
        /* aborted/red — el barbero puede re-añadir manualmente */
      })
      .finally(() => setLoadingExtras(false));
    return () => controller.abort();
  }, [booking.id]);

  const totalDuration = computeBookingSnapshot(duration ?? 0, extras).durationMin;

  const updateExtra = (idx: number, patch: Partial<BookingServiceLine>) => {
    setExtras((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const submit = async () => {
    if (!service.trim()) {
      setError('El servicio principal es obligatorio.');
      return;
    }
    if (!duration || duration <= 0) {
      setError('La duración del servicio principal debe ser mayor que 0.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/bookings/${booking.id}/services`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: service.trim(),
          price: price,
          duration: duration,
          extraServices: extras.filter(
            (e) => e.name.trim() && e.durationMin > 0,
          ),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error || 'No se pudo guardar.');
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch {
      setError('Error de red.');
      setSubmitting(false);
    }
  };

  const INPUT =
    'w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--color-scrim-strong)] backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-line flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-softer flex items-center justify-center shrink-0">
            <Pencil className="h-5 w-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-ink">
              Editar servicio o precio
            </h3>
            <p className="text-xs text-ink-2 mt-0.5">
              {booking.customerName ?? booking.customerPhone} · {booking.date}{' '}
              {booking.time}
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

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-1.5">
              Servicio principal
            </label>
            <input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              disabled={submitting}
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-1.5">
                Duración (min)
              </label>
              <NumberInput
                value={duration}
                onValueChange={setDuration}
                min={5}
                max={480}
                decimals={0}
                disabled={submitting}
                className={INPUT}
                aria-label="Duración del servicio principal en minutos"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-1.5">
                Precio (€)
              </label>
              <NumberInput
                value={price}
                onValueChange={setPrice}
                min={0}
                decimals={2}
                step="0.01"
                placeholder="0"
                disabled={submitting}
                className={INPUT}
                aria-label="Precio del servicio principal en euros"
              />
            </div>
          </div>

          {/* Servicios extra (R7) */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
              Servicios extra
            </p>
            {loadingExtras ? (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-ink-3" />
              </div>
            ) : (
              <>
                {extras.map((extra, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-line bg-overlay/40 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={extra.name}
                        onChange={(e) =>
                          updateExtra(idx, { name: e.target.value })
                        }
                        placeholder="Nombre del servicio"
                        disabled={submitting}
                        className={INPUT}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setExtras((prev) => prev.filter((_, i) => i !== idx))
                        }
                        disabled={submitting}
                        aria-label={`Quitar servicio extra ${idx + 1}`}
                        className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-ink-2 mb-1 block">
                          Duración (min)
                        </label>
                        <NumberInput
                          value={extra.durationMin}
                          onValueChange={(n) =>
                            updateExtra(idx, { durationMin: n ?? 0 })
                          }
                          min={0}
                          max={480}
                          decimals={0}
                          disabled={submitting}
                          className={INPUT}
                          aria-label={`Duración servicio extra ${idx + 1}`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-ink-2 mb-1 block">
                          Precio (€)
                        </label>
                        <NumberInput
                          value={extra.priceEuros}
                          onValueChange={(n) =>
                            updateExtra(idx, { priceEuros: n })
                          }
                          min={0}
                          decimals={2}
                          step="0.01"
                          placeholder="0"
                          disabled={submitting}
                          className={INPUT}
                          aria-label={`Precio servicio extra ${idx + 1}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setExtras((prev) => [
                      ...prev,
                      { name: '', durationMin: 30, priceEuros: null },
                    ])
                  }
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line hover:border-brand hover:text-brand px-3 py-2 text-xs font-semibold text-ink-2 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Añadir otro servicio
                </button>
              </>
            )}
            {extras.length > 0 && (
              <p className="text-[11px] text-ink-2">
                Duración total:{' '}
                <span className="font-semibold text-ink tabular-nums">
                  {totalDuration} min
                </span>
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm rounded-lg bg-danger/10 border border-danger/30 text-danger px-3 py-2">
              {error}
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
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
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
