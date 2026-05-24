'use client';

import { useEffect, useState } from 'react';

// -----------------------------------------------------------------------------
// NumberInput — input numérico que SE PUEDE DEJAR VACÍO (R11).
//
// El bug que mata: `value={Number(x)}` + `onChange={e => setX(Number(e.target.value))}`.
// Al borrar el campo, `Number('') === 0`, así que el usuario nunca puede
// vaciarlo para teclear de cero — el cursor pelea contra un 0 fantasma.
//
// Patrón correcto (el que usan POS/Booksy y todo input financiero serio):
//   · estado de edición = STRING (permite '' mientras se teclea)
//   · se emite `number | null` al padre (null = vacío, no 0)
//   · coerción/clamp SOLO en blur (no mientras teclea, para no saltar el cursor)
//
// Reutilizable: una sola fuente de verdad para todos los campos numéricos
// del dashboard. Las superficies fuera de WS-C se migran en task de
// follow-up post-merge (no tocar ahora — colisiona con WS-B/E/F).
// -----------------------------------------------------------------------------

interface NumberInputProps {
  /** Valor controlado. `null` = campo vacío (NO 0). */
  value: number | null;
  /** Se llama en cada tecla con el valor parseado (`null` si está vacío). */
  onChange: (value: number | null) => void;
  /** Mínimo permitido. Se aplica (clamp) en blur, no mientras se teclea. */
  min?: number;
  /** Máximo permitido. Se aplica (clamp) en blur, no mientras se teclea. */
  max?: number;
  /** Paso del spinner nativo. */
  step?: number | string;
  /** Decimales permitidos. 0 = solo enteros (default). */
  decimals?: number;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** aria-label cuando no hay <label> asociado por id. */
  'aria-label'?: string;
  className?: string;
}

/** Formatea un número a string sin ceros/decimales colgando innecesarios. */
function toEditString(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '';
  return String(n);
}

export default function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  decimals = 0,
  placeholder,
  disabled,
  id,
  'aria-label': ariaLabel,
  className,
}: NumberInputProps) {
  // Estado de edición local en STRING — es lo que permite el campo vacío.
  // Se sincroniza desde la prop SOLO cuando el valor externo cambia a algo
  // distinto de lo que el usuario está tecleando (evita pisar '' o '1.').
  const [draft, setDraft] = useState<string>(() => toEditString(value));

  useEffect(() => {
    const parsed = draft.trim() === '' ? null : Number(draft);
    const draftMatchesValue =
      (parsed === null && value === null) ||
      (parsed !== null && Number.isFinite(parsed) && parsed === value);
    if (!draftMatchesValue) {
      setDraft(toEditString(value));
    }
    // Solo re-sincronizamos cuando cambia el valor externo, no en cada
    // pulsación (eso lo maneja handleChange).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (raw: string) => {
    setDraft(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange(null);
      return;
    }
    const n = Number(trimmed);
    // Mientras teclea ('-', '1.', '') no forzamos nada: si aún no es un
    // número válido, no emitimos (el padre conserva el último válido).
    if (!Number.isFinite(n)) return;
    onChange(n);
  };

  const handleBlur = () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      // Vacío se respeta — NO se fuerza a 0 (esa es toda la gracia de R11).
      onChange(null);
      return;
    }
    let n = Number(trimmed);
    if (!Number.isFinite(n)) {
      onChange(null);
      setDraft('');
      return;
    }
    if (decimals === 0) n = Math.trunc(n);
    else n = Number(n.toFixed(decimals));
    if (typeof min === 'number' && n < min) n = min;
    if (typeof max === 'number' && n > max) n = max;
    onChange(n);
    setDraft(toEditString(n));
  };

  return (
    <input
      type="number"
      inputMode={decimals === 0 ? 'numeric' : 'decimal'}
      id={id}
      aria-label={ariaLabel}
      value={draft}
      min={min}
      max={max}
      step={step ?? (decimals === 0 ? 1 : 'any')}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      className={
        className ??
        'w-full px-3 py-2 text-sm rounded-lg bg-surface border border-line text-ink placeholder-ink-3 focus:outline-none focus:border-brand transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
      }
    />
  );
}
