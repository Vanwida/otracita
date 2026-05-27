'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Modal from '../_components/Modal';
import {
  CalendarClock,
  CalendarOff,
  CalendarX2,
  CalendarCheck,
  Wallet,
  ChevronRight,
  Focus,
} from 'lucide-react';
import AbsenceModal from '../equipo/turnos/AbsenceModal';
import BlockModal from '../equipo/turnos/BlockModal';
import type { CalendarEvent, Barber } from './types';
import { barberColorVar } from './types';

// -----------------------------------------------------------------------------
// BarberActionMenu — menú contextual al clicar la cabecera de un barbero en
// la agenda (fix #2). Acciones sobre ese barbero:
//   · Editar horario          → /dashboard/equipo/turnos (editor canónico,
//                                con sus datos ya cargados — no duplicamos
//                                el loader de turnos en la agenda)
//   · Día libre / ausencia    → AbsenceModal (reusado tal cual: solo usa
//                                barber.id + barber.name)
//   · Descanso / bloquear     → BlockModal (idem, reusado)
//   · Qué ha hecho            → resumen del barbero a partir de los eventos
//                                YA cargados por CalendarView (cero fetch
//                                nuevo) + enlace al desglose completo en
//                                Equipo>Empleados (BarberBreakdown)
//
// No reinventa: reusa los modales de Turnos y los datos ya en memoria.
// -----------------------------------------------------------------------------

