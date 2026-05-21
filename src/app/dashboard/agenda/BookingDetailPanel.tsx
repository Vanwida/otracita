'use client';

import { X, Copy, Check, CheckCircle2, UserX, Undo2, CreditCard, Link as LinkIcon, Loader2, QrCode, CalendarX2, MessageCircle, ShoppingBag, Pencil, Plus, FileWarning, Phone, RotateCcw, AlertTriangle } from 'lucide-react';
import AddProductSaleModal from './AddProductSaleModal';
import SlideOver from '../_components/SlideOver';
import Modal from '../_components/Modal';
import ServiceLinePicker from '../_components/ServiceLinePicker';
import PaymentMethodPrompt, { type CashPaymentMethod } from '../_components/PaymentMethodPrompt';
import SumupCheckoutPrompt from '../_components/SumupCheckoutPrompt';
import RectificativaModal from '../facturas/_components/RectificativaModal';
import NumberInput from '../_components/NumberInput';
import { pushUndoToast } from '../_components/UndoToast';
import { computeBookingSnapshot, type BookingServiceLine } from '@/lib/bookings/duration';
import ClientProfile from '../clientes/[id]/ClientProfile';
import type { ClientProfileData } from '@/lib/clients/profile';
import { useState, useTransition, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { paymentBadge } from './types';
import type { CalendarEvent, Barber } from './types';
import { FEEDBACK_MS } from '@/lib/ui-timings'

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
  /** Catálogo de servicios de la tienda — el editor "Editar servicio o
   *  precio" lo usa para el picker (FIX C: principal+extras = dropdown,
   *  no texto libre). Mismo shape que recibe NewBookingPanel. */
  services?: Array<{ name: string; duration: number; price: number }>;
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

export default function BookingDetailPanel({ booking, onClose, stripeConnectStatus, cashRegisterEnabled = false, sumupReaderConnected = false, barbers = [], services = [], onMoved }: Props) {
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

  // Refund state — separado del cobro. `refundConfirm` abre el paso de
  // confirmación (un reembolso es irreversible y mueve dinero real).
  const [refundConfirm, setRefundConfirm] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

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
    setRefundConfirm(false);
    setRefundError(null);
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

  // F5 Reni: badge Nuevo/Habitual debajo del nombre. Fetch ligero a
  // /api/customers/by-phone/visits (solo cuenta de reservas). No carga la
  // ficha completa: 1 SELECT contra customers (vs la profile que hace ~6).
  const [visitInfo, setVisitInfo] = useState<{
    isNew: boolean
    visitNumber: number
  } | null>(null);

  // Resetea la ficha al cambiar de reserva (evita ver el cliente anterior).
  useEffect(() => {
    setProfileOpen(false);
    setProfileData(null);
    setProfileError(null);
    setVisitInfo(null);
  }, [booking?.id]);

  // Lookup ligero de visitas — dispara al abrir/cambiar de reserva. El badge
  // queda vacío si falla (no es crítico para el flow de la agenda).
  useEffect(() => {
    if (!booking?.customerPhone) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/customers/by-phone/visits?phone=${encodeURIComponent(booking.customerPhone)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          isNew: boolean;
          visitNumber: number;
        };
        if (!cancelled) {
          setVisitInfo({ isNew: data.isNew, visitNumber: data.visitNumber });
        }
      } catch {
        // silencioso — el badge simplemente no aparece
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking?.id, booking?.customerPhone]);

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
    setTimeout(() => setCopied(false), FEEDBACK_MS.copied);
  };

  const copyLink = () => {
    if (!paymentData?.payment.paymentUrl) return;
    navigator.clipboard.writeText(paymentData.payment.paymentUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), FEEDBACK_MS.copied);
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

  // Reembolso total del cobro online (Stripe Connect). Idempotente en el
  // backend; aquí solo reflejamos el estado. Tras éxito el pago pasa a
  // 'refunded' y la UI muestra el estado reembolsado.
  const refundPayment = useCallback(async () => {
    const paymentId = paymentData?.payment.id;
    if (!paymentId) return;
    setRefundError(null);
    setRefundLoading(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefundError(data.error || 'No se pudo reembolsar');
        setRefundLoading(false);
        return;
      }
      setPaymentData((prev) =>
        prev
          ? { ...prev, payment: { ...prev.payment, status: 'refunded' } }
          : prev,
      );
      setRefundConfirm(false);
    } catch {
      setRefundError('Error de red');
    } finally {
      setRefundLoading(false);
    }
  }, [paymentData]);

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  const sourceLabel = (source: string) =>
    source === 'booksy' ? 'Booksy' : 'WhatsApp Bot';

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

  // Booksy abre el panel con una BANDA DE ESTADO de color a todo el ancho
  // (verde "CONFIRMADO", screenshot 09.58.37). Mismo patrón con tokens
  // otracita: el estado lo lleva la banda, no metadata gris perdida en el
  // cuerpo. Texto sobre fondo de color saturado → usamos los tokens
  // success/danger/ink al ~12% para fondo + el sólido para el texto, AAA.
  const statusBanner = (
    status: string,
  ): { bg: string; fg: string } => {
    switch (status) {
      case 'no_show':
        return { bg: 'bg-danger', fg: 'text-white' };
      case 'completed':
        return { bg: 'bg-success', fg: 'text-white' };
      case 'cancelled':
        return { bg: 'bg-overlay', fg: 'text-ink-2' };
      default: // confirmed → verde, igual que Booksy
        return { bg: 'bg-success', fg: 'text-white' };
    }
  };

  const alreadyPaid = paymentData?.payment.status === 'succeeded';
  const isRefunded = paymentData?.payment.status === 'refunded';
  const hasPendingLink = paymentData?.payment.status === 'pending' && paymentData?.payment.paymentUrl;

  return (
    <>
      {/* Slide-over canónico (mismo chasis que NewBookingPanel y la ficha
          de cliente — ancho/scrim/anim/a11y en _components/SlideOver). Sin
          `title`: el detalle pinta su propia banda de estado de color como
          primer hijo. Los modales y overlays de abajo son SIBLINGS suyos,
          con su propio ciclo de vida. */}
      <SlideOver
        open={!!booking}
        onClose={onClose}
        ariaLabel="Detalle de la cita"
      >
        {booking && (
          <>
            {/* Banda de estado a todo el ancho (Booksy 09.58.37): ✕ a la
                izquierda, estado en mayúsculas al centro, "Llamar" a la
                derecha. El color de la banda comunica el estado. */}
            {(() => {
              const sb = statusBanner(booking.status);
              return (
                <div
                  className={`flex items-center justify-between px-3 py-2.5 ${sb.bg} ${sb.fg}`}
                >
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar detalle"
                    className="inline-flex items-center justify-center h-10 w-10 rounded-lg hover:bg-black/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <span className="text-xs uppercase tracking-[0.18em] font-bold">
                    {statusLabel(booking.status)}
                    {booking.source === 'booksy' && ' · Booksy'}
                  </span>
                  <a
                    href={`tel:${booking.customerPhone}`}
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-black/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    Llamar
                  </a>
                </div>
              );
            })()}

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

                {/* F5 Reni · badge Nuevo/Habitual. Renderiza solo cuando hay
                    info (silencioso si falla el fetch). Tokens semánticos:
                    brand-softer para Nuevo (positivo, captación) · overlay
                    neutro para Habitual (fidelización implícita). */}
                {visitInfo && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      visitInfo.isNew
                        ? 'bg-brand-softer text-brand-strong border border-brand/30'
                        : 'bg-overlay text-ink-2 border border-line'
                    }`}
                    aria-label={
                      visitInfo.isNew
                        ? 'Cliente nuevo'
                        : `Cliente habitual, visita ${visitInfo.visitNumber}`
                    }
                  >
                    {visitInfo.isNew
                      ? 'Nuevo cliente'
                      : `Habitual · ${visitInfo.visitNumber}ª visita`}
                  </span>
                )}

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
                {/* El estado ya lo lleva la banda superior (Booksy no lo
                    repite); aquí solo el origen + aviso solo-lectura. */}
                <p className="text-xs text-ink-2">
                  {sourceLabel(booking.source)}
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
                  ) : isRefunded ? (
                    <div className="rounded-xl border border-line bg-overlay p-3 space-y-1">
                      <p className="text-sm font-semibold text-ink-2 inline-flex items-center gap-1.5">
                        <RotateCcw className="h-4 w-4" /> Reembolsado
                      </p>
                      <p className="text-xs text-ink-2">
                        {(paymentData!.payment.amountCents / 100).toFixed(2)} € devueltos al cliente
                      </p>
                    </div>
                  ) : alreadyPaid ? (
                    <div className="rounded-xl border border-success/30 bg-success/10 p-3 space-y-2">
                      <p className="text-sm font-semibold text-success inline-flex items-center gap-1.5">
                        <Check className="h-4 w-4" /> Pagado online
                      </p>
                      <p className="text-xs text-ink-2">
                        {(paymentData!.payment.amountCents / 100).toFixed(2)} € ·{' '}
                        {paymentData!.payment.paidAt
                          ? format(parseISO(paymentData!.payment.paidAt), "d MMM yyyy 'a las' HH:mm", { locale: es })
                          : ''}
                      </p>

                      {/* Reembolsar — acción de dinero irreversible: paso de
                          confirmación explícito antes de ejecutar. */}
                      {!refundConfirm ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRefundError(null);
                            setRefundConfirm(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reembolsar
                        </button>
                      ) : (
                        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 space-y-2">
                          <p className="text-xs text-ink inline-flex items-start gap-1.5 leading-relaxed">
                            <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
                            Se devolverán{' '}
                            <strong>{(paymentData!.payment.amountCents / 100).toFixed(2)} €</strong>{' '}
                            al cliente. No se puede deshacer.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={refundPayment}
                              disabled={refundLoading}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-danger hover:bg-danger/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-60"
                            >
                              {refundLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Confirmar reembolso
                            </button>
                            <button
                              type="button"
                              onClick={() => setRefundConfirm(false)}
                              disabled={refundLoading}
                              className="inline-flex items-center justify-center rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors disabled:opacity-60"
                            >
                              Cancelar
                            </button>
                          </div>
                          {refundError && (
                            <p className="text-xs text-danger">{refundError}</p>
                          )}
                        </div>
                      )}
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

            {/* Footer fijo con el TOTAL (Booksy 09.58.37: barra inferior
                con "Total" grande). Sticky shrink-0 fuera del scroll. Solo
                cuando la cita tiene precio. */}
            {booking.price !== null && booking.price !== undefined && (
              <div className="shrink-0 border-t border-line bg-surface px-5 py-3 flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-2">
                  Total
                </span>
                <span className="text-2xl font-bold text-ink tabular-nums leading-none">
                  {booking.price} €
                </span>
              </div>
            )}
          </>
        )}
      </SlideOver>

      {/* Modales — siblings del panel, FUERA del slide-over. No comparten
          su ciclo de vida (cada uno gestiona su propio open/close);
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
          services={services}
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

      {/* Ficha de cliente en overlay — slide-over CANÓNICO sobre el panel
          de detalle. Mismo <ClientProfile> que /clientes/[id], variant
          panel. surface="canvas" (superficie tipo lista), zClass z-[60]
          para apilar SOBRE el panel de detalle (z-50). Ancho canónico:
          antes divergía a w-[480px]/94vw — ahora la única definición vive
          en SlideOver. Header propio (barra bg-surface) como primer hijo. */}
      <SlideOver
        open={profileOpen && !!booking}
        onClose={() => setProfileOpen(false)}
        ariaLabel="Ficha del cliente"
        surface="canvas"
        zClass="z-[60]"
        scrim="always"
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
      </SlideOver>
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
  services,
  onClose,
  onSaved,
}: {
  booking: CalendarEvent;
  services: Array<{ name: string; duration: number; price: number }>;
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


  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel="Editar servicio o precio"
      size="md"
      zClass="z-[70]"
      closeOnBackdrop={!submitting}
      footer={
        <div className="flex items-center justify-end gap-2">
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
      }
    >
        {/* Header propio (avatar Pencil + contexto de la cita). */}
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
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Servicio principal — picker compartido (catálogo →
              autorrellena duración/precio, editables). MISMA pieza que
              "Nueva cita" (FIX C: ya no se teclea el nombre a mano). */}
          <ServiceLinePicker
            services={services}
            value={{
              name: service,
              durationMin: duration ?? 0,
              priceEuros: price,
            }}
            onChange={(v) => {
              setService(v.name);
              setDuration(v.durationMin || null);
              setPrice(v.priceEuros);
            }}
            label="Servicio principal"
            required
            disabled={submitting}
            ariaSuffix="servicio principal"
          />

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
                    className="rounded-lg border border-line bg-overlay/40 p-3"
                  >
                    <ServiceLinePicker
                      services={services}
                      value={extra}
                      onChange={(v) => updateExtra(idx, v)}
                      onRemove={() =>
                        setExtras((prev) => prev.filter((_, i) => i !== idx))
                      }
                      label={`Servicio extra ${idx + 1}`}
                      disabled={submitting}
                      ariaSuffix={`servicio extra ${idx + 1}`}
                    />
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

    </Modal>
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
    <Modal
      open
      onClose={onClose}
      ariaLabel="Cancelar la cita"
      size="md"
      zClass="z-[70]"
      closeOnBackdrop={!submitting}
      footer={
        <div className="flex items-center justify-end gap-2">
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
      }
    >
        {/* Header propio (avatar danger + contexto de la cita). */}
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

    </Modal>
  )
}
