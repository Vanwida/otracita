'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock } from 'lucide-react';
import type { CalendarEvent } from './types';

const PX_PER_MIN = 2;
const GRID_START = 8 * 60;  // 08:00
const GRID_END = 22 * 60;   // 22:00
const TOTAL_HEIGHT = (GRID_END - GRID_START) * PX_PER_MIN; // 1680px

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const HOUR_LABELS = Array.from({ length: GRID_END / 60 - GRID_START / 60 }, (_, i) => {
  const h = GRID_START / 60 + i;
  return { label: `${String(h).padStart(2, '0')}:00`, top: i * 60 * PX_PER_MIN };
});

function parseBusinessHours(hoursStr: string | undefined): { open: number; close: number } | null {
  if (!hoursStr || hoursStr === 'Cerrado') return null;
  const match = hoursStr.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!match) return null;
  return { open: toMinutes(match[1]), close: toMinutes(match[2]) };
}

function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

interface Props {
  date: Date;
  events: CalendarEvent[];
  barbers: Array<{ name: string }>;
  blockedDates: string[];
  hours: Record<string, string> | null;
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, time: string) => void;
}

export default function DayGrid({
  date,
  events,
  barbers,
  blockedDates,
  hours,
  onEventClick,
  onSlotClick,
}: Props) {
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

  const dateStr = format(date, 'yyyy-MM-dd');
  const isBlocked = blockedDates.includes(dateStr);
  const dayOfWeek = format(date, 'EEEE', { locale: es }).toLowerCase();

  // Parse business hours for today
  const todayHoursStr = hours?.[dayOfWeek];
  const businessHours = parseBusinessHours(todayHoursStr);

  // Current time indicator position
  const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const currentTimePx =
    isToday && currentTimeMin >= GRID_START && currentTimeMin <= GRID_END
      ? (currentTimeMin - GRID_START) * PX_PER_MIN
      : null;

  // Columns: one per configured barber, plus a fallback "Sin asignar" for
  // any booking whose `barber` name doesn't match a configured barber (null,
  // empty, legacy "Sin preferencia" strings, or a barber who has been renamed
  // or removed). Without this the daily agenda silently swallowed phantom
  // bookings — the barber never saw them and the client lost the cut.
  const barberNameSet = new Set(barbers.map((b) => b.name.trim().toLowerCase()));
  const isAssigned = (e: { barber: string | null }): boolean =>
    !!e.barber && barberNameSet.has(e.barber.trim().toLowerCase());
  const hasUnassigned =
    barbers.length > 0 &&
    events.some((e) => e.date === dateStr && !isAssigned(e) && e.status !== 'cancelled');

  const columns =
    barbers.length > 0
      ? [
          ...barbers.map((b) => ({ key: b.name, label: b.name })),
          ...(hasUnassigned ? [{ key: '__unassigned__', label: 'Sin asignar' }] : []),
        ]
      : [{ key: 'all', label: 'Todos' }];

  const getEventsForColumn = (colKey: string) => {
    if (colKey === 'all') return events.filter((e) => e.date === dateStr);
    if (colKey === '__unassigned__')
      return events.filter((e) => e.date === dateStr && !isAssigned(e));
    return events.filter(
      (e) => e.date === dateStr && isAssigned(e) && e.barber!.trim().toLowerCase() === colKey.trim().toLowerCase(),
    );
  };

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, colKey: string) => {
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
    void colKey;
  };

  return (
    <div className="flex flex-1 overflow-hidden bg-surface">
      {/* Time gutter */}
      <div className="w-12 shrink-0 bg-surface border-r border-line relative" style={{ height: TOTAL_HEIGHT + 40 }}>
        <div className="h-10" /> {/* header spacer */}
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

      {/* Columns scroll wrapper */}
      <div className="flex-1 overflow-x-auto overflow-y-auto" ref={scrollRef}>
        <div className="flex min-w-0" style={{ minWidth: `${columns.length * 160}px` }}>
          {columns.map(col => {
            const colEvents = getEventsForColumn(col.key);

            return (
              <div
                key={col.key}
                className="flex-1 flex flex-col border-r border-line last:border-r-0 min-w-0"
              >
                {/* Column header */}
                <div className="h-10 flex items-center justify-center px-2 border-b border-line bg-overlay shrink-0">
                  <span className="text-xs font-bold text-ink-2 truncate">{col.label}</span>
                </div>

                {/* Column body */}
                <div
                  className="relative cursor-pointer"
                  style={{ height: TOTAL_HEIGHT }}
                  onClick={e => handleColumnClick(e, col.key)}
                >
                  {/* Business hours dimming — before open */}
                  {businessHours && businessHours.open > GRID_START && (
                    <div
                      className="absolute left-0 right-0 top-0 bg-overlay pointer-events-none z-10"
                      style={{ height: (businessHours.open - GRID_START) * PX_PER_MIN }}
                    />
                  )}

                  {/* Business hours dimming — after close */}
                  {businessHours && businessHours.close < GRID_END && (
                    <div
                      className="absolute left-0 right-0 bg-overlay pointer-events-none z-10"
                      style={{
                        top: (businessHours.close - GRID_START) * PX_PER_MIN,
                        height: (GRID_END - businessHours.close) * PX_PER_MIN,
                      }}
                    />
                  )}

                  {/* Blocked overlay */}
                  {isBlocked && (
                    <div className="absolute inset-0 z-20 pointer-events-none blocked-overlay" />
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

                  {/* Current time line */}
                  {currentTimePx !== null && (
                    <div
                      className="absolute left-0 right-0 z-30 pointer-events-none"
                      style={{ top: currentTimePx }}
                    >
                      <div className="h-px bg-time-now" />
                    </div>
                  )}

                  {/* Events */}
                  {colEvents.map(event => {
                    const startMin = toMinutes(event.time);
                    const top = (startMin - GRID_START) * PX_PER_MIN;
                    const height = Math.max(event.duration * PX_PER_MIN, 24);
                    const isBooksy = event.source === 'booksy';
                    const isCancelledOrNoShow =
                      event.status === 'cancelled' || event.status === 'no_show';

                    let colorClass = '';
                    if (isCancelledOrNoShow) {
                      colorClass = 'bg-event-noshow/15 text-event-noshow border border-event-noshow/25';
                    } else if (isBooksy) {
                      colorClass = 'bg-event-booksy text-white';
                    } else {
                      colorClass = 'bg-event-native text-white';
                    }

                    const endMin = startMin + event.duration;
                    const endH = Math.floor(endMin / 60);
                    const endM = endMin % 60;
                    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

                    return (
                      <div
                        key={event.id}
                        data-event="true"
                        onClick={e => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        className={`absolute left-1 right-1 z-20 rounded px-1.5 py-1 cursor-pointer overflow-hidden transition-opacity hover:opacity-80 ${colorClass}`}
                        style={{ top, height }}
                        title={event.title}
                      >
                        {/* Booksy lock icon */}
                        {isBooksy && !isCancelledOrNoShow && (
                          <Lock className="absolute top-1 right-1 h-3 w-3 opacity-70" />
                        )}
                        <p className="text-[10px] font-semibold leading-tight truncate">
                          {event.time} – {endTime}
                        </p>
                        {height > 28 && (
                          <p className="text-[10px] leading-tight truncate font-medium">
                            {event.customerName || event.customerPhone}
                          </p>
                        )}
                        {height > 44 && (
                          <p className="text-[9px] leading-tight truncate opacity-80">
                            {event.service}
                          </p>
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
