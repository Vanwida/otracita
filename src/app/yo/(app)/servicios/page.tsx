import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireBarberRole } from '@/lib/auth/require-barber-role';
import { hasManagerPermission } from '@/lib/manager-permissions';
import ServiciosClient from './ServiciosClient';

// -----------------------------------------------------------------------------
// /yo/servicios — gated por `edit_services`. Permite al manager editar el
// catálogo de servicios del local (precio, duración, nombre). Persiste en
// `clients.chatbotServices` vía PATCH /api/yo/services.
// -----------------------------------------------------------------------------

export default async function ServiciosPage() {
  const hdrs = await headers();
  const fakeReq = new Request('http://internal/yo/servicios', { headers: hdrs });
  const access = await requireBarberRole(fakeReq);
  if (!access.ok) redirect('/yo/agenda');
  if (!hasManagerPermission(access.user, 'edit_services')) {
    redirect('/yo/agenda');
  }
  return <ServiciosClient />;
}
