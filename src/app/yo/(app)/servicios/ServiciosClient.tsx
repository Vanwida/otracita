'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Scissors, Loader2, Plus, Trash2, Check } from 'lucide-react';

// -----------------------------------------------------------------------------
// ServiciosClient (#72) — editor del catálogo de servicios del local, gated
// por `edit_services`. Lista de filas con nombre + duración + precio. Save
// hace PATCH del array completo (mismo modelo que el wizard /setup).
//
// UI: lista vertical compacta, save bar fija con feedback de éxito/error.
// Sin scroll vertical fuera del listado natural de servicios; tokens
// semánticos, sin hex.
// -----------------------------------------------------------------------------

interface ServiceRow {
  name: string;
  duration: number; // minutos
  price: number; // euros (precio público — se almacena tal cual en jsonb)
}

interface Response {
  services: ServiceRow[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<Response>);

export default function ServiciosClient() {
  const { data, mutate, isLoading } = useSWR<Response>(
    '/api/yo/services',
    fetcher,
  );
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (data?.services) {
      setRows(data.services);
      setDirty(false);
    }
  }, [data?.services]);

  const update = (idx: number, patch: Partial<ServiceRow>) => {
    setRows((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    setDirty(true);
    setSuccess(false);
  };

  const add = () => {
    setRows((prev) => [
      ...prev,
      { name: 'Servicio nuevo', duration: 30, price: 15 },
    ]);
    setDirty(true);
    setSuccess(false);
  };

  const remove = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
    setSuccess(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/yo/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: rows }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'No se pudo guardar.');
        return;
      }
      setSuccess(true);
      setDirty(false);
      await mutate();
    } catch {
      setError('Error de conexión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-control border border-line bg-gradient-to-br from-brand-softer to-surface p-5 text-center shadow-sm">
        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
          <Scissors className="h-5 w-5 text-brand" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Catálogo de servicios
        </p>
        <p className="mt-1 text-2xl font-bold text-ink">
          {rows.length} servicio{rows.length === 1 ? '' : 's'}
        </p>
      </section>

      <ul className="space-y-2">
        {isLoading && (
          <li className="py-8 text-center text-sm text-ink-3">Cargando…</li>
        )}
        {!isLoading &&
          rows.map((s, idx) => (
            <li
              key={idx}
              className="rounded-control border border-line bg-surface p-3"
            >
              <input
                type="text"
                value={s.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                placeholder="Nombre del servicio"
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand"
                disabled={saving}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    Duración (min)
                  </span>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    step={5}
                    value={s.duration}
                    onChange={(e) =>
                      update(idx, { duration: Number(e.target.value) })
                    }
                    className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                    disabled={saving}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    Precio (€)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={s.price}
                    onChange={(e) => update(idx, { price: Number(e.target.value) })}
                    className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                    disabled={saving}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={saving}
                className="mt-2 inline-flex items-center gap-1 text-xs text-danger hover:underline disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar
              </button>
            </li>
          ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-2 rounded-control border border-dashed border-line bg-surface py-3 text-sm font-medium text-ink-2 hover:border-line-strong"
      >
        <Plus className="h-4 w-4" />
        Añadir servicio
      </button>

      {/* Save bar fija */}
      <div className="sticky bottom-2 z-10 flex items-center justify-end gap-2 rounded-control border border-line bg-surface p-3 shadow-sm">
        {error && (
          <p className="mr-auto text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        {!error && success && (
          <p className="mr-auto inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" />
            Guardado
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-espresso)] px-4 py-2 text-sm font-semibold text-[var(--color-cream-high)] hover:bg-[var(--color-espresso-2)] disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
