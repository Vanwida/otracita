'use client';

import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarEvent } from './types';

const PX_PER_MIN = 2;
const GRID_START = 8 * 60;   // 08:00
const GRID_END = 22 * 60;    // 22:00
const TOTAL_HEIGHT = (GRID_END - GRID_START) * PX_PER_MIN; // 1680px

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const HOUR_LABELS = Array.from({ length: GRID_END / 60 - GRID_START / 60 }, (_, i) => {
  const h = GRID_START / 60 + i;
  return { label: `${String(h).padStart(2, '0')}:00`, top: i * 60 * PX_PER_MIN };
});

interface Props {
  weekStart: Date;
  events: CalendarEvent[];
  blockedDates: string[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, time: string) => void;
}

export default function WeekGrid({
  weekStart,
  events,
  blockedDates,
  onEventClick,
  onSlotClick,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, dateStr: string) => {
    // Don't fire if clicking on an event chip
    if ((e.target as HTMLElement).closest('[data-event]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
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
    <div className="flex flex-1 overflow-hidden">
      {/* Time gutter */}
      <div className="w-12 shrink-0 relative" style={{ height: TOTAL_HEIGHT + 32 }}>
        <div className="h-8" /> {/* header spacer */}
        <div className="relative" style={{ height: TOTAL_HEIGHT }}>
          {HOUR_LABELS.map(({ label, top }) => (
            <div
              key={label}
              className="absolute right-2 text-[10px] text-neutral-600 select-none"
              style={{ top: top - 6 }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Day columns scroll wrapper */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="flex min-w-0" style={{ minWidth: '560px' }}>
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, today);
            const isBlocked = blockedDates.includes(dateStr);
            const dayEvents = getEventsForDay(dateStr);

            return (
              <div key={dateStr} className="flex-1 flex flex-col border-r border-[#1a1a1a] last:border-r-0 min-w-0">
                {/* Column header */}
                <div className="h-8 flex flex-col items-center justify-center border-b border-[#1a1a1a] shrink-0">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? 'text-emerald-400' : 'text-neutral-600'}`}
                  >
                    {format(day, 'EEE', { locale: es })}
                  </span>
                  <span
                    className={`text-xs font-bold leading-none ${isToday ? 'text-emerald-400' : 'text-neutral-300'}`}
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
                    <div
                      className="absolute inset-0 z-10 pointer-events-none"
                      style={{
                        background:
                          'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(255,255,255,0.03) 6px, rgba(255,255,255,0.03) 12px)',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                      }}
                    />
                  )}

                  {/* Hour lines */}
                  {HOUR_LABELS.map(({ top }, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-[#1a1a1a]"
                      style={{ top }}
                    />
                  ))}

                  {/* Half-hour lines */}
                  {HOUR_LABELS.map(({ top }, i) => (
                    <div
                      key={`half-${i}`}
                      className="absolute left-0 right-0 border-t border-[#151515]"
                      style={{ top: top + 30 * PX_PER_MIN }}
                    />
                  ))}

                  {/* Events */}
                  {dayEvents.map(event => {
                    const startMin = toMinutes(event.time);
                    const top = (startMin - GRID_START) * PX_PER_MIN;
                    const height = Math.max(event.duration * PX_PER_MIN, 20);
                    const isBooksy = event.source === 'booksy';

                    return (
                      <div
                        key={event.id}
                        data-event="true"
                        onClick={e => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        className={`absolute left-1 right-1 z-20 rounded px-1.5 py-1 cursor-pointer overflow-hidden border transition-opacity hover:opacity-80 ${
                          isBooksy
                            ? 'bg-violet-600/20 border-violet-500/30 text-violet-300'
                            : 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300'
                        }`}
                        style={{ top, height }}
                        title={event.title}
                      >
                        <p className="text-[10px] font-semibold leading-tight truncate">
                          {event.customerName || event.customerPhone}
                        </p>
                        {height > 28 && (
                          <p className="text-[9px] opacity-70 truncate">{event.service}</p>
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
