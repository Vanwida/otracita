export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { barbers as barbersTable } from '@/db/schema';
import { requireBarberRole } from '@/lib/auth/require-barber-role';
import { hasManagerPermission } from '@/lib/manager-permissions';
import CalendarView from '@/app/dashboard/agenda/CalendarView';

// -----------------------------------------------------------------------------
// /yo/agenda — agenda OPERATIVA del barbero (modo móvil).
//
// Reusa el `CalendarView` canónico del admin con dos props nuevas:
//   · `mobileMode={true}` → header compactado, sin Day/Week/Month toggle
//     (solo Día), sin rail lateral, sin botones "Importar"/"Llenar huecos".
//   · `barberFilterId={barber.id}` → la query SWR filtra estrictamente
//     por barbero. Si el actor NO tiene `edit_others_bookings`, el endpoint
//     también lo refuerza server-side (defensa en profundidad).
//
// El catálogo de servicios y los barberos se cargan SSR igual que en el
// dashboard admin, pero `barbers` queda restringido a el suyo (1 columna)
// cuando no es manager con `edit_others_bookings`. Manager con ese permiso
// puede ver al equipo entero — la prop `barberFilterId` actúa entonces como
// "selección por defecto" sin restringir.
// -----------------------------------------------------------------------------

export default async function YoAgendaPage() {
  const hdrs = await headers();
  const fakeReq = new Request('http://internal/yo/agenda', { headers: hdrs });
  const access = await requireBarberRole(fakeReq);
  if (!access.ok) {
    if (access.status === 401) redirect('/login?next=/yo/agenda');
    if (access.status === 403) redirect('/dashboard');
    redirect('/login?next=/yo/agenda&error=invite');
  }

  const { barber, client, user } = access;

  // `chatbotServices` es jsonb sin schema (mismo shape que en admin).
  const services =
    (client.chatbotServices as Array<{
      name: string;
      duration: number;
      price: number;
      colorToken?: string | null;
    }>) || [];

  // Equipo: si tiene `edit_others_bookings` ve a todo el equipo (puede
  // mover citas entre barberos); si no, solo su columna.
  const canSeeTeam = hasManagerPermission(user, 'edit_others_bookings');
  const barberRows = canSeeTeam
    ? await db
        .select({
          id: barbersTable.id,
          name: barbersTable.name,
          photoUrl: barbersTable.photoUrl,
          displayOrder: barbersTable.displayOrder,
        })
        .from(barbersTable)
        .where(
          and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)),
        )
        .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))
    : [
        {
          id: barber.id,
          name: barber.name,
          photoUrl: barber.photoUrl,
          displayOrder: barber.displayOrder ?? 0,
        },
      ];

  const blockedDates = (client.blockedDates as string[]) || [];
  const hours = (client.chatbotHours as Record<string, string>) || null;

  return (
    <div className="flex h-[calc(100dvh-72px-env(safe-area-inset-bottom))] min-h-0 flex-col -mx-4 -mt-4">
      {/* CalendarView usa useSearchParams (task #102) — necesita Suspense
          boundary en Next 16 aunque aquí el filtro URL no aplique. */}
      <Suspense fallback={null}>
        <CalendarView
          services={services}
          barbers={barberRows}
          blockedDates={blockedDates}
          hours={hours}
          stripeConnectStatus={client.stripeConnectStatus}
          promosEnabled={client.promosEnabled}
          cashRegisterEnabled={client.cashRegisterEnabled}
          sumupReaderConnected={
            !!client.sumupAccessToken &&
            !!client.sumupMerchantCode &&
            !!client.sumupReaderId
          }
          mobileMode={true}
          barberFilterId={barber.id}
        />
      </Suspense>
    </div>
  );
}
