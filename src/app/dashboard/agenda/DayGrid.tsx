'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { Lock, ChevronDown, Heart } from 'lucide-react';
import type { CalendarEvent, CalendarBlock, Barber } from './types';
import { barberColorVar, paymentBadge } from './types';
import { appointmentBlockStyle, statusBadge } from './_appointment-color';
import { hoursForDate } from '@/lib/availability-hours';
import { computeAgendaWindow, toMinutes, PX_PER_MIN, SNAP_MIN } from './_agenda-window';
import { computeOverlapLayout } from './_event-layout';

// La VENTANA temporal (inicio/fin/alto/etiquetas) ya NO es fija — se deriva
// de los datos del día visible en `_agenda-window` (fuente única, también
// la usa WeekGrid). Antes GRID_START/END estaban hardcodeados a 08:00–22:00
// y una tienda que abría a las 07:00 no veía esa hora.

// Must equal --agenda-col-header-h (60px). The gutter wrapper reserves
// header + body so its scroll height matches the column bodies exactly.
const COL_HEADER_H = 60;

function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

interface Props {
  date: Date;
  events: CalendarEvent[];
  /** Descansos y ausencias del equipo en el rango cargado. La agenda los
   *  pinta como overlays diagonales sobre la columna del barbero en el
   *  rango horario indicado (clase `.blocked-overlay` ya tokenizada). */
  blocks: CalendarBlock[];
  barbers: Barber[];
  /** Catálogo de servicios del cliente — alimenta el color del bloque
   *  (#33). Cada entrada puede traer `colorToken` opcional; si falta o es
   *  inválido, `resolveBookingColorToken` cae al DEFAULT (terracota). */
  services: ReadonlyArray<{ name: string; colorToken?: string | null }>;
  blockedDates: string[];
  hours: Record<string, string> | null;
  onEventClick: (event: CalendarEvent) => void;
  /** barberId is the canonical id of the clicked column (null for the
   *  "Sin asignar" fallback / single-column shops). */
  onSlotClick: (date: string, time: string, barberId: string | null) => void;
  /** Clic en la CABECERA de una columna de barbero → menú de acciones
   *  (editar horario · ausencia · falta disp. · qué ha hecho). Fix #2. */
  onBarberClick: (barber: Barber) => void;
  /** Clic sobre un descanso/ausencia ya creado → abre menú para
   *  eliminar/editar. Sin esto el clic caía en el slot vacío detrás y
   *  abría "Nueva cita" (no podías modificar un descanso). */
  onBlockClick: (block: CalendarBlock) => void;
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
  /**
   * Resize por drag de bordes (U1, feedback Reni V1 P2). El padre PATCHea
   * /api/bookings/[id] con { duration } y, si se arrastró el borde
   * superior, también { time }. Optimista en SWR (mismo patrón que move).
   */
  onEventResize: (
    id: string,
    next: { time: string; duration: number },
  ) => void;
  /**
   * Resize por drag de bordes para descansos / ausencias parciales (U1).
   * El padre PATCHea /api/barbers/[barberId]/blocks?blockId=... con
   * { startTime, endTime }. Día-libre completo NO se resizea (no tiene
   * rango horario — UI filtra fuera el handle).
   */
  onBlockResize: (
    block: CalendarBlock,
    next: { startTime: string; endTime: string },
  ) => void;
  /**
   * Drag&drop para descansos / ausencias (Reni V1 P3 — "cualquier bloque
   * en la agenda se tiene que poder mover con el mouse"). El padre PATCHea
   * /api/barbers/[barberId]/blocks?blockId=... con los campos que cambien.
   * Día-libre completo (start/end null) se mueve SIN cambio de horario —
   * solo cambia date y/o barberId.
   */
  onBlockMove: (
    block: CalendarBlock,
    next: { date: string; startTime: string | null; endTime: string | null; barberId: string },
  ) => void;
}

/** Mínimo de duración tras resize. Coincide con el snap del cliente y el
 *  mínimo aceptado por el endpoint. Bajarlo más rompería el predicado de
 *  solape (`end > start`). */
const RESIZE_MIN_MIN = 5;

/** Alto del handle invisible en cada borde del bloque, en píxeles. Pequeño
 *  pero suficiente para agarrar con ratón sin pelear con el clic del bloque. */
const RESIZE_HANDLE_PX = 6;

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
  // Lenguaje de barbero: si ese día no curra, no es una "falta de
  // disponibilidad" — es que hoy no trabaja. Mismo estado, plano.
  if (blocked) return 'Hoy no trabaja';
  const h = hoursForDate(dateStr, hours);
  if (!h) return 'Hoy no trabaja';
  return `${h.start} - ${h.end}`;
}

