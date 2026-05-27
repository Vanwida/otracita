'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Users, Check, X } from 'lucide-react';
import BarberAvatar from '../_components/BarberAvatar';
import type { Barber } from './types';
import { barberColorVar } from './types';

// -----------------------------------------------------------------------------
// BarberVisibilityControl — control multi-select de visibilidad de barberos
// en el header de la agenda (task #102 v2).
//
// Patrón: botón con icono Users (+ avatares apilados de los seleccionados)
// que abre un popover anclado abajo-izquierda con checkboxes de cada
// barbero del equipo. Acciones rápidas al final ("Todos" / "Ninguno").
// Devuelve los IDs seleccionados al padre vía onChange — el padre los
// serializa al URL (`?barbers=id1,id2`).
//
// Reglas:
//   · `selectedIds.length === 0`  → considera "todos" (mismo set visible).
//   · `selectedIds.length === barbers.length` → "todos" (URL limpia).
//   · `selectedIds.length === 1`  → label "Solo [Nombre]".
//   · `selectedIds.length > 1 < N`→ label "N de M".
//
// Por qué no usar DropdownMenu canónico: ese primitivo es single-select
// con `selected: string`. Multi-select pide otra shape (Set<string>) y
// otro renderer (checkbox en vez de Check al final). Aquí construimos
// el popover a mano (click-outside, ESC, focus management) — patrón
// pequeño y autocontenido. Si en el futuro aparece un segundo multi-
// select, abstraemos.
// -----------------------------------------------------------------------------

interface Props {
  /** Lista completa del equipo (activos, ordenados por displayOrder). */
  barbers: Barber[];
  /** IDs actualmente visibles. Empty array = todos (default). */
  selectedIds: string[];
  /** Se invoca con el nuevo array de IDs. El padre normaliza (empty/full
   *  = no añadir param al URL). */
  onChange: (next: string[]) => void;
}

export default function BarberVisibilityControl({
  barbers,
  selectedIds,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  // Normaliza: si selectedIds está vacío, tratamos como "todos". El padre
  // garantiza que si pasa una lista, sólo contiene ids válidos del equipo,
  // pero nos defendemos por si acaso.
  const validSelected = selectedIds.filter((id) =>
    barbers.some((b) => b.id === id),
  );
  const isAll =
    validSelected.length === 0 || validSelected.length === barbers.length;
  const selectedBarbers = isAll
    ? barbers
    : barbers.filter((b) => validSelected.includes(b.id));

  // Click-outside y ESC. Standard popover plumbing.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggleBarber(id: string) {
    // Si estamos en "todos" (selected.length === 0 o = total), el primer
    // click empieza desde "todos seleccionados" y quita el clicado — UX
    // estándar (Google Calendar, Linear).
    const baseline = isAll
      ? barbers.map((b) => b.id)
      : validSelected;
    const next = baseline.includes(id)
      ? baseline.filter((x) => x !== id)
      : [...baseline, id];
    // Si tras togglear no queda ninguno, lo tratamos como "ninguno"
    // explícito. El padre, al normalizar, decidirá si lo refleja en URL
    // como ausente (= todos) o no. Spec: "0 válidos → ignorar param y
    // mostrar todos". Aquí mandamos [] como señal.
    onChange(next);
  }

  function selectAll() {
    onChange([]);
  }
  function selectNone() {
    // Misma semántica que selectAll desde el punto de vista del usuario:
    // un estado "ninguno seleccionado" no tiene sentido (la agenda quedaría
    // vacía y confusa). Normalizamos a "todos" — coherente con la regla
    // del padre.
    onChange([]);
  }

  // Label del trigger: "Equipo" si todos; "Solo [Nombre]" si 1; "N de M"
  // si parcial. Mantiene el botón corto y predecible.
  const triggerLabel = isAll
    ? 'Equipo'
    : selectedBarbers.length === 1
      ? `Solo ${selectedBarbers[0].name}`
      : `${selectedBarbers.length} de ${barbers.length}`;

  // Avatares apilados de los seleccionados (máx 3 + "+N"). Solo cuando
  // está filtrado (en "todos" la pila sería ruido — basta el icono Users).
  const stack = !isAll ? selectedBarbers.slice(0, 3) : [];
  const overflow = !isAll && selectedBarbers.length > 3
    ? selectedBarbers.length - 3
    : 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={isAll ? 'Mostrar barberos' : `Mostrar barberos — ${triggerLabel}`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          isAll
            ? 'bg-surface border-line text-ink-2 hover:border-line-strong hover:text-ink'
            : 'bg-brand-softer border-brand/40 text-brand-strong hover:border-brand'
        }`}
        title={isAll ? 'Mostrar barberos' : triggerLabel}
      >
        {isAll ? (
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <span className="inline-flex -space-x-1.5" aria-hidden="true">
            {stack.map((b) => (
              <BarberAvatar
                key={b.id}
                url={b.photoUrl}
                name={b.name}
                className="h-5 w-5 rounded-full ring-2 ring-surface overflow-hidden flex items-center justify-center text-[9px] font-bold text-white"
                fallbackClassName="text-[9px] font-bold text-white"
              />
            ))}
            {overflow > 0 && (
              <span className="inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-full ring-2 ring-surface bg-overlay text-[9px] font-bold text-ink-2">
                +{overflow}
              </span>
            )}
          </span>
        )}
        <span>{triggerLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-labelledby={labelId}
          className="absolute top-full left-0 mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
            <p id={labelId} className="text-xs font-semibold uppercase tracking-widest text-ink-3">
              Mostrar barberos
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="p-1 rounded-md text-ink-3 hover:text-ink hover:bg-overlay transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {barbers.map((b) => {
              const checked = isAll || validSelected.includes(b.id);
              const initials = b.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? '')
                .join('');
              return (
                <li key={b.id}>
                  <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-overlay transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBarber(b.id)}
                      className="sr-only peer"
                    />
                    <span
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        checked
                          ? 'bg-brand border-brand text-brand-ink'
                          : 'bg-surface border-line peer-focus-visible:border-brand'
                      }`}
                      aria-hidden="true"
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <BarberAvatar
                      url={b.photoUrl}
                      name={b.name}
                      className="h-6 w-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                      fallbackClassName="text-[10px] font-bold text-white"
                    />
                    <span className="flex-1 min-w-0 flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: barberColorVar(b.displayOrder) }}
                        aria-hidden="true"
                      />
                      <span className="text-sm text-ink truncate">{b.name}</span>
                      {/* Tooltip fallback para iniciales (debug visual durante
                          carga del avatar). Render-libre cuando ya hay foto. */}
                      <span className="sr-only">{initials}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-line bg-canvas/50">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                className="px-2 py-1 text-[11px] font-medium rounded-md text-ink-2 hover:text-ink hover:bg-overlay transition-colors"
              >
                Todos
              </button>
              {/* "Ninguno" se mapea a "todos" porque una agenda con cero
                  columnas no aporta valor — pero mantenemos el botón por
                  affordance (el usuario que filtra agresivo lo busca). */}
              <button
                type="button"
                onClick={selectNone}
                className="px-2 py-1 text-[11px] font-medium rounded-md text-ink-2 hover:text-ink hover:bg-overlay transition-colors"
              >
                Ninguno
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 text-[11px] font-semibold rounded-md bg-brand text-brand-ink hover:bg-brand-strong transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
