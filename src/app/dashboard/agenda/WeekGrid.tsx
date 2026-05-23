'use client';

import { useEffect, useRef, useMemo } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock } from 'lucide-react';
import type { CalendarEvent } from './types';
import {
  appointmentBlockClasses,
  resolveBookingColorToken,
  statusCornerBadge,
} from './_appointment-color';
import { computeAgendaWindow, toMinutes, WEEK_PX_PER_MIN } from './_agenda-window';
import { computeOverlapLayout } from './_event-layout';
import { hoursForDate } from '@/lib/availability-hours';
import { useCurrentTime } from './_hooks/use-current-time';

// La ventana temporal ya NO es fija — se deriva de los datos de la SEMANA
// visible en `_agenda-window` (misma fuente que DayGrid). Antes
// GRID_START/END estaban hardcodeados a 08:00–22:00 y una tienda que abría
// a las 07:00 perdía esa hora también en Semana.

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
  /** Click en la cabecera de un día (nombre + número) → cambia a vista
   *  Día centrada en ese día. Lo despacha el parent (CalendarView), que
   *  posee el estado de `viewMode` y `currentDay` (fuente única, DRY con
   *  el toggle Día/Semana/Mes y el botón "Hoy"). */
  onSelectDay: (date: Date) => void;
}

