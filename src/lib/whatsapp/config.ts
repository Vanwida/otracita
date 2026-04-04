import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface ServiceConfig {
  name: string;
  duration: number; // minutes
  price: number; // euros
}

export interface BarbershopConfig {
  id: string;
  businessName: string;
  greeting: string;
  services: ServiceConfig[];
  barbers: Array<{ name: string }>;
  hours: Record<string, string> | null;
  address: string;
  googleCalendarId?: string;
  whatsappPhoneNumberId: string;
  whatsappAccessToken: string;
  blockedDates: string[];
}

export async function getClientByPhoneNumberId(
  phoneNumberId: string
): Promise<BarbershopConfig | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.whatsappPhoneNumberId, phoneNumberId));

  if (!client) return null;

  return {
    id: client.id,
    businessName: client.businessName,
    greeting:
      client.chatbotGreeting ||
      `Hola! Soy el asistente de ${client.businessName}. En que puedo ayudarte?`,
    services: ((client.chatbotServices as Array<Record<string, unknown>>) || []).map(s => ({
      name: String(s.name || ''),
      duration: Number(s.duration) || 30,
      price: Number(s.price) || 0,
    })),
    barbers: (client.booksyServices as Array<{ name: string }>) || [],
    hours: (client.chatbotHours as Record<string, string>) || null,
    address: client.address || '',
    googleCalendarId: client.googleCalendarId || undefined,
    whatsappPhoneNumberId: phoneNumberId,
    whatsappAccessToken:
      client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '',
    blockedDates: (client.blockedDates as string[]) || [],
  };
}
