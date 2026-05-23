import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireBarberRole } from '@/lib/auth/require-barber-role';
import { hasManagerPermission } from '@/lib/manager-permissions';
import FinanzasClient from './FinanzasClient';

// -----------------------------------------------------------------------------
// /yo/finanzas — solo accesible si el barbero es Manager con `view_finances`.
// Si no, redirigimos a /yo/agenda (la URL podría haberse compartido sin
// permiso). El gating "duro" lo hace el endpoint /api/yo/finanzas con 403.
// -----------------------------------------------------------------------------

export default async function FinanzasPage() {
  const hdrs = await headers();
  const fakeReq = new Request('http://internal/yo/finanzas', { headers: hdrs });
  const access = await requireBarberRole(fakeReq);
  if (!access.ok) redirect('/yo/agenda');
  if (!hasManagerPermission(access.user, 'view_finances')) {
    redirect('/yo/agenda');
  }
  return <FinanzasClient />;
}
