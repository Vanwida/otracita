'use client';

import { useMemo } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock, UsersRound } from 'lucide-react';
import Link from 'next/link';
import type { CalendarEvent, Barber } from './types';
import {
  appointmentBlockClasses,
  resolveBookingColorToken,
  statusCornerBadge,
} from './_appointment-color';
import { barberPhotoUrl } from '@/lib/barber-photo-url';
import { buildWeekCell } from './_lib/week-cell';

// -----------------------------------------------------------------------------
// WeekGrid — modelo MATRIZ barberos × días (paridad Booksy/Fresha).
//
// Antes la vista Semana era "7 columnas día × timeline vertical proporcional".
// El problema: con 3+ barberos y citas paralelas el bug #58 (3 iteraciones)
// nunca se resolvía bien — citas que se pisaban quedaban superpuestas o en
// carriles 1/N tan finos que no se leían. Booksy y Fresha resolvieron esto
// hace años con un modelo distinto:
//
//   · FILAS    = barberos (1 swimlane por barbero activo)
//   · COLUMNAS = los 7 días de la semana
//   · CELDA    = lista densa de citas de ESE barbero en ESE día, con bloques
//                de TAMAÑO FIJO (no proporcionales al tiempo). Cada bloque
//                muestra rango horario + servicio. Cuando no caben todas,
//                las primeras N + link "Mostrar todo (X)" que cambia a Día
//                filtrada por ese barbero.
//
// El cuerpo de la vista Día (DayGrid) sigue siendo timeline visual con scroll
// vertical — sólo cambia el modelo en Semana. La paleta saturada y los
// helpers de color/badge se reusan tal cual desde `_appointment-color`.
// -----------------------------------------------------------------------------

// Máximo de bloques visibles por celda antes de colapsar en "Mostrar todo".
// 6 es el dulce de Booksy/Fresha — más allá la celda se vuelve ilegible y la
// densidad ya no aporta. El número se queda hardcoded a propósito: no es algo
// que un barbero deba poder configurar (premature config, ver CLAUDE.md).
const MAX_VISIBLE_PER_CELL = 6;

