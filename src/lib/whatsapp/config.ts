import { db } from '@/db';
import { barbers as barbersTable, clients } from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';

export interface ServiceConfig {
  name: string;
  duration: number; // minutes
  price: number; // euros
}

/**
 * A staff member as seen by the WhatsApp bot and the availability engine.
 * `hours` / `blockedDates` can be null ⇒ inherit from the shop-wide config
 * (config.hours / config.blockedDates). `displayOrder` drives deterministic
 * "any available" tie-breaking and the agenda column order.
 */
export interface BarberConfig {
  id: string;
  name: string;
  hours: Record<string, string> | null;
  blockedDates: string[];
  displayOrder: number;
}

export interface BarbershopConfig {
  id: string;
  businessName: string;
  /** Name the bot uses when introducing itself ("Soy Raúl, el asistente de
   *  Barbería X"). Null / empty ⇒ generic "Soy el asistente". */
  botName: string | null;
  greeting: string;
  services: ServiceConfig[];
  barbers: BarberConfig[];
  hours: Record<string, string> | null;
  address: string;
  googleCalendarId?: string;
  useDbAvailability: boolean;
  whatsappPhoneNumberId: string;
  whatsappAccessToken: string;
  blockedDates: string[];
  // Scheduling standards — these are enforced by the availability engine and
  // the booking pipeline so the bot cannot accept out-of-policy reservations.
  minLeadTimeMinutes: number;
  maxBookingHorizonDays: number;
  serviceBufferMinutes: number;
  slotStepMinutes: number;
  botTone: string;
  // Billing tier + trial. El gate del bot se hace en engine.ts via
  // hasFeature(this, 'whatsappBot'). Solo Pro+ (o Solo en trial) puede
  // recibir respuestas automáticas; los demás dejan los mensajes para que
  // el barbero los conteste a mano.
  tier: 'solo' | 'pro' | 'estudio';
  trialEndsAt: Date | null;
  trialStartedAt: Date | null;
  status: string;
  plan: string;
  stripeSubscriptionId: string | null;
}

export async function getClientByPhoneNumberId(
  phoneNumberId: string
): Promise<BarbershopConfig | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.whatsappPhoneNumberId, phoneNumberId));

  if (!client) return null;

  const barberRows = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name));

  const botName = (client.botName ?? '').trim() || null;
  const selfIntro = botName
    ? `Soy ${botName}, el asistente de ${client.businessName}`
    : `Soy el asistente de ${client.businessName}`;

  return {
    id: client.id,
    businessName: client.businessName,
    botName,
    greeting:
      client.chatbotGreeting ||
      `Hola! ${selfIntro}. En que puedo ayudarte?`,
    services: ((client.chatbotServices as Array<Record<string, unknown>>) || []).map(s => ({
      name: String(s.name || ''),
      duration: Number(s.duration) || 30,
      price: Number(s.price) || 0,
    })),
    barbers: barberRows.map((b) => ({
      id: b.id,
      name: b.name,
      hours: (b.hours as Record<string, string> | null) ?? null,
      blockedDates: (b.blockedDates as string[]) ?? [],
      displayOrder: b.displayOrder,
    })),
    hours: (client.chatbotHours as Record<string, string>) || null,
    address: client.address || '',
    googleCalendarId: client.googleCalendarId || undefined,
    useDbAvailability: client.useDbAvailability ?? false,
    whatsappPhoneNumberId: phoneNumberId,
    whatsappAccessToken:
      client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '',
    blockedDates: (client.blockedDates as string[]) || [],
    minLeadTimeMinutes: client.minLeadTimeMinutes,
    maxBookingHorizonDays: client.maxBookingHorizonDays,
    serviceBufferMinutes: client.serviceBufferMinutes,
    slotStepMinutes: client.slotStepMinutes,
    botTone: client.botTone,
    tier: (client.tier as 'solo' | 'pro' | 'estudio') ?? 'solo',
    trialEndsAt: client.trialEndsAt ?? null,
    trialStartedAt: client.trialStartedAt ?? null,
    status: client.status,
    plan: client.plan,
    stripeSubscriptionId: client.stripeSubscriptionId ?? null,
  };
}
