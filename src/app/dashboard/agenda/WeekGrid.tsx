'use client';

import { useState, useEffect, useRef } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock } from 'lucide-react';
import type { CalendarEvent, Barber } from './types';
import {
  appointmentBlockStyle,
  statusBadge,
  displayOrderForEventBarber,
} from './_appointment-color';

const PX_PER_MIN = 2;
const GRID_START = 8 * 60;   // 08:00
const GRID_END = 22 * 60;    // 22:00
const TOTAL_HEIGHT = (GRID_END - GRID_START) * PX_PER_MIN; // 1680px

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const HOUR_LABELS = Array.from({ length: GRID_END / 60 - GRID_START / 60 }, (_, i) => {
  const h = GRID_START / 60 + i;
  return { label: `${String(h).padStart(2, '0')}:00`, top: i * 60 * PX_PER_MIN };
});

interface Props {
  weekStart: Date;
  events: CalendarEvent[];
  blockedDates: string[];
  /** Equipo activo — para resolver el color de cada cita por su barbero
   *  (mismo color que en Día/Mes, fuente única `_appointment-color`). */
  barbers: Barber[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, time: string) => void;
}

export default function WeekGrid({
  weekStart,
  events,
  blockedDates,
  barbers,
  onEventClick,
  onSlotClick,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const [currentTimeMin, setCurrentTimeMin] = useState(getCurrentTimeMinutes);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeMin(getCurrentTimeMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const offset = Math.max(0, (currentTimeMin - GRID_START) * PX_PER_MIN - 100);
      scrollRef.current.scrollTop = offset;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTimePx =
    currentTimeMin >= GRID_START && currentTimeMin <= GRID_END
      ? (currentTimeMin - GRID_START) * PX_PER_MIN
      : null;

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, dateStr: string) => {
    if ((e.target as HTMLElement).closest('[data-event]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickedMinutes = Math.floor(y / PX_PER_MIN) + GRID_START;
    const rounded = Math.round(clickedMinutes / 30) * 30;
    const clamped = Math.max(GRID_START, Math.min(GRID_END - 30, rounded));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onSlotClick(dateStr, time);
  };

  const getEventsForDay = (dateStr: string) =>
    events.filter(e => e.date === dateStr);

  return (
    <div className="flex flex-1 overflow-hidden bg-surface">
      {/* Time gutter */}
      <div className="w-12 shrink-0 relative bg-surface border-r border-line" style={{ height: TOTAL_HEIGHT + 32 }}>
        <div className="h-8" /> {/* header spacer */}
        <div className="relative" style={{ height: TOTAL_HEIGHT }}>
          {/* Current time dot in gutter */}
          {currentTimePx !== null && (
            <div
              className="absolute right-0 z-20"
              style={{ top: currentTimePx - 5 }}
            >
              <div className="h-2.5 w-2.5 rounded-full bg-time-now translate-x-1/2" />
            </div>
          )}
          {HOUR_LABELS.map(({ label, top }) => (
            <div
              key={label}
              className="absolute right-2 text-[10px] text-ink-2 select-none"
              style={{ top: top - 6 }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Day columns scroll wrapper */}
      <div className="flex-1 overflow-x-auto overflow-y-auto" ref={scrollRef}>
        <div className="flex min-w-0" style={{ minWidth: '560px' }}>
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, today);
            const isBlocked = blockedDates.includes(dateStr);
            const dayEvents = getEventsForDay(dateStr);

            return (
              <div
                key={dateStr}
                className={`flex-1 flex flex-col border-r border-line last:border-r-0 min-w-0 ${isToday ? 'bg-today-tint' : 'bg-surface'}`}
              >
                {/* Column header */}
                <div className="h-8 flex flex-col items-center justify-center border-b border-line shrink-0">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? 'text-brand' : 'text-ink-2'}`}
                  >
                    {format(day, 'EEE', { locale: es })}
                  </span>
                  <span
                    className={`text-xs font-bold leading-none ${isToday ? 'text-brand' : 'text-ink-2'}`}
                  >
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Column body */}
                <div
                  className="relative cursor-pointer"
                  style={{ height: TOTAL_HEIGHT }}
                  onClick={e => handleColumnClick(e, dateStr)}
                >
                  {/* Blocked overlay */}
                  {isBlocked && (
                    <div className="absolute inset-0 z-10 pointer-events-none blocked-overlay" />
                  )}

                  {/* Hour lines */}
                  {HOUR_LABELS.map(({ top }, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-line"
                      style={{ top }}
                    />
                  ))}

                  {/* Half-hour lines */}
                  {HOUR_LABELS.map(({ top }, i) => (
                    <div
                      key={`half-${i}`}
                      className="absolute left-0 right-0 border-t border-canvas"
                      style={{ top: top + 30 * PX_PER_MIN }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && currentTimePx !== null && (
                    <div
                      className="absolute left-0 right-0 z-30 pointer-events-none"
                      style={{ top: currentTimePx }}
                    >
                      <div className="h-px bg-time-now" />
                    </div>
                  )}

                  {/* Events */}
                  {dayEvents.map(event => {
                    const startMin = toMinutes(event.time);
                    const top = (startMin - GRID_START) * PX_PER_MIN;
                    const height = Math.max(event.duration * PX_PER_MIN, 20);
                    const isBooksy = event.source === 'booksy';
                    const isCancelled = event.status === 'cancelled';
                    // Color = barbero de la cita (mismo que Día/Mes). Estado
                    // por tratamiento + ícono, nunca por otro tono (fix #6).
                    const dispOrder = displayOrderForEventBarber(
                      event.barber,
                      barbers,
                    );
                    const { style: blockStyle, treatment } = appointmentBlockStyle(
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
                        className={`absolute left-1 right-1 z-20 rounded-r px-1.5 py-1 cursor-pointer overflow-hidden transition-opacity hover:opacity-80 ${treatment}`}
                        style={{ top, height, ...blockStyle }}
                        title={event.title}
                      >
                        {/* Booksy lock icon */}
                        {isBooksy && !isCancelled && (
                          <Lock className="absolute top-1 right-1 h-3 w-3 opacity-70" />
                        )}
                        <p className="text-[10px] font-semibold leading-tight truncate">
                          {event.time} {event.customerName || event.customerPhone}
                          {badge && (
                            <span
                              className={`ml-1 inline-flex items-center gap-0.5 font-bold ${badge.tone}`}
                            >
                              <badge.icon className="h-2.5 w-2.5" aria-hidden="true" />
                              {height > 28 && <span>{badge.label}</span>}
                            </span>
                          )}
                        </p>
                        {height > 28 && (
                          <p className="text-[9px] opacity-80 truncate">{event.service}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