interface Props {
  weekStart: Date;
  events: CalendarEvent[];
  /** Equipo del tenant (incluye displayOrder, photoUrl). Las filas de la
   *  matriz son estos barberos en orden. Si está vacío, mostramos empty
   *  state apuntando a Equipo. */
  barbers: Barber[];
  /** Catálogo de servicios — color del bloque por servicio (#33). */
  services: ReadonlyArray<{ name: string; colorToken?: string | null }>;
  blockedDates: string[];
  onEventClick: (event: CalendarEvent) => void;
  /** Click en cabecera de día (LUN 18) → cambia a vista Día centrada. */
  onSelectDay: (date: Date) => void;
  /** Click en "Mostrar todo (N) ›" en una celda → cambia a vista Día
   *  centrada en ese día Y filtrada por ese barbero. CalendarView posee el
   *  state (viewMode + currentDay + selectedBarber). */
  onShowAllDay: (date: Date, barber: Barber) => void;
  /** Click en una celda VACÍA → crea cita rápida en ese barbero/día. La
   *  hora se setea por defecto a 10:00 (Booksy no abre slot picker en cell;
   *  el barbero confirma hora en NewBookingPanel). */
  onCellClick: (date: string, barberId: string) => void;
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

/** Hora "HH:MM" → minutos desde medianoche, para ordenar citas dentro de una
 *  celda. No queremos depender de date-fns aquí (helper local sencillo). */
function timeToMinutes(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
}

/** Suma `mins` minutos a "HH:MM" y devuelve "HH:MM". Para imprimir el rango
 *  completo "15:00 - 15:45" en el bloque. */
function addMinutesToHHMM(time: string, mins: number): string {
  const total = timeToMinutes(time) + mins;
  // Clamp defensivo: una cita que rebase medianoche sería un dato corrupto.
  // La vista Semana no tiene por qué crashear — el bloque mostrará "23:59".
  const clamped = Math.max(0, Math.min(24 * 60 - 1, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function WeekGrid({
  weekStart,
  events,
  barbers,
  services,
  blockedDates,
  onEventClick,
  onSelectDay,
  onShowAllDay,
  onCellClick,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const today = new Date();

  // Indexamos las citas por (barberId, date) una sola vez. Para barberos sin
  // id canónico (legacy) caemos a match por NAME normalizado. Citas
  // canceladas se incluyen — el barbero quiere VER el hueco que se canceló
  // (mismo criterio que DayGrid: accountability + reproducir el hueco).
  const eventsByCell = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const nameToId = new Map<string, string>();
    for (const b of barbers) {
      nameToId.set(b.name.trim().toLowerCase(), b.id);
    }
    for (const ev of events) {
      // Resolver el barberId canónico de cada cita. Prioridad: el id que
      // ya viene en la cita; si no, lookup por nombre. Si nada matchea,
      // se ignora (no hay swimlane "Sin asignar" en Semana — la vista
      // matriz es por equipo registrado; los huérfanos se ven en Día).
      let barberId = ev.barberId ?? null;
      if (!barberId && ev.barber) {
        barberId = nameToId.get(ev.barber.trim().toLowerCase()) ?? null;
      }
      if (!barberId) continue;
      const key = `${barberId}|${ev.date}`;
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);
    }
    // Ordenar cada celda por hora ascendente (la API ya las suele devolver
    // así pero no lo garantiza; este sort es barato — N citas/celda ≪ 50).
    for (const list of map.values()) {
      list.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    }
    return map;
  }, [events, barbers]);

  // Empty state: tenant sin equipo activo. La matriz no tiene filas que
  // pintar y el CTA correcto es ir a /dashboard/equipo a añadir barberos.
  if (barbers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-canvas p-8">
        <div className="text-center max-w-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-overlay flex items-center justify-center mb-4">
            <UsersRound className="h-6 w-6 text-ink-3" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-ink mb-2">
            Sin equipo configurado
          </h2>
          <p className="text-sm text-ink-2 mb-4 leading-relaxed">
            La vista Semana es una matriz de barberos por día. Añade al menos
            un barbero para ver la agenda semanal.
          </p>
          <Link
            href="/dashboard/equipo"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand hover:bg-brand-strong text-brand-ink transition-colors"
          >
            Ir a Equipo
          </Link>
        </div>
      </div>
    );
  }

  // Layout: CSS Grid con columna sticky izquierda (barberos) + 7 columnas
  // (días). Scroll horizontal en mobile cuando hay 5+ barberos × 7 días.
  // grid-template-columns: 120px para la columna de barberos en desktop;
  // las 7 de día son fr (responsive) con min para que no se rompan a
  // anchos imposibles de leer. La cabecera de día va sticky-top; la columna
  // de barberos sticky-left → la esquina sup-izq queda fija siempre.
  return (
    <div className="flex flex-1 overflow-auto bg-canvas">
      <div
        role="grid"
        aria-label="Agenda semanal por barbero"
        className="grid w-full min-w-[840px]"
        style={{
          // 120px columna barberos + 7×(min 140px, ideal 1fr). minmax
          // garantiza legibilidad en pantallas estrechas (scroll horizontal
          // si total > viewport) y reparto equitativo en desktop.
          gridTemplateColumns: '120px repeat(7, minmax(140px, 1fr))',
        }}
      >
        {/* Esquina sup-izq: vacía. Sticky en ambos ejes para no taparse
            al scrollear ni vertical ni horizontalmente. z-30 para quedar
            por encima de cabecera (z-20) y columna barberos (z-10). */}
        <div className="sticky top-0 left-0 z-30 h-12 bg-surface border-b border-r border-line" />

        {/* Cabecera de columnas: días (LUN 18, MAR 19…). Sticky top. */}
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const dateStr = format(day, 'yyyy-MM-dd');
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-label={`Ver agenda del ${format(day, "EEEE d 'de' MMMM", { locale: es })}`}
              className={`sticky top-0 z-20 h-12 flex flex-col items-center justify-center gap-0.5 border-b border-r border-line last:border-r-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset cursor-pointer ${
                isToday ? 'bg-today-tint hover:bg-today-tint' : 'bg-surface hover:bg-overlay'
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider leading-none ${
                  isToday ? 'text-brand' : 'text-ink-2'
                }`}
              >
                {format(day, 'EEE', { locale: es })}
              </span>
              <span
                className={`text-sm font-bold leading-none tabular-nums ${
                  isToday ? 'text-brand' : 'text-ink'
                }`}
              >
                {format(day, 'd')}
              </span>
            </button>
          );
        })}

        {/* Filas: una por barbero. Cada fila = celda sticky-left (avatar+
            nombre) + 7 celdas de día. */}
        {barbers.map((barber) => (
          <BarberRow
            key={barber.id}
            barber={barber}
            days={days}
            today={today}
            blockedDates={blockedDates}
            eventsByCell={eventsByCell}
            services={services}
            onEventClick={onEventClick}
            onShowAllDay={onShowAllDay}
            onCellClick={onCellClick}
          />
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// BarberRow — una fila de la matriz: header sticky-left + 7 celdas día.
// Se aísla en su propio componente para que el `key={barber.id}` sea estable
// y React no remueva nodos al reordenar el equipo.
// -----------------------------------------------------------------------------
function BarberRow({
  barber,
  days,
  today,
  blockedDates,
  eventsByCell,
  services,
  onEventClick,
  onShowAllDay,
  onCellClick,
}: {
  barber: Barber;
  days: Date[];
  today: Date;
  blockedDates: string[];
  eventsByCell: Map<string, CalendarEvent[]>;
  services: ReadonlyArray<{ name: string; colorToken?: string | null }>;
  onEventClick: (event: CalendarEvent) => void;
  onShowAllDay: (date: Date, barber: Barber) => void;
  onCellClick: (date: string, barberId: string) => void;
}) {
  return (
    <>
      {/* Header de fila (barbero) — sticky left. Borde derecho fuerte para
          separar visualmente la columna fija del cuerpo de la matriz. */}
      <div
        role="rowheader"
        className="sticky left-0 z-10 bg-surface border-b border-r border-line flex items-center gap-2 px-2 py-2 min-h-[88px]"
      >
        {barber.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={barberPhotoUrl(barber.id) ?? ''}
            alt=""
            className="h-9 w-9 rounded-full object-cover border border-line shrink-0"
          />
        ) : (
          <span
            className="h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold text-brand-ink shrink-0 bg-brand"
            aria-hidden="true"
          >
            {initials(barber.name)}
          </span>
        )}
        <span className="text-[13px] font-semibold text-ink truncate leading-tight">
          {barber.name}
        </span>
      </div>

      {/* 7 celdas día. */}
      {days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const isToday = isSameDay(day, today);
        const isBlocked = blockedDates.includes(dateStr);
        const cellKey = `${barber.id}|${dateStr}`;
        const cellEvents = eventsByCell.get(cellKey) ?? [];
        const { visible, overflowCount } = buildWeekCell(
          cellEvents,
          MAX_VISIBLE_PER_CELL,
        );

        return (
          <WeekCell
            key={cellKey}
            dateStr={dateStr}
            day={day}
            barber={barber}
            isToday={isToday}
            isBlocked={isBlocked}
            visible={visible}
            overflowCount={overflowCount}
            services={services}
            onEventClick={onEventClick}
            onShowAllDay={onShowAllDay}
            onCellClick={onCellClick}
          />
        );
      })}
    </>
  );
}

