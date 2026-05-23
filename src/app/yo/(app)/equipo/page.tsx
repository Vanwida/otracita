import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireBarberRole } from '@/lib/auth/require-barber-role';
import { hasManagerPermission } from '@/lib/manager-permissions';
import EquipoClient from './EquipoClient';

// -----------------------------------------------------------------------------
// /yo/equipo — gated por `view_commissions` o `edit_team_clients`. El gating
// duro lo hace el endpoint /api/yo/equipo con 403 si ninguno.
// -----------------------------------------------------------------------------

export default async function EquipoPage() {
  const hdrs = await headers();
  const fakeReq = new Request('http://internal/yo/equipo', { headers: hdrs });
  const access = await requireBarberRole(fakeReq);
  if (!access.ok) redirect('/yo/agenda');
  if (
    !hasManagerPermission(access.user, 'view_commissions') &&
    !hasManagerPermission(access.user, 'edit_team_clients')
  ) {
    redirect('/yo/agenda');
  }
  return <EquipoClient />;
}