interface Props {
  /** Barbero de la columna clicada. null = menú cerrado. */
  barber: Barber | null;
  /** TODOS los eventos cargados en la vista actual (CalendarView). Se
   *  filtran aquí por este barbero — sin pedir nada al servidor. */
  events: CalendarEvent[];
  /** Día actualmente visible (YYYY-MM-DD) — defaultDate de los modales y
   *  base del resumen "hoy". */
  dateStr: string;
  onClose: () => void;
  /** Tras crear ausencia/bloqueo, el padre revalida la agenda. */
  onChanged: () => void;
  /** Task #102 — true cuando la agenda ya está filtrada a ESTE barbero
   *  (URL param `?barber=<id>`). Invierte el toggle: "Ver toda la agenda"
   *  en vez de "Ver solo a X". */
  isFiltered?: boolean;
  /** Task #102 — toggle del filtro. Recibe el id si se activa, o null si
   *  se quita. CalendarView empuja el cambio al URL y cierra el menú. */
  onToggleFilter?: (next: string | null) => void;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export default function BarberActionMenu({
  barber,
  events,
  dateStr,
  onClose,
  onChanged,
  isFiltered = false,
  onToggleFilter,
}: Props) {
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  // Resumen del barbero para el día visible — calculado sobre los eventos
  // que CalendarView ya tiene en memoria (no hay fetch nuevo).
  const summary = useMemo(() => {
    if (!barber) return null;
    const key = barber.name.trim().toLowerCase();
    const mine = events.filter(
      (e) =>
        e.date === dateStr &&
        e.barber?.trim().toLowerCase() === key &&
        e.status !== 'cancelled',
    );
    const done = mine.filter((e) => e.status === 'completed');
    const billed = done.reduce((acc, e) => acc + (e.price ?? 0), 0);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const upcoming = mine
      .filter((e) => e.status === 'confirmed' && toMinutes(e.time) >= nowMin)
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))[0];
    return {
      total: mine.length,
      doneCount: done.length,
      billed,
      next: upcoming
        ? `${upcoming.time} · ${upcoming.customerName || upcoming.customerPhone}`
        : null,
    };
  }, [barber, events, dateStr]);

  // Shape mínimo que AbsenceModal/BlockModal necesitan (solo id+name; el
  // resto de TurnosBarber no lo leen — verificado). Construirlo aquí evita
  // arrastrar el loader de turnos a la agenda.
  const modalBarber = barber
    ? {
        id: barber.id,
        name: barber.name,
        photoUrl: barber.photoUrl,
        hours: null,
        breaks: [],
        blocks: [],
      }
    : null;

  const color = barber ? barberColorVar(barber.displayOrder) : undefined;

  return (
    <>
      <Modal
        open={!!barber && !absenceOpen && !blockOpen}
        onClose={onClose}
        ariaLabel={barber ? `Acciones para ${barber.name}` : 'Acciones del barbero'}
        size="md"
        footer={
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-xs font-medium text-ink-2 hover:text-ink py-1.5 transition-colors"
          >
            Cerrar
          </button>
        }
      >
        {barber && (
          <>
              {/* Cabecera con identidad del barbero */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
                <span
                  className="h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                >
                  {barber.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? '')
                    .join('')}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {barber.name}
                  </p>
                  <p className="text-xs text-ink-3">Acciones del barbero</p>
                </div>
              </div>

              {/* Qué ha hecho hoy — sobre datos ya cargados */}
              {summary && (
                <div className="px-5 py-3 bg-overlay/40 border-b border-line">
                  <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-1.5">
                    Hoy
                  </p>
                  {summary.total === 0 ? (
                    <p className="text-xs text-ink-2">Sin citas este día.</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                      <span className="inline-flex items-center gap-1">
                        <CalendarCheck className="h-3 w-3 text-ink-3" />
                        {summary.doneCount}/{summary.total} hechas
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Wallet className="h-3 w-3 text-ink-3" />
                        {summary.billed.toFixed(0)} €
                      </span>
                      {summary.next && (
                        <span className="w-full text-ink-3">
                          Próxima: {summary.next}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <ul className="divide-y divide-line">
                {/* Task #102 — "Ver solo a [Nombre]" / "Ver toda la agenda".
                    Primera acción del sheet (foco/visual = decisión más
                    inmediata: filtrar antes que editar horario). El padre
                    (CalendarView) sincroniza con el URL param `?barber=<id>`
                    via push (no replace) para que back funcione. Sólo se
                    renderiza si el padre nos pasó `onToggleFilter` — en
                    /yo/agenda el barbero ya está acotado a su scope y este
                    toggle no aplicaría. */}
                {onToggleFilter && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        onToggleFilter(isFiltered ? null : barber.id);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-overlay transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                    >
                      <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-overlay text-brand shrink-0">
                        <Focus className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">
                          {isFiltered
                            ? 'Ver toda la agenda'
                            : `Ver solo a ${barber.name}`}
                        </span>
                        <span className="block text-xs text-ink-2 truncate">
                          {isFiltered
                            ? 'Quita el filtro'
                            : 'Solo su columna en la agenda'}
                        </span>
                      </span>
                    </button>
                  </li>
                )}
                <li>
                  <Link
                    href="/dashboard/equipo/turnos"
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-overlay transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                  >
                    <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-overlay text-brand shrink-0">
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        Editar horario
                      </span>
                      <span className="block text-xs text-ink-2 truncate">
                        Jornada y descansos en Equipo › Turnos
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 text-ink-3 shrink-0"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setAbsenceOpen(true)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-overlay transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                  >
                    <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-overlay text-brand shrink-0">
                      <CalendarOff className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">
                        Ausencia (día libre)
                      </span>
                      <span className="block text-xs text-ink-2 truncate">
                        Día completo (vacaciones, baja, personal)
                      </span>
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setBlockOpen(true)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-overlay transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                  >
                    <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-overlay text-brand shrink-0">
                      <CalendarX2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">
                        Descanso / bloquear hueco
                      </span>
                      <span className="block text-xs text-ink-2 truncate">
                        Tapar una franja de un día concreto
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
          </>
        )}
      </Modal>

      {/* Modales reusados de Equipo › Turnos — mismo endpoint, misma
          validación. Al guardar, revalidamos la agenda. */}
      {modalBarber && absenceOpen && (
        <AbsenceModal
          barber={modalBarber}
          defaultDate={dateStr}
          onClose={() => setAbsenceOpen(false)}
          onSaved={() => {
            setAbsenceOpen(false);
            onChanged();
            onClose();
          }}
        />
      )}
      {modalBarber && blockOpen && (
        <BlockModal
          barber={modalBarber}
          defaultDate={dateStr}
          onClose={() => setBlockOpen(false)}
          onSaved={() => {
            setBlockOpen(false);
            onChanged();
            onClose();
          }}
        />
      )}
    </>
  );
}
