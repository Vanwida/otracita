'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  CalendarClock,
  CalendarOff,
  CalendarX2,
  CalendarCheck,
  Wallet,
  ChevronRight,
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
//   · Añadir ausencia         → AbsenceModal (reusado tal cual: solo usa
//                                barber.id + barber.name)
//   · Falta de disponibilidad → BlockModal (idem, reusado)
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
      <AnimatePresence>
        {barber && !absenceOpen && !blockOpen && (
          <>
            <motion.div
              key="barber-menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onClose}
              className="fixed inset-0 z-[60] bg-[var(--color-scrim)]"
              aria-hidden="true"
            />
            <motion.div
              key="barber-menu"
              role="dialog"
              aria-modal="true"
              aria-label={`Acciones para ${barber.name}`}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="fixed left-1/2 top-1/2 z-[61] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface border border-line shadow-2xl overflow-hidden"
            >
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
                        Añadir ausencia
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
                        Falta de disponibilidad
                      </span>
                      <span className="block text-xs text-ink-2 truncate">
                        Bloquear una franja de un día concreto
                      </span>
                    </span>
                  </button>
                </li>
              </ul>

              <div className="px-5 py-2.5 bg-overlay/40 border-t border-line">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full text-center text-xs font-medium text-ink-2 hover:text-ink py-1.5 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
