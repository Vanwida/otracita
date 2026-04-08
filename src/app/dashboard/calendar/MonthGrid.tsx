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
import { es } from 'date-fns/locale';
import type { CalendarEvent } from './types';

const DAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_VISIBLE = 3;

interface Props {
  monthStart: Date;
  events: CalendarEvent[];
  blockedDates: string[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, time: string) => void;
}

export default function MonthGrid({
  monthStart,
  events,
  blockedDates,
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
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-[#1a1a1a] shrink-0">
        {DAY_HEADERS.map(d => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-neutral-600"
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
                className={`relative p-1.5 border-r border-b border-[#1a1a1a] last-of-type:border-r-0 cursor-pointer transition-colors hover:bg-[#141414] ${
                  isBlocked ? 'bg-[#111]' : ''
                } ${!isCurrentMonth ? 'opacity-30' : ''}`}
              >
                {/* Blocked pattern */}
                {isBlocked && isCurrentMonth && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.02) 8px)',
                    }}
                  />
                )}

                {/* Day number */}
                <div className="flex justify-end mb-1">
                  <span
                    className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-emerald-500 text-black'
                        : 'text-neutral-400'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Events */}
                <div className="space-y-0.5">
                  {dayEvents.slice(0, MAX_VISIBLE).map(event => {
                    const isBooksy = event.source === 'booksy';
                    return (
                      <div
                        key={event.id}
                        data-event="true"
                        onClick={e => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate cursor-pointer transition-opacity hover:opacity-80 ${
                          isBooksy
                            ? 'bg-violet-600/20 text-violet-300'
                            : 'bg-emerald-600/20 text-emerald-300'
                        }`}
                        title={event.title}
                      >
                        {event.time} {event.customerName || event.customerPhone}
                      </div>
                    );
                  })}
                  {extra > 0 && (
                    <div className="text-[10px] text-neutral-600 pl-1.5">+{extra} más</div>
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
