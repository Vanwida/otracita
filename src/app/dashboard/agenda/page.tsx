export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { clients, barbers as barbersTable } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import CalendarView from './CalendarView';

export default async function CalendarPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/login');

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email!));

  if (!client) redirect('/dashboard/setup');

  // `chatbotServices` es jsonb sin schema — leemos los campos que la agenda
  // necesita (incluye `colorToken` opcional para pintar el bloque #33). Los
  // consumidores validan el token con `isServiceColorToken` al pintar; si
  // falta o es inválido, cae al DEFAULT_SERVICE_COLOR (terracota).
  const services =
    (client.chatbotServices as Array<{
      name: string;
      duration: number;
      price: number;
      colorToken?: string | null;
    }>) || [];
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
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

