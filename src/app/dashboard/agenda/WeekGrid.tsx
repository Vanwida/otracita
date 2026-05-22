'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock } from 'lucide-react';
import type { CalendarEvent } from './types';
import {
  appointmentBlockClasses,
  resolveBookingColorToken,
  statusCornerBadge,
} from './_appointment-color';
import { computeAgendaWindow, toMinutes, PX_PER_MIN } from './_agenda-window';
import { hoursForDate } from '@/lib/availability-hours';

// La ventana temporal ya NO es fija — se deriva de los datos de la SEMANA
// visible en `_agenda-window` (misma fuente que DayGrid). Antes
// GRID_START/END estaban hardcodeados a 08:00–22:00 y una tienda que abría
// a las 07:00 perdía esa hora también en Semana.

function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

interface Props {
  weekStart: Date;
  events: CalendarEvent[];
  /** Catálogo de servicios — color del bloque por servicio (#33). */
  services: ReadonlyArray<{ name: string; colorToken?: string | null }>;
  blockedDates: string[];
  /** Horario semanal de la tienda — alimenta la ventana dinámica y el
   *  sombreado fuera-de-horario, consistente con la vista Día. */
  hours: Record<string, string> | null;
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: string, time: string) => void;
}

export default function WeekGrid({
  weekStart,
  events,
  services,
  blockedDates,
  hours,
  onEventClick,
  onSlotClick,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const [currentTimeMin, setCurrentTimeMin] = useState(getCurrentTimeMinutes);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dayStrs = useMemo(
    () => days.map((d) => format(d, 'yyyy-MM-dd')),
    [days],
  );

  // Ventana DINÁMICA de la semana (fuente única _agenda-window): unión del
  // horario de tienda + citas reales en los 7 días visibles.
  const { startMin, endMin, totalHeight, hourLabels } = useMemo(
    () =>
      computeAgendaWindow({
        dates: dayStrs,
        hours,
        events: events.map((e) => ({
          date: e.date,
          time: e.time,
          duration: e.duration,
        })),
      }),
    [dayStrs, hours, events],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeMin(getCurrentTimeMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll inicial: a "ahora" si cae en la ventana (la semana suele
  // contener hoy), si no al inicio de la ventana. Re-corre al cambiar de
  // semana/ventana. Scroll interno — la página nunca scrollea.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nowInWindow =
      currentTimeMin >= startMin && currentTimeMin <= endMin;
    const targetMin = nowInWindow ? currentTimeMin : startMin;
    el.scrollTop = Math.max(0, (targetMin - startMin) * PX_PER_MIN - 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStrs[0], startMin, endMin]);

  const currentTimePx =
    currentTimeMin >= startMin && currentTimeMin <= endMin
      ? (currentTimeMin - startMin) * PX_PER_MIN
      : null;

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, dateStr: string) => {
    if ((e.target as HTMLElement).closest('[data-event]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickedMinutes = Math.floor(y / PX_PER_MIN) + startMin;
    const rounded = Math.round(clickedMinutes / 30) * 30;
    const clamped = Math.max(startMin, Math.min(endMin - 30, rounded));
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
      <div className="w-12 shrink-0 relative bg-surface border-r border-line" style={{ height: totalHeight + 32 }}>
        <div className="h-8" /> {/* header spacer */}
        <div className="relative" style={{ height: totalHeight }}>
          {/* Current time dot in gutter */}
          {currentTimePx !== null && (
            <div
              className="absolute right-0 z-20"
              style={{ top: currentTimePx - 5 }}
            >
              <div className="h-2.5 w-2.5 rounded-full bg-time-now translate-x-1/2" />
            </div>
          )}
          {hourLabels.map(({ label, top }) => (
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
                  style={{ height: totalHeight }}
                  onClick={e => handleColumnClick(e, dateStr)}
                >
                  {/* Fuera de horario de ESE día (consistente con la vista
                      Día): tinte + trama contra la ventana dinámica. */}
                  {(() => {
                    const dh = hoursForDate(dateStr, hours);
                    if (!dh) return null;
                    const open = toMinutes(dh.start);
                    const close = toMinutes(dh.end);
                    return (
                      <>
                        {open > startMin && (
                          <div
                            className="absolute left-0 right-0 top-0 offhours-overlay pointer-events-none z-10"
                            style={{ height: (open - startMin) * PX_PER_MIN }}
                          />
                        )}
                        {close < endMin && (
                          <div
                            className="absolute left-0 right-0 offhours-overlay pointer-events-none z-10"
                            style={{
                              top: (close - startMin) * PX_PER_MIN,
                              height: (endMin - close) * PX_PER_MIN,
                            }}
                          />
                        )}
                      </>
                    );
                  })()}

                  {/* Blocked overlay */}
                  {isBlocked && (
                    <div className="absolute inset-0 z-10 pointer-events-none blocked-overlay" />
                  )}

                  {/* Hour lines */}
                  {hourLabels.map(({ top }, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-line"
                      style={{ top }}
                    />
                  ))}

                  {/* Half-hour lines — sin la última (su +30min saldría de
                      la ventana, que siempre cierra en hora en punto). */}
                  {hourLabels.slice(0, -1).map(({ top }, i) => (
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
                    const evStartMin = toMinutes(event.time);
                    const top = (evStartMin - startMin) * PX_PER_MIN;
                    // Alto mínimo legible (igual criterio que Día, algo más
                    // bajo por la densidad de 7 columnas).
                    const height = Math.max(event.duration * PX_PER_MIN, 34);
                    const showService = height >= 50;
                    const isBooksy = event.source === 'booksy';
                    const isCancelled = event.status === 'cancelled';
                    // #33 — Color por SERVICIO (no por estado). Mismo helper
                    // que Día/Mes; estado va a badge esquina (commit 3).
                    const colorToken = resolveBookingColorToken(event, services);
                    const { className: blockClass, treatment } = appointmentBlockClasses(
                      colorToken,
                      event.status,
                    );
                    const badge = statusCornerBadge(event.status);

                    return (
                      <div
                        key={event.id}
                        data-event="true"
                        onClick={e => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        className={`absolute left-1 right-1 z-20 flex flex-col gap-0.5 rounded-md px-1.5 py-1 cursor-pointer overflow-hidden transition-opacity hover:opacity-80 ${blockClass} ${treatment}`}
                        style={{ top, height }}
                        title={event.title}
                      >
                        {/* Estado/Booksy — esquina sup-der (#33). Mismo
                            patrón que DayGrid: disco translúcido + ícono. */}
                        <div
                          className="absolute top-0.5 right-0.5 z-10 inline-flex items-center justify-center h-4 w-4 rounded-full bg-surface/85 backdrop-blur-sm shadow-sm"
                          aria-label={isBooksy && !isCancelled ? 'Cita de Booksy' : badge.label}
                          title={isBooksy && !isCancelled ? 'Cita de Booksy' : badge.label}
                        >
                          {isBooksy && !isCancelled ? (
                            <Lock className="h-2.5 w-2.5 text-ink-2" aria-hidden="true" />
                          ) : (
                            <badge.icon
                              className={`h-2.5 w-2.5 ${badge.tone}`}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        {/* Línea 1 — hora + cliente. Reservamos paddings
                            para no chocar con el badge esquina. */}
                        <p
                          className="font-semibold leading-tight truncate pr-5"
                          style={{ fontSize: 'var(--agenda-ev-client)' }}
                        >
                          <span className="tabular-nums">{event.time}</span>{' '}
                          {event.customerName || event.customerPhone}
                        </p>
                        {showService && (
                          <p
                            className="opacity-80 leading-tight truncate"
                            style={{ fontSize: 'var(--agenda-ev-service)' }}
                          >
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
