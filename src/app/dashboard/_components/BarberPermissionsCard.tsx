'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Shield, ShieldCheck } from 'lucide-react';
import {
  MANAGER_PERMISSION_KEYS,
  MANAGER_PERMISSION_LABELS,
  MANAGER_PERMISSION_HINTS,
  type ManagerPermission,
} from '@/lib/manager-permissions';

// -----------------------------------------------------------------------------
// BarberPermissionsCard — editor de Rol + permisos granulares.
//
// Modelo:
//   · Rol = "Operador" (default) | "Manager".
//   · Si Manager → grid de 7 checkboxes (uno por clave del catálogo).
//   · Persist via PATCH /api/barbers/[barberId]/permissions.
//
// Se renderiza dentro del SlideOver editor del barbero (junto a
// BarberInviteCard). Solo se muestra si el barbero ya tiene cuenta
// Better Auth (`account != null`); si no, mostramos un hint pidiendo
// invitarlo primero — el endpoint mismo bloquea con 400.
//
// Reglas de UI (memoria feedback_ui_patterns):
//   · Sin scroll vertical interno — el grid de 7 checkboxes cabe en
//     viewport mobile (2 cols).
//   · Componentes consistentes con el resto del editor: rounded-control,
//     border-line, bg-surface, tokens semánticos (sin hex).
// -----------------------------------------------------------------------------

interface Account {
  userId: string;
  email: string;
  disabledAt: string | null;
  isManager: boolean;
  managerPermissions: string[];
}

interface Props {
  barberId: string;
  barberName: string;
  account: Account | null;
  /** Callback opcional tras un guardado exitoso (refresca SWR). */
  onChanged?: () => void;
}

export default function BarberPermissionsCard({
  barberId,
  barberName,
  account,
  onChanged,
}: Props) {
  // -- Estado del editor (mirror del server + dirty tracking) ---------------
  const initialIsManager = account?.isManager ?? false;
  const initialPerms = useMemo<Set<ManagerPermission>>(() => {
    const set = new Set<ManagerPermission>();
    if (account?.managerPermissions) {
      for (const p of account.managerPermissions) {
        if ((MANAGER_PERMISSION_KEYS as readonly string[]).includes(p)) {
          set.add(p as ManagerPermission);
        }
      }
    }
    return set;
  }, [account?.managerPermissions]);

  const [isManager, setIsManager] = useState(initialIsManager);
  const [perms, setPerms] = useState<Set<ManagerPermission>>(initialPerms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Si la cuenta cambia (otro barbero seleccionado) → resync state.
  useEffect(() => {
    setIsManager(initialIsManager);
    setPerms(initialPerms);
    setError(null);
    setSuccess(false);
  }, [initialIsManager, initialPerms]);

  const dirty =
    isManager !== initialIsManager ||
    !sameSet(perms, initialPerms);

  const toggle = (key: ManagerPermission) => {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSuccess(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/barbers/${barberId}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isManager,
          managerPermissions: isManager ? Array.from(perms) : [],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'No se pudo guardar.');
        return;
      }
      setSuccess(true);
      onChanged?.();
    } catch {
      setError('Error de conexión.');
    } finally {
      setBusy(false);
    }
  };

  // -- Render --------------------------------------------------------------
  if (!account) {
    // Sin cuenta — el admin tiene que invitar primero (lo dice
    // BarberInviteCard). Aquí mostramos un hint pasivo.
    return (
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Rol y permisos</h4>
        <div className="rounded-control border border-dashed border-line bg-surface p-3 text-xs text-ink-2">
          Cuando {barberName.split(' ')[0]} acepte la invitación podrás darle
          permisos de manager (ver finanzas, cerrar caja, editar citas de
          otros, etc.).
        </div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-ink">Rol y permisos</h4>

      {/* Toggle Operador / Manager (segmented) */}
      <div role="tablist" className="mb-3 grid grid-cols-2 gap-1 rounded-control bg-overlay/60 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={!isManager}
          onClick={() => {
            setIsManager(false);
            setSuccess(false);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-control py-2 text-xs font-medium transition-colors ${
            !isManager ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          Operador
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isManager}
          onClick={() => {
            setIsManager(true);
            setSuccess(false);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-control py-2 text-xs font-medium transition-colors ${
            isManager ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Manager
        </button>
      </div>

      <p className="mb-3 text-xs text-ink-3">
        {isManager
          ? 'Tiene acceso ampliado según los permisos marcados. Ajustes técnicos (Stripe, plan) siguen siendo solo del jefe.'
          : 'Ve solo sus citas, sus ventas y sus propinas. Cobra solo lo suyo.'}
      </p>

      {/* Grid de permisos — solo visible cuando es Manager */}
      {isManager && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MANAGER_PERMISSION_KEYS.map((key) => {
            const checked = perms.has(key);
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-2 rounded-control border p-3 transition-colors ${
                  checked
                    ? 'border-brand bg-brand-softer'
                    : 'border-line bg-surface hover:border-line-strong'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                  checked={checked}
                  onChange={() => toggle(key)}
                  disabled={busy}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {MANAGER_PERMISSION_LABELS[key]}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-3">
                    {MANAGER_PERMISSION_HINTS[key]}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* Save bar */}
      <div className="mt-4 flex items-center justify-end gap-2">
        {error && (
          <p className="mr-auto text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        {!error && success && (
          <p className="mr-auto text-xs text-success">Guardado.</p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-espresso)] px-3 py-2 text-sm font-semibold text-[var(--color-cream-high)] transition-colors hover:bg-[var(--color-espresso-2)] disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
