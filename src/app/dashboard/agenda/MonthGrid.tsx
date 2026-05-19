'use client';

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import type { CalendarEvent, Barber } from './types';
import {
  appointmentChipStyle,
  statusBadge,
  displayOrderForEventBarber,
} from './_appointment-color';

const DAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_VISIBLE = 3;

interface Props {
  monthStart: Date;
  events: CalendarEvent[];
  blockedDates: string[];
  /** Equipo activo — color de cada cita por su barbero (fuente única). */
  barbers: Barber[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, time: string) => void;
}

export default function MonthGrid({
  monthStart,
  events,
  blockedDates,
  barbers,
  onEventClick,
  onSlotClick,
}: Props) {
  const today = new Date();

  // Build the full grid — Mon through Sun, fill with adjacent-month days
  const gridStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const getEventsForDay = (dateStr: string) => events.filter(e => e.date === dateStr);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-surface">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-line shrink-0">
        {DAY_HEADERS.map(d => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-ink-2"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks grid */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="grid grid-cols-7 h-full"
          style={{ gridAutoRows: 'minmax(80px, 1fr)' }}
        >
          {allDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, today);
            const isBlocked = blockedDates.includes(dateStr);
            const dayEvents = getEventsForDay(dateStr);
            const extra = dayEvents.length - MAX_VISIBLE;

            return (
              <div
                key={dateStr}
                onClick={() => onSlotClick(dateStr, '10:00')}
                className={`relative p-1.5 border-r border-b border-line last-of-type:border-r-0 cursor-pointer transition-colors hover:bg-canvas ${
                  isBlocked ? 'bg-overlay' : ''
                } ${!isCurrentMonth ? 'opacity-30' : ''}`}
              >
                {/* Blocked pattern */}
                {isBlocked && isCurrentMonth && (
                  <div className="absolute inset-0 pointer-events-none blocked-overlay" />
                )}

                {/* Day number */}
                <div className="flex justify-end mb-1">
                  <span
                    className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-brand text-brand-ink'
                        : 'text-ink-2'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Events */}
                <div className="space-y-0.5">
                  {dayEvents.slice(0, MAX_VISIBLE).map(event => {
                    // Color = ESTADO de la cita (Booksy-exact, igual que
                    // Día/Semana) + ícono/etiqueta (fuente única, fix #6).
                    // `dispOrder` se mantiene por compat; ya no tinta el chip.
                    const dispOrder = displayOrderForEventBarber(
                      event.barber,
                      barbers,
                    );
                    const { style: chipStyle, treatment } = appointmentChipStyle(
                      dispOrder,
                      event.status,
                    );
                    const badge = statusBadge(event.status);

                    return (
                      <div
                        key={event.id}
                        data-event="true"
                        onClick={e => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate cursor-pointer transition-opacity hover:opacity-80 ${treatment}`}
                        style={chipStyle}
                        title={event.title}
                      >
                        {badge && (
                          <badge.icon
                            className={`mr-0.5 inline-block h-2.5 w-2.5 align-[-1px] ${badge.tone}`}
                            aria-label={badge.label}
                          />
                        )}
                        {event.time} {event.customerName || event.customerPhone}
                      </div>
                    );
                  })}
                  {extra > 0 && (
                    <div className="text-[10px] text-ink-3 pl-1.5">+{extra} más</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
