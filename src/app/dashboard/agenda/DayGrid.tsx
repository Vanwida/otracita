'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock, ChevronDown } from 'lucide-react';
import type { CalendarEvent, Barber } from './types';
import { barberColorVar, paymentBadge } from './types';
import { appointmentBlockStyle, statusBadge } from './_appointment-color';
import { hoursForDate } from '@/lib/availability-hours';

const PX_PER_MIN = 2;
const GRID_START = 8 * 60;  // 08:00
const GRID_END = 22 * 60;   // 22:00
const TOTAL_HEIGHT = (GRID_END - GRID_START) * PX_PER_MIN; // 1680px
// Must equal --agenda-col-header-h (60px). The gutter wrapper reserves
// header + body so its scroll height matches the column bodies exactly.
const COL_HEADER_H = 60;
// Drag&drop / click-to-create se ajustan a esta rejilla de minutos. 5 min
// = "ajustar minutos libremente" sin que un pixel mal puesto deje 10:03
// (R1/R3). El servidor acepta cualquier HH:MM; el snap es UX del cliente.
const SNAP_MIN = 5;

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
  /** Clic en la CABECERA de una columna de barbero → menú de acciones
   *  (editar horario · ausencia · falta disp. · qué ha hecho). Fix #2. */
  onBarberClick: (barber: Barber) => void;
  /**
   * Drag&drop: el usuario soltó la cita `id` en una nueva (date,time) y/o
   * columna de barbero. barberId=null → columna "Sin asignar" (mantener
   * "cualquiera"). El padre hace el update optimista + PATCH + revalida.
   * R1/R3.
   */
  onEventMove: (
    id: string,
    next: { date: string; time: string; barberId: string | null },
  ) => void;
}

// El color de la cita = color del BARBERO (consistente Día/Semana/Mes); el
// ESTADO se comunica con tratamiento + ícono + etiqueta, NO con otro tono.
// Toda esa lógica vive en `_appointment-color.ts` (fuente única, fix #6).

/** Iniciales de un nombre — máx 2 letras, mayúsculas. "José Ruiz" → "JR". */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Subtítulo de la cabecera de columna (paridad Booksy 09.39.31): el HORARIO
 * que ese barbero trabaja ese día ("11:00 - 20:00") o "Falta de
 * disponibilidad" si está cerrado/bloqueado. Reusa `hoursForDate` de la
 * lib de disponibilidad — cero lógica de parseo duplicada. Hoy todos los
 * barberos heredan el horario de tienda (`hours`); cuando WS-B cablee
 * horario por-barbero esta función ya consume el shape correcto. */
function barberDayHoursLabel(
  dateStr: string,
  hours: Record<string, string> | null,
  blocked: boolean,
): string {
  if (blocked) return 'Falta de disponibilidad';
  const h = hoursForDate(dateStr, hours);
  if (!h) return 'Falta de disponibilidad';
  return `${h.start} - ${h.end}`;
}

