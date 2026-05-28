'use client';

import { X, Copy, Check, CheckCircle2, UserX, Undo2, CreditCard, Loader2, CalendarX2, MessageCircle, ShoppingBag, Pencil, Plus, Phone, Ban, Banknote, Smartphone, Globe, Trash2 } from 'lucide-react';
import { MANUAL_SOURCES, type ManualSource } from '@/lib/attribution/source-manual';
import { getSourceMeta } from '@/lib/sources';
import AddProductSaleModal from './AddProductSaleModal';
import BookingActivityTimeline from './BookingActivityTimeline';
import SlideOver from '../_components/SlideOver';
import Modal from '../_components/Modal';
import ServiceLinePicker from '../_components/ServiceLinePicker';
import ChargeFlow from '../_components/ChargeFlow';
import NumberInput from '../_components/NumberInput';
import CustomerTypeahead from '../_components/CustomerTypeahead';
import RectificativaModal from '../facturas/_components/RectificativaModal';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/payments/methods';
import { pushUndoToast } from '../_components/UndoToast';
import { dispatchTracking } from '@/lib/tracking/dispatch';
import { computeBookingSnapshot, type BookingServiceLine } from '@/lib/bookings/duration';
import ClientProfile from '../clientes/[id]/ClientProfile';
import type { ClientProfileData } from '@/lib/clients/profile';
import { hoursForDate, parseMinutes } from '@/lib/availability-hours';
import { useConfirm } from '../_components/ConfirmDialog';
import { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { paymentBadge } from './types';
import type { CalendarEvent, Barber } from './types';
import { formatCents } from '@/lib/format';
import { FEEDBACK_MS } from '@/lib/ui-timings'

function addMinutesToTime(timeStr: string, mins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface Props {
  booking: CalendarEvent | null;
  onClose: () => void;
  /**
   * Stripe Connect account state for the current tenant. Drives whether the
   * `card_online` method appears in the ChargeFlow grid + the "activa
   * cobros" CTA when no method is online-capable yet.
   */
  stripeConnectStatus: 'none' | 'pending' | 'active' | 'restricted' | string;
  /** Cuando true, el cobro alimenta el cuadre de caja del día (cash_movements
   *  en backend). Informativo — el ChargeFlow registra todos los métodos
   *  igual; este flag pinta el aviso "caja cerrada" si procede. */
  cashRegisterEnabled?: boolean;
  /** True si la sesión de caja de hoy está abierta. Mostramos un warning
   *  suave en el ChargeFlow si está cerrada (no bloquea el cobro). */
  cashSessionOpen?: boolean;
  /** @deprecated SumUp Cloud Reader se ha unificado en ChargeFlow (método
   *  `card_physical`). El prop se mantiene para no romper callers existentes
   *  hasta que se actualice CalendarView; se ignora internamente. */
  sumupReaderConnected?: boolean;
  /** Equipo activo — para el selector de barbero del editor "mover cita"
   *  (R3) y para atribuir tip cuando la cita no tiene barbero fijo. */
  barbers?: Barber[];
  /** Catálogo de servicios de la tienda — el editor "Editar servicio o
   *  precio" lo usa para el picker (FIX C: principal+extras = dropdown,
   *  no texto libre). Mismo shape que recibe NewBookingPanel. */
  services?: Array<{ name: string; duration: number; price: number }>;
  /** Horario semanal de la tienda — el editor "Mover cita" lo usa para
   *  avisar (y pedir confirmación al guardar, patrón #83) si la nueva
   *  hora cae fuera del horario laboral del día. Null = sin horario
   *  configurado → no validamos client-side. */
  hours?: Record<string, string> | null;
  /** Se invoca tras CUALQUIER mutación exitosa dentro del panel (mover,
   *  editar servicio, no-show, cobrar, cerrar gratis, añadir producto,
   *  marcar origen, cancelar). El padre revalida la query SWR del
   *  calendario; como `booking` ahora se DERIVA de esa query, el panel
   *  se re-renderiza con datos frescos sin cerrar/reabrir. Si el booking
   *  desaparece de la lista (cancelado y filtrado, movido fuera del
   *  rango visible) el padre cierra el drawer automáticamente. */
  onMutated?: () => void;
}

export default function BookingDetailPanel({ booking, onClose, stripeConnectStatus, cashRegisterEnabled = false, cashSessionOpen = true, barbers = [], services = [], hours = null, onMutated }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ChargeFlow — único motor de cobro unificado (épica Reni).
  const [chargeOpen, setChargeOpen] = useState(false);

  // "Cerrar sin cobrar" — citas cortesía / gratis: PATCH legacy a
  // completed sin método. Convive con ChargeFlow porque ChargeFlow exige
  // un total > 0 (el grid de métodos no tiene sentido si el precio es 0).
  const [closingFree, setClosingFree] = useState(false);

  const isNoShow = booking?.status === 'no_show';
  const isCompleted = booking?.status === 'completed';
  // Solo se completa una cita confirmada (no no-show, no completed, no cancelled).
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

  // F3 Reni — selector de origen al cierre de cita ("¿de dónde te conoció?").
  // Optimistic: actualizamos `sourceManualLocal` al click; si el PATCH falla
  // revertimos. Click en el chip activo → desmarca (envía null). Visible en
  // cualquier estado (no bloquea, no obliga). Booksy ES solo-lectura → fuera.
  const [sourceManualLocal, setSourceManualLocal] = useState<ManualSource | null>(
    null,
  );
  const [sourcePending, setSourcePending] = useState<ManualSource | null | 'clear'>(
    null,
  );
  useEffect(() => {
    const v = booking?.sourceManual ?? null;
    setSourceManualLocal(
      v && (MANUAL_SOURCES as readonly string[]).includes(v)
        ? (v as ManualSource)
        : null,
    );
  }, [booking?.id, booking?.sourceManual]);

  async function persistSourceManual(next: ManualSource | null) {
    if (!booking) return;
    const prev = sourceManualLocal;
    setSourceManualLocal(next);
    setSourcePending(next === null ? 'clear' : next);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceManual: next }),
      });
      if (!res.ok) {
        // Revert silently — no toast, este selector es low-stakes.
        setSourceManualLocal(prev);
      } else {
        // Revalida la lista del calendario: la fuente única del booking
        // es la query SWR del padre, no `router.refresh()` (que solo
        // refresca server components y aquí no recarga nada útil).
        onMutated?.();
        startTransition(() => router.refresh());
      }
    } catch {
      setSourceManualLocal(prev);
    } finally {
      setSourcePending(null);
    }
  }

  // Sembrar el editor cuando se CAMBIA a otra cita (id distinto). NO
  // depender del objeto entero: el padre ahora deriva `booking` de la
  // query SWR y refetch cada 10s genera nuevas referencias para el mismo
  // booking — si dependiéramos del objeto el formulario "Mover cita" se
  // reseteaba mid-edit cada vez que llegaba un refresh en background.
  // Re-leemos las fields manualmente al cambiar de id.
  useEffect(() => {
    if (booking) {
      setMoveDate(booking.date);
      setMoveTime(booking.time);
      setMoveBarberId(booking.barberId ?? '');
      setMoveOpen(false);
      setMoveError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id]);

  async function submitMove() {
    if (!booking) return;
    // Validación HH:MM (browser ya enforza con type=time, defensa extra
    // para teclado manual / paste). Sin esto, un valor inválido provoca un
    // 400 del server con copy poco amigable.
    if (!/^\d{2}:\d{2}$/.test(moveTime)) {
      setMoveError('La hora debe ir en formato HH:MM (00:00 a 23:59).');
      return;
    }
    // Fuera de horario laboral → confirmación previa (patrón #83). PATCH
    // server-side no valida horas; lo hacemos aquí para que Reni no mueva
    // sin querer una cita a las 04:00 con un typo. Si el horario no está
    // configurado (hoursForDate=null en día abierto o sin clave) saltamos
    // el check — equivale a "tienda cerrada ese día"; reusar el mensaje
    // sería confuso, mejor permitirlo silenciosamente (igual que create).
    const dayHours = hoursForDate(moveDate, hours ?? null);
    if (dayHours) {
      const startMin = parseMinutes(moveTime);
      const endMin = startMin + booking.duration;
      const openMin = parseMinutes(dayHours.start);
      const closeMin = parseMinutes(dayHours.end);
      if (startMin < openMin || endMin > closeMin) {
        const ok = await confirm({
          title: 'Fuera del horario habitual',
          message: `La cita quedaría ${moveTime}–${addMinutesToTime(moveTime, booking.duration)}, fuera del horario del día (${dayHours.start}–${dayHours.end}). ¿La mueves igualmente?`,
          confirmLabel: 'Mover igual',
          cancelLabel: 'Cancelar',
        });
        if (!ok) return;
      }
    }
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
      // No cerramos el panel: tras el refetch, si la cita sigue en el
      // rango visible el panel se re-renderiza con la nueva fecha/hora.
      // Si quedó fuera de rango, el padre cierra el drawer solo (auto-
      // close en CalendarView cuando el id deja de existir en `events`).
      onMutated?.();
    } catch {
      setMoveError('Sin conexión. La cita no se movió.');
    } finally {
      setMoving(false);
    }
  }

  // A3 — editar servicio/precio. Antes de completar = edición libre (modal
  // propio). Después de completar = depende de si hay factura:
  //   · SIN factura emitida → editar sale libre (EditSaleModal): precio,
  //     cliente, método, propina. Reescribe payments/tips/cash_movements.
  //   · CON factura emitida → rectificativa (RectificativaModal). La factura
  //     sellada nunca se muta; createRectificativa emite un doc nuevo que la
  //     sustituye legalmente.
  // El barbero ve UN solo botón "Editar venta"; aquí decidimos qué flow abrir.
  const [editOpen, setEditOpen] = useState(false);
  const [editSaleOpen, setEditSaleOpen] = useState(false);
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
    booking.price > 0 &&
    booking.status === 'confirmed';

  const connectActive = stripeConnectStatus === 'active';

  // Reset al cambiar de cita — sólo state local del panel.
  useEffect(() => {
    setChargeOpen(false);
    setClosingFree(false);
    // A3 — cierra cualquier modal de edición/rectificativa al cambiar de cita.
    setEditOpen(false);
    setRectInvoice(null);
    setRectError(null);
  }, [booking?.id]);

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
        // Si Stripe efectivamente cobró la tarifa, fire conversion event.
        // Silencioso si no hay pixel cargado en dashboard.
        try {
          const data = (await res.json()) as {
            noShowFee?: { status?: string; amountCents?: number };
          };
          if (data?.noShowFee?.status === 'charged') {
            dispatchTracking({
              event: 'no_show_charged',
              valueCents: data.noShowFee.amountCents ?? 0,
              currency: 'EUR',
              transactionId: `noshow-${booking.id}`,
            });
          }
        } catch {
          /* noop */
        }
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
              onMutated?.();
              startTransition(() => router.refresh());
            }
          },
        });
      }
      onMutated?.();
      startTransition(() => router.refresh());
    } catch {
      setError('Sin conexión. Revisa tu wifi e inténtalo otra vez.');
    }
  }

  // Cerrar cita gratis / cortesía — PATCH legacy a `completed` sin
  // paymentMethod. Sólo se ofrece cuando el booking no tiene precio o
  // el barbero pulsa "Cerrar sin cobrar" debajo del CTA principal.
  async function closeBookingFree() {
    if (!booking) return;
    setError(null);
    setClosingFree(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'No se ha podido cerrar la cita.');
        return;
      }
      // No cerramos: la cita pasa a `completed` y el panel pinta la
      // banda verde + el bloque "Cita completada" con la opción
      // rectificativa. Antes hacíamos `onClose()` y el barbero no sabía
      // si la acción había hecho efecto.
      onMutated?.();
      startTransition(() => router.refresh());
    } catch {
      setError('Sin conexión. Revisa tu wifi e inténtalo otra vez.');
    } finally {
      setClosingFree(false);
    }
  }

  // A3 post-completion — un solo botón "Editar venta" que pregunta al
  // backend qué flow corresponde:
  //   1. GET /api/bookings/[id]/sale → devuelve `editable` + `lockReason`.
  //   2. editable=true → abre EditSaleModal (rebuild de payments/tips/cash).
  //   3. lockReason='invoice_locked' → carga factura y abre RectificativaModal.
  //   4. lockReason='external_payment_locked' → mensaje (refund manual antes).
  // Nunca tocamos un documento fiscal sellado.
  const openEditSale = useCallback(async () => {
    if (!booking) return;
    setRectError(null);
    setRectLoading(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/sale`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRectError(data.error || 'No se pudo cargar la venta.');
        return;
      }
      if (data.editable) {
        setEditSaleOpen(true);
        return;
      }
      if (data.lockReason === 'invoice_locked') {
        // Hay factura viva — usamos el flow histórico de rectificativa.
        const r2 = await fetch(
          `/api/invoices/by-booking?bookingId=${encodeURIComponent(booking.id)}`,
        );
        const inv = await r2.json().catch(() => ({}));
        if (!r2.ok || !inv.invoice) {
          setRectError(inv.error || 'No se pudo cargar la factura.');
          return;
        }
        if (inv.invoice.status === 'rectified') {
          setRectError('Esta factura ya tiene una rectificativa emitida.');
          return;
        }
        setRectInvoice(inv.invoice);
        return;
      }
      if (data.lockReason === 'external_payment_locked') {
        setRectError(
          'Esta venta tiene un cobro real con Stripe o datáfono. Reembólsalo desde el detalle del pago antes de cambiarla.',
        );
        return;
      }
      if (data.lockReason === 'booksy_readonly') {
        setRectError(
          'Las citas importadas de Booksy son solo lectura. Edita el original en Booksy.',
        );
        return;
      }
      setRectError('Esta venta no es editable en este momento.');
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
                  <span className="text-ink-3 mx-1.5">→</span>
                  {addMinutesToTime(booking.time, booking.duration)}
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
                      {/* Hora inicio + Hora fin. Fin es read-only — se
                          calcula sumando la duración total del booking
                          (snapshot ya incluye servicios extra; ver
                          src/lib/bookings/duration.ts). Reni teclea la
                          hora directamente (HH:MM) y ve al instante a qué
                          hora terminará. Pattern espejado de NewBookingPanel
                          tras task #80. */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="move-time" className="text-[11px] font-medium text-ink-2">
                            Hora inicio
                          </label>
                          <input
                            id="move-time"
                            type="time"
                            value={moveTime}
                            onChange={(e) => setMoveTime(e.target.value)}
                            className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors tabular-nums"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="move-time-end" className="text-[11px] font-medium text-ink-2">
                            Hora fin
                          </label>
                          <input
                            id="move-time-end"
                            type="text"
                            readOnly
                            tabIndex={-1}
                            aria-label={`Hora fin calculada — duración ${booking.duration} min`}
                            value={
                              moveTime && /^\d{2}:\d{2}$/.test(moveTime)
                                ? addMinutesToTime(moveTime, booking.duration)
                                : '--:--'
                            }
                            className="bg-overlay/60 border border-line rounded-lg px-3 py-2 text-sm text-ink-2 outline-none tabular-nums cursor-default"
                          />
                        </div>
                      </div>
                      {/* Aviso fuera de horario laboral del día. No bloquea:
                          al guardar, useConfirm() pide OK explícito (patrón
                          #83 "Crear igual"). Si no hay horario configurado
                          o el día está cerrado, no mostramos nada (sin
                          horario contra el que comparar). */}
                      {(() => {
                        if (!/^\d{2}:\d{2}$/.test(moveTime)) return null;
                        const dayHours = hoursForDate(moveDate, hours ?? null);
                        if (!dayHours) return null;
                        const startMin = parseMinutes(moveTime);
                        const endMin = startMin + booking.duration;
                        const openMin = parseMinutes(dayHours.start);
                        const closeMin = parseMinutes(dayHours.end);
                        if (startMin >= openMin && endMin <= closeMin) return null;
                        return (
                          <p className="text-[11px] text-warning leading-relaxed">
                            Fuera del horario del día ({dayHours.start}–{dayHours.end}). Al guardar, te pedirá confirmación.
                          </p>
                        );
                      })()}
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

              {/* F3 Reni — selector de origen ("¿de dónde te conoció?"). Sin
                  nudge, sin obligar: chips icon-only con tooltip. Click marca,
                  click en el activo desmarca. Optimistic. Convive con la
                  atribución pasiva (UTM/referrer) y la gana en reporting. */}
              {!isBooksy && (
                <div className="pt-2 border-t border-line space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
                    ¿De dónde te conoció?
                  </p>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Marcar origen del cliente"
                  >
                    {MANUAL_SOURCES.map((src) => {
                      const meta = getSourceMeta(src);
                      const Icon = meta.Icon;
                      const label = meta.label;
                      const isActive = sourceManualLocal === src;
                      const isPending = sourcePending === src;
                      return (
                        <button
                          key={src}
                          type="button"
                          onClick={() => persistSourceManual(isActive ? null : src)}
                          disabled={sourcePending !== null}
                          title={label}
                          aria-label={
                            isActive ? `${label} — pulsa para desmarcar` : label
                          }
                          aria-pressed={isActive}
                          className={
                            'inline-flex items-center justify-center h-9 w-9 rounded-full border transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
                            (isActive
                              ? 'bg-brand border-brand text-brand-ink hover:bg-brand-strong'
                              : 'bg-surface border-line text-ink-2 hover:border-brand hover:text-brand')
                          }
                        >
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                    {/* Chip "Sin marcar" — solo aparece cuando hay un override
                        activo, como acceso rápido a desmarcar (equivalente a
                        click en el chip activo). */}
                    {sourceManualLocal !== null && (
                      <button
                        type="button"
                        onClick={() => persistSourceManual(null)}
                        disabled={sourcePending !== null}
                        title="Sin marcar"
                        aria-label="Sin marcar — quitar el origen"
                        className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-line bg-surface text-ink-3 hover:border-danger hover:text-danger transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        {sourcePending === 'clear' ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Ban className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                  {sourceManualLocal && (
                    <p className="text-[11px] text-ink-3">
                      Marcado: <span className="text-ink-2 font-medium">{getSourceMeta(sourceManualLocal).label}</span>
                    </p>
                  )}
                </div>
              )}

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

              {/* Cobrar — acción principal cuando la cita ha terminado. Abre
                  ChargeFlow, motor unificado: grid de métodos + pago
                  fraccionado + propina inline + auto-facturación en backend.
                  Sólo se ofrece para citas confirmadas con precio > 0; las
                  citas gratis usan el link "Cerrar sin cobrar" debajo. */}
              {booking.status === 'confirmed' && (
                <div className="pt-2 border-t border-line space-y-2">
                  {canCharge ? (
                    <button
                      type="button"
                      onClick={() => setChargeOpen(true)}
                      disabled={pending || closingFree}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-strong px-4 py-3 text-base font-semibold text-brand-ink transition-colors disabled:opacity-60 min-h-[48px]"
                    >
                      <CreditCard className="h-4 w-4" aria-hidden="true" />
                      Cobrar · {formatCents(Math.round((booking.price ?? 0) * 100))}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeBookingFree}
                    disabled={closingFree || pending}
                    className="w-full text-xs text-ink-3 hover:text-ink-2 underline-offset-2 hover:underline transition-colors py-2 disabled:opacity-60"
                  >
                    {closingFree ? 'Cerrando…' : 'Cerrar sin cobrar'}
                  </button>
                  {error && <p className="text-xs text-danger">{error}</p>}
                </div>
              )}

              {/* Cita ya completada — el botón "Editar venta" decide el flow
                  según el estado fiscal:
                    · Sin factura emitida → EditSaleModal (precio, cliente,
                      método, propina). Reescribe payments/tips/cash_movements
                      sin tocar documentos fiscales.
                    · Con factura emitida → RectificativaModal. La original
                      no se muta (RD 1007/2023). */}
              {isCompleted && (
                <div className="pt-2 border-t border-line space-y-2">
                  <div className="rounded-xl border border-success/30 bg-success/10 p-3 space-y-1">
                    <p className="text-sm font-semibold text-success inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Venta registrada
                    </p>
                    <p className="text-xs text-ink-2 leading-relaxed">
                      ¿Te has equivocado en algo? Puedes corregir precio,
                      cliente, método de cobro o propina. Si ya hay factura
                      emitida, se hará una rectificativa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openEditSale}
                    disabled={rectLoading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface hover:border-brand hover:text-brand px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors disabled:opacity-60"
                  >
                    {rectLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                    Editar venta
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

              {/* El flow de "Cobrar online" antiguo (link de pago + QR + reembolso
                  aislado) se ha unificado dentro de ChargeFlow — método
                  `card_online`. El reembolso queda fuera de scope V1 del
                  ChargeFlow; si hace falta, el barbero entra en /dashboard/caja
                  para ver el pago y reembolsarlo desde allí. */}

              {/* Actividad (task #107) — timeline de todo lo que le ha pasado a
                  la cita (creada, movida, cancelada, no-show, cobrada…). Sitio
                  donde la cancelada y demás transiciones quedan visibles ahora
                  que el grid las oculta (#108). */}
              <BookingActivityTimeline bookingId={booking.id} />
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
            // Una cita cancelada normalmente se filtra del calendario;
            // el padre cerrará el drawer solo cuando el id deje de
            // existir en `events`. Si por algún motivo siguiera visible
            // (ej. filtro "incluye canceladas") al menos el panel mostrará
            // el estado "Cancelada" actualizado.
            onMutated?.()
            router.refresh()
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

      {/* ChargeFlow — motor de cobro unificado (épica Reni). Maneja método
          único, fraccionado, espera online y propina inline. Sólo se
          renderiza con price > 0 (las citas gratis usan PATCH legacy). */}
      {booking && booking.price !== null && booking.price > 0 && (
        <ChargeFlow
          key={booking.id}
          booking={{
            id: booking.id,
            price: booking.price,
            customerName: booking.customerName,
            barberId: booking.barberId,
            serviceLabel: booking.service,
          }}
          barbers={barbers.map((b) => ({ id: b.id, displayName: b.name }))}
          stripeConnectActive={connectActive}
          cashSessionOpen={cashRegisterEnabled ? cashSessionOpen : true}
          open={chargeOpen}
          onClose={() => setChargeOpen(false)}
          onCharged={() => {
            setChargeOpen(false);
            // No cerramos el panel: la cita pasa a `completed` y el
            // panel ahora pinta la banda verde + el bloque rectificativa.
            // El barbero ve la confirmación inmediata del cobro.
            onMutated?.();
            startTransition(() => router.refresh());
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
            // Revalida la lista del calendario para que el panel
            // pinte el servicio/precio/duración nuevo sin reabrir.
            onMutated?.();
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* A3 post-completion SIN factura — editor de venta libre. Reescribe
          payments + tips + cash_movements. No toca documentos fiscales. */}
      {booking && editSaleOpen && (
        <EditSaleModal
          booking={booking}
          barbers={barbers}
          stripeConnectActive={connectActive}
          onClose={() => setEditSaleOpen(false)}
          onSaved={() => {
            setEditSaleOpen(false);
            onMutated?.();
            startTransition(() => router.refresh());
          }}
          onMutated={() => {
            // Añadir/quitar producto: revalida la agenda sin cerrar el editor.
            onMutated?.();
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* A3 post-completion CON factura — rectificativa de la factura sellada.
          La original NUNCA se muta; createRectificativa emite un documento
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

// -----------------------------------------------------------------------------
// EditSaleModal — corrige una venta YA COBRADA sin factura emitida (task #86).
//
// Reni reportó 4 errores típicos al cobrar: precio mal puesto, cliente
// equivocado, método de cobro incorrecto, propina mal cuadrada. Este modal
// los cubre todos en un solo paso. VeriFactu prohíbe mutar facturas emitidas
// → si hay invoice viva, el botón "Editar venta" abre RectificativaModal en
// su lugar (lo decide el GET /api/bookings/[id]/sale).
//
// PATCH /api/bookings/[id]/sale aplica los cambios atómicos:
//   · bookings (customerName/phone, service, price, paymentMethod)
//   · payments (rebuild de la línea offline única — V1 no soporta split)
//   · tips (upsert/delete + cash_movement tip_cash asociado)
//   · cash_movements del booking (delete + reinsert en sesión abierta)
//
// V1 deliberadamente NO soporta split-payment editing (ChargeFlow ya cubre
// ese caso al cobrar). Si la venta original era split, este modal la
// convierte en línea única con el método elegido — el barbero ve un aviso.
// -----------------------------------------------------------------------------

interface SaleProductLine {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  paymentMethod: string;
  barberId: string | null;
  /** Ya facturada → no se puede quitar sin rectificativa. */
  invoiced: boolean;
}

interface SaleData {
  editable: boolean;
  lockReason: string | null;
  booking: {
    customerName: string | null;
    customerPhone: string;
    service: string;
    price: number | null;
    paymentMethod: string | null;
    barberId: string | null;
    barber: string | null;
  };
  payments: Array<{ id: string; method: string | null; amountCents: number; notes: string | null }>;
  tip: {
    id: string;
    amountCents: number;
    method: 'cash' | 'card' | string | null;
    barberId: string | null;
    barberName: string | null;
  } | null;
  productSales: SaleProductLine[];
}

// Catálogo ligero para el selector de "añadir producto" dentro del editor.
interface CatalogProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  priceCents: number;
  stockQuantity: number | null;
}

// Métodos de pago de producto (distintos del enum de cobro de cita — el
// endpoint /api/products/sales solo acepta estos tres).
const PRODUCT_SALE_METHODS = ['cash', 'card', 'online'] as const;
type ProductSaleMethod = (typeof PRODUCT_SALE_METHODS)[number];
const PRODUCT_SALE_METHOD_LABEL: Record<ProductSaleMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  online: 'Online',
};

function EditSaleModal({
  booking,
  barbers,
  stripeConnectActive,
  onClose,
  onSaved,
  onMutated,
}: {
  booking: CalendarEvent;
  barbers: Barber[];
  stripeConnectActive: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Revalida la agenda del padre SIN cerrar el modal — para que añadir o
   *  quitar un producto refresque la lista sin perder el contexto del editor. */
  onMutated?: () => void;
}) {
  // ── State ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleData | null>(null);

  // Form fields
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [service, setService] = useState<string>('');
  const [price, setPrice] = useState<number | null>(null);
  // V1: método único — si la venta era split, mostramos aviso y el barbero
  // elige uno. Selector con grid de métodos válidos.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [tipEnabled, setTipEnabled] = useState(false);
  // Propina en euros con 2 decimales para coherencia con la columna `price`
  // del booking — internamente se manda en céntimos.
  const [tipEuros, setTipEuros] = useState<number | null>(null);
  const [tipMethod, setTipMethod] = useState<'cash' | 'card'>('cash');
  const [tipBarberId, setTipBarberId] = useState<string>('');

  // ── Productos vendidos (task #111) ─────────────────────────────────────
  // Catálogo para el selector + estado del sub-flujo "añadir producto".
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false); // sub-form abierto
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  // Campos del sub-form (prefill al abrir: precio del producto, barbero de la
  // cita, método efectivo).
  const [newProductId, setNewProductId] = useState<string>('');
  const [newQty, setNewQty] = useState<number>(1);
  const [newPriceEuros, setNewPriceEuros] = useState<number | null>(null);
  const [newBarberId, setNewBarberId] = useState<string>('');
  const [newMethod, setNewMethod] = useState<ProductSaleMethod>('cash');

  const isSplit = (sale?.payments.length ?? 0) > 1;

  // ── Precarga (recargable) ──────────────────────────────────────────────
  // Reutilizable: tras añadir/quitar un producto refrescamos la venta sin
  // cerrar el modal. `firstLoad` resetea los campos del formulario solo la
  // primera vez (un refresh por producto NO debe pisar lo que el barbero esté
  // editando en cliente/precio/método/propina).
  const loadSale = useCallback(
    async (firstLoad: boolean) => {
      try {
        const res = await fetch(`/api/bookings/${booking.id}/sale`);
        const data = (await res.json().catch(() => ({}))) as SaleData & { error?: string };
        if (!res.ok || !data.editable) {
          setLoadError(data.error || 'Esta venta no es editable.');
          setLoading(false);
          return;
        }
        setSale(data);
        if (firstLoad) {
          setCustomerName(data.booking.customerName ?? '');
          setCustomerPhone(data.booking.customerPhone);
          setLinkedPhone(
            data.booking.customerPhone && !data.booking.customerPhone.startsWith('pos-')
              ? data.booking.customerPhone
              : null,
          );
          setService(data.booking.service);
          setPrice(data.booking.price ?? null);
          const firstMethod = data.payments[0]?.method;
          if (firstMethod && (PAYMENT_METHODS as readonly string[]).includes(firstMethod)) {
            setPaymentMethod(firstMethod as PaymentMethod);
          } else {
            setPaymentMethod('cash');
          }
          if (data.tip && data.tip.amountCents > 0) {
            setTipEnabled(true);
            setTipEuros(Math.round(data.tip.amountCents) / 100);
            setTipMethod(data.tip.method === 'card' ? 'card' : 'cash');
            setTipBarberId(data.tip.barberId ?? data.booking.barberId ?? '');
          } else {
            setTipEnabled(false);
            setTipEuros(null);
            setTipMethod('cash');
            setTipBarberId(data.booking.barberId ?? '');
          }
        }
        setLoading(false);
      } catch {
        setLoadError('No se pudo cargar la venta.');
        setLoading(false);
      }
    },
    [booking.id],
  );

  // El estado inicial (loading=true) ya está en useState; el effect solo
  // dispara el fetch (evita setState síncrono → regla react-hooks).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadSale(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSale]);

  // Catálogo de productos — carga perezosa al abrir el sub-form la 1ª vez.
  useEffect(() => {
    if (!addingProduct || catalogLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/products');
        const d = (await r.json().catch(() => ({}))) as { products?: CatalogProduct[] };
        if (!cancelled && Array.isArray(d.products)) {
          setCatalog(d.products);
        }
      } catch {
        /* silencioso — el selector queda vacío y el barbero ve "sin productos" */
      } finally {
        if (!cancelled) setCatalogLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addingProduct, catalogLoaded]);

  // ── Métodos disponibles ──────────────────────────────────────────────
  // Excluimos card_online de la edición — para cambiar a online el barbero
  // debe reembolsar el cobro actual y volver a cobrar (ver endpoint).
  const availableMethods: PaymentMethod[] = PAYMENT_METHODS.filter(
    (m) => m !== 'card_online' || stripeConnectActive,
  ).filter((m) => m !== 'card_online'); // V1: nunca card_online en edición

  // ── Productos: abrir / añadir / quitar ─────────────────────────────────
  const selectedCatalogProduct = catalog.find((p) => p.id === newProductId) ?? null;
  const newQtyExceedsStock =
    selectedCatalogProduct != null &&
    selectedCatalogProduct.stockQuantity !== null &&
    newQty > selectedCatalogProduct.stockQuantity;

  // Abre el sub-form con prefill: barbero de la cita por defecto.
  const openAddProduct = () => {
    setProductError(null);
    setNewProductId('');
    setNewQty(1);
    setNewPriceEuros(null);
    setNewBarberId(sale?.booking.barberId ?? '');
    setNewMethod('cash');
    setAddingProduct(true);
  };

  // Al elegir producto en el selector, prefill del precio (€) al del catálogo.
  const pickProduct = (id: string) => {
    setNewProductId(id);
    const p = catalog.find((x) => x.id === id);
    setNewPriceEuros(p ? Math.round(p.priceCents) / 100 : null);
  };

  const addProduct = async () => {
    if (!selectedCatalogProduct) {
      setProductError('Elige un producto.');
      return;
    }
    if (newQty < 1) {
      setProductError('La cantidad debe ser al menos 1.');
      return;
    }
    if (newPriceEuros === null || newPriceEuros < 0) {
      setProductError('Indica un precio válido.');
      return;
    }
    setProductSubmitting(true);
    setProductError(null);
    try {
      const r = await fetch('/api/products/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedCatalogProduct.id,
          quantity: newQty,
          paymentMethod: newMethod,
          bookingId: booking.id,
          // barberId opcional — si vacío, el endpoint cae al barbero de la cita.
          barberId: newBarberId || undefined,
          unitPriceCents: Math.round((newPriceEuros ?? 0) * 100),
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setProductError(d.error || 'No se pudo añadir el producto.');
        setProductSubmitting(false);
        return;
      }
      // Recarga la venta (refresca la lista de productos) sin pisar el resto
      // del formulario, cierra el sub-form y avisa al padre para revalidar.
      await loadSale(false);
      setAddingProduct(false);
      onMutated?.();
    } catch {
      setProductError('Error de red.');
    } finally {
      setProductSubmitting(false);
    }
  };

  const removeProduct = async (saleLineId: string) => {
    setProductError(null);
    setRemovingId(saleLineId);
    try {
      const r = await fetch(`/api/products/sales/${saleLineId}`, { method: 'DELETE' });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setProductError(d.error || 'No se pudo quitar el producto.');
        setRemovingId(null);
        return;
      }
      await loadSale(false);
      onMutated?.();
    } catch {
      setProductError('Error de red.');
    } finally {
      setRemovingId(null);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────
  const submit = async () => {
    if (!service.trim()) {
      setSubmitError('El servicio es obligatorio.');
      return;
    }
    if (tipEnabled) {
      if (!tipEuros || tipEuros <= 0) {
        setSubmitError('La propina debe ser mayor que 0.');
        return;
      }
      if (!tipBarberId) {
        setSubmitError('Elige el barbero al que va la propina.');
        return;
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Body — solo enviamos lo que cambió para no pisar campos por error
      // (el endpoint sabe aplicar lo que viene).
      const original = sale!.booking;
      const body: Record<string, unknown> = {};
      const trimmedName = customerName.trim();
      if ((trimmedName || null) !== (original.customerName || null)) {
        body.customerName = trimmedName || null;
      }
      if (customerPhone.trim() && customerPhone.trim() !== original.customerPhone) {
        body.customerPhone = customerPhone.trim();
      }
      if (service.trim() !== original.service) {
        body.service = service.trim();
      }
      if ((price ?? null) !== (original.price ?? null)) {
        body.price = price;
      }
      if (paymentMethod !== original.paymentMethod) {
        body.paymentMethod = paymentMethod;
      }

      // Tip: si estaba y se quitó → null; si se modifica o añade → objeto.
      const hadTip = !!sale!.tip;
      if (tipEnabled) {
        body.tip = {
          amountCents: Math.round((tipEuros ?? 0) * 100),
          method: tipMethod,
          barberId: tipBarberId,
        };
      } else if (hadTip) {
        body.tip = null;
      }

      if (Object.keys(body).length === 0) {
        setSubmitError('No has cambiado nada.');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/bookings/${booking.id}/sale`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.error || 'No se pudo guardar.');
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch {
      setSubmitError('Error de red. Inténtalo otra vez.');
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel="Editar venta cobrada"
      size="md"
      zClass="z-[70]"
      closeOnBackdrop={!submitting}
      footer={
        !loading && !loadError && (
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
        )
      }
    >
      {/* Header propio (avatar Pencil + contexto de la cita). */}
      <div className="p-5 border-b border-line flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-brand-softer flex items-center justify-center shrink-0">
          <Pencil className="h-5 w-5 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-ink">Editar venta</h3>
          <p className="text-xs text-ink-2 mt-0.5">
            {booking.date} {booking.time} · sin factura emitida — los cambios
            no afectan a Hacienda.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10 text-ink-3">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {loadError && (
          <p className="text-sm rounded-lg bg-danger/10 border border-danger/30 text-danger px-3 py-2">
            {loadError}
          </p>
        )}

        {!loading && !loadError && sale && (
          <>
            {isSplit && (
              <p className="text-xs rounded-lg bg-warning/10 border border-warning/30 text-warning px-3 py-2">
                La venta original se cobró fraccionada en {sale.payments.length}{' '}
                tramos. Al guardar quedará registrada con un único método —
                elige cuál.
              </p>
            )}

            {/* Cliente */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                Cliente
              </p>
              <CustomerTypeahead
                name={customerName}
                onNameChange={setCustomerName}
                linkedPhone={linkedPhone}
                onLink={(c) => {
                  setCustomerName(c.name);
                  setCustomerPhone(c.phone);
                  setLinkedPhone(c.phone);
                }}
                onUnlink={() => setLinkedPhone(null)}
                ariaLabel="Cliente"
                placeholder="Nombre del cliente"
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-sale-phone" className="text-[11px] font-medium text-ink-2">
                  Teléfono
                </label>
                <input
                  id="edit-sale-phone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (linkedPhone && e.target.value.trim() !== linkedPhone) {
                      setLinkedPhone(null);
                    }
                  }}
                  disabled={submitting}
                  className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                />
              </div>
            </div>

            {/* Servicio + precio */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                Servicio y precio
              </p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-sale-service" className="text-[11px] font-medium text-ink-2">
                  Servicio
                </label>
                <input
                  id="edit-sale-service"
                  type="text"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  disabled={submitting}
                  className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-sale-price" className="text-[11px] font-medium text-ink-2">
                  Precio (€)
                </label>
                <NumberInput
                  id="edit-sale-price"
                  value={price}
                  onValueChange={setPrice}
                  min={0}
                  decimals={0}
                  placeholder="0"
                  disabled={submitting}
                  aria-label="Precio en euros"
                  className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                />
                <p className="text-[11px] text-ink-3">
                  Bookings se guardan en euros enteros. El cuadre de caja se
                  reajusta automáticamente.
                </p>
              </div>
            </div>

            {/* Método de pago */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                Método de cobro
              </p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Método de cobro">
                {availableMethods.map((m) => {
                  const Icon =
                    m === 'cash'
                      ? Banknote
                      : m === 'card_physical'
                        ? CreditCard
                        : m === 'bizum'
                          ? Smartphone
                          : Globe;
                  const isActive = paymentMethod === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setPaymentMethod(m)}
                      disabled={submitting}
                      className={
                        'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
                        (isActive
                          ? 'bg-brand-softer border-brand text-ink'
                          : 'bg-surface border-line text-ink-2 hover:border-brand hover:text-ink')
                      }
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {PAYMENT_METHOD_LABEL[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Propina */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={tipEnabled}
                  onChange={(e) => setTipEnabled(e.target.checked)}
                  disabled={submitting}
                  className="h-4 w-4"
                />
                <span className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                  Propina {sale.tip ? '· ya registrada' : '· añadir'}
                </span>
              </label>
              {tipEnabled && (
                <div className="space-y-2 rounded-lg border border-line bg-overlay/40 p-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="edit-sale-tip-amount" className="text-[11px] font-medium text-ink-2">
                      Importe (€)
                    </label>
                    <NumberInput
                      id="edit-sale-tip-amount"
                      value={tipEuros}
                      onValueChange={setTipEuros}
                      min={0}
                      decimals={2}
                      placeholder="0,00"
                      disabled={submitting}
                      aria-label="Propina en euros"
                      className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Método de la propina">
                    {(['cash', 'card'] as const).map((m) => {
                      const isActive = tipMethod === m;
                      const Icon = m === 'cash' ? Banknote : CreditCard;
                      return (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() => setTipMethod(m)}
                          disabled={submitting}
                          className={
                            'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ' +
                            (isActive
                              ? 'bg-brand-softer border-brand text-ink'
                              : 'bg-surface border-line text-ink-2 hover:border-brand hover:text-ink')
                          }
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {m === 'cash' ? 'Efectivo' : 'Tarjeta'}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="edit-sale-tip-barber" className="text-[11px] font-medium text-ink-2">
                      Barbero
                    </label>
                    <select
                      id="edit-sale-tip-barber"
                      value={tipBarberId}
                      onChange={(e) => setTipBarberId(e.target.value)}
                      disabled={submitting}
                      className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                    >
                      <option value="">— elige —</option>
                      {barbers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Productos vendidos (task #111) — añadir el producto que el
                barbero vendió y olvidó registrar, o quitar uno metido por
                error. Cada operación es inmediata (POST/DELETE) e independiente
                de "Guardar cambios": al añadir se descuenta stock y se recalcula
                el cuadre; al quitar se devuelve. Sin factura emitida (este modal
                solo se abre cuando la venta es editable), así que no afecta a
                Hacienda. */}
            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                Productos vendidos
              </p>

              {sale.productSales.length === 0 && !addingProduct && (
                <p className="text-xs text-ink-3">
                  No hay productos en esta venta.
                </p>
              )}

              {sale.productSales.length > 0 && (
                <ul className="space-y-1.5">
                  {sale.productSales.map((line) => (
                    <li
                      key={line.id}
                      className="flex items-center gap-3 rounded-lg border border-line bg-overlay/40 px-3 py-2"
                    >
                      <div className="h-8 w-8 rounded-md bg-surface border border-line shrink-0 overflow-hidden flex items-center justify-center">
                        {line.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={line.imageUrl} alt={line.name} className="h-full w-full object-cover" />
                        ) : (
                          <ShoppingBag className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {line.name}
                          {line.quantity > 1 && (
                            <span className="text-ink-3 font-normal"> · ×{line.quantity}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-ink-3 tabular-nums">
                          {formatCents(line.totalCents)} · {PRODUCT_SALE_METHOD_LABEL[(line.paymentMethod as ProductSaleMethod)] ?? line.paymentMethod}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProduct(line.id)}
                        disabled={line.invoiced || removingId !== null || submitting}
                        title={
                          line.invoiced
                            ? 'Ya facturado — usa una rectificativa'
                            : 'Quitar producto'
                        }
                        aria-label={`Quitar ${line.name}`}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                      >
                        {removingId === line.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Sub-form "añadir producto" */}
              {addingProduct ? (
                <div className="space-y-3 rounded-lg border border-line bg-overlay/40 p-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="edit-sale-add-product" className="text-[11px] font-medium text-ink-2">
                      Producto
                    </label>
                    {!catalogLoaded ? (
                      <div className="flex justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-ink-3" aria-hidden="true" />
                      </div>
                    ) : catalog.length === 0 ? (
                      <p className="text-xs text-ink-3">
                        No tienes productos dados de alta.{' '}
                        <Link href="/dashboard/ventas/productos" className="text-brand hover:underline">
                          Añádelos aquí
                        </Link>
                        .
                      </p>
                    ) : (
                      <select
                        id="edit-sale-add-product"
                        value={newProductId}
                        onChange={(e) => pickProduct(e.target.value)}
                        disabled={productSubmitting}
                        className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                      >
                        <option value="">— elige —</option>
                        {catalog.map((p) => {
                          const out = p.stockQuantity !== null && p.stockQuantity === 0;
                          return (
                            <option key={p.id} value={p.id} disabled={out}>
                              {p.name}
                              {out
                                ? ' · agotado'
                                : p.stockQuantity !== null
                                  ? ` · ${p.stockQuantity} uds`
                                  : ''}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>

                  {selectedCatalogProduct && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="edit-sale-add-qty" className="text-[11px] font-medium text-ink-2">
                            Cantidad
                          </label>
                          <NumberInput
                            id="edit-sale-add-qty"
                            value={newQty}
                            onValueChange={(n) => {
                              if (n !== null) setNewQty(Math.max(1, Math.min(99, n)));
                            }}
                            min={1}
                            max={99}
                            decimals={0}
                            aria-label="Cantidad"
                            disabled={productSubmitting}
                            className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors tabular-nums"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="edit-sale-add-price" className="text-[11px] font-medium text-ink-2">
                            Precio unitario (€)
                          </label>
                          <NumberInput
                            id="edit-sale-add-price"
                            value={newPriceEuros}
                            onValueChange={setNewPriceEuros}
                            min={0}
                            decimals={2}
                            placeholder="0,00"
                            aria-label="Precio unitario en euros"
                            disabled={productSubmitting}
                            className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="edit-sale-add-barber" className="text-[11px] font-medium text-ink-2">
                          Barbero
                        </label>
                        <select
                          id="edit-sale-add-barber"
                          value={newBarberId}
                          onChange={(e) => setNewBarberId(e.target.value)}
                          disabled={productSubmitting}
                          className="bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
                        >
                          <option value="">Barbero de la cita</option>
                          {barbers.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-ink-2">Método de cobro</p>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Método de cobro del producto">
                          {PRODUCT_SALE_METHODS.map((m) => {
                            const isActive = newMethod === m;
                            return (
                              <button
                                key={m}
                                type="button"
                                role="radio"
                                aria-checked={isActive}
                                onClick={() => setNewMethod(m)}
                                disabled={productSubmitting}
                                className={
                                  'rounded-lg border px-2 py-2 text-xs font-medium transition-colors ' +
                                  (isActive
                                    ? 'bg-brand-softer border-brand text-ink'
                                    : 'bg-surface border-line text-ink-2 hover:border-brand hover:text-ink')
                                }
                              >
                                {PRODUCT_SALE_METHOD_LABEL[m]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {newQtyExceedsStock && (
                        <p className="text-[11px] text-warning">
                          Solo quedan {selectedCatalogProduct.stockQuantity} unidades.
                        </p>
                      )}
                    </>
                  )}

                  {productError && (
                    <p className="text-xs rounded-lg bg-danger/10 border border-danger/30 text-danger px-3 py-2">
                      {productError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingProduct(false);
                        setProductError(null);
                      }}
                      disabled={productSubmitting}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={addProduct}
                      disabled={!selectedCatalogProduct || newQtyExceedsStock || productSubmitting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand-strong px-3 py-2 text-xs font-semibold text-brand-ink transition-colors disabled:opacity-60"
                    >
                      {productSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      Añadir producto
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openAddProduct}
                  disabled={submitting || removingId !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line hover:border-brand hover:text-brand px-3 py-2 text-xs font-semibold text-ink-2 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Añadir producto
                </button>
              )}

              {/* Error de producto fuera del sub-form (p.ej. fallo al quitar). */}
              {productError && !addingProduct && (
                <p className="text-xs rounded-lg bg-danger/10 border border-danger/30 text-danger px-3 py-2">
                  {productError}
                </p>
              )}
            </div>

            {submitError && (
              <p className="text-sm rounded-lg bg-danger/10 border border-danger/30 text-danger px-3 py-2">
                {submitError}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
