'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Loader2, Megaphone, X } from 'lucide-react';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import DayGrid from './DayGrid';
import AgendaSideRail from './AgendaSideRail';
import BookingDetailPanel from './BookingDetailPanel';
import NewBookingPanel from './NewBookingPanel';
import PromosFillModal from './PromosFillModal';
import SlotActionMenu from './SlotActionMenu';
import BarberActionMenu from './BarberActionMenu';
import type { CalendarEvent, Barber, SlotAction } from './types';

interface Props {
  services: Array<{ name: string; duration: number; price: number }>;
  barbers: Barber[];
  blockedDates: string[];
  hours: Record<string, string> | null;
  /**
   * Resolved Stripe Connect state — drives whether the BookingDetailPanel
   * shows the "Activa cobros" CTA or the "Generar link de pago" flow.
   */
  stripeConnectStatus: 'none' | 'pending' | 'active' | 'restricted' | string;
  /** Cuando true, muestra el botón "Llenar huecos" en la cabecera. */
  promosEnabled: boolean;
  /** Cuando true, al "Marcar completada" se pide método de pago para
   *  alimentar el cuadre de caja. */
  cashRegisterEnabled?: boolean;
  /** SumUp+Reader pareados → cobro instantáneo Cloud API en vez de modal
   *  manual cash/card/online. */
  sumupReaderConnected?: boolean;
  /**
   * Costura para WS-B: se invoca cuando el usuario elige "Falta de
   * disponibilidad" o "Ausencia" en el menú contextual de slot. NUEVA
   * CITA NO pasa por aquí (la resuelve CalendarView con NewBookingPanel).
   * Default no-op hasta que WS-B cablee BlockModal/AbsenceModal.
   */
  onSelectSlotAction?: (
    action: Extract<SlotAction, { type: 'unavailability' | 'absence' }>,
  ) => void;
}

