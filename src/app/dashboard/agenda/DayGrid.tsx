'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock } from 'lucide-react';
import type { CalendarEvent, Barber } from './types';
import { barberColorVar } from './types';

const PX_PER_MIN = 2;
const GRID_START = 8 * 60;  // 08:00
const GRID_END = 22 * 60;   // 22:00
const TOTAL_HEIGHT = (GRID_END - GRID_START) * PX_PER_MIN; // 1680px
// Must equal --agenda-col-header-h (52px). The gutter wrapper reserves
// header + body so its scroll height matches the column bodies exactly.
const COL_HEADER_H = 52;

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
  barbers: Barber[];
  blockedDates: string[];
  hours: Record<string, string> | null;
  onEventClick: (event: CalendarEvent) => void;
  /** barberId is the canonical id of the clicked column (null for the
   *  "Sin asignar" fallback / single-column shops). */
  onSlotClick: (date: string, time: string, barberId: string | null) => void;
}

// El FILL del bloque codifica el ESTADO de la cita (UI0 #3); la identidad
// del barbero la lleva el borde-acento izquierdo (no el fondo). Tokens en
// globals.css @theme. 'confirmed' es el caso normal (verde sage suave);
// completed = slate frío; no_show = rojo; cancelled = casi-gris apagado.
function statusBlockStyle(status: string): { bg: string; ink: string } {
  switch (status) {
    case 'completed':
      return {
        bg: 'var(--color-event-completed-bg)',
        ink: 'var(--color-event-completed-ink)',
      };
    case 'no_show':
      return {
        bg: 'var(--color-event-noshow-bg)',
        ink: 'var(--color-event-noshow-ink)',
      };
    case 'cancelled':
      return {
        bg: 'var(--color-event-cancelled-bg)',
        ink: 'var(--color-event-cancelled-ink)',
      };
    default: // confirmed (y cualquier estado desconocido → tratar como activo)
      return {
        bg: 'var(--color-event-confirmed-bg)',
        ink: 'var(--color-event-confirmed-ink)',
      };
  }
}

