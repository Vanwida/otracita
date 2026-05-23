'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { upload } from '@vercel/blob/client';
import { Camera, Loader2, LogOut, Scissors, TrendingUp, Heart } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import type { TodayFeed } from '../_lib/types';
import { formatEuros } from '../_lib/format';

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<TodayFeed>);

export default function TuClient() {
  const { data, mutate } = useSWR<TodayFeed>('/api/yo/today', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    if (!confirm('¿Cerrar sesión en este móvil?')) return;
    setLoggingOut(true);
    try {
      await authClient.signOut();
    } finally {
      window.location.href = '/login';
    }
  };

  const startEditName = () => {
    setNameDraft(data?.barber.name ?? '');
    setEditingName(true);
    setError(null);
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === data?.barber.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setError(null);
    try {
      const res = await fetch('/api/yo/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'No se pudo guardar.');
        return;
      }
      await mutate();
      setEditingName(false);
    } catch {
      setError('Error de conexión.');
    } finally {
      setSavingName(false);
    }
  };

  const onPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      // Upload directo a Vercel Blob desde el cliente (token efímero
      // emitido por /api/yo/profile/photo-upload-token).
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/yo/profile/photo-upload-token',
      });
      const res = await fetch('/api/yo/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: blob.url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'No se pudo guardar la foto.');
        return;
      }
      await mutate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo subir la foto.',
      );
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const barber = data?.barber;
  const sales = data?.sales;
  const tips = data?.tips;

  return (
    <div className="space-y-5">
      {/* Identidad */}
      <section className="rounded-control border border-line bg-surface p-5 text-center shadow-sm">
        <div className="relative mx-auto inline-block">
          {barber?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={barber.photoUrl}
              alt={barber.name}
              className="h-20 w-20 rounded-full border border-line object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-line bg-overlay text-2xl font-bold text-ink-2">
              {barber?.name.slice(0, 1).toUpperCase() ?? '?'}
            </div>
          )}
          <label
            htmlFor="yo-photo-upload"
            className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-line bg-surface shadow-sm hover:bg-canvas"
            aria-label="Cambiar foto"
          >
            {uploadingPhoto ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-2" />
            ) : (
              <Camera className="h-3.5 w-3.5 text-ink-2" />
            )}
            <input
              id="yo-photo-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onPhotoFile}
              disabled={uploadingPhoto}
            />
          </label>
        </div>

        <div className="mt-3">
          {editingName ? (
            <div className="mx-auto flex max-w-xs items-center gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-center text-base font-bold text-ink outline-none focus:border-brand"
                autoFocus
                disabled={savingName}
              />
              <button
                type="button"
                onClick={saveName}
                disabled={savingName}
                className="rounded-lg border border-brand bg-brand px-3 py-1.5 text-xs font-semibold text-[var(--color-cream-high)] disabled:opacity-50"
              >
                {savingName ? '…' : 'OK'}
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                disabled={savingName}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditName}
              className="text-lg font-bold text-ink hover:underline"
            >
              {barber?.name ?? 'Cargando…'}
            </button>
          )}
        </div>

        {barber?.role && !editingName && (
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
            {barber.role}
          </p>
        )}
        {data?.client.businessName && (
          <p className="mt-2 text-xs text-ink-2">
            Trabajas en {data.client.businessName}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
      </section>

      {/* Stats mes */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Resumen del mes
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Cortes hoy"
            value={(sales?.todayCount ?? 0).toString()}
            Icon={Scissors}
          />
          <StatCard
            label="Ingresos mes"
            value={formatEuros(sales?.monthCents ?? 0)}
            Icon={TrendingUp}
          />
          <StatCard
            label="Propinas hoy"
            value={formatEuros(tips?.todayCents ?? 0)}
            Icon={Heart}
          />
          <StatCard
            label="Propinas mes"
            value={formatEuros(
              (tips?.cashEntregadaCents ?? 0) +
                (tips?.cardPendienteCents ?? 0),
            )}
            Icon={Heart}
          />
        </div>
      </section>

      {/* Logout */}
      <section>
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface py-3 text-sm font-medium text-ink-2 transition-colors hover:bg-overlay/40 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon: typeof Scissors;
}) {
  return (
    <div className="rounded-control border border-line bg-surface p-4">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-softer">
        <Icon className="h-4 w-4 text-brand" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