// -----------------------------------------------------------------------------
// WeekCell — celda barbero×día. Lista bloques + link "Mostrar todo".
// -----------------------------------------------------------------------------
function WeekCell({
  dateStr,
  day,
  barber,
  isToday,
  isBlocked,
  visible,
  overflowCount,
  services,
  onEventClick,
  onShowAllDay,
  onCellClick,
}: {
  dateStr: string;
  day: Date;
  barber: Barber;
  isToday: boolean;
  isBlocked: boolean;
  visible: CalendarEvent[];
  overflowCount: number;
  services: ReadonlyArray<{ name: string; colorToken?: string | null }>;
  onEventClick: (event: CalendarEvent) => void;
  onShowAllDay: (date: Date, barber: Barber) => void;
  onCellClick: (date: string, barberId: string) => void;
}) {
  const isEmpty = visible.length === 0 && overflowCount === 0;

  return (
    <div
      role="gridcell"
      className={`relative border-b border-r border-line last:border-r-0 p-1.5 min-h-[88px] flex flex-col gap-1 ${
        isToday ? 'bg-today-tint' : 'bg-surface'
      } ${isBlocked ? 'blocked-overlay' : ''}`}
      onClick={(e) => {
        // Click sobre la celda VACÍA → crea cita rápida. Si el click cayó
        // sobre un bloque o el link "Mostrar todo", esos handlers ya
        // hicieron stopPropagation. Defensa adicional: si el target es
        // un elemento interactivo, ignoramos.
        if ((e.target as HTMLElement).closest('[data-event]')) return;
        if ((e.target as HTMLElement).closest('[data-overflow-link]')) return;
        onCellClick(dateStr, barber.id);
      }}
      style={{ cursor: isEmpty ? 'pointer' : 'default' }}
    >
      {visible.map((event) => (
        <WeekBlock
          key={event.id}
          event={event}
          services={services}
          onEventClick={onEventClick}
        />
      ))}

      {overflowCount > 0 && (
        <button
          type="button"
          data-overflow-link="true"
          onClick={(e) => {
            e.stopPropagation();
            onShowAllDay(day, barber);
          }}
          className="text-[11px] font-semibold text-brand-strong hover:text-brand transition-colors text-left mt-auto cursor-pointer focus:outline-none focus-visible:underline"
        >
          Mostrar todo ({overflowCount + visible.length}) ›
        </button>
      )}

      {/* Empty state minimalista: una línea apenas visible para que la
          celda no parezca rota. Hover pasa el cursor a pointer (creación
          rápida). Booksy hace lo mismo — celdas vacías son clickables. */}
      {isEmpty && (
        <span className="text-[11px] text-ink-3/60 select-none">—</span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// WeekBlock — un bloque de cita en la celda. Altura FIJA (no proporcional al
// tiempo). Dos líneas: rango horario + servicio. Color por servicio,
// badge de estado en esquina sup-der.
// -----------------------------------------------------------------------------
function WeekBlock({
  event,
  services,
  onEventClick,
}: {
  event: CalendarEvent;
  services: ReadonlyArray<{ name: string; colorToken?: string | null }>;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const colorToken = resolveBookingColorToken(event, services);
  const { className: blockClass, style: blockColorStyle, treatment } =
    appointmentBlockClasses(colorToken, event.status);
  const badge = statusCornerBadge(event.status);
  const isBooksy = event.source === 'booksy';
  const isCancelled = event.status === 'cancelled';
  const endTime = addMinutesToHHMM(event.time, event.duration);
  const rangeLabel = `${event.time} - ${endTime}`;

  return (
    <button
      type="button"
      data-event="true"
      onClick={(e) => {
        e.stopPropagation();
        onEventClick(event);
      }}
      title={`${rangeLabel}${event.service ? ` · ${event.service}` : ''}${
        event.customerName ? ` · ${event.customerName}` : ''
      }`}
      // Altura fija ~38px (dos líneas compactas) — no proporcional al
      // tiempo. Padding mínimo. radius pequeño. Hover atenúa.
      className={`relative flex flex-col rounded-[4px] px-1.5 py-1 text-left overflow-hidden transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ink ${blockClass} ${treatment}`}
      style={blockColorStyle}
    >
      {/* Badge estado (esq sup-der). Booksy → candado; resto → ícono según
          status. El color del fill ya comunica el SERVICIO (paleta saturada),
          el badge da el ESTADO sin pisar el texto. */}
      <span
        className="absolute top-0.5 right-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-surface/90 backdrop-blur-sm shadow-sm"
        aria-label={isBooksy && !isCancelled ? 'Cita de Booksy' : badge.label}
        title={isBooksy && !isCancelled ? 'Cita de Booksy' : badge.label}
      >
        {isBooksy && !isCancelled ? (
          <Lock className="h-2 w-2 text-ink-2" aria-hidden="true" />
        ) : (
          <badge.icon className={`h-2 w-2 ${badge.tone}`} aria-hidden="true" />
        )}
      </span>
      {/* Línea 1: rango horario completo. tabular-nums para que las cifras
          alineen en columna vertical (mejor escaneo del barbero). pr-4 deja
          espacio para el badge sin pisarse. */}
      <span className="text-[10.5px] font-bold leading-tight tabular-nums pr-4">
        {rangeLabel}
      </span>
      {/* Línea 2: nombre del servicio. NO el cliente — privacidad + densidad
          (Booksy hace lo mismo). Truncado con ellipsis si pasa el ancho. */}
      {event.service && (
        <span className="text-[10.5px] leading-tight truncate opacity-90">
          {event.service}
        </span>
      )}
    </button>
  );
}
