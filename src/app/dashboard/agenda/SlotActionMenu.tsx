'use client';

import { CalendarPlus, CalendarClock, CalendarOff } from 'lucide-react';
import Modal from '../_components/Modal';
import type { SlotAction } from './types';

// -----------------------------------------------------------------------------
// SlotActionMenu — chooser que aparece al clicar un hueco vacío de la agenda
// (feedback A7, screenshot 10.22.09). Tres acciones sobre la agenda atenuada:
//   · NUEVA CITA                  → abre NewBookingPanel prefilled
//   · AÑADIR FALTA DE DISPONIBILIDAD → intent a WS-B (panel slide-in)
//   · AÑADIR AUSENCIA             → intent a WS-B (modal)
//
// Este componente NO sabe qué hace cada acción: emite la SlotAction y
// CalendarView decide. Las dos últimas hoy van a callbacks stub — WS-B es
// dueño de esos paneles; aquí sólo se deja la costura limpia.
// -----------------------------------------------------------------------------

interface Props {
  open: boolean;
  /** Slot clicado. null cuando el menú está cerrado. */
  slot: { date: string; time: string; barberId: string | null } | null;
  /** Etiqueta humana del slot para el subtítulo (p.ej. "Lun 18 · 10:30 · Reni"). */
  contextLabel?: string;
  onClose: () => void;
  onAction: (action: SlotAction) => void;
}

const ROWS: Array<{
  type: SlotAction['type'];
  label: string;
  hint: string;
  Icon: typeof CalendarPlus;
}> = [
  {
    type: 'new_booking',
    label: 'Nueva cita',
    hint: 'Reservar a un cliente en este hueco',
    Icon: CalendarPlus,
  },
  {
    type: 'unavailability',
    label: 'Añadir falta de disponibilidad',
    hint: 'Bloquear esta franja (no se podrá reservar)',
    Icon: CalendarClock,
  },
  {
    type: 'absence',
    label: 'Añadir ausencia',
    hint: 'Marcar al barbero como ausente',
    Icon: CalendarOff,
  },
];

export default function SlotActionMenu({
  open,
  slot,
  contextLabel,
  onClose,
  onAction,
}: Props) {
  return (
    <Modal
      open={open && !!slot}
      onClose={onClose}
      ariaLabel="Acciones para este hueco"
      size="sm"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full text-center text-xs font-medium text-ink-2 hover:text-ink py-1.5 transition-colors"
        >
          Cancelar
        </button>
      }
    >
      {slot && (
        <>
          {/* Header propio (no plano): "Este hueco" + contexto. */}
          <div className="px-5 py-3 border-b border-line">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-ink-2">
              Este hueco
            </p>
            {contextLabel && (
              <p className="mt-0.5 text-sm font-medium text-ink capitalize">
                {contextLabel}
              </p>
            )}
          </div>
          <ul className="divide-y divide-line">
            {ROWS.map(({ type, label, hint, Icon }) => (
              <li key={type}>
                <button
                  type="button"
                  onClick={() =>
                    onAction({
                      type,
                      date: slot.date,
                      time: slot.time,
                      barberId: slot.barberId,
                    } as SlotAction)
                  }
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-overlay transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                >
                  <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-overlay text-brand shrink-0">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    {/* Booksy muestra estas acciones en MAYÚSCULAS en el
                        popup del hueco (09.39.31) — mismo casing aquí. */}
                    <span className="block text-sm font-semibold uppercase tracking-wide text-ink">
                      {label}
                    </span>
                    <span className="block text-xs text-ink-2 truncate">
                      {hint}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