export default function CalendarView({ services, barbers, blockedDates, hours, stripeConnectStatus, promosEnabled, cashRegisterEnabled = false, sumupReaderConnected = false, onSelectSlotAction }: Props) {
  const [isPromosOpen, setIsPromosOpen] = useState(false);
  const [currentDay, setCurrentDay] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [selectedBarber, setSelectedBarber] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState<CalendarEvent | null>(null);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [newBookingSlot, setNewBookingSlot] = useState<{
    date: string;
    time: string;
    barberId: string | null;
  }>({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '10:00',
    barberId: null,
  });
  // Menú contextual de slot (A7). null = cerrado.
  const [slotMenu, setSlotMenu] = useState<{
    date: string;
    time: string;
    barberId: string | null;
  } | null>(null);
  // Menú de acciones de barbero (fix #2). null = cerrado.
  const [barberMenu, setBarberMenu] = useState<Barber | null>(null);
  // Error transitorio de un movimiento de cita (drag&drop / mover manual).
  // Se autolimpia; el rollback visual lo hace el revalidate de SWR.
  const [moveError, setMoveError] = useState<string | null>(null);
  // Build the calendar fetch URL from the current view. SWR keys by URL so
  // changing view/date/barber automatically triggers a new request — and
  // a background poll every 10s keeps the grid in sync when the bot creates
  // a booking or another device updates one.
  const fetchUrl = useMemo(() => {
    let start: string;
    let end: string;
    if (viewMode === 'day') {
      start = format(currentDay, 'yyyy-MM-dd');
      end = start;
    } else if (viewMode === 'week') {
      start = format(startOfWeek(currentDay, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      end = format(endOfWeek(currentDay, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    } else {
      start = format(startOfMonth(currentDay), 'yyyy-MM-dd');
      end = format(endOfMonth(currentDay), 'yyyy-MM-dd');
    }
    return `/api/dashboard/calendar?start=${start}&end=${end}&barber=${selectedBarber}`;
  }, [currentDay, viewMode, selectedBarber]);

  const {
    data: events = [],
    isLoading: loading,
    mutate: refetch,
  } = useSWR<CalendarEvent[]>(fetchUrl, async (url: string) => {
    const r = await fetch(url);
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  }, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const rangeLabel = () => {
    if (viewMode === 'day') {
      // Formato Booksy literal: "Lun., 18 May." (día abreviado + número +
      // mes abreviado). date-fns 'EEE' ya capitaliza con locale es.
      return format(currentDay, "EEE, d MMM", { locale: es });
    }
    if (viewMode === 'week') {
      const ws = startOfWeek(currentDay, { weekStartsOn: 1 });
      const we = endOfWeek(currentDay, { weekStartsOn: 1 });
      const startDay = format(ws, 'd');
      const endFull = format(we, "d MMM yyyy", { locale: es });
      return `${startDay} a ${endFull}`;
    }
    return format(currentDay, 'MMMM yyyy', { locale: es });
  };

  const handlePrev = () => {
    if (viewMode === 'day') setCurrentDay(d => subDays(d, 1));
    else if (viewMode === 'week') setCurrentDay(d => subWeeks(d, 1));
    else setCurrentDay(d => subMonths(d, 1));
  };

  const handleNext = () => {
    if (viewMode === 'day') setCurrentDay(d => addDays(d, 1));
    else if (viewMode === 'week') setCurrentDay(d => addWeeks(d, 1));
    else setCurrentDay(d => addMonths(d, 1));
  };

  const handleTodayClick = () => {
    setCurrentDay(new Date());
  };

  // Clic en hueco vacío → menú contextual (A7). barberId opcional:
  // DayGrid lo pasa (columna clicada); Week/Month llaman con 2 args.
  const handleSlotClick = (date: string, time: string, barberId?: string | null) => {
    setSelectedBooking(null);
    setIsNewBookingOpen(false);
    setSlotMenu({ date, time, barberId: barberId ?? null });
  };

  // Despacha la opción elegida en el menú. NUEVA CITA la resolvemos aquí
  // (NewBookingPanel prefilled). Las otras dos se delegan a WS-B vía
  // stubs — costura limpia, no-op + TODO hasta que sus paneles existan.
  const handleSlotAction = (action: SlotAction) => {
    setSlotMenu(null);
    if (action.type === 'new_booking') {
      setNewBookingSlot({
        date: action.date,
        time: action.time,
        barberId: action.barberId,
      });
      setIsNewBookingOpen(true);
      return;
    }
    // WS-B owns BlockModal/AbsenceModal. El intent ya llega con
    // {type,date,time,barberId} listo para consumir. Si WS-B aún no
    // cableó el handler, es un no-op silencioso (no rompe el flujo).
    onSelectSlotAction?.(action);
  };

  // Etiqueta humana del slot para el subtítulo del menú: "lun 18 may · 10:30 · Reni".
  const slotMenuLabel = useMemo(() => {
    if (!slotMenu) return undefined;
    let label = `${format(parseISO(slotMenu.date), "EEE d MMM", { locale: es })} · ${slotMenu.time}`;
    if (slotMenu.barberId) {
      const b = barbers.find((x) => x.id === slotMenu.barberId);
      if (b) label += ` · ${b.name}`;
    }
    return label;
  }, [slotMenu, barbers]);

  // Mover una cita (drag&drop en DayGrid o "mover manual" desde el panel
  // detalle). Optimista: pintamos el cambio YA en la caché de SWR, luego
  // PATCH; al volver revalidamos para reconciliar con el servidor (y
  // deshacer el optimismo si hubo solape/permiso). R1/R3.
  const handleEventMove = useCallback(
    async (
      id: string,
      next: { date: string; time: string; barberId: string | null },
    ) => {
      const current = events.find((e) => e.id === id);
      if (!current) return;
      // No-op si no cambia nada (mismo día, hora y barbero).
      const sameBarber =
        (current.barberId ?? null) === (next.barberId ?? null);
      if (
        current.date === next.date &&
        current.time === next.time &&
        sameBarber
      ) {
        return;
      }
      setMoveError(null);
      const nextBarberName = next.barberId
        ? barbers.find((b) => b.id === next.barberId)?.name ?? current.barber
        : null;

      // 1) Update optimista en la caché SWR (sin revalidar todavía).
      await refetch(
        (prev) =>
          (prev ?? []).map((e) =>
            e.id === id
              ? {
                  ...e,
                  date: next.date,
                  time: next.time,
                  barberId: next.barberId,
                  barber: nextBarberName,
                }
              : e,
          ),
        { revalidate: false },
      );

      // 2) PATCH al endpoint (re-valida solape en servidor).
      try {
        const res = await fetch(`/api/bookings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: next.date,
            time: next.time,
            barberId: next.barberId,
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
        }
      } catch {
        setMoveError('Sin conexión. La cita no se movió.');
      } finally {
        // 3) Revalidar SIEMPRE: si el PATCH falló, esto deshace el
        // optimismo volviendo a la verdad del servidor.
        await refetch();
      }
    },
    [events, barbers, refetch],
  );

  const handleEventClick = (event: CalendarEvent) => {
    setIsNewBookingOpen(false);
    setSelectedBooking(event);
  };

  const VIEW_LABELS: Record<'day' | 'week' | 'month', string> = {
    day: 'Día',
    week: 'Semana',
    month: 'Mes',
  };

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-surface flex-wrap shrink-0">
        {/* Title */}
        <h1 className="text-base font-bold text-ink mr-1">Calendario</h1>

        {/* Today */}
        <button
          onClick={handleTodayClick}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-overlay border border-line text-ink-2 hover:bg-canvas transition-colors"
        >
          Hoy
        </button>

        {/* Prev / Range / Next */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg hover:bg-overlay text-ink-2 hover:text-ink transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-ink-2 min-w-[160px] text-center capitalize">
            {rangeLabel()}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg hover:bg-overlay text-ink-2 hover:text-ink transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day / Week / Month toggle */}
        <div className="flex rounded-lg bg-overlay border border-line p-0.5">
          {(['day', 'week', 'month'] as const).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === m
                  ? 'bg-surface shadow-sm text-ink'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              {VIEW_LABELS[m]}
            </button>
          ))}
        </div>

        {/* El filtro de barbero ya NO vive aquí: el control PRIMARIo de
            "quién" son las columnas paralelas (vista día). Aislar a uno
            solo es secundario y vive en el rail izquierdo ("Empleados y
            recursos"), igual que en Booksy (screenshot 09.39.31). */}

        {/* Promos + import + new booking */}
        {promosEnabled && (
          <button
            type="button"
            onClick={() => setIsPromosOpen(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface border border-brand/40 hover:border-brand text-brand-strong hover:bg-brand-softer transition-colors"
            title="Avisar a clientes habituales para llenar huecos"
          >
            <Megaphone className="h-3.5 w-3.5" />
            Llenar huecos
          </button>
        )}
        <a
          href="/dashboard/agenda/importar"
          className={`${promosEnabled ? '' : 'ml-auto'} flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface border border-line hover:border-line-strong text-ink-2 hover:text-ink transition-colors`}
          title="Importar reservas desde Booksy / agenda externa"
        >
          Importar
        </a>
        <button
          onClick={() => {
            setNewBookingSlot({ date: format(new Date(), 'yyyy-MM-dd'), time: '10:00', barberId: null });
            setSelectedBooking(null);
            setIsNewBookingOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand hover:bg-brand-strong text-brand-ink transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva Reserva
        </button>

        {/* Loading indicator */}
        {loading && <Loader2 className="h-4 w-4 text-ink-3 animate-spin" />}
      </div>

      {/* Error de movimiento (drag&drop / mover manual). El revalidate de
          SWR ya devolvió la cita a su sitio; esto solo explica por qué. */}
      {moveError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-4 py-2 bg-danger/10 border-b border-danger/30 text-danger text-xs font-medium shrink-0"
        >
          <span>{moveError}</span>
          <button
            type="button"
            onClick={() => setMoveError(null)}
            className="text-danger/70 hover:text-danger"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Cuerpo: rail izquierdo (nav firma de Booksy) + rejilla. El rail
          solo en Día/Semana — Mes YA es un calendario, un mini-mes al lado
          sería redundante. La leyenda de equipo y el filtro de barbero
          viven ahora DENTRO del rail (fuente única, no duplicar). */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {viewMode !== 'month' && (
          <AgendaSideRail
            currentDay={currentDay}
            onSelectDate={(d) => setCurrentDay(d)}
            barbers={barbers}
            selectedBarber={selectedBarber}
            onSelectBarber={setSelectedBarber}
          />
        )}

        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {viewMode === 'day' ? (
            <DayGrid
              date={currentDay}
              events={events}
              barbers={barbers}
              blockedDates={blockedDates}
              hours={hours}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
              onBarberClick={(b) => {
                setSelectedBooking(null);
                setSlotMenu(null);
                setBarberMenu(b);
              }}
              onEventMove={handleEventMove}
            />
          ) : viewMode === 'week' ? (
            <WeekGrid
              weekStart={startOfWeek(currentDay, { weekStartsOn: 1 })}
              events={events}
              blockedDates={blockedDates}
              barbers={barbers}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
            />
          ) : (
            <MonthGrid
              monthStart={startOfMonth(currentDay)}
              events={events}
              blockedDates={blockedDates}
              barbers={barbers}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
            />
          )}
        </div>
      </div>

      {/* Detail panel */}
      <BookingDetailPanel
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        stripeConnectStatus={stripeConnectStatus}
        cashRegisterEnabled={cashRegisterEnabled}
        sumupReaderConnected={sumupReaderConnected}
        barbers={barbers}
        onMoved={() => refetch()}
      />

      {/* Promos modal — solo se renderiza si está activado en /dashboard/app */}
      {promosEnabled && (
        <PromosFillModal
          isOpen={isPromosOpen}
          onClose={() => setIsPromosOpen(false)}
        />
      )}

      {/* Menú contextual de slot (A7) — chooser sobre la agenda atenuada */}
      <SlotActionMenu
        open={slotMenu !== null}
        slot={slotMenu}
        contextLabel={slotMenuLabel}
        onClose={() => setSlotMenu(null)}
        onAction={handleSlotAction}
      />

      {/* Menú de acciones del barbero (fix #2) — clic en su cabecera de
          columna. Reusa AbsenceModal/BlockModal y los eventos ya cargados. */}
      <BarberActionMenu
        barber={barberMenu}
        events={events}
        dateStr={format(currentDay, 'yyyy-MM-dd')}
        onClose={() => setBarberMenu(null)}
        onChanged={() => refetch()}
      />

      {/* New booking panel */}
      <NewBookingPanel
        isOpen={isNewBookingOpen}
        initialDate={newBookingSlot.date}
        initialTime={newBookingSlot.time}
        initialBarberId={newBookingSlot.barberId}
        services={services}
        barbers={barbers}
        onClose={() => setIsNewBookingOpen(false)}
        onCreated={() => {
          refetch();
        }}
      />
    </div>
  );
}
