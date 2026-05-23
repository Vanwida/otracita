'use client';

import { useEffect, useState } from 'react';

// -----------------------------------------------------------------------------
// DayHourOverridesManager — editor de excepciones del horario del LOCAL por
// fecha concreta. Cubre el caso "el martes 28 abro 9-22 en vez de 10-20" o
// "cierro el 1 de mayo aunque sea lunes laborable" sin tocar el semanal
// recurrente.
//
// Auto-save: cada acción (add / edit / remove) PATCHea contra
// /api/day-hour-overrides — mismo patrón que BlockedDatesManager. No hay
// botón "Guardar"; el SlideOver actúa solo como contenedor.
//
// Layout: lista compacta de excepciones existentes arriba, formulario de
// nueva excepción abajo. Por defecto el formulario propone un rango
// "10:00-20:00" (override de extensión) — el usuario alterna a "Cerrado"
// con el switch. Esto cubre los dos usos principales del feature.
// -----------------------------------------------------------------------------

export interface DayOverride {
  id: string;
  date: string;
  hours: string;
  note: string | null;
}

interface Props {
  initial: DayOverride[];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const TIME_RANGE_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

function isValidRange(value: string): boolean {
  if (!TIME_RANGE_RE.test(value)) return false;
  const [a, b] = value.split('-');
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return ah * 60 + am < bh * 60 + bm;
}

export default function DayHourOverridesManager({ initial }: Props) {
  const [items, setItems] = useState<DayOverride[]>(
    [...initial].sort((a, b) => a.date.localeCompare(b.date)),
  );
  const [date, setDate] = useState('');
  const [mode, setMode] = useState<'range' | 'closed'>('range');
  const [range, setRange] = useState('10:00-20:00');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  // Reset error al cambiar inputs.
  useEffect(() => {
    if (error) setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, mode, range, note]);

  async function save() {
    if (!date) {
      setError('Elige una fecha.');
      return;
    }
    if (date < today) {
      setError('No puedes añadir excepciones en el pasado.');
      return;
    }
    const hoursValue = mode === 'closed' ? 'Cerrado' : range.trim();
    if (mode === 'range' && !isValidRange(hoursValue)) {
      setError('Rango inválido. Formato HH:MM-HH:MM con inicio antes de fin.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/day-hour-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          hours: hoursValue,
          note: note.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Error al guardar.');
        return;
      }
      setItems(
        Array.isArray(data.overrides)
          ? (data.overrides as DayOverride[]).slice().sort((a, b) => a.date.localeCompare(b.date))
          : items,
      );
      // Reset campos para encadenar otra excepción rápido.
      setDate('');
      setNote('');
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  async function remove(target: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/day-hour-overrides', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Error al eliminar.');
        return;
      }
      setItems(
        Array.isArray(data.overrides)
          ? (data.overrides as DayOverride[]).slice().sort((a, b) => a.date.localeCompare(b.date))
          : items.filter((i) => i.date !== target),
      );
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Lista de excepciones existentes */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-ink-3">
            Sin excepciones. Añade abajo una fecha con horario distinto al
            semanal.
          </p>
        ) : (
          items.map((it) => {
            const closed = it.hours === 'Cerrado';
            return (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">
                    <span className="font-semibold">{formatDateLabel(it.date)}</span>
                    {' · '}
                    {closed ? (
                      <span className="text-danger">Cerrado</span>
                    ) : (
                      <span className="text-ink-2">{it.hours}</span>
                    )}
                  </p>
                  {it.note && (
                    <p className="text-[11px] text-ink-3 truncate">{it.note}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(it.date)}
                  disabled={loading}
                  className="text-ink-3 hover:text-danger transition-colors"
                  aria-label={`Eliminar excepción del ${it.date}`}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Formulario nueva excepción */}
      <div className="space-y-3 rounded-lg border border-line bg-canvas p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-ink-2">Fecha</label>
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand transition-colors"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('range')}
            className={`flex-1 min-h-10 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              mode === 'range'
                ? 'border-brand bg-brand-softer text-brand-strong'
                : 'border-line bg-surface text-ink-2 hover:border-line-strong'
            }`}
          >
            Horario distinto
          </button>
          <button
            type="button"
            onClick={() => setMode('closed')}
            className={`flex-1 min-h-10 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              mode === 'closed'
                ? 'border-danger bg-danger-softer text-danger'
                : 'border-line bg-surface text-ink-2 hover:border-line-strong'
            }`}
          >
            Cerrado
          </button>
        </div>

        {mode === 'range' && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-ink-2">
              Horario para este día
            </label>
            <input
              type="text"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="09:00-22:00"
              className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand transition-colors text-center font-mono"
            />
            <p className="text-[11px] text-ink-3">
              Reemplaza al recurrente solo ese día. Formato HH:MM-HH:MM.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-ink-2">
            Nota (opcional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Festivo local, evento, formación..."
            maxLength={200}
            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={loading || !date}
          className="btn-primary btn-sm w-full"
        >
          Añadir excepción
        </button>

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