export default function WeekGrid({
  weekStart,
  events,
  services,
  blockedDates,
  hours,
  onEventClick,
  onSlotClick,
  onSelectDay,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // Reloj vivo — refresca cada 60s para que la línea "ahora" avance sin
  // recargar (bug Reni 2026-05-22). `today` se deriva del mismo Date para
  // que el resaltado de la columna de hoy también pase de un día a otro
  // sin reload si el dashboard queda abierto cruzando medianoche.
  const nowDate = useCurrentTime();
  const today = nowDate;
  const currentTimeMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  const scrollRef = useRef<HTMLDivElement>(null);

  const dayStrs = useMemo(
    () => days.map((d) => format(d, 'yyyy-MM-dd')),
    [days],
  );

  // Ventana DINÁMICA de la semana (fuente única _agenda-window): unión del
  // horario de tienda + citas reales en los 7 días visibles.
  //
  // `computeAgendaWindow` calcula `totalHeight`/`hourLabels.top` con la
  // densidad por defecto (PX_PER_MIN = vista Día = 2). En Semana usamos
  // WEEK_PX_PER_MIN (más denso → más citas en pantalla) y reescalamos esos
  // dos campos. `startMin`/`endMin` son minutos puros y siguen siendo válidos.
  const { startMin, endMin, hourLabels } = useMemo(() => {
    const w = computeAgendaWindow({
      dates: dayStrs,
      hours,
      events: events.map((e) => ({
        date: e.date,
        time: e.time,
        duration: e.duration,
      })),
    });
    // Reetiquetamos las etiquetas a la densidad de Semana — mismas horas en
    // punto que ya calcula el módulo, sólo cambia el `top` en px.
    const labels = w.hourLabels.map((hl, i) => ({
      label: hl.label,
      top: i * 60 * WEEK_PX_PER_MIN,
    }));
    return { startMin: w.startMin, endMin: w.endMin, hourLabels: labels };
  }, [dayStrs, hours, events]);

  const totalHeight = (endMin - startMin) * WEEK_PX_PER_MIN;

  // Auto-scroll inicial: a "ahora" si cae en la ventana (la semana suele
  // contener hoy), si no al inicio de la ventana. Re-corre al cambiar de
  // semana/ventana. Scroll interno — la página nunca scrollea.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nowInWindow =
      currentTimeMin >= startMin && currentTimeMin <= endMin;
    const targetMin = nowInWindow ? currentTimeMin : startMin;
    el.scrollTop = Math.max(0, (targetMin - startMin) * WEEK_PX_PER_MIN - 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStrs[0], startMin, endMin]);

  const currentTimePx =
    currentTimeMin >= startMin && currentTimeMin <= endMin
      ? (currentTimeMin - startMin) * WEEK_PX_PER_MIN
      : null;

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>, dateStr: string) => {
    if ((e.target as HTMLElement).closest('[data-event]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickedMinutes = Math.floor(y / WEEK_PX_PER_MIN) + startMin;
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
                {/* Column header — botón completo, no solo el número. Click
                    → cambia la vista a "Día" centrada en ese día (DRY: usa
                    el mismo setter que el toggle Día/Semana/Mes del
                    CalendarView, vía `onSelectDay`). El target horizontal
                    cubre toda la columna; vertical 32px (h-8) por alineación
                    con el gutter — el strip completo dispara el click. */}
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  aria-label={`Ver agenda del ${format(day, "EEEE d 'de' MMMM", { locale: es })}`}
                  className="h-8 w-full flex flex-col items-center justify-center border-b border-line shrink-0 cursor-pointer hover:bg-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset transition-colors"
                >
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
                </button>

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
                            style={{ height: (open - startMin) * WEEK_PX_PER_MIN }}
                          />
                        )}
                        {close < endMin && (
                          <div
                            className="absolute left-0 right-0 offhours-overlay pointer-events-none z-10"
                            style={{
                              top: (close - startMin) * WEEK_PX_PER_MIN,
                              height: (endMin - close) * WEEK_PX_PER_MIN,
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
                      style={{ top: top + 30 * WEEK_PX_PER_MIN }}
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

                  {/* Events — variante COMPACT (Semana). Diferencias vs Día:
                      · padding mínimo (4px/2px) para no robar alto a citas cortas
                      · fuentes -compact (cliente 11.5px / servicio 10.5px)
                      · altura = duration × WEEK_PX_PER_MIN (densidad Semana
                        = 1.5px/min → 30min ≈ 43px, 45min ≈ 64px). Calibrada
                        para que Reni vea muchas más citas a la vez que en Día.
                      · gap visual real de 2px entre bloques consecutivos
                        (top+1 / height-2) para que dos citas seguidas NUNCA
                        parezcan una sola — el bug original.
                      · < 15min (= height < ~22px) → altura visual mínima 18px
                        para legibilidad. El siguiente bloque empieza en su
                        `top` real (basado en su hora), así que pueden
                        solaparse 2-3px — convención Booksy/Fresha.
                      · < 20min (= height < 30px) → solo nombre cliente, sin
                        hora ni servicio (posición vertical comunica la hora)
                      · CITAS SOLAPADAS en TIEMPO (bug #58 v3, 2026-05-23):
                        antes el bloque ocupaba left-0.5 right-0.5 (todo el
                        ancho de la columna). Dos citas con horas que se pisan
                        → mismo carril vertical, una encima de otra. Ahora
                        `computeOverlapLayout` (DRY, mismo helper que DayGrid)
                        reparte en N carriles laterales 1/N. 2px de aire
                        entre carriles (calc) para que no parezcan pegadas. */}
                  {(() => {
                    const layout = computeOverlapLayout(
                      dayEvents.map((e) => ({
                        id: e.id,
                        startMin: toMinutes(e.time),
                        durationMin: e.duration,
                      })),
                    );
                    return dayEvents.map(event => {
                      const evStartMin = toMinutes(event.time);
                      const rawTop = (evStartMin - startMin) * WEEK_PX_PER_MIN;
                      const rawHeight = event.duration * WEEK_PX_PER_MIN;
                      // 1px de aire arriba/abajo → 2px gap real entre citas
                      // pegadas. Min-height visual 18px para citas <15min
                      // (legibilidad); el `top` del siguiente bloque ya está
                      // en su hora real → puede solapar 2-3px (Booksy-style).
                      const top = rawTop + 1;
                      const height = Math.max(rawHeight - 2, 18);
                      const isShort = height < 30;   // ~< 20min @ 1.5px/min
                      const isTiny = height < 22;    // ~< 15min → ultra-denso
                      const showService = height >= 42 && !isShort; // ~30min+
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
                      const displayName =
                        event.customerName?.trim() ||
                        event.customerPhone?.trim() ||
                        'Sin nombre';
                      // Lane layout: si esta cita comparte minutos con otras
                      // del mismo día, se reparten el ancho de la columna en
                      // N carriles. 2px de aire entre carriles (insetX) para
                      // que dos citas paralelas tengan un hairline visible
                      // — sin que parezca un único bloque pegado. Bug #58 v3.
                      const lay = layout.get(event.id) ?? { leftPct: 0, widthPct: 100 };
                      const insetX = 2;

                      return (
                        <div
                          key={event.id}
                          data-event="true"
                          onClick={e => {
                            e.stopPropagation();
                            onEventClick(event);
                          }}
                          className={`absolute z-20 flex flex-col rounded cursor-pointer overflow-hidden transition-opacity hover:opacity-80 ${
                            isTiny ? 'px-1 py-0' : 'px-1 py-0.5'
                          } ${blockClass} ${treatment}`}
                          style={{
                            top,
                            height,
                            left: `calc(${lay.leftPct}% + ${insetX}px)`,
                            width: `calc(${lay.widthPct}% - ${insetX * 2}px)`,
                          }}
                          title={`${event.time} · ${displayName}${event.service ? ` · ${event.service}` : ''}`}
                        >
                          {/* Badge estado/Booksy — solo si el bloque tiene
                              altura suficiente para acomodarlo sin pisar el
                              texto. En citas ultra-cortas el color del fill
                              + tooltip ya transmiten el contexto. */}
                          {!isTiny && (
                            <div
                              className="absolute top-0 right-0 z-10 inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-surface/85 backdrop-blur-sm shadow-sm"
                              aria-label={isBooksy && !isCancelled ? 'Cita de Booksy' : badge.label}
                              title={isBooksy && !isCancelled ? 'Cita de Booksy' : badge.label}
                            >
                              {isBooksy && !isCancelled ? (
                                <Lock className="h-2 w-2 text-ink-2" aria-hidden="true" />
                              ) : (
                                <badge.icon
                                  className={`h-2 w-2 ${badge.tone}`}
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          )}
                          {/* Línea 1.
                              · isShort (<20min): solo nombre cliente, sin hora.
                                La hora está implícita en la posición + el gutter.
                              · resto: hora + cliente (la hora ayuda al barrido
                                vertical rápido en vista semanal). */}
                          <p
                            className={`font-semibold leading-tight truncate ${
                              isTiny ? 'pr-0' : 'pr-4'
                            }`}
                            style={{ fontSize: 'var(--agenda-ev-client-compact)' }}
                          >
                            {!isShort && (
                              <span className="tabular-nums mr-1">{event.time}</span>
                            )}
                            {displayName}
                          </p>
                          {showService && (
                            <p
                              className="opacity-80 leading-tight truncate"
                              style={{ fontSize: 'var(--agenda-ev-service-compact)' }}
                            >
                              {event.service}
                            </p>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