export default function DayGrid({
  date,
  events,
  barbers,
  blockedDates,
  hours,
  onEventClick,
  onSlotClick,
  onBarberClick,
  onEventMove,
}: Props) {
  const [currentTimeMin, setCurrentTimeMin] = useState(getCurrentTimeMinutes);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Drag&drop nativo (HTML5, sin dependencia nueva). Guardamos el id de la
  // cita arrastrada y el offset (px) entre el cursor y el borde superior
  // del bloque, para que al soltar la hora destino sea la del INICIO del
  // bloque y no la del punto donde se agarró.
  const dragRef = useRef<{ id: string; grabOffsetPx: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Soltar una cita en una columna: calcula la (date,time,barberId)
  // destino y delega en el padre (update optimista + PATCH + revalida).
  const handleColumnDrop = (
    e: React.DragEvent<HTMLDivElement>,
    barberId: string | null,
  ) => {
    e.preventDefault();
    const drag = dragRef.current;
    // Fallback: si el ref se perdió entre frames (Safari/FF nulan refs
    // custom en algunos drags), recuperamos el id del dataTransfer que
    // SIEMPRE seteamos en onDragStart. Sin offset → asumimos agarre por
    // el borde superior del bloque (0px), suficiente con el snap de 5min.
    const dragId = drag?.id ?? (e.dataTransfer.getData('text/plain') || null);
    const grabOffsetPx = drag?.grabOffsetPx ?? 0;
    dragRef.current = null;
    setDraggingId(null);
    if (!dragId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // y del cursor → restamos el offset de agarre → top del bloque.
    const topPx = e.clientY - rect.top - grabOffsetPx;
    const startMinutes = Math.round(topPx / PX_PER_MIN) + GRID_START;
    const snapped = Math.round(startMinutes / SNAP_MIN) * SNAP_MIN;
    const clamped = Math.max(GRID_START, Math.min(GRID_END - SNAP_MIN, snapped));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onEventMove(dragId, { date: dateStr, time, barberId });
  };

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
    // Snap a SNAP_MIN (R1/R3: ajustar minutos libremente, no solo medias horas).
    const rounded = Math.round(clickedMinutes / SNAP_MIN) * SNAP_MIN;
    const clamped = Math.max(GRID_START, Math.min(GRID_END - SNAP_MIN, rounded));
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
            <div className="h-[var(--agenda-col-header-h)] bg-overlay border-b border-line sticky top-0 z-50" /> {/* header spacer — z-50: esquina sup-izq por encima de las cabeceras de columna (z-40) al scrollear ambos ejes */}
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
                    scrolling the day. z-40: por encima de los eventos (z-20)
                    y de la línea "ahora" (z-30) — antes era z-20 y, al ser
                    igual que los eventos, estos (más tarde en el DOM)
                    pintaban POR ENCIMA al hacer scroll. El bg-overlay es
                    opaco, así que ahora tapa correctamente las citas que
                    suben. La esquina sup-izq (gutter spacer) va a z-50 para
                    quedar sobre las cabeceras al scrollear en ambos ejes. */}
                {(() => {
                  // Subtítulo = horario que trabaja ese barbero ese día, o
                  // "Falta de disponibilidad" (paridad Booksy 09.39.31).
                  // Solo para columnas que mapean a un barbero real.
                  const hoursLabel = col.barber
                    ? barberDayHoursLabel(dateStr, hours, isBlocked)
                    : null;
                  const headerInner = (
                    <>
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
                          className="h-8 w-8 rounded-full object-cover ring-2 shrink-0"
                          style={{ ['--tw-ring-color' as string]: colColor }}
                        />
                      ) : (
                        <span
                          className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                          style={{ backgroundColor: colColor }}
                          aria-hidden="true"
                        >
                          {col.barber ? initials(col.barber.name) : '∅'}
                        </span>
                      )}
                      {/* Nombre (mayúsculas, Booksy) sobre el horario del
                          día. min-w-0 + truncate para que no rompa columnas
                          estrechas. */}
                      <span className="flex flex-col min-w-0 flex-1 text-left">
                        <span className="text-[0.75rem] font-bold uppercase tracking-wide text-ink truncate leading-tight">
                          {col.label}
                        </span>
                        {hoursLabel && (
                          <span className="text-[0.6875rem] text-ink-2 truncate leading-tight tabular-nums">
                            {hoursLabel}
                          </span>
                        )}
                      </span>
                      {col.barber && (
                        <ChevronDown
                          className="h-3.5 w-3.5 text-ink-3 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  );
                  const headerClass =
                    'h-[var(--agenda-col-header-h)] w-full flex flex-row items-center gap-2 px-2.5 border-b border-line bg-overlay shrink-0 sticky top-0 z-40';
                  // Clic en la cabecera → menú de acciones del barbero
                  // (fix #2). Solo si la columna mapea a un barbero real
                  // (la fallback "Sin asignar"/"Todos" no es accionable).
                  return col.barber ? (
                    <button
                      type="button"
                      onClick={() => onBarberClick(col.barber!)}
                      aria-label={`Acciones de ${col.barber.name}${hoursLabel ? `, ${hoursLabel}` : ''}`}
                      className={`${headerClass} cursor-pointer hover:bg-overlay/70 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand transition-colors`}
                    >
                      {headerInner}
                    </button>
                  ) : (
                    <div className={headerClass}>{headerInner}</div>
                  );
                })()}

                {/* Column body — también drop target del drag&drop. */}
                <div
                  className="relative cursor-pointer"
                  style={{ height: TOTAL_HEIGHT }}
                  onClick={e => handleColumnClick(e, col.barber?.id ?? null)}
                  onDragOver={e => {
                    // Permitir soltar mientras haya una cita arrastrándose.
                    // Comprobamos ref O estado: el ref es síncrono pero el
                    // estado (draggingId) sobrevive a frames donde el ref se
                    // limpia. preventDefault en dragover es OBLIGATORIO para
                    // que el evento drop dispare (spec HTML5).
                    if (dragRef.current || draggingId) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={e => handleColumnDrop(e, col.barber?.id ?? null)}
                >
                  {/* Fuera de horario — antes de abrir. .offhours-overlay
                      (FIX 3): tinte cálido + trama diagonal → "cerrado" se
                      lee de un vistazo sin pisar el acento de barbero (barra
                      sólida saturada, nunca compite con el tinte). */}
                  {businessHours && businessHours.open > GRID_START && (
                    <div
                      className="absolute left-0 right-0 top-0 offhours-overlay pointer-events-none z-10"
                      style={{ height: (businessHours.open - GRID_START) * PX_PER_MIN }}
                    />
                  )}

                  {/* Fuera de horario — tras cerrar. */}
                  {businessHours && businessHours.close < GRID_END && (
                    <div
                      className="absolute left-0 right-0 offhours-overlay pointer-events-none z-10"
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
                    // Color = ESTADO de la cita (Booksy-exact, igual en
                    // Semana/Mes) + ícono + etiqueta, nunca solo color. La
                    // identidad del barbero vive en la cabecera de columna.
                    const { style: blockStyle, treatment } = appointmentBlockStyle(
                      col.barber?.displayOrder ?? null,
                      event.status,
                    );
                    const badge = statusBadge(event.status);

                    const endMin = startMin + event.duration;
                    const endH = Math.floor(endMin / 60);
                    const endM = endMin % 60;
                    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

                    // Booksy = solo lectura (lo gestiona Booksy); las
                    // citas canceladas no se mueven. El resto es arrastrable
                    // para reprogramar (R1/R3).
                    const isDraggable = !isBooksy && !isCancelled;
                    const isDragging = draggingId === event.id;

                    return (
                      <div
                        key={event.id}
                        data-event="true"
                        draggable={isDraggable}
                        onDragStart={e => {
                          if (!isDraggable) return;
                          // Offset entre el cursor y el top del bloque, para
                          // que al soltar la hora sea la del INICIO, no la
                          // del punto agarrado.
                          const r = e.currentTarget.getBoundingClientRect();
                          dragRef.current = {
                            id: event.id,
                            grabOffsetPx: e.clientY - r.top,
                          };
                          e.dataTransfer.effectAllowed = 'move';
                          // Firefox exige setData para iniciar el drag.
                          e.dataTransfer.setData('text/plain', event.id);
                          setDraggingId(event.id);
                        }}
                        onDragEnd={() => {
                          dragRef.current = null;
                          setDraggingId(null);
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        className={`absolute left-1 right-1 z-20 rounded-r px-1.5 py-1 overflow-hidden transition-opacity hover:opacity-80 ${
                          isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } ${treatment} ${isDragging ? 'opacity-40' : ''} ${
                          // Mientras se arrastra CUALQUIER cita, las demás
                          // dejan de capturar puntero/drop: así el dragover y
                          // el drop SIEMPRE llegan al cuerpo de la columna,
                          // incluso si sueltas encima de otra cita (era el
                          // bug — soltar sobre una cita existente no hacía
                          // nada porque el tile interceptaba el drop).
                          draggingId ? 'pointer-events-none' : ''
                        }`}
                        style={{ top, height, ...blockStyle }}
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
                          {/* Estado por ícono + etiqueta (NUNCA solo color):
                              confirmada no necesita decoración. */}
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
                          <p className="text-[10px] leading-tight truncate font-medium">
                            {event.customerName || event.customerPhone}
                          </p>
                        )}
                        {height > 44 && (
                          <p className="text-[9px] leading-tight truncate opacity-75">
                            {event.service}
                          </p>
                        )}
                        {/* R6 badge cobrado (display-only). El método lo
                            captura WS-D al completar; aquí solo se pinta.
                            Pegado abajo-derecha para no robar la línea de
                            cliente/servicio. */}
                        {(() => {
                          const pb = paymentBadge(event.paymentMethod);
                          if (!pb || height <= 28) return null;
                          return (
                            <span
                              className="absolute bottom-1 right-1 inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded bg-surface/70 text-[9px] font-bold tabular-nums"
                              title={pb.label}
                              aria-label={pb.label}
                            >
                              {pb.glyph}
                            </span>
                          );
                        })()}
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
