export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/server';
import { hasFeature } from '@/lib/billing/tier';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Mic } from 'lucide-react';
import VoiceTest from './VoiceTest';
import UpgradeRequired from '../_components/UpgradeRequired';

interface ServiceConfig {
  name: string;
  duration: number;
  price?: number;
}

interface BooksyService {
  name?: string;
  barber?: string;
  staff?: string;
}

interface BusinessHours {
  start: string;
  end: string;
}

export default async function VoiceTestPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect('/login');
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email!));

  if (!client) {
    redirect('/dashboard/setup');
  }

  if (!hasFeature(client, 'recepcionistaIA')) {
    return (
      <UpgradeRequired
        feature="recepcionistaIA"
        title="Recepcionista IA"
        icon={Mic}
        back={{ label: 'Ajustes', href: '/dashboard/ajustes' }}
      />
    );
  }

  const services = (client.chatbotServices as ServiceConfig[]) || [];
  const booksyServices = (client.booksyServices as BooksyService[]) || [];
  const hours = (client.chatbotHours as BusinessHours) || { start: '09:00', end: '20:00' };

  // Extract unique barber names from booksyServices
  const barbers = [
    ...new Set(
      booksyServices
        .map(s => s.barber || s.staff || null)
        .filter((b): b is string => typeof b === 'string' && b.length > 0)
    ),
  ];

  return (
    <VoiceTest
      client={{
        businessName: client.businessName,
        services,
        barbers,
        hours,
      }}
    />
  );
}
