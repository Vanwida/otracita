'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Users, Calendar, TrendingUp, ChevronRight } from 'lucide-react';
import { formatEuros } from '../_lib/format';
import { barberPhotoUrl } from '@/lib/barber-photo-url';

// -----------------------------------------------------------------------------
// EquipoClient (#72) — pantalla del manager con `view_commissions` o
// `edit_team_clients`. Lista de barberos activos del local con sus ventas
// brutas del mes y citas de hoy. Si tiene `edit_team_clients` aparece un CTA
// "Ver clientes del equipo" que lleva a `/yo/equipo/clientes` (placeholder —
// la lista completa de clientes se gestiona en /dashboard/clientes, pendiente
// de portar a /yo si se demanda).
//
// UI sin scroll vertical innecesario: lista compacta, sticky header del
// periodo, cards aireadas. Tokens semánticos.
// -----------------------------------------------------------------------------

interface TeamMember {
  id: string;
  name: string;
  photoUrl: string | null;
  role: string | null;
  monthlySalesCents: number;
  todayBookings: number;
}

interface EquipoResponse {
  permissions: {
    view_commissions: boolean;
    edit_team_clients: boolean;
  };
  month: { start: string; end: string };
  team: TeamMember[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<EquipoResponse>);

export default function EquipoClient() {
  const { data, isLoading } = useSWR<EquipoResponse>(
    '/api/yo/equipo',
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  );

  return (
    <div className="space-y-5">
      {/* Headline */}
      <section className="rounded-control border border-line bg-gradient-to-br from-brand-softer to-surface p-5 text-center shadow-sm">
        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
          <Users className="h-5 w-5 text-brand" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Equipo del local
        </p>
        <p className="mt-1 text-2xl font-bold text-ink">
          {data?.team.length ?? 0} barbero{(data?.team.length ?? 0) === 1 ? '' : 's'}
        </p>
        {data?.permissions.view_commissions && (
          <p className="mt-1 text-xs text-ink-2">
            Ventas del mes ·{' '}
            {formatEuros(
              data.team.reduce((sum, b) => sum + b.monthlySalesCents, 0),
            )}
          </p>
        )}
      </section>

      {/* Lista barberos */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Quién está en el local
        </h2>
        <ul className="space-y-2">
          {isLoading && (
            <li className="py-8 text-center text-sm text-ink-3">Cargando…</li>
          )}
          {!isLoading && data?.team.length === 0 && (
            <li className="rounded-control border border-line bg-surface p-6 text-center text-sm text-ink-3">
              No hay barberos activos.
            </li>
          )}
          {data?.team.map((b) => (
            <li key={b.id}>
              <BarberRow
                barber={b}
                showCommissions={data.permissions.view_commissions}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* CTA clientes del equipo — solo si tiene edit_team_clients */}
      {data?.permissions.edit_team_clients && (
        <section>
          <Link
            href="/yo/equipo/clientes"
            className="flex items-center gap-3 rounded-control border border-line bg-surface p-4 hover:border-line-strong"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
              <Users className="h-5 w-5 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                Clientes del equipo
              </p>
              <p className="text-xs text-ink-2">
                Ver y editar la ficha de cualquier cliente del local.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-ink-3" />
          </Link>
        </section>
      )}

      <p className="px-1 text-[11px] text-ink-3">
        Las comisiones detalladas (servicios, bonos, tramos) viven en el panel
        del jefe.
      </p>
    </div>
  );
}

function BarberRow({
  barber,
  showCommissions,
}: {
  barber: TeamMember;
  showCommissions: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-line bg-surface p-3">
      {barber.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={barberPhotoUrl(barber.id) ?? ''}
          alt={barber.name}
          className="h-12 w-12 rounded-full border border-line object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-overlay text-base font-bold text-ink-2">
          {barber.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{barber.name}</p>
        {barber.role && (
          <p className="truncate text-[11px] uppercase tracking-wide text-ink-3">
            {barber.role}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {barber.todayBookings} hoy
          </span>
          {showCommissions && (
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {formatEuros(barber.monthlySalesCents)}/mes
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
