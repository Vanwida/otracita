'use client';

import { useState, useMemo } from 'react';
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
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Loader2, Megaphone } from 'lucide-react';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import DayGrid from './DayGrid';
import BookingDetailPanel from './BookingDetailPanel';
import NewBookingPanel from './NewBookingPanel';
import PromosFillModal from './PromosFillModal';
import type { CalendarEvent, Barber } from './types';

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
}

export default function CalendarView({ services, barbers, blockedDates, hours, stripeConnectStatus, promosEnabled, cashRegisterEnabled = false, sumupReaderConnected = false }: Props) {
  const [isPromosOpen, setIsPromosOpen] = useState(false);
  const [currentDay, setCurrentDay] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [selectedBarber, setSelectedBarber] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState<CalendarEvent | null>(null);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [newBookingSlot, setNewBookingSlot] = useState<{ date: string; time: string }>({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '10:00',
  });
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
      return format(currentDay, "EEEE, d 'de' MMMM yyyy", { locale: es });
    }
    if (viewMode === 'week') {
      const ws = startOfWeek(currentDay, { weekStartsOn: 1 });
      const we = endOfWeek(currentDay, { weekStartsOn: 1 });
      const startDay = format(ws, 'd');
      const endFull = format(we, "d MMM yyyy", { locale: es });
      return `${startDay}–${endFull}`;
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

  const handleSlotClick = (date: string, time: string) => {
    setNewBookingSlot({ date, time });
    setSelectedBooking(null);
    setIsNewBookingOpen(true);
  };

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

        {/* Barber select */}
        {barbers.length > 0 && (
          <select
            value={selectedBarber}
            onChange={e => setSelectedBarber(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-surface border border-line text-ink-2 hover:border-line-strong focus:outline-none focus:border-brand transition-colors"
          >
            <option value="all">Todos los barberos</option>
            {barbers.map(b => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        )}

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
            setNewBookingSlot({ date: format(new Date(), 'yyyy-MM-dd'), time: '10:00' });
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

      {/* Grid */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {viewMode === 'day' ? (
          <DayGrid
            date={currentDay}
            events={events}
            barbers={barbers}
            blockedDates={blockedDates}
            hours={hours}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        ) : viewMode === 'week' ? (
          <WeekGrid
            weekStart={startOfWeek(currentDay, { weekStartsOn: 1 })}
            events={events}
            blockedDates={blockedDates}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        ) : (
          <MonthGrid
            monthStart={startOfMonth(currentDay)}
            events={events}
            blockedDates={blockedDates}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        )}
      </div>

      {/* Detail panel */}
      <BookingDetailPanel
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        stripeConnectStatus={stripeConnectStatus}
        cashRegisterEnabled={cashRegisterEnabled}
        sumupReaderConnected={sumupReaderConnected}
      />

      {/* Promos modal — solo se renderiza si está activado en /dashboard/app */}
      {promosEnabled && (
        <PromosFillModal
          isOpen={isPromosOpen}
          onClose={() => setIsPromosOpen(false)}
        />
      )}

      {/* New booking panel */}
      <NewBookingPanel
        isOpen={isNewBookingOpen}
        initialDate={newBookingSlot.date}
        initialTime={newBookingSlot.time}
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
