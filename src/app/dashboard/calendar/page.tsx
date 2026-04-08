export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
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
  const barbers = (client.booksyServices as Array<{ name: string }>) || [];
  const blockedDates = (client.blockedDates as string[]) || [];
  const hours = (client.chatbotHours as Record<string, string>) || null;

  return (
    <CalendarView
      services={services}
      barbers={barbers}
      blockedDates={blockedDates}
      hours={hours}
    />
  );
}
