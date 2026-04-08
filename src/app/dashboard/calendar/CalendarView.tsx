'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Loader2 } from 'lucide-react';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import BookingDetailPanel from './BookingDetailPanel';
import NewBookingPanel from './NewBookingPanel';
import type { CalendarEvent } from './types';

interface Props {
  services: Array<{ name: string; duration: number; price: number }>;
  barbers: Array<{ name: string }>;
  blockedDates: string[];
  hours: Record<string, string> | null;
}

export default function CalendarView({ services, barbers, blockedDates }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedBarber, setSelectedBarber] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState<CalendarEvent | null>(null);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [newBookingSlot, setNewBookingSlot] = useState<{ date: string; time: string }>({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '10:00',
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(() => {
    const start =
      viewMode === 'week'
        ? format(startOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        : format(startOfMonth(weekStart), 'yyyy-MM-dd');
    const end =
      viewMode === 'week'
        ? format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        : format(endOfMonth(weekStart), 'yyyy-MM-dd');

    setLoading(true);
    fetch(`/api/dashboard/calendar?start=${start}&end=${end}&barber=${selectedBarber}`)
      .then(r => r.json())
      .then(data => {
        setEvents(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setEvents([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [weekStart, viewMode, selectedBarber]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const rangeLabel = () => {
    if (viewMode === 'week') {
      const ws = startOfWeek(weekStart, { weekStartsOn: 1 });
      const we = endOfWeek(weekStart, { weekStartsOn: 1 });
      const startDay = format(ws, 'd');
      const endFull = format(we, "d MMM yyyy", { locale: es });
      return `${startDay}–${endFull}`;
    }
    return format(weekStart, 'MMMM yyyy', { locale: es });
  };

  const handlePrev = () => {
    if (viewMode === 'week') setWeekStart(w => subWeeks(w, 1));
    else setWeekStart(w => subMonths(w, 1));
  };

  const handleNext = () => {
    if (viewMode === 'week') setWeekStart(w => addWeeks(w, 1));
    else setWeekStart(w => addMonths(w, 1));
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

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1f1f1f] flex-wrap shrink-0">
        {/* Title */}
        <h1 className="text-base font-bold text-white mr-1">Calendario</h1>

        {/* Today */}
        <button
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1a1a1a] border border-[#262626] text-neutral-300 hover:text-white hover:border-[#333] transition-colors"
        >
          Hoy
        </button>

        {/* Prev / Range / Next */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-neutral-300 min-w-[140px] text-center capitalize">
            {rangeLabel()}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Week / Month toggle */}
        <div className="flex rounded-lg bg-[#141414] border border-[#1f1f1f] p-0.5">
          {(['week', 'month'] as const).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === m
                  ? 'bg-[#262626] text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {m === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>

        {/* Barber select */}
        {barbers.length > 0 && (
          <select
            value={selectedBarber}
            onChange={e => setSelectedBarber(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#141414] border border-[#262626] text-neutral-300 hover:border-[#333] focus:outline-none focus:border-emerald-500/50 transition-colors"
          >
            <option value="all">Todos los barberos</option>
            {barbers.map(b => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        {/* New booking button */}
        <button
          onClick={() => {
            setNewBookingSlot({ date: format(new Date(), 'yyyy-MM-dd'), time: '10:00' });
            setSelectedBooking(null);
            setIsNewBookingOpen(true);
          }}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva Reserva
        </button>

        {/* Loading indicator */}
        {loading && <Loader2 className="h-4 w-4 text-neutral-500 animate-spin" />}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {viewMode === 'week' ? (
          <WeekGrid
            weekStart={startOfWeek(weekStart, { weekStartsOn: 1 })}
            events={events}
            blockedDates={blockedDates}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        ) : (
          <MonthGrid
            monthStart={startOfMonth(weekStart)}
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
      />

      {/* New booking panel */}
      <NewBookingPanel
        isOpen={isNewBookingOpen}
        initialDate={newBookingSlot.date}
        initialTime={newBookingSlot.time}
        services={services}
        barbers={barbers}
        onClose={() => setIsNewBookingOpen(false)}
        onCreated={() => {
          fetchEvents();
        }}
      />
    </div>
  );
}
