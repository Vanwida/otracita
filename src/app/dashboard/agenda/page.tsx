export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { clients, barbers as barbersTable } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import CalendarView from './CalendarView';
import AreaTabs from '../_components/AreaTabs';

export default async function CalendarPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/login');

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email!));

  if (!client) redirect('/dashboard/setup');

  const services =
    (client.chatbotServices as Array<{ name: string; duration: number; price: number }>) || [];
  // Equipo activo: canonical `barbers` table. NUNCA leer de
  // client.booksyServices (jsonb legacy, se quedó congelado cuando se
  // introdujo la tabla). Usarlo provocaba que un barbero dado de baja (soft
  // delete → active=false) siguiera apareciendo en la agenda.
  const barberRows = await db
    .select({
      id: barbersTable.id,
      name: barbersTable.name,
      photoUrl: barbersTable.photoUrl,
      displayOrder: barbersTable.displayOrder,
    })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name));
  const barbers = barberRows;
  const blockedDates = (client.blockedDates as string[]) || [];
  const hours = (client.chatbotHours as Record<string, string>) || null;

  // CalendarView es un calendario operativo autocontenido (shell propio
  // h-full + toolbar Día/Semana/Mes + drag&drop). Se le antepone una barra
  // de pestañas fina (shrink-0) para que el contrato de IA (Calendario ·
  // Importar) sea navegable sin tocar el componente. LÓGICA INTACTA.
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <div className="shrink-0 border-b border-line bg-canvas px-[var(--space-page)] pt-[var(--space-card)]">
        <div className="flex items-baseline justify-between gap-4 pb-3">
          <h1
            className="font-semibold leading-tight text-ink"
            style={{ fontSize: 'var(--text-page-title)' }}
          >
            Agenda
          </h1>
        </div>
        <AreaTabs area="agenda" />
      </div>
      <div className="min-h-0 flex-1">
        <CalendarView
          services={services}
          barbers={barbers}
          blockedDates={blockedDates}
          hours={hours}
          stripeConnectStatus={client.stripeConnectStatus}
          promosEnabled={client.promosEnabled}
          cashRegisterEnabled={client.cashRegisterEnabled}
          sumupReaderConnected={
            !!client.sumupAccessToken && !!client.sumupMerchantCode && !!client.sumupReaderId
          }
        />
      </div>
    </div>
  );
}
