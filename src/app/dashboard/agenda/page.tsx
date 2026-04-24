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

  const services =
    (client.chatbotServices as Array<{ name: string; duration: number; price: number }>) || [];
  // Equipo activo: canonical `barbers` table. NUNCA leer de
  // client.booksyServices (jsonb legacy, se quedó congelado cuando se
  // introdujo la tabla). Usarlo provocaba que un barbero dado de baja (soft
  // delete → active=false) siguiera apareciendo en la agenda.
  const barberRows = await db
    .select({ name: barbersTable.name })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name));
  const barbers = barberRows;
  const blockedDates = (client.blockedDates as string[]) || [];
  const hours = (client.chatbotHours as Record<string, string>) || null;

  return (
    <CalendarView
      services={services}
      barbers={barbers}
      blockedDates={blockedDates}
      hours={hours}
      stripeConnectStatus={client.stripeConnectStatus}
    />
  );
}