export default function DayGrid({
  date,
  events,
  blocks,
  barbers,
  services,
  blockedDates,
  hours,
  onEventClick,
  onSlotClick,
  onBarberClick,
  onBlockClick,
  onEventMove,
  onEventResize,
  onBlockResize,
  onBlockMove,
}: Props) {
  const [currentTimeMin, setCurrentTimeMin] = useState(getCurrentTimeMinutes);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Drag&drop nativo (HTML5, sin dependencia nueva). Guardamos el kind +
  // id arrastrado y el offset (px) entre el cursor y el borde superior
  // del bloque, para que al soltar la hora destino sea la del INICIO del
  // bloque y no la del punto donde se agarró. kind='event' (citas) o
  // 'block' (descansos/ausencias) — el handler de drop decide el callback
  // y, en el caso de día-libre completo, ignora la posición vertical.
  type DragPayload =
    | { kind: 'event'; id: string; grabOffsetPx: number }
    | { kind: 'block'; block: CalendarBlock; grabOffsetPx: number; fullDay: boolean };
  const dragRef = useRef<DragPayload | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Pointer fino (desktop). En touch / iPad con dedo el resize por bordes
  // es frágil — directiva explícita del producto (U1). matchMedia se
  // resuelve cliente-side; por defecto false en SSR para no pintar handles
  // que después desaparecen (sin flicker / sin mismatch de hidratación).
  const [pointerFine, setPointerFine] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: fine)');
    setPointerFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPointerFine(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Estado en vivo del resize. Mientras el barbero arrastra un borde, este
  // objeto sustituye visualmente el bloque (start/end overrideados) para
  // que el preview no dependa del round-trip al servidor. Al soltar, el
  // padre hace el update optimista en SWR + PATCH; este estado se limpia.
  type ResizeState =
    | { kind: 'event'; id: string; edge: 'top' | 'bottom'; startMin: number; endMin: number }
    | { kind: 'block'; id: string; edge: 'top' | 'bottom'; startMin: number; endMin: number };
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  // Ref para tener acceso síncrono dentro de los listeners globales (en
  // React 19+ el closure de useState capturado en addEventListener se
  // queda viejo entre frames si el state cambia rápido).
  const resizingRef = useRef<ResizeState | null>(null);
  resizingRef.current = resizing;
  // Tras un resize, el browser dispara un `click` sintético sobre el
  // elemento bajo el cursor al soltar el mouseup. Si ese elemento es el
  // slot vacío de la columna, `handleColumnClick` abre "Nueva cita"
  // fantasma (bug Alex 2026-05-21). Este flag se levanta en el mouseup
  // del resize y se baja en el siguiente microtask — el click sintético
  // (que llega en el mismo tick justo después) lo lee y aborta.
  const justResizedRef = useRef(false);

  const dateStr = format(date, 'yyyy-MM-dd');
  const isBlocked = blockedDates.includes(dateStr);
  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

  // Ventana temporal DINÁMICA del día (fuente única _agenda-window):
  // derivada del horario de tienda + citas reales de ESTE día, nunca
  // recorta una hora abierta ni un evento. startMin/endMin/totalHeight/
  // hourLabels sustituyen a los antiguos GRID_START/END/TOTAL_HEIGHT
  // hardcodeados. Se recalcula sólo si cambian fecha/horario/eventos.
  const { startMin, endMin, totalHeight, hourLabels } = useMemo(
    () =>
      computeAgendaWindow({
        dates: [dateStr],
        hours,
        events: events
          .filter((e) => e.date === dateStr)
          .map((e) => ({ date: e.date, time: e.time, duration: e.duration })),
      }),
    [dateStr, hours, events],
  );

  // Horario de tienda del día para el sombreado fuera-de-horario. Usa la
  // fuente canónica `hoursForDate` (EN/ES + "Cerrado"), no un parser ad-hoc.
  const dayHours = hoursForDate(dateStr, hours);
  const businessHours = dayHours
    ? { open: toMinutes(dayHours.start), close: toMinutes(dayHours.end) }
    : null;

  // Inicia un resize por drag de bordes (U1). Captura la posición inicial
  // del ratón y los minutos start/end del bloque, engancha listeners
  // globales (mousemove/mouseup) y los limpia al soltar. En cada frame
  // recalcula start/end snapped a SNAP_MIN, respetando el mínimo de
  // duración y la "espina" opuesta (no permitir cruzar el otro borde).
  // Al soltar, si hubo cambio real, delega en el padre vía
  // `onEventResize` u `onBlockResize`.
  const startResize = (
    e: React.MouseEvent,
    target:
      | { kind: 'event'; id: string; startMin: number; endMin: number }
      | { kind: 'block'; block: CalendarBlock; startMin: number; endMin: number },
    edge: 'top' | 'bottom',
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const initialY = e.clientY;
    const initialStart = target.startMin;
    const initialEnd = target.endMin;
    const id = target.kind === 'event' ? target.id : target.block.id;

    const initialState: ResizeState = {
      kind: target.kind,
      id,
      edge,
      startMin: initialStart,
      endMin: initialEnd,
    };
    setResizing(initialState);
    resizingRef.current = initialState;

    const onMove = (ev: MouseEvent) => {
      const deltaPx = ev.clientY - initialY;
      const deltaMinRaw = deltaPx / PX_PER_MIN;
      // Snap del DELTA, no del valor final — así un drag mínimo (1-2 px)
      // no salta al múltiplo más cercano del valor original, sólo cuando
      // realmente cruzas un step de SNAP_MIN.
      const deltaMin = Math.round(deltaMinRaw / SNAP_MIN) * SNAP_MIN;
      let nextStart = initialStart;
      let nextEnd = initialEnd;
      if (edge === 'top') {
        nextStart = initialStart + deltaMin;
        // Clamp dentro de la ventana visible y por debajo del end −min.
        nextStart = Math.max(startMin, nextStart);
        nextStart = Math.min(nextStart, initialEnd - RESIZE_MIN_MIN);
      } else {
        nextEnd = initialEnd + deltaMin;
        nextEnd = Math.min(endMin, nextEnd);
        nextEnd = Math.max(nextEnd, initialStart + RESIZE_MIN_MIN);
      }
      const next: ResizeState = {
        kind: target.kind,
        id,
        edge,
        startMin: nextStart,
        endMin: nextEnd,
      };
      resizingRef.current = next;
      setResizing(next);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Marcar ANTES de limpiar state para que el `click` sintético que
      // el browser dispara justo después del mouseup encuentre el flag
      // levantado en `handleColumnClick` y aborte. queueMicrotask lo baja
      // tras el click — más fiable que setTimeout(0) en Safari.
      justResizedRef.current = true;
      queueMicrotask(() => {
        justResizedRef.current = false;
      });
      const final = resizingRef.current;
      resizingRef.current = null;
      setResizing(null);
      if (!final) return;
      // No-op si el barbero soltó sin cruzar ni un step (delta=0).
      if (final.startMin === initialStart && final.endMin === initialEnd) return;
      if (target.kind === 'event') {
        onEventResize(target.id, {
          time: minutesToHHMM(final.startMin),
          duration: final.endMin - final.startMin,
        });
      } else {
        onBlockResize(target.block, {
          startTime: minutesToHHMM(final.startMin),
          endTime: minutesToHHMM(final.endMin),
        });
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Soltar una cita o un descanso/ausencia en una columna. Para citas
  // calcula (date,time,barberId) destino y llama `onEventMove`. Para
  // bloques llama `onBlockMove` (parcial: cambia rango+date+barberId;
  // día-libre completo: solo cambia date+barberId, rango queda null).
  // Update optimista + PATCH + revalida los hace el padre.
  const handleColumnDrop = (
    e: React.DragEvent<HTMLDivElement>,
    barberId: string | null,
  ) => {
    e.preventDefault();
    const drag = dragRef.current;
    // Fallback: si el ref se perdió entre frames (Safari/FF nulan refs
    // custom en algunos drags), recuperamos kind+id del dataTransfer que
    // SIEMPRE seteamos en onDragStart con prefijo `event:` o `block:`.
    // Sin offset → asumimos agarre por el borde superior (0px), suficiente
    // con el snap de 5min.
    const raw = e.dataTransfer.getData('text/plain') || '';
    const grabOffsetPx = drag?.grabOffsetPx ?? 0;
    dragRef.current = null;
    setDraggingId(null);

    // Resolución del kind/id: prioridad al ref (lleva el block completo
    // sin volver a buscarlo en `blocks`); fallback al dataTransfer parseado.
    let kind: 'event' | 'block' | null = drag?.kind ?? null;
    let eventId: string | null = null;
    let block: CalendarBlock | null = null;
    if (drag?.kind === 'event') {
      eventId = drag.id;
    } else if (drag?.kind === 'block') {
      block = drag.block;
    } else if (raw.startsWith('block:')) {
      kind = 'block';
      const id = raw.slice('block:'.length);
      block = blocks.find((b) => b.id === id) ?? null;
    } else if (raw.startsWith('event:')) {
      kind = 'event';
      eventId = raw.slice('event:'.length);
    } else if (raw) {
      // Compat: payloads viejos sin prefijo se tratan como cita (R1/R3 original).
      kind = 'event';
      eventId = raw;
    }
    if (!kind) return;

    // Día-libre completo: ignoramos la posición vertical — el bloque cubre
    // toda la columna, no tiene "hora de inicio" que ajustar al cursor.
    // Solo cambian date y barberId (en este DayGrid date es la del día
    // visible — drag entre columnas dentro del mismo día). Bloquea drop
    // sobre la columna "Sin asignar".
    if (kind === 'block' && block) {
      if (!barberId) {
        // No-op silencioso visualmente; el padre puede sacar un toast si
        // quiere — por ahora cancelamos sin error (consistente con el
        // patrón de cita sobre "Sin asignar", que sí permite el reset a
        // null; bloques NO pueden quedar sin barbero por shape del schema).
        return;
      }
      const fullDay = block.startTime === null && block.endTime === null;
      if (fullDay) {
        onBlockMove(block, {
          date: dateStr,
          startTime: null,
          endTime: null,
          barberId,
        });
        return;
      }
      // Bloque parcial: respetar la duración original, mover el INICIO al
      // punto donde el barbero soltó (menos el offset de agarre). Clamp
      // dentro de la ventana visible para que el end no se salga.
      const rect = e.currentTarget.getBoundingClientRect();
      const topPx = e.clientY - rect.top - grabOffsetPx;
      const startMinutes = Math.round(topPx / PX_PER_MIN) + startMin;
      const snapped = Math.round(startMinutes / SNAP_MIN) * SNAP_MIN;
      const durationMin = toMinutes(block.endTime!) - toMinutes(block.startTime!);
      const clampedStart = Math.max(
        startMin,
        Math.min(endMin - durationMin, snapped),
      );
      const newStart = minutesToHHMM(clampedStart);
      const newEnd = minutesToHHMM(clampedStart + durationMin);
      onBlockMove(block, {
        date: dateStr,
        startTime: newStart,
        endTime: newEnd,
        barberId,
      });
      return;
    }

    if (kind === 'event' && eventId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const topPx = e.clientY - rect.top - grabOffsetPx;
      const startMinutes = Math.round(topPx / PX_PER_MIN) + startMin;
      const snapped = Math.round(startMinutes / SNAP_MIN) * SNAP_MIN;
      const clamped = Math.max(startMin, Math.min(endMin - SNAP_MIN, snapped));
      const h = Math.floor(clamped / 60);
      const m = clamped % 60;
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      onEventMove(eventId, { date: dateStr, time, barberId });
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeMin(getCurrentTimeMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll inicial (patrón Google Calendar / Cal.com / FullCalendar
  // `scrollTime`): si es HOY y "ahora" cae dentro de la ventana → llevar a
  // ~100px sobre "ahora"; si no → llevar a la apertura de la tienda (o al
  // inicio de la ventana). Re-corre al cambiar de día/ventana (como
  // `scrollTimeReset`). El scroll vive en este contenedor interno — la
  // PÁGINA nunca scrollea (viewport-lock intacto).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nowInWindow =
      isToday && currentTimeMin >= startMin && currentTimeMin <= endMin;
    const targetMin = nowInWindow
      ? currentTimeMin
      : businessHours?.open ?? startMin;
    el.scrollTop = Math.max(0, (targetMin - startMin) * PX_PER_MIN - 100);
  // Sólo en cambio de día/ventana, no en cada tick del reloj (eso lo
  // gestiona el efecto "follow the clock" de abajo).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, startMin, endMin]);

  // Follow the clock. Every minute (when currentTimeMin ticks), if "ahora"
  // is still inside the visible area we slide the view so it stays around
  // 1/3 from the top — that way the day advances with the clock without
  // any manual scrolling. If the barber has scrolled away to look at a
  // different hour, we leave their position alone until they come back.
  useEffect(() => {
    const el = scrollRef.current;
    const isTodayLive = dateStr === format(new Date(), 'yyyy-MM-dd');
    if (!el || !isTodayLive) return;
    if (currentTimeMin < startMin || currentTimeMin > endMin) return;

    const nowPx = (currentTimeMin - startMin) * PX_PER_MIN;
    const viewportTop = el.scrollTop;
    const viewportBottom = viewportTop + el.clientHeight;
    const nowIsVisible = nowPx >= viewportTop && nowPx <= viewportBottom;
    if (!nowIsVisible) return;

    const target = Math.max(0, nowPx - el.clientHeight / 3);
    el.scrollTo({ top: target, behavior: 'smooth' });
  }, [currentTimeMin, dateStr, startMin, endMin]);

  // Current time indicator position (dentro de la ventana dinámica).
  const currentTimePx =
    isToday && currentTimeMin >= startMin && currentTimeMin <= endMin
      ? (currentTimeMin - startMin) * PX_PER_MIN
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
    // Click sintético que el browser dispara tras soltar un resize: si
    // el cursor cayó sobre un slot vacío, llegaba aquí y abría "Nueva
    // cita" fantasma. El flag se levanta en el mouseup del resize y se
    // baja en el siguiente microtask (ver `startResize` / `onUp`).
    if (justResizedRef.current) return;
    if ((e.target as HTMLElement).closest('[data-event]')) return;
    // Bloques (descansos/ausencias) ahora son draggable wrappers — el clic
    // sobre su área (fuera del label inner button) llegaría aquí y abriría
    // "Nueva cita" sobre el descanso. Lo cortamos en seco igual que con citas.
    if ((e.target as HTMLElement).closest('[data-block]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const clickedMinutes = Math.floor(y / PX_PER_MIN) + startMin;
    // Snap a SNAP_MIN (R1/R3: ajustar minutos libremente, no solo medias horas).
    const rounded = Math.round(clickedMinutes / SNAP_MIN) * SNAP_MIN;
    const clamped = Math.max(startMin, Math.min(endMin - SNAP_MIN, rounded));
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
        <div className="flex" style={{ minWidth: `${56 + columns.length * 180}px` }}>
          {/* Time gutter (sticky left) — angosto w-14 (56px), label-caps
              tracking, right-aligned. Patrón Stitch: el gutter no compite
              por atención, comunica la hora con la mínima tinta posible. */}
          <div
            className="w-14 shrink-0 bg-surface border-r border-line sticky left-0 z-30"
            style={{ height: totalHeight + COL_HEADER_H }}
          >
            {/* header spacer — TRANSPARENTE + sin borde inferior. Antes
                era `bg-surface border-b border-line`, lo que tapaba los
                números de hora (especialmente el "10": empezaba debajo del
                spacer y se cortaba). Quitando el fondo y el borde, los
                hour labels pasan visibles por detrás del header de barberos
                cuando se scrollea verticalmente — feedback Alex 2026-05-20.
                pointer-events-none: es decorativo, no debe interferir con
                clicks sobre los headers de columna que viven encima. */}
            <div className="h-[var(--agenda-col-header-h)] sticky top-0 z-50 pointer-events-none" />
            <div className="relative" style={{ height: totalHeight }}>
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
                  className="absolute right-2 text-ink-2 select-none tabular-nums font-semibold"
                  style={{ top: top - 7, fontSize: '0.6875rem', letterSpacing: '0.04em' }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {columns.map(col => {
            const colEvents = getEventsForColumn(col.key);
            // Layout de carriles para solape: citas concurrentes a 1/N
            // anchura. Algoritmo en _event-layout.ts (puro, testeable).
            const layout = computeOverlapLayout(
              colEvents.map((e) => ({
                id: e.id,
                startMin: toMinutes(e.time),
                durationMin: e.duration,
              })),
            );
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
                  const hoursLabel = col.barber
                    ? barberDayHoursLabel(dateStr, hours, isBlocked)
                    : null;
                  const headerInner = (
                    <>
                      {col.barber?.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={col.barber.photoUrl}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover border border-line shrink-0"
                        />
                      ) : (
                        <span
                          className="h-10 w-10 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                          style={{ backgroundColor: colColor }}
                          aria-hidden="true"
                        >
                          {col.barber ? initials(col.barber.name) : '∅'}
                        </span>
                      )}
                      <span className="flex flex-col min-w-0 flex-1 text-left">
                        {/* Nombre — Stitch usa headline-sm (Hanken Grotesk
                            semibold 18px); aquí Inter semibold 14px uppercase
                            mantiene la jerarquía y respeta nuestro stack. */}
                        <span className="text-[0.875rem] font-semibold uppercase text-ink truncate leading-tight">
                          {col.label}
                        </span>
                        {hoursLabel && (
                          <span
                            className="text-ink-2 truncate leading-tight tabular-nums uppercase mt-0.5"
                            style={{ fontSize: '0.6875rem', letterSpacing: '0.06em' }}
                          >
                            {hoursLabel}
                          </span>
                        )}
                      </span>
                      {col.barber && (
                        <ChevronDown
                          className="h-5 w-5 text-ink-2 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  );
                  // Cabecera LIMPIA: bg-surface sólido (matches Stitch), sin
                  // gradients ni tints. La identidad del barbero la lleva la
                  // foto + nombre, no un tint de fondo (que ensucia el lienzo).
                  const headerClass =
                    'h-[var(--agenda-col-header-h)] w-full flex flex-row items-center gap-3 px-3 border-b border-line shrink-0 sticky top-0 z-40 bg-surface hover:bg-overlay/40 transition-colors';
                  return col.barber ? (
                    <button
                      type="button"
                      onClick={() => onBarberClick(col.barber!)}
                      aria-label={`Acciones de ${col.barber.name}${hoursLabel ? `, ${hoursLabel}` : ''}`}
                      className={`${headerClass} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand`}
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
                  style={{ height: totalHeight }}
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
                  {/* Fuera de horario — antes de abrir. Veil cálido + 1px
                      line-strong al filo (donde arranca el día activo) para
                      que el cambio de zona se lea sin diagonales. */}
                  {businessHours && businessHours.open > startMin && (
                    <div
                      className="absolute left-0 right-0 top-0 offhours-overlay pointer-events-none z-10"
                      style={{
                        height: (businessHours.open - startMin) * PX_PER_MIN,
                        borderBottom: '1px solid var(--color-line-strong)',
                      }}
                    />
                  )}

                  {/* Fuera de horario — tras cerrar. Filo arriba (cierre). */}
                  {businessHours && businessHours.close < endMin && (
                    <div
                      className="absolute left-0 right-0 offhours-overlay pointer-events-none z-10"
                      style={{
                        top: (businessHours.close - startMin) * PX_PER_MIN,
                        height: (endMin - businessHours.close) * PX_PER_MIN,
                        borderTop: '1px solid var(--color-line-strong)',
                      }}
                    />
                  )}

                  {/* Blocked overlay — día entero bloqueado a nivel TIENDA
                      (clients.blockedDates). Toda la columna queda cerrada. */}
                  {isBlocked && (
                    <div className="absolute inset-0 z-20 pointer-events-none blocked-overlay" />
                  )}

                  {/* Descansos y ausencias del BARBERO de esta columna en
                      este día. `col.barber?.id` puede ser null en la
                      columna "Sin asignar" — ahí no aplica. El predicado
                      de disponibilidad server-side ya respeta estos blocks
                      al validar nuevas citas; aquí solo lo pintamos. */}
                  {col.barber && blocks
                    .filter((b) => b.date === dateStr && b.barberId === col.barber!.id)
                    .map((b) => {
                      const fullDay = !b.startTime && !b.endTime;
                      // Si este bloque está siendo redimensionado, override
                      // start/end con el estado en vivo. Sólo aplica a
                      // bloqueos parciales — los de día completo no se resizean.
                      const liveBlock =
                        resizing && resizing.kind === 'block' && resizing.id === b.id
                          ? resizing
                          : null;
                      const baseStartMin = b.startTime ? toMinutes(b.startTime) : startMin;
                      const baseEndMin = b.endTime ? toMinutes(b.endTime) : endMin;
                      const blockStartMin = liveBlock ? liveBlock.startMin : baseStartMin;
                      const blockEndMin = liveBlock ? liveBlock.endMin : baseEndMin;
                      const top = Math.max(0, (blockStartMin - startMin) * PX_PER_MIN);
                      const height = Math.max(8, (blockEndMin - blockStartMin) * PX_PER_MIN);
                      const label =
                        b.kind === 'absence' ? (fullDay ? 'Día libre' : 'Ausencia') : 'Descanso';
                      // Resize sólo para franjas parciales (start+end no
                      // null). Día completo (start/end null) no tiene rango
                      // horario que arrastrar — el barbero edita el motivo
                      // o la borra y recrea.
                      const canResize = pointerFine && !fullDay && b.startTime !== null && b.endTime !== null;
                      // Drag&drop: descansos parciales se mueven libremente.
                      // Día-libre completo también — solo cambia columna
                      // (barbero), no posición vertical. Mismo gate desktop.
                      const isBlockDraggable = pointerFine;
                      const isBlockDragging = draggingId === b.id;
                      return (
                        <div
                          key={b.id}
                          data-block="true"
                          draggable={isBlockDraggable}
                          onDragStart={(e) => {
                            if (!isBlockDraggable) return;
                            const r = e.currentTarget.getBoundingClientRect();
                            dragRef.current = {
                              kind: 'block',
                              block: b,
                              grabOffsetPx: e.clientY - r.top,
                              fullDay,
                            };
                            e.dataTransfer.effectAllowed = 'move';
                            // Prefijo `block:` para que el handler de drop
                            // distinga de citas — sin esto un block se movería
                            // por el flujo de eventos (PATCH /bookings 404).
                            e.dataTransfer.setData('text/plain', `block:${b.id}`);
                            setDraggingId(b.id);
                          }}
                          onDragEnd={() => {
                            dragRef.current = null;
                            setDraggingId(null);
                          }}
                          className={`absolute left-0 right-0 z-20 blocked-overlay ${
                            isBlockDraggable ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${isBlockDragging ? 'opacity-40' : ''} ${
                            draggingId && !isBlockDragging ? 'pointer-events-none' : ''
                          }`}
                          style={{ top, height }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              // Evita que el clic burbujee al slot vacío del
                              // fondo (abriría "Nueva cita"). Antes el overlay
                              // era pointer-events-none → no se podía modificar
                              // un descanso ya creado.
                              e.stopPropagation();
                              onBlockClick(b);
                            }}
                            className="absolute inset-0 flex items-start justify-center hover:opacity-80 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                            aria-label={`${label}${b.note ? ` — ${b.note}` : ''} (clic para gestionar)`}
                            title={`${label}${b.note ? ` — ${b.note}` : ''}`}
                          >
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-2 backdrop-blur-sm">
                              {label}
                            </span>
                          </button>
                          {canResize && (
                            <>
                              <div
                                role="presentation"
                                onMouseDown={(e) =>
                                  startResize(
                                    e,
                                    { kind: 'block', block: b, startMin: baseStartMin, endMin: baseEndMin },
                                    'top',
                                  )
                                }
                                className="absolute left-0 right-0 top-0 z-10 cursor-ns-resize"
                                style={{ height: RESIZE_HANDLE_PX }}
                                aria-hidden="true"
                              />
                              <div
                                role="presentation"
                                onMouseDown={(e) =>
                                  startResize(
                                    e,
                                    { kind: 'block', block: b, startMin: baseStartMin, endMin: baseEndMin },
                                    'bottom',
                                  )
                                }
                                className="absolute left-0 right-0 bottom-0 z-10 cursor-ns-resize"
                                style={{ height: RESIZE_HANDLE_PX }}
                                aria-hidden="true"
                              />
                            </>
                          )}
                        </div>
                      );
                    })}

                  {/* Hour lines */}
                  {hourLabels.map(({ top }, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-line"
                      style={{ top }}
                    />
                  ))}

                  {/* Half-hour line — muy sutil, sólo una capa. Las
                      quarter-hour quitadas: el snap 5min ya cumple la
                      precisión; visualmente eran ruido. */}
                  {hourLabels.slice(0, -1).map(({ top }, i) => (
                    <div
                      key={`half-${i}`}
                      className="absolute left-0 right-0 border-t border-line"
                      style={{ top: top + 30 * PX_PER_MIN, opacity: 0.22 }}
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

                  {/* Events — fill saturado del ESTADO (sin borde-izq 4px,
                      banned). Layout con carriles para solape lateral
                      (computeOverlapLayout). Rounded-md las 4 esquinas. */}
                  {colEvents.map(event => {
                    const baseStartMin = toMinutes(event.time);
                    const baseEndMin = baseStartMin + event.duration;
                    // Override en vivo durante un resize de ESTA cita. Mientras
                    // el cursor está agarrado al borde, el bloque pinta con
                    // start/end del estado local — el commit al servidor llega
                    // al soltar (onMouseUp en startResize).
                    const liveResize =
                      resizing && resizing.kind === 'event' && resizing.id === event.id
                        ? resizing
                        : null;
                    const evStartMin = liveResize ? liveResize.startMin : baseStartMin;
                    const evEndMin = liveResize ? liveResize.endMin : baseEndMin;
                    const durationMin = evEndMin - evStartMin;
                    const top = (evStartMin - startMin) * PX_PER_MIN;
                    const height = Math.max(durationMin * PX_PER_MIN, 40);
                    // Umbral de densidad: con ≥56px caben hora+cliente+servicio.
                    const showService = height >= 56;
                    const isBooksy = event.source === 'booksy';
                    const isCancelled = event.status === 'cancelled';
                    const { style: blockStyle, treatment } = appointmentBlockStyle(
                      col.barber?.displayOrder ?? null,
                      event.status,
                    );
                    const badge = statusBadge(event.status);

                    const endTime = minutesToHHMM(evEndMin);
                    // Durante un resize por el borde TOP, la hora de inicio
                    // del bloque cambia en vivo — refleja el preview en el
                    // pill horario de la cabecera, no la snapshot.
                    const displayStartTime = liveResize ? minutesToHHMM(evStartMin) : event.time;

                    const isDraggable = !isBooksy && !isCancelled;
                    const isDragging = draggingId === event.id;
                    // Mismo guard que el drag&drop: las citas legacy de Booksy
                    // y las canceladas no se resizean. Sólo en desktop
                    // (pointerFine).
                    const isResizable = pointerFine && !isBooksy && !isCancelled;

                    // Layout de carril: si la cita se solapa con otras en
                    // esta columna, va a anchura 1/N. 2px de aire entre
                    // carriles (calc) — sin que parezca pegado.
                    const lay = layout.get(event.id) ?? { leftPct: 0, widthPct: 100 };
                    const insetX = 2;

                    return (
                      <div
                        key={event.id}
                        data-event="true"
                        draggable={isDraggable}
                        onDragStart={e => {
                          if (!isDraggable) return;
                          const r = e.currentTarget.getBoundingClientRect();
                          dragRef.current = {
                            kind: 'event',
                            id: event.id,
                            grabOffsetPx: e.clientY - r.top,
                          };
                          e.dataTransfer.effectAllowed = 'move';
                          // Prefijo `event:` para distinguir de bloques en
                          // el handler de drop. Compat con payloads viejos:
                          // el handler también acepta id sin prefijo.
                          e.dataTransfer.setData('text/plain', `event:${event.id}`);
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
                        className={`absolute z-20 flex flex-col rounded-md p-2 overflow-hidden shadow-sm transition-transform duration-150 hover:-translate-y-0.5 ${
                          isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } ${treatment} ${isDragging ? 'opacity-40' : ''} ${
                          draggingId && !isDragging ? 'pointer-events-none' : ''
                        }`}
                        style={{
                          top,
                          height,
                          left: `calc(${lay.leftPct}% + ${insetX}px)`,
                          width: `calc(${lay.widthPct}% - ${insetX * 2}px)`,
                          ...blockStyle,
                        }}
                        title={event.title}
                      >
                        {/* Top row: hora tabular (mono) + icono estado/lock.
                            Layout flex justify-between para que el icono no
                            robe línea al texto del cliente. */}
                        <div className="flex justify-between items-start leading-tight">
                          <span
                            className="tabular-nums font-medium opacity-90"
                            style={{ fontSize: '0.6875rem', letterSpacing: '0.01em' }}
                          >
                            {displayStartTime}<span className="opacity-70"> – {endTime}</span>
                          </span>
                          {isBooksy && !isCancelled ? (
                            <Lock
                              className="h-3 w-3 opacity-70 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <badge.icon
                              className="h-3 w-3 opacity-75 shrink-0 mt-0.5"
                              aria-label={badge.label}
                            />
                          )}
                        </div>

                        {/* Cliente — protagonista. headline-sm scale.
                            ♥ inline al lado del nombre cuando el cliente
                            solicitó EXPLÍCITAMENTE a este barbero (no
                            "cualquiera"). Antes vivía `absolute bottom-1
                            left-1.5` y se solapaba/quedaba fuera cuando el
                            bloque era estrecho por solape (2 citas a 1/N
                            de ancho). Inline siempre cabe, siempre se ve. */}
                        <p
                          className="font-semibold truncate leading-tight mt-0.5"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {event.customerName || event.customerPhone}
                          {event.barberRequested && !isBooksy && (
                            <Heart
                              className="ml-1 inline-block h-3 w-3 align-text-bottom text-danger fill-danger"
                              aria-label="Cliente solicitó este barbero"
                            >
                              <title>Cliente solicitó este barbero</title>
                            </Heart>
                          )}
                        </p>

                        {/* Servicio — secundario, opacity reducida. */}
                        {showService && (
                          <p
                            className="leading-tight truncate opacity-75 mt-0.5"
                            style={{ fontSize: '0.6875rem' }}
                          >
                            {event.service}
                          </p>
                        )}

                        {/* Badge cobrado — esquina inf-der, glyph sobre pill
                            translúcida para legibilidad sobre el fill. */}
                        {(() => {
                          const pb = paymentBadge(event.paymentMethod);
                          if (!pb) return null;
                          return (
                            <span
                              className="absolute bottom-1 right-1 inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded font-bold tabular-nums"
                              style={{
                                fontSize: '0.625rem',
                                backgroundColor: 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
                                color: 'var(--color-ink)',
                              }}
                              title={pb.label}
                              aria-label={pb.label}
                            >
                              {pb.glyph}
                            </span>
                          );
                        })()}

                        {/* Resize handles (U1) — bordes invisibles, 6px,
                            cursor ns-resize. Desktop only (pointerFine).
                            Top edge: cambia hora de inicio + duración.
                            Bottom edge: solo duración. mouseDown.preventDefault
                            evita que dispare el drag&drop nativo del bloque. */}
                        {isResizable && (
                          <>
                            <div
                              role="presentation"
                              onMouseDown={(e) =>
                                startResize(
                                  e,
                                  { kind: 'event', id: event.id, startMin: baseStartMin, endMin: baseEndMin },
                                  'top',
                                )
                              }
                              className="absolute left-0 right-0 top-0 cursor-ns-resize"
                              style={{ height: RESIZE_HANDLE_PX }}
                              aria-hidden="true"
                            />
                            <div
                              role="presentation"
                              onMouseDown={(e) =>
                                startResize(
                                  e,
                                  { kind: 'event', id: event.id, startMin: baseStartMin, endMin: baseEndMin },
                                  'bottom',
                                )
                              }
                              className="absolute left-0 right-0 bottom-0 cursor-ns-resize"
                              style={{ height: RESIZE_HANDLE_PX }}
                              aria-hidden="true"
                            />
                          </>
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
