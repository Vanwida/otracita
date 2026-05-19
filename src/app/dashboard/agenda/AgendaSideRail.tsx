'use client';

import { useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  format,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock3, AlertCircle, UserX, CircleDollarSign } from 'lucide-react';
import type { Barber } from './types';
import { barberColorVar } from './types';

// -----------------------------------------------------------------------------
// AgendaSideRail — el rail izquierdo firma de Booksy (screenshot 09.39.31).
// Es la nav de fecha PRIMARIA del calendario: un ex-usuario de Booksy alarga
// la mano hacia aquí, no hacia los ◀▶. Réplica estructural exacta, piel con
// nuestros tokens (cream/terracota/espresso, sin hex inline, sin Fraunces).
//
// De arriba a abajo, igual que Booksy:
//   1. Mini-mes: "Mayo 2026" + ◀▶, rejilla de días, HOY resaltado, días
//      fuera de mes atenuados. Clic en un día → navega la agenda a ese día.
//   2. "Saltar por semanas": chips +1..+6 / -1..-6 → salto rápido de semanas.
//   3. "Empleados y recursos": filtro SECUNDARIo de barbero (el primario son
//      las columnas paralelas). Select plano embebido, no el control central.
//   4. "Destacados": leyenda de estado (Pago + Estado de la cita). Color +
//      ícono + etiqueta = AAA (el color nunca es la única señal).
//
// El rail solo existe en Día/Semana (Mes ya ES un calendario). Reusa el
// color de barbero (barberColorVar) y los íconos/estados de _appointment-
// color — cero sistema de color paralelo.
// -----------------------------------------------------------------------------

interface Props {
  /** Día/ancla actual del calendario. */
  currentDay: Date;
  /** Navega el calendario a una fecha concreta (clic en el mini-mes). */
  onSelectDate: (date: Date) => void;
  /** Barberos activos del tenant — alimentan el filtro secundario. */
  barbers: Barber[];
  /** Valor del filtro de barbero ('all' = todas las columnas). */
  selectedBarber: string;
  onSelectBarber: (value: string) => void;
}

/** Lunes-a-domingo del mes visible, incluyendo días de relleno de los
 *  meses adyacentes para cuadrar la rejilla 7×N (igual que Booksy). */