/** Iniciales de un nombre — máx 2 letras, mayúsculas. "José Ruiz" → "JR". */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
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

  // Scroll to current time on mount — puts "ahora" ~100px from the top so
  // the barber lands on the live portion of the day.
  useEffect(() => {
    if (scrollRef.current) {
      const offset = Math.max(0, (currentTimeMin - GRID_START) * PX_PER_MIN - 100);
      scrollRef.current.scrollTop = offset;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the clock. Every minute (when currentTimeMin ticks), if "ahora"
  // is still inside the visible area we slide the view so it stays around
  // 1/3 from the top — that way the day advances with the clock without
  // any manual scrolling. If the barber has scrolled away to look at a
  // different hour, we leave their position alone until they come back.
  useEffect(() => {
    const el = scrollRef.current;
    const dateStr = format(date, 'yyyy-MM-dd');
    const isTodayLive = dateStr === format(new Date(), 'yyyy-MM-dd');
    if (!el || !isTodayLive) return;
    if (currentTimeMin < GRID_START || currentTimeMin > GRID_END) return;

    const nowPx = (currentTimeMin - GRID_START) * PX_PER_MIN;
    const viewportTop = el.scrollTop;
    const viewportBottom = viewportTop + el.clientHeight;
    const nowIsVisible = nowPx >= viewportTop && nowPx <= viewportBottom;
    if (!nowIsVisible) return;

    const target = Math.max(0, nowPx - el.clientHeight / 3);
    el.scrollTo({ top: target, behavior: 'smooth' });
  }, [currentTimeMin, date]);

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

  // Each column carries its Barber (when it maps to one) so the header can
  // render avatar + identity color and slot-clicks can emit the real
  // barberId. The "Sin asignar" / single-column fallbacks have barber=null.
  type Column = { key: string; label: string; barber: Barber | null };
  const columns: Column[] =
    barbers.length > 0
      ? [
          ...barbers.map((b) => ({ key: b.name, label: b.name, barber: b })),
          ...(hasUnassigned
            ? [{ key: '__unassigned__', label: 'Sin asignar', barber: null }]
            : []),
        ]
      : [{ key: 'all', label: 'Todos', barber: null }];

  const getEventsForColumn = (colKey: string) => {
    if (colKey === 'all') return events.filter((e) => e.date === dateStr);
    if (colKey === '__unassigned__')
      return events.filter((e) => e.date === dateStr && !isAssigned(e));
    return events.filter(
      (e) => e.date === dateStr && isAssigned(e) && e.barber!.trim().toLowerCase() === colKey.trim().toLowerCase(),
    );
  };

  const handleColumnClick = (
    e: React.MouseEvent<HTMLDivElement>,
    barberId: string | null,
  ) => {
    if ((e.target as HTMLElement).closest('[data-event]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickedMinutes = Math.floor(y / PX_PER_MIN) + GRID_START;
    // Snap a 5 min (R1/R3: ajustar minutos libremente, no solo medias horas).
    const rounded = Math.round(clickedMinutes / 5) * 5;
    const clamped = Math.max(GRID_START, Math.min(GRID_END - 5, rounded));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onSlotClick(dateStr, time, barberId);
  };

  return (
    <div className="flex flex-1 overflow-hidden bg-surface">
      {/* Single scroll container so the time gutter and the column bodies
          scroll TOGETHER vertically (otherwise events drift visually from
          their hour labels). The gutter is position:sticky on the left so
          it stays visible when the user scrolls horizontally across many
          barbers. */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="flex" style={{ minWidth: `${48 + columns.length * 160}px` }}>
          {/* Time gutter (sticky left) */}
          <div
            className="w-12 shrink-0 bg-surface border-r border-line sticky left-0 z-30"
            style={{ height: TOTAL_HEIGHT + COL_HEADER_H }}
          >
            <div className="h-[var(--agenda-col-header-h)] bg-overlay border-b border-line sticky top-0 z-40" /> {/* header spacer — matches column header height */}
            <div className="relative" style={{ height: TOTAL_HEIGHT }}>
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

          {columns.map(col => {
            const colEvents = getEventsForColumn(col.key);
            const colColor = col.barber
              ? barberColorVar(col.barber.displayOrder)
              : 'var(--color-line-strong)';

            return (
              <div
                key={col.key}
                className="flex-1 flex flex-col border-r border-line last:border-r-0 min-w-0"
              >
                {/* Column header — avatar + name + identity color spine
                    (Booksy-dense, A5). Sticky so it stays visible while
                    scrolling the day. The 3px top spine + avatar ring carry
                    the barber color; NO color column on the table — derived
                    from displayOrder via barberColorVar(). */}
                <div className="h-[var(--agenda-col-header-h)] flex flex-col items-center justify-center gap-1 px-2 border-b border-line bg-overlay shrink-0 sticky top-0 z-20">
                  <span
                    className="absolute top-0 left-0 right-0 h-[3px]"
                    style={{ backgroundColor: colColor }}
                    aria-hidden="true"
                  />
                  {col.barber?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={col.barber.photoUrl}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover ring-2 shrink-0"
                      style={{ ['--tw-ring-color' as string]: colColor }}
                    />
                  ) : (
                    <span
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: colColor }}
                      aria-hidden="true"
                    >
                      {col.barber ? initials(col.barber.name) : '∅'}
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-ink-2 truncate max-w-full leading-none">
                    {col.label}
                  </span>
                </div>

                {/* Column body */}
                <div
                  className="relative cursor-pointer"
                  style={{ height: TOTAL_HEIGHT }}
                  onClick={e => handleColumnClick(e, col.barber?.id ?? null)}
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

                  {/* Events — fill codifica ESTADO (UI0 #3); el borde-acento
                      izquierdo lleva el color del barbero de la columna. */}
                  {colEvents.map(event => {
                    const startMin = toMinutes(event.time);
                    const top = (startMin - GRID_START) * PX_PER_MIN;
                    const height = Math.max(event.duration * PX_PER_MIN, 24);
                    const isBooksy = event.source === 'booksy';
                    const isCancelled = event.status === 'cancelled';
                    const { bg, ink } = statusBlockStyle(event.status);

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
                        className={`absolute left-1 right-1 z-20 rounded-r px-1.5 py-1 cursor-pointer overflow-hidden transition-opacity hover:opacity-80 ${
                          isCancelled ? 'line-through opacity-70' : ''
                        }`}
                        style={{
                          top,
                          height,
                          backgroundColor: bg,
                          color: ink,
                          borderLeft: `3px solid ${colColor}`,
                        }}
                        title={event.title}
                      >
                        {/* Booksy lock icon */}
                        {isBooksy && !isCancelled && (
                          <Lock className="absolute top-1 right-1 h-3 w-3 opacity-60" />
                        )}
                        {/* A2 ♥ — cliente pidió este barbero explícitamente.
                            Sólo se pinta en el tile cuando hay altura para
                            no chocar con el candado de Booksy. */}
                        {event.barberRequested && !isBooksy && height > 28 && (
                          <span
                            className="absolute top-1 right-1 text-[10px] leading-none"
                            title="Solicitado por el cliente"
                            aria-label="Solicitado por el cliente"
                          >
                            ♥
                          </span>
                        )}
                        <p className="text-[10px] font-semibold leading-tight truncate">
                          {event.time}
                          <span className="opacity-60"> – {endTime}</span>
                        </p>
                        {height > 28 && (
                          <p className="text-[10px] leading-tight truncate font-medium">
                            {event.customerName || event.customerPhone}
                          </p>
                        )}
                        {height > 44 && (
                          <p className="text-[9px] leading-tight truncate opacity-75">
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
