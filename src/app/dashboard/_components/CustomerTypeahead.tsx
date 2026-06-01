'use client';

import { User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// -----------------------------------------------------------------------------
// CustomerTypeahead — buscador de cliente conocido (Booksy "Sugiere para
// este cliente"). FUENTE ÚNICA: antes esta lógica vivía solo en PosTerminal;
// ahora la consumen el TPV (Ventas) Y "Nueva cita" en la agenda, para que
// reservar a un cliente que vuelve enlace su ficha (historial / fidelidad /
// no-show) en vez de crear un registro huérfano.
//
// Controlado: el padre posee `name` (texto libre del input) y, si se
// adjunta un cliente conocido, recibe su `phone` vía onLink. Si el padre
// reescribe el nombre a mano, onUnlink suelta el enlace (vuelve a walk-in).
//
// Búsqueda: debounce 250ms, ≥2 chars, sólo mientras NO haya enlace, contra
// /api/pos/customers (multi-tenant por sesión, máx 8 resultados). Endpoint
// reutilizado tal cual — no se crea uno paralelo.
// -----------------------------------------------------------------------------

interface Props {
  /** Texto del input (nombre del cliente). El padre lo posee. */
  name: string;
  onNameChange: (name: string) => void;
  /** Teléfono del cliente conocido adjuntado, o null si es walk-in. */
  linkedPhone: string | null;
  /** Se llama al elegir una coincidencia: el padre fija nombre + teléfono.
   *  `reputation` es opcional — quien no lo necesite (TPV) lo ignora; "Nueva
   *  cita" lo usa para avisar si el cliente está bloqueado. */
  onLink: (customer: { name: string; phone: string; reputation?: string }) => void;
  /** Se llama cuando el usuario edita el nombre teniendo un enlace activo
   *  (suelta el enlace) o pulsa la X (limpia todo). */
  onUnlink: () => void;
  placeholder?: string;
  /** aria-label del input (cada contexto describe su propósito). */
  ariaLabel?: string;
  /** Clase extra para el contenedor (posicionamiento del dropdown). */
  className?: string;
}

export default function CustomerTypeahead({
  name,
  onNameChange,
  linkedPhone,
  onLink,
  onUnlink,
  placeholder = 'Cliente (opcional)',
  ariaLabel = 'Buscar o escribir cliente',
  className = '',
}: Props) {
  const [matches, setMatches] = useState<{ name: string; phone: string; reputation?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Typeahead: ≥2 chars, debounce 250ms, sólo sin enlace activo. Búsqueda
  // best-effort — si falla, no rompe el flujo de reserva/venta. Todos los
  // setState ocurren DENTRO del timer (asíncronos), nunca síncronos en el
  // cuerpo del efecto: con <2 chars el timer simplemente vacía resultados.
  useEffect(() => {
    if (linkedPhone) return;
    const term = name.trim();
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      if (term.length < 2) {
        setMatches([]);
        return;
      }
      fetch(`/api/pos/customers?q=${encodeURIComponent(term)}`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d: { customers?: { name: string; phone: string; reputation?: string }[] }) => {
          setMatches(d.customers ?? []);
          setOpen(true);
        })
        .catch(() => {
          /* sin coincidencias no rompe nada */
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [name, linkedPhone]);

  // Cierra el dropdown al click fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <label
        className={`flex items-center gap-2 rounded-control border bg-canvas px-3 py-2 ${
          linkedPhone ? 'border-brand' : 'border-line'
        }`}
      >
        <User
          className={`h-4 w-4 shrink-0 ${
            linkedPhone ? 'text-brand' : 'text-ink-3'
          }`}
          aria-hidden="true"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => {
            onNameChange(e.target.value);
            if (linkedPhone) onUnlink();
          }}
          onFocus={() => {
            if (matches.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
        {name && (
          <button
            type="button"
            onClick={() => {
              onNameChange('');
              onUnlink();
              setOpen(false);
              setMatches([]);
            }}
            aria-label="Quitar cliente"
            className="shrink-0 rounded p-0.5 text-ink-3 transition-colors hover:text-ink-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      {open && matches.length > 0 && !linkedPhone && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-control border border-line bg-surface shadow-xl">
          {matches.map((c) => (
            <li key={c.phone}>
              <button
                type="button"
                onClick={() => {
                  onLink(c);
                  setOpen(false);
                  setMatches([]);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-overlay"
              >
                <span className="truncate text-sm font-semibold text-ink">
                  {c.name || 'Sin nombre'}
                </span>
                <span className="shrink-0 text-[0.75rem] tabular-nums text-ink-3">
                  {c.phone}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {linkedPhone && (
        <p className="mt-1 text-[0.6875rem] text-ink-3">
          Cliente conocido · enlaza con su historial
        </p>
      )}
    </div>
  );
}