function monthGridDays(anchor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEK_JUMP_OFFSETS = [1, 2, 3, 4, 5, 6];

export default function AgendaSideRail({
  currentDay,
  onSelectDate,
  barbers,
  selectedBarber,
  onSelectBarber,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => monthGridDays(currentDay), [currentDay]);

  return (
    <aside
      className="w-[15rem] shrink-0 border-r border-line bg-surface flex flex-col overflow-y-auto"
      aria-label="Navegación de fecha y filtros"
    >
      {/* 1 · Mini-mes */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.8125rem] font-semibold text-ink capitalize">
            {format(currentDay, 'MMMM yyyy', { locale: es })}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onSelectDate(subMonths(currentDay, 1))}
              className="p-1 rounded-md text-ink-2 hover:bg-overlay hover:text-ink transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSelectDate(addMonths(currentDay, 1))}
              className="p-1 rounded-md text-ink-2 hover:bg-overlay hover:text-ink transition-colors"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAY_LABELS.map((w, i) => (
            <span
              key={i}
              className="text-[0.625rem] font-semibold text-ink-3 text-center uppercase tracking-wide select-none"
              aria-hidden="true"
            >
              {w}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {days.map((d) => {
            const inMonth = isSameMonth(d, currentDay);
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, currentDay);
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => onSelectDate(d)}
                aria-label={format(d, "EEEE d 'de' MMMM", { locale: es })}
                aria-current={isSelected ? 'date' : undefined}
                className={`h-7 rounded-md text-[0.75rem] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-brand ${
                  isSelected
                    ? 'bg-brand text-brand-ink font-bold'
                    : isToday
                      ? 'bg-brand-softer text-brand-strong font-bold ring-1 ring-inset ring-brand/40'
                      : inMonth
                        ? 'text-ink hover:bg-overlay'
                        : 'text-ink-3 hover:bg-overlay'
                }`}
              >
                {format(d, 'd')}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2 · Saltar por semanas */}
      <div className="px-3 py-2 border-t border-line">
        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-2 mb-1.5">
          Saltar por semanas
        </span>
        <div className="grid grid-cols-6 gap-1 mb-1">
          {WEEK_JUMP_OFFSETS.map((n) => (
            <button
              key={`+${n}`}
              type="button"
              onClick={() => onSelectDate(addWeeks(currentDay, n))}
              className="h-6 rounded-md text-[0.6875rem] font-semibold tabular-nums bg-overlay text-ink-2 hover:bg-brand-softer hover:text-brand-strong transition-colors"
              aria-label={`Adelantar ${n} ${n === 1 ? 'semana' : 'semanas'}`}
            >
              +{n}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {WEEK_JUMP_OFFSETS.map((n) => (
            <button
              key={`-${n}`}
              type="button"
              onClick={() => onSelectDate(addWeeks(currentDay, -n))}
              className="h-6 rounded-md text-[0.6875rem] font-semibold tabular-nums bg-overlay text-ink-2 hover:bg-brand-softer hover:text-brand-strong transition-colors"
              aria-label={`Retroceder ${n} ${n === 1 ? 'semana' : 'semanas'}`}
            >
              -{n}
            </button>
          ))}
        </div>
      </div>

      {/* 3 · Empleados y recursos — filtro SECUNDARIO (las columnas
          paralelas son el control primario; esto solo aísla a uno). */}
      {barbers.length > 0 && (
        <div className="px-3 py-2 border-t border-line">
          <label
            htmlFor="agenda-barber-filter"
            className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-2 mb-1.5"
          >
            Empleados y recursos
          </label>
          <select
            id="agenda-barber-filter"
            value={selectedBarber}
            onChange={(e) => onSelectBarber(e.target.value)}
            className="w-full px-2 py-1.5 text-[0.75rem] rounded-md bg-surface border border-line text-ink hover:border-line-strong focus:outline-none focus:border-brand transition-colors"
          >
            <option value="all">Todo el equipo</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 4 · Destacados — leyenda. color + ícono + etiqueta = AAA. */}
      <div className="px-3 py-2 border-t border-line">
        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-2 mb-2">
          Destacados
        </span>

        <span className="block text-[0.625rem] font-semibold uppercase tracking-wide text-ink-3 mb-1">
          Pago
        </span>
        <ul className="space-y-1 mb-3">
          <li className="flex items-center gap-1.5 text-[0.75rem] text-ink">
            <CircleDollarSign className="h-3.5 w-3.5 text-success shrink-0" aria-hidden="true" />
            Pagado
          </li>
          <li className="flex items-center gap-1.5 text-[0.75rem] text-ink">
            <CircleDollarSign className="h-3.5 w-3.5 text-ink-3 shrink-0" aria-hidden="true" />
            Sin pagar
          </li>
        </ul>

        <span className="block text-[0.625rem] font-semibold uppercase tracking-wide text-ink-3 mb-1">
          Estado de la cita
        </span>
        <ul className="space-y-1">
          <li className="flex items-center gap-1.5 text-[0.75rem] text-ink">
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" aria-hidden="true" />
            Confirmada
          </li>
          <li className="flex items-center gap-1.5 text-[0.75rem] text-ink">
            <Clock3 className="h-3.5 w-3.5 text-warning shrink-0" aria-hidden="true" />
            Sin confirmar
          </li>
          <li className="flex items-center gap-1.5 text-[0.75rem] text-ink">
            <UserX className="h-3.5 w-3.5 text-danger shrink-0" aria-hidden="true" />
            Inasistencia
          </li>
          <li className="flex items-center gap-1.5 text-[0.75rem] text-ink">
            <AlertCircle className="h-3.5 w-3.5 text-ink-3 shrink-0" aria-hidden="true" />
            Cancelada
          </li>
        </ul>
      </div>

      {/* Leyenda de equipo (color por barbero) — debajo de Destacados, mismo
          color determinista que pinta el acento de cada cita. Solo si hay
          equipo configurado. color + nombre = AAA. */}
      {barbers.length > 0 && (
        <div className="px-3 py-2 border-t border-line">
          <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-2 mb-2">
            Equipo
          </span>
          <ul className="space-y-1">
            {barbers.map((b) => (
              <li key={b.id} className="flex items-center gap-1.5 text-[0.75rem] text-ink min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: barberColorVar(b.displayOrder) }}
                  aria-hidden="true"
                />
                <span className="truncate">{b.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
