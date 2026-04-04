'use client';

import { useState } from 'react';

interface BlockedDatesManagerProps {
  initialDates: string[];
  clientId: string;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function BlockedDatesManager({ initialDates, clientId }: BlockedDatesManagerProps) {
  const [dates, setDates] = useState<string[]>(
    [...initialDates].sort()
  );
  const [inputDate, setInputDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  async function addDate() {
    if (!inputDate) return;
    if (inputDate < today) {
      setError('No puedes bloquear fechas en el pasado.');
      return;
    }
    if (dates.includes(inputDate)) {
      setError('Esta fecha ya esta bloqueada.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', date: inputDate }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Error al guardar.');
        return;
      }

      setDates(prev => [...prev, inputDate].sort());
      setInputDate('');
    } catch {
      setError('Error de conexion. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function removeDate(dateStr: string) {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', date: dateStr }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Error al eliminar.');
        return;
      }

      setDates(prev => prev.filter(d => d !== dateStr));
    } catch {
      setError('Error de conexion. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {dates.length === 0 && (
          <p className="text-sm text-neutral-500">Sin fechas bloqueadas.</p>
        )}
        {dates.map(d => (
          <span
            key={d}
            className="bg-[#141414] border border-[#262626] rounded-lg px-3 py-1.5 text-sm text-neutral-300 flex items-center gap-2"
          >
            {formatDateLabel(d)}
            <button
              type="button"
              onClick={() => removeDate(d)}
              disabled={loading}
              className="text-neutral-500 hover:text-red-400 transition-colors"
              aria-label={`Eliminar ${d}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="date"
          value={inputDate}
          min={today}
          onChange={e => {
            setInputDate(e.target.value);
            setError('');
          }}
          className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
        />
        <button
          type="button"
          onClick={addDate}
          disabled={loading || !inputDate}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-medium rounded-lg px-4 py-2 text-sm transition-colors"
        >
          Bloquear
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
