'use client';

import { Trash2 } from 'lucide-react';
import { useId } from 'react';
import NumberInput from './NumberInput';

// -----------------------------------------------------------------------------
// ServiceLinePicker — UNA línea de servicio (catálogo + duración + precio).
//
// Contexto (FIX C): "Nueva cita" elegía el servicio de un <select> del
// catálogo (autorrellena duración/precio), pero el editor "Editar servicio
// o precio" de BookingDetailPanel hacía TECLEAR el nombre a mano (principal
// Y extras). Mismo bug de hermano divergente / no-DRY que CustomerTypeahead.
//
// Fuente única de "una línea de servicio": <select> del catálogo de la
// tienda → al elegir, rellena duración+precio por defecto; los NumberInput
// siguen editables (un barbero puede cobrar distinto). Opción explícita
// "Otro / personalizado" para algo fuera de catálogo (secundaria, NO el
// texto libre por defecto). Consumido por NewBookingPanel (principal +
// extras) y por el editor de BookingDetailPanel.
// -----------------------------------------------------------------------------

/** Catálogo de servicios de la tienda (chatbotServices). */
export interface ServiceCatalogItem {
  name: string;
  duration: number;
  price: number;
}

/** Valor de una línea de servicio (= BookingServiceLine de lib/bookings). */
export interface ServiceLineValue {
  name: string;
  durationMin: number;
  priceEuros: number | null;
}

/** Valor centinela del <option> "Otro / personalizado". No es un nombre de
 *  servicio válido (no puede colisionar con el catálogo). */
const CUSTOM = '__custom__';

const FIELD =
  'w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors';

interface Props {
  /** Catálogo de la tienda. Si está vacío, sólo modo personalizado. */
  services: ServiceCatalogItem[];
  value: ServiceLineValue;
  onChange: (next: ServiceLineValue) => void;
  /** Si se pasa, se muestra el botón de eliminar (líneas extra). */
  onRemove?: () => void;
  /** Etiqueta de la línea (p. ej. "Servicio principal" / "Servicio extra 2"). */
  label: string;
  /** Marca visual de obligatorio en la etiqueta. */
  required?: boolean;
  disabled?: boolean;
  /** Sufijo para los aria-label (contexto del campo). */
  ariaSuffix?: string;
}

export default function ServiceLinePicker({
  services,
  value,
  onChange,
  onRemove,
  label,
  required = false,
  disabled = false,
  ariaSuffix,
}: Props) {
  const uid = useId();
  const suffix = ariaSuffix ?? label;

  // Una línea está "en catálogo" si su nombre coincide con un servicio.
  // Si no (nombre libre heredado o vacío con catálogo presente) → modo
  // personalizado, para no perder datos existentes (citas viejas con
  // servicio tecleado a mano siguen editándose sin romperse).
  const inCatalog = services.some((s) => s.name === value.name);
  const selectValue =
    services.length === 0 || (!inCatalog && value.name !== '')
      ? CUSTOM
      : value.name;
  const isCustom = selectValue === CUSTOM;

  const handleSelect = (picked: string) => {
    if (picked === CUSTOM) {
      // Pasa a personalizado: conserva duración/precio actuales, limpia el
      // nombre sólo si venía de un servicio de catálogo (para que el barbero
      // escriba el suyo); si ya era libre, lo respeta.
      onChange({ ...value, name: inCatalog ? '' : value.name });
      return;
    }
    const svc = services.find((s) => s.name === picked);
    onChange({
      name: picked,
      durationMin: svc ? svc.duration : value.durationMin,
      priceEuros: svc ? svc.price : value.priceEuros,
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor={`${uid}-svc`}
          className="text-[11px] font-bold uppercase tracking-widest text-ink-2"
        >
          {label}
          {required && ' *'}
        </label>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Quitar ${suffix}`}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {services.length > 0 ? (
        <select
          id={`${uid}-svc`}
          required={required}
          value={selectValue}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={disabled}
          className={FIELD}
          aria-label={`Servicio — ${suffix}`}
        >
          {/* Si la línea aún no tiene servicio elegido, un placeholder
              deshabilitado fuerza una elección consciente (principal). */}
          {selectValue === '' && (
            <option value="" disabled>
              Elige un servicio…
            </option>
          )}
          {services.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
          <option value={CUSTOM}>Otro / personalizado…</option>
        </select>
      ) : null}

      {/* Nombre libre SÓLO en modo personalizado (o sin catálogo). No es
          el camino por defecto: el barbero lo eligió explícitamente. */}
      {isCustom && (
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Nombre del servicio"
          disabled={disabled}
          required={required}
          aria-label={`Nombre del servicio personalizado — ${suffix}`}
          className={FIELD}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-ink-2 mb-1 block">
            Duración (min)
          </label>
          <NumberInput
            value={value.durationMin}
            onValueChange={(n) =>
              onChange({ ...value, durationMin: n ?? 0 })
            }
            min={0}
            max={480}
            decimals={0}
            disabled={disabled}
            className={FIELD}
            aria-label={`Duración (min) — ${suffix}`}
          />
        </div>
        <div>
          <label className="text-[11px] text-ink-2 mb-1 block">
            Precio (€)
          </label>
          <NumberInput
            value={value.priceEuros}
            onValueChange={(n) => onChange({ ...value, priceEuros: n })}
            min={0}
            decimals={2}
            step="0.01"
            placeholder="0"
            disabled={disabled}
            className={FIELD}
            aria-label={`Precio (€) — ${suffix}`}
          />
        </div>
      </div>
    </div>
  );
}
