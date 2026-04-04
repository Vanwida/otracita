import OpenAI from 'openai';
import { db } from '@/db';
import { conversations, clients, customers, bookings, analytics, waitlist } from '@/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getClientByPhoneNumberId, type BarbershopConfig, type ServiceConfig } from './config';
import { sendWhatsAppMessage, sendWhatsAppButtons, sendWhatsAppList } from './sender';
import {
  getAvailableSlots,
  createBooking,
  deleteCalendarEvent,
  getTodayDate,
  getTomorrowDate,
  formatDateSpanish,
} from '@/lib/google-calendar';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConversationStep =
  | 'idle'
  | 'greeting'
  | 'asking_name'
  | 'choosing_service'
  | 'choosing_barber'
  | 'choosing_date'
  | 'choosing_slot'
  | 'confirming'
  | 'cancelling'
  | 'cancel_confirming'
  | 'changing'
  | 'done';

type Intent = 'booking' | 'cancel' | 'change' | 'question' | 'greeting';

interface IncomingMessage {
  from: string;
  phoneNumberId: string;
  messageText: string;
  messageType: string;
  /** For interactive replies (buttons / list) */
  interactiveReplyId?: string;
}

interface ConversationRow {
  id: string;
  clientId: string;
  customerPhone: string;
  step: string;
  selectedService: string | null;
  selectedSlot: string | null;
  context: unknown;
  lastInteraction: Date;
  createdAt: Date;
}

interface ConversationContext {
  selectedDate?: string;
  serviceDuration?: number;
  servicePrice?: number;
  selectedBarber?: string;
  customerName?: string;
  cancelBookingId?: string;
  isChanging?: boolean;
  waitlistDate?: string;
  isWaitlistFlow?: boolean;
  lang?: 'es' | 'en';
}

// ---------------------------------------------------------------------------
// Bilingual support
// ---------------------------------------------------------------------------

type Lang = 'es' | 'en';

function detectLanguage(text: string): Lang {
  const lower = text.toLowerCase();
  const enWords = ['hello', 'hi', 'hey', 'book', 'appointment', 'cancel', 'change', 'haircut', 'barber', 'please', 'thanks', 'thank', 'yes', 'no', 'help', 'english', 'what', 'when', 'how', 'exit'];
  const esWords = ['hola', 'reservar', 'cita', 'cancelar', 'corte', 'barba', 'gracias', 'por favor', 'quiero', 'necesito', 'cuando', 'como'];
  const enScore = enWords.filter(w => lower.includes(w)).length;
  const esScore = esWords.filter(w => lower.includes(w)).length;
  return enScore > esScore ? 'en' : 'es';
}

const T = {
  es: {
    greeting: (name: string | null) => name ? `Hola ${name}! 👋\n\n¿En qué te puedo ayudar?` : `Hola! 👋\n\n¿En qué te puedo ayudar?`,
    btnBook: 'Reservar cita',
    btnCancel: 'Cancelar cita',
    btnInfo: 'Ver servicios',
    btnDone: 'Listo',
    askService: (name: string | null) => `Hola ${name || ''}! ¿Qué servicio te gustaría?`,
    noService: 'No he entendido qué servicio quieres. Por favor, selecciona una opción de la lista.\n\nSi quieres empezar de nuevo, escribe *salir*.',
    askBarber: '¿Con qué barbero quieres la cita?',
    noPreference: 'Sin preferencia',
    askDate: '¿Para qué día quieres la cita?',
    btnToday: 'Hoy',
    btnTomorrow: 'Mañana',
    btnOtherDay: 'Otro día',
    askSlot: (date: string) => `¿A qué hora el ${date}?`,
    btnViewSlots: 'Ver huecos',
    noSlots: (date: string) => `Lo siento, no hay huecos disponibles para el ${date}. ¿Quieres probar otro día?\n\nResponde con una fecha (ej: lunes, 7 de abril) o escribe *salir* para volver al menú.`,
    confirmBooking: (name: string, service: string, date: string, time: string, barber: string | null) =>
      `Perfecto! Confirmo tu reserva:\n\n📋 *${service}*\n📅 ${date}\n🕐 ${time}${barber && barber !== 'Sin preferencia' ? `\n💈 ${barber}` : ''}\n\n¿Confirmamos?`,
    btnConfirm: '✅ Confirmar',
    btnCancel2: '❌ Cancelar',
    bookingConfirmed: (service: string, date: string, time: string) => `✅ Reserva confirmada!\n\n📋 *${service}*\n📅 ${date}\n🕐 ${time}\n\nTe esperamos! 💈`,
    bookingCancelled: '❌ Reserva cancelada. Si necesitas algo más, escríbeme.',
    askName: '¿Cómo te llamas?',
    blocked: 'Lo sentimos, tu cuenta tiene demasiadas ausencias y no podemos aceptar nuevas reservas.',
    noBookings: 'No tienes reservas activas.',
    cancelWhich: 'Tienes varias reservas. ¿Cuál quieres cancelar?',
    cancelConfirm: (service: string, date: string, time: string) => `¿Confirmas cancelar tu cita de *${service}* el ${date} a las ${time}?`,
    btnYesCancel: 'Sí, cancelar',
    btnNoKeep: 'No, mantener',
    cancelDone: '✅ Cita cancelada correctamente.',
    cancelError: 'No he podido cancelar. Escríbenos directamente si necesitas ayuda.',
    resetMsg: '¿En qué te puedo ayudar?',
    servicesSection: 'Servicios',
    waitlistAdded: (date: string) => `Te añado a la lista de espera para el ${date}. Te avisaré si se libera un hueco. 🔔`,
    reminderMsg: (name: string, service: string, date: string, time: string, barber: string | null) =>
      `Hola ${name}! 👋 Recuerda que mañana tienes cita:\n\n📋 *${service}*\n📅 ${date}\n🕐 ${time}${barber ? `\n💈 ${barber}` : ''}\n\n¿Todo bien?`,
    btnConfirmReminder: '✅ Ahí estaré',
    btnCancelReminder: '❌ Necesito cancelar',
    questionSystemPrompt: (businessName: string, services: string, address: string) =>
      `Eres el asistente virtual de ${businessName}. Responde breve y amigable en español.\nServicios disponibles:\n${services || 'No hay servicios configurados aún.'}\nDirección: ${address || 'No disponible'}\nSi el cliente quiere reservar, dile que escriba "reservar" o "cita".`,
  },
  en: {
    greeting: (name: string | null) => name ? `Hey ${name}! 👋\n\nHow can I help you?` : `Hey there! 👋\n\nHow can I help you?`,
    btnBook: 'Book appointment',
    btnCancel: 'Cancel booking',
    btnInfo: 'View services',
    btnDone: 'Done',
    askService: (name: string | null) => `Hey ${name || 'there'}! Which service would you like?`,
    noService: "I didn't understand which service you want. Please select an option from the list.\n\nIf you want to start over, type *exit*.",
    askBarber: 'Which barber would you like?',
    noPreference: 'No preference',
    askDate: 'Which day would you like your appointment?',
    btnToday: 'Today',
    btnTomorrow: 'Tomorrow',
    btnOtherDay: 'Another day',
    askSlot: (date: string) => `What time on ${date}?`,
    btnViewSlots: 'View slots',
    noSlots: (date: string) => `Sorry, no slots available for ${date}. Would you like to try another day?\n\nReply with a date (e.g. Monday, April 7) or type *exit* to go back to the menu.`,
    confirmBooking: (name: string, service: string, date: string, time: string, barber: string | null) =>
      `Great! Here's your booking summary:\n\n📋 *${service}*\n📅 ${date}\n🕐 ${time}${barber && barber !== 'No preference' ? `\n💈 ${barber}` : ''}\n\nShall we confirm?`,
    btnConfirm: '✅ Confirm',
    btnCancel2: '❌ Cancel',
    bookingConfirmed: (service: string, date: string, time: string) => `✅ Booking confirmed!\n\n📋 *${service}*\n📅 ${date}\n🕐 ${time}\n\nSee you soon! 💈`,
    bookingCancelled: '❌ Booking cancelled. Let me know if you need anything else.',
    askName: "What's your name?",
    blocked: "We're sorry, your account has too many no-shows and we can't accept new bookings.",
    noBookings: "You don't have any active bookings.",
    cancelWhich: 'You have multiple bookings. Which one would you like to cancel?',
    cancelConfirm: (service: string, date: string, time: string) => `Confirm cancellation of your *${service}* appointment on ${date} at ${time}?`,
    btnYesCancel: 'Yes, cancel',
    btnNoKeep: 'No, keep it',
    cancelDone: '✅ Appointment successfully cancelled.',
    cancelError: "I couldn't process the cancellation. Please contact us directly if you need help.",
    resetMsg: 'How can I help you?',
    servicesSection: 'Services',
    waitlistAdded: (date: string) => `I've added you to the waitlist for ${date}. I'll notify you if a slot opens up. 🔔`,
    reminderMsg: (name: string, service: string, date: string, time: string, barber: string | null) =>
      `Hey ${name}! 👋 Just a reminder that tomorrow you have an appointment:\n\n📋 *${service}*\n📅 ${date}\n🕐 ${time}${barber ? `\n💈 ${barber}` : ''}\n\nAll good?`,
    btnConfirmReminder: "✅ I'll be there",
    btnCancelReminder: '❌ I need to cancel',
    questionSystemPrompt: (businessName: string, services: string, address: string) =>
      `You are the virtual assistant of ${businessName}. Reply briefly and in a friendly tone in English.\nAvailable services:\n${services || 'No services configured yet.'}\nAddress: ${address || 'Not available'}\nIf the customer wants to book, tell them to write "book" or "appointment".`,
  },
} as const;

// ---------------------------------------------------------------------------
// Intent classification
// ---------------------------------------------------------------------------

async function classifyIntent(message: string): Promise<Intent> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Classify the user intent from a WhatsApp message to a barbershop. Reply with ONLY one word: booking, cancel, change, question, or greeting.\n"change" means the user wants to modify/reschedule an existing appointment (e.g. "cambiar cita", "modificar", "reagendar").',
        },
        { role: 'user', content: message },
      ],
      max_tokens: 10,
      temperature: 0,
    });
    const intent = response.choices[0].message.content?.trim().toLowerCase() as Intent | undefined;
    if (intent && ['booking', 'cancel', 'change', 'question', 'greeting'].includes(intent)) {
      return intent;
    }
  } catch (err) {
    console.error('Intent classification error:', err);
  }
  return 'greeting';
}

// ---------------------------------------------------------------------------
// Analytics tracking
// ---------------------------------------------------------------------------

async function trackAnalytics(
  clientId: string,
  field: 'messagesReceived' | 'messagesReplied' | 'bookingsMade' | 'bookingsCancelled'
) {
  try {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

    const [existing] = await db
      .select()
      .from(analytics)
      .where(and(
        eq(analytics.clientId, clientId),
        sql`${analytics.date}::date = ${todayStr}::date`
      ));

    const fieldMap = {
      messagesReceived: analytics.messagesReceived,
      messagesReplied: analytics.messagesReplied,
      bookingsMade: analytics.bookingsMade,
      bookingsCancelled: analytics.bookingsCancelled,
    };

    if (existing) {
      await db
        .update(analytics)
        .set({ [field]: sql`${fieldMap[field]} + 1` })
        .where(eq(analytics.id, existing.id));
    } else {
      await db.insert(analytics).values({
        clientId,
        date: todayDate,
        messagesReceived: field === 'messagesReceived' ? 1 : 0,
        messagesReplied: field === 'messagesReplied' ? 1 : 0,
        bookingsMade: field === 'bookingsMade' ? 1 : 0,
        bookingsCancelled: field === 'bookingsCancelled' ? 1 : 0,
      });
    }
  } catch (err) {
    console.error('Analytics tracking error:', err);
  }
}

// ---------------------------------------------------------------------------
// Customer helpers
// ---------------------------------------------------------------------------

async function getOrCreateCustomer(
  clientId: string,
  phone: string
): Promise<{ id: string; name: string | null }> {
  const [existing] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.clientId, clientId), eq(customers.phone, phone)));

  if (existing) return { id: existing.id, name: existing.name };

  const [created] = await db
    .insert(customers)
    .values({ clientId, phone })
    .returning();

  return { id: created.id, name: created.name };
}

async function setCustomerName(clientId: string, phone: string, name: string): Promise<void> {
  await db
    .update(customers)
    .set({ name })
    .where(and(eq(customers.clientId, clientId), eq(customers.phone, phone)));
  // Also update name on all existing bookings for this customer
  await db
    .update(bookings)
    .set({ customerName: name })
    .where(and(eq(bookings.clientId, clientId), eq(bookings.customerPhone, phone)));
}

async function incrementCustomerBookings(clientId: string, phone: string): Promise<void> {
  await db
    .update(customers)
    .set({
      totalBookings: sql`${customers.totalBookings} + 1`,
      lastBookingAt: new Date(),
    })
    .where(and(eq(customers.clientId, clientId), eq(customers.phone, phone)));
}

async function incrementCustomerCancellations(clientId: string, phone: string): Promise<void> {
  await db
    .update(customers)
    .set({
      cancellations: sql`${customers.cancellations} + 1`,
    })
    .where(and(eq(customers.clientId, clientId), eq(customers.phone, phone)));

  // Update reputation based on cancellations + no-shows
  await updateCustomerReputation(clientId, phone);
}

async function incrementCustomerNoShows(clientId: string, phone: string): Promise<void> {
  await db
    .update(customers)
    .set({
      noShows: sql`${customers.noShows} + 1`,
    })
    .where(and(eq(customers.clientId, clientId), eq(customers.phone, phone)));

  await updateCustomerReputation(clientId, phone);
}

async function updateCustomerReputation(clientId: string, phone: string): Promise<void> {
  const [cust] = await db.select().from(customers)
    .where(and(eq(customers.clientId, clientId), eq(customers.phone, phone)));

  if (!cust) return;

  const noShows = cust.noShows || 0;
  const total = cust.totalBookings || 1;

  // Blocked: 3+ no-shows
  if (noShows >= 3) {
    await db.update(customers).set({ reputation: 'blocked' })
      .where(eq(customers.id, cust.id));
  // Warning: 2 no-shows or >30% no-show rate with 5+ bookings
  } else if (noShows >= 2 || (total >= 5 && noShows / total > 0.3)) {
    await db.update(customers).set({ reputation: 'warning' })
      .where(eq(customers.id, cust.id));
  } else {
    await db.update(customers).set({ reputation: 'good' })
      .where(eq(customers.id, cust.id));
  }
}

// ---------------------------------------------------------------------------
// Conversation state helpers
// ---------------------------------------------------------------------------

async function getOrCreateConversation(
  clientId: string,
  customerPhone: string
): Promise<ConversationRow> {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.clientId, clientId),
        eq(conversations.customerPhone, customerPhone)
      )
    );

  if (existing) return existing as ConversationRow;

  const [created] = await db
    .insert(conversations)
    .values({
      clientId,
      customerPhone,
      step: 'idle',
    })
    .returning();

  return created as ConversationRow;
}

async function updateConversation(
  id: string,
  updates: {
    step?: string;
    selectedService?: string | null;
    selectedSlot?: string | null;
    context?: unknown;
  }
): Promise<void> {
  await db
    .update(conversations)
    .set({ ...updates, lastInteraction: new Date() })
    .where(eq(conversations.id, id));
}

function getContext(conversation: ConversationRow): ConversationContext {
  return (conversation.context as ConversationContext) || {};
}

// ---------------------------------------------------------------------------
// Answer free-form questions using the barbershop config
// ---------------------------------------------------------------------------

async function answerQuestion(
  message: string,
  config: BarbershopConfig,
  lang: Lang = 'es'
): Promise<string> {
  const servicesList = config.services
    .map((s) => `- ${s.name}: ${s.duration}min, ${s.price}EUR`)
    .join('\n');

  const systemPrompt = T[lang].questionSystemPrompt(config.businessName, servicesList, config.address || '');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ],
    max_tokens: 200,
    temperature: 0.7,
  });

  return response.choices[0].message.content || (lang === 'en' ? "Sorry, I couldn't answer your question." : 'Lo siento, no he podido responder a tu pregunta.');
}

// ---------------------------------------------------------------------------
// Booking flow helpers
// ---------------------------------------------------------------------------

function buildServicesButtons(
  services: ServiceConfig[]
): Array<{ id: string; title: string }> {
  // WhatsApp buttons max 3, titles max 20 chars
  return services.slice(0, 3).map((s, i) => ({
    id: `service_${i}`,
    title: s.name.slice(0, 20),
  }));
}

function buildServicesListSections(
  services: ServiceConfig[],
  lang: Lang = 'es'
): Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> {
  return [
    {
      title: T[lang].servicesSection,
      rows: services.map((s, i) => ({
        id: `service_${i}`,
        title: s.name.slice(0, 24),
        description: `${s.duration}min - ${s.price}EUR`,
      })),
    },
  ];
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const config = await getClientByPhoneNumberId(msg.phoneNumberId);
  if (!config) {
    console.error(`No client found for phoneNumberId: ${msg.phoneNumberId}`);
    return;
  }

  // Track incoming message
  await trackAnalytics(config.id, 'messagesReceived');

  // Look up or create customer record
  const customer = await getOrCreateCustomer(config.id, msg.from);
  const customerName = customer.name;

  const conversation = await getOrCreateConversation(config.id, msg.from);
  const step = conversation.step as ConversationStep;
  const token = config.whatsappAccessToken;
  const text = msg.messageText.trim();
  const interactiveId = msg.interactiveReplyId;

  // Detect or retrieve language; allow explicit switch at any time
  const ctx0 = getContext(conversation);
  const lower = text.toLowerCase().trim();

  // Explicit language switch keywords
  const switchToEn = ['english', 'in english', 'inglés', 'ingles', 'speak english', 'habla inglés'];
  const switchToEs = ['spanish', 'español', 'en español', 'castellano', 'habla español', 'habla espanol'];
  let lang: Lang;
  let langSwitched = false;

  if (switchToEn.some(w => lower.includes(w))) {
    lang = 'en';
    langSwitched = ctx0.lang !== 'en';
  } else if (switchToEs.some(w => lower.includes(w))) {
    lang = 'es';
    langSwitched = ctx0.lang !== 'es';
  } else if (ctx0.lang) {
    // Already set — re-detect only if message is unambiguously the other language
    const detected = detectLanguage(text);
    lang = detected !== ctx0.lang && text.split(' ').length >= 3 ? detected : (ctx0.lang as Lang);
  } else {
    lang = detectLanguage(text);
  }

  const needsLangSave = lang !== ctx0.lang;
  const needsNameSave = !!customerName && !ctx0.customerName;

  if (needsLangSave || needsNameSave) {
    const merged: ConversationContext = {
      ...ctx0,
      ...(needsLangSave ? { lang } : {}),
      ...(needsNameSave ? { customerName: customerName! } : {}),
    };
    await updateConversation(conversation.id, { context: merged });
  }

  // If user explicitly requested a language switch, confirm and show menu
  if (langSwitched) {
    const confirm = lang === 'en'
      ? "Sure! I'll continue in English 🇬🇧"
      : '¡Claro! Continúo en español 🇪🇸';
    await sendWhatsAppButtons(
      msg.phoneNumberId, msg.from, confirm,
      [
        { id: 'action_book', title: T[lang].btnBook },
        { id: 'action_cancel', title: T[lang].btnCancel },
        { id: 'action_info', title: T[lang].btnInfo },
      ],
      token
    );
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // -----------------------------------------------------------------------
  // Global escape: reset conversation from any step
  // -----------------------------------------------------------------------
  const escapePhrases = ['cancelar', 'cancel', 'reset', 'reiniciar', 'salir', 'exit', 'menu', 'menú', 'inicio', 'empezar', 'start'];
  const isEscape = step !== 'idle' && escapePhrases.includes(text.toLowerCase());
  if (isEscape) {
    await updateConversation(conversation.id, { step: 'idle', selectedService: null, selectedSlot: null, context: null });
    await sendWhatsAppButtons(
      msg.phoneNumberId,
      msg.from,
      lang === 'en' ? "Sure, let's start over. How can I help you?" : 'Vale, empezamos de nuevo. ¿En qué te puedo ayudar?',
      [
        { id: 'action_book', title: T[lang].btnBook },
        { id: 'action_cancel', title: T[lang].btnCancel },
        { id: 'action_info', title: T[lang].btnInfo },
      ],
      token
    );
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // -----------------------------------------------------------------------
  // Global waitlist trigger: intercept from any step
  // -----------------------------------------------------------------------
  const waitlistKeywords = ['lista de espera', 'lista espera', 'apuntarme', 'avisame si', 'avísame si', 'waitlist', 'join waitlist', 'notify me', 'avisa si se libera'];
  if (waitlistKeywords.some(k => lower.includes(k))) {
    await startWaitlistFlow(conversation, config, token, msg, lang);
    return;
  }

  // -----------------------------------------------------------------------
  // State machine: handle mid-flow interactions first
  // -----------------------------------------------------------------------

  // Handle action buttons from greeting/post-booking
  if (interactiveId === 'action_book') {
    return await startBookingFlow(conversation, config, token, msg, customerName, lang);
  }
  if (interactiveId === 'action_cancel') {
    return await startCancellationFlow(conversation, config, token, msg, customerName, lang);
  }
  if (interactiveId === 'action_info') {
    const infoQ = lang === 'en' ? 'What services do you offer and how much do they cost?' : 'Qué servicios ofrecéis y cuánto cuestan?';
    const answer = await answerQuestion(infoQ, config, lang);
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, answer, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }
  if (interactiveId === 'action_done') {
    const doneMsg = lang === 'en' ? "Perfect! Let me know if you need anything else. 👋" : 'Perfecto! Si necesitas algo más, escríbeme cuando quieras. 👋';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, doneMsg, token);
    await updateConversation(conversation.id, { step: 'idle' });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // -- Reminder button responses --
  if (interactiveId === 'reminder_confirm') {
    const reminderConfirmMsg = lang === 'en' ? "✅ Great, see you tomorrow! 💈" : '✅ Perfecto, te esperamos mañana! 💈';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, reminderConfirmMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  if (interactiveId === 'reminder_cancel') {
    // Find their upcoming booking and cancel it
    const upcomingBooking = await db.select().from(bookings)
      .where(and(
        eq(bookings.clientId, config.id),
        eq(bookings.customerPhone, msg.from),
        eq(bookings.status, 'confirmed')
      ))
      .orderBy(bookings.date)
      .limit(1);

    if (upcomingBooking.length > 0) {
      const bk = upcomingBooking[0];
      // Delete from Google Calendar
      if (bk.googleEventId && config.googleCalendarId) {
        await deleteCalendarEvent(config.googleCalendarId, bk.googleEventId);
      }
      // Update booking status
      await db.update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(bookings.id, bk.id));

      // Track cancellation
      await trackAnalytics(config.id, 'bookingsCancelled');
      await incrementCustomerCancellations(config.id, msg.from);

      // Check waitlist for this date
      await notifyWaitlist(config, bk.date, bk.time, bk.service || '', bk.barber || null, token);

      const reminderCancelledMsg = lang === 'en'
        ? 'Your appointment has been cancelled. Would you like to book another?'
        : 'Tu cita ha sido cancelada. ¿Quieres reservar otra?';
      await sendWhatsAppButtons(
        msg.phoneNumberId,
        msg.from,
        reminderCancelledMsg,
        [
          { id: 'action_book', title: lang === 'en' ? 'Book another' : 'Reservar otra' },
          { id: 'action_done', title: lang === 'en' ? 'No, thanks' : 'No, gracias' },
        ],
        token
      );
      await trackAnalytics(config.id, 'messagesReplied');
    }
    return;
  }

  // -- Waitlist button responses --
  if (interactiveId === 'waitlist_yes') {
    const ctx = getContext(conversation);
    await db.insert(waitlist).values({
      clientId: config.id,
      customerPhone: msg.from,
      customerName: ctx.customerName || null,
      date: ctx.waitlistDate || '',
      service: conversation.selectedService || null,
      barber: ctx.selectedBarber || null,
    });
    const waitlistConfirmMsg = lang === 'en'
      ? "✅ We'll let you know if a slot opens up. Anything else?"
      : '✅ Te avisaremos si se libera un hueco. ¿Quieres hacer algo más?';
    await sendWhatsAppButtons(
      msg.phoneNumberId,
      msg.from,
      waitlistConfirmMsg,
      [
        { id: 'action_book', title: lang === 'en' ? 'Try another date' : 'Probar otra fecha' },
        { id: 'action_done', title: lang === 'en' ? "That's all" : 'Eso es todo' },
      ],
      token
    );
    await updateConversation(conversation.id, { step: 'idle' });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  if (interactiveId === 'waitlist_no') {
    // Re-show date picker
    await sendDatePicker(msg, config, token, lang);
    return;
  }

  if (interactiveId === 'waitlist_accept') {
    // Find their waitlist entry
    const entry = await db.select().from(waitlist)
      .where(and(
        eq(waitlist.clientId, config.id),
        eq(waitlist.customerPhone, msg.from),
        eq(waitlist.status, 'notified')
      ))
      .limit(1);

    if (entry.length > 0) {
      const w = entry[0];
      // Mark waitlist as booked
      await db.update(waitlist)
        .set({ status: 'booked' })
        .where(eq(waitlist.id, w.id));

      // Start a booking flow for them with the service pre-selected
      const waitlistAcceptMsg = lang === 'en' ? "✅ Great! Let's book your slot." : '✅ ¡Genial! Vamos a reservar tu hueco.';
      await sendWhatsAppMessage(msg.phoneNumberId, msg.from, waitlistAcceptMsg, token);
      const freshConversation = await getOrCreateConversation(config.id, msg.from);
      await startBookingFlow(freshConversation, config, token, msg, w.customerName, lang);
    }
    return;
  }

  if (interactiveId === 'waitlist_decline') {
    // Mark as expired, notify next person
    const entry = await db.select().from(waitlist)
      .where(and(
        eq(waitlist.clientId, config.id),
        eq(waitlist.customerPhone, msg.from),
        eq(waitlist.status, 'notified')
      ))
      .limit(1);

    if (entry.length > 0) {
      await db.update(waitlist)
        .set({ status: 'expired' })
        .where(eq(waitlist.id, entry[0].id));

      // Notify next person in line for the same date
      await notifyWaitlist(config, entry[0].date, '', entry[0].service || '', entry[0].barber || null, token);
    }

    const waitlistDeclineMsg = lang === 'en' ? "Understood. If you change your mind, let me know. 👋" : 'Entendido. Si cambias de opinión, escríbeme. 👋';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, waitlistDeclineMsg, token);
    return;
  }

  if (step === 'asking_name') {
    return await handleNameCapture(conversation, config, text, token, msg, lang);
  }

  if (step === 'choosing_service') {
    return await handleServiceSelection(conversation, config, interactiveId || text, token, msg, customerName, lang);
  }

  if (step === 'choosing_barber') {
    return await handleBarberSelection(conversation, config, interactiveId || text, token, msg, lang);
  }

  if (step === 'choosing_date') {
    return await handleDateSelection(conversation, config, interactiveId || text, token, msg, lang);
  }

  if (step === 'choosing_slot') {
    return await handleSlotSelection(conversation, config, interactiveId || text, token, msg, lang);
  }

  if (step === 'confirming') {
    return await handleConfirmation(conversation, config, interactiveId || text, token, msg, lang);
  }

  if (step === 'cancelling') {
    return await handleCancelSelection(conversation, config, interactiveId || text, token, msg, lang);
  }

  if (step === 'cancel_confirming') {
    return await handleCancelConfirmation(conversation, config, interactiveId || text, token, msg, lang);
  }

  if (step === 'changing') {
    return await handleChangeConfirmation(conversation, config, interactiveId || text, token, msg, lang);
  }

  // -----------------------------------------------------------------------
  // Idle / greeting / new intent
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // "When is my appointment?" — check before AI classification
  // -----------------------------------------------------------------------
  const citaKeywords = ['mi cita', 'mi reserva', 'cuando tengo', 'cuándo tengo', 'tengo cita', 'próxima cita', 'proxima cita',
    'mis citas', 'mis reservas', 'my appointment', 'my booking', 'my bookings', 'when is my', 'do i have', 'next appointment'];
  if (citaKeywords.some(k => lower.includes(k))) {
    const today = getTodayDate();
    const upcoming = await db.select().from(bookings)
      .where(and(
        eq(bookings.clientId, config.id),
        eq(bookings.customerPhone, msg.from),
        eq(bookings.status, 'confirmed'),
        gte(bookings.date, today)
      ))
      .orderBy(bookings.date, bookings.time)
      .limit(10);

    if (upcoming.length === 0) {
      const reply = lang === 'en'
        ? "You don't have any upcoming appointments. Would you like to book one?"
        : 'No tienes ninguna cita próxima. ¿Quieres reservar una?';
      await sendWhatsAppMessage(msg.phoneNumberId, msg.from, reply, token);
    } else if (upcoming.length === 1) {
      const bk = upcoming[0];
      const reply = lang === 'en'
        ? `📅 Your next appointment:\n\n*${bk.service}*\n${formatDateSpanish(bk.date)} at ${bk.time}${bk.barber ? `\n💈 ${bk.barber}` : ''}`
        : `📅 Tu próxima cita:\n\n*${bk.service}*\n${formatDateSpanish(bk.date)} a las ${bk.time}${bk.barber ? `\n💈 ${bk.barber}` : ''}`;
      await sendWhatsAppMessage(msg.phoneNumberId, msg.from, reply, token);
    } else {
      // Multiple bookings — show as a list
      const rows = upcoming.map(b => ({
        id: `info_booking_${b.id}`,
        title: b.service.slice(0, 24),
        description: `${formatDateSpanish(b.date)} ${b.time}${b.barber ? ` · ${b.barber}` : ''}`,
      }));
      const header = lang === 'en'
        ? `You have ${upcoming.length} upcoming appointments:`
        : `Tienes ${upcoming.length} citas próximas:`;
      await sendWhatsAppList(
        msg.phoneNumberId, msg.from,
        header,
        lang === 'en' ? 'View appointments' : 'Ver citas',
        [{ title: lang === 'en' ? 'Your appointments' : 'Tus citas', rows }],
        token
      );
    }
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // -----------------------------------------------------------------------
  // "Change my name" — e.g. "me llamo X", "my name is X", "llámame X"
  // -----------------------------------------------------------------------
  const nameChangeES = lower.match(/(?:me llamo|mi nombre es|soy|llámame|llamame)\s+([a-záéíóúüñA-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s]{1,20})/);
  const nameChangeEN = lower.match(/(?:my name is|call me|i(?:'m| am))\s+([a-zA-Z][a-zA-Z\s]{1,20})/);
  const nameMatch = nameChangeES || nameChangeEN;
  if (nameMatch) {
    const newName = nameMatch[1].trim().split(' ')[0]; // Take first word only
    const capitalized = newName.charAt(0).toUpperCase() + newName.slice(1).toLowerCase();
    await setCustomerName(config.id, msg.from, capitalized);
    await updateConversation(conversation.id, { context: { ...getContext(conversation), customerName: capitalized, lang } });
    const reply = lang === 'en'
      ? `Got it! I'll call you ${capitalized} from now on 👍`
      : `¡Perfecto! A partir de ahora te llamo ${capitalized} 👍`;
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, reply, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  const intent = await classifyIntent(text);

  switch (intent) {
    case 'booking':
      await startBookingFlow(conversation, config, token, msg, customerName, lang);
      break;

    case 'cancel':
      await startCancellationFlow(conversation, config, token, msg, customerName, lang);
      break;

    case 'change':
      await startChangeFlow(conversation, config, token, msg, customerName, lang);
      break;

    case 'question': {
      const answer = await answerQuestion(text, config, lang);
      await sendWhatsAppMessage(msg.phoneNumberId, msg.from, answer, token);
      await trackAnalytics(config.id, 'messagesReplied');
      break;
    }

    case 'greeting':
    default:
      await sendGreeting(conversation, config, token, msg, customerName, lang);
      break;
  }
}

// ---------------------------------------------------------------------------
// Flow handlers
// ---------------------------------------------------------------------------

async function sendGreeting(
  conversation: ConversationRow,
  config: BarbershopConfig,
  token: string,
  msg: IncomingMessage,
  customerName: string | null,
  lang: Lang = 'es'
): Promise<void> {
  await updateConversation(conversation.id, { step: 'greeting' });

  const greetingText = T[lang].greeting(customerName);

  if (config.services.length > 0) {
    await sendWhatsAppButtons(
      msg.phoneNumberId,
      msg.from,
      greetingText,
      [
        { id: 'action_book', title: T[lang].btnBook },
        { id: 'action_cancel', title: lang === 'en' ? 'Cancel/Change' : 'Cancelar/Cambiar' },
        { id: 'action_info', title: lang === 'en' ? 'Info & prices' : 'Info y precios' },
      ],
      token
    );
  } else {
    const fallbackMsg = lang === 'en'
      ? `${greetingText}\n\nTell me what you need and I'll help.`
      : `${greetingText}\n\nEscribeme lo que necesites y te ayudo.`;
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, fallbackMsg, token);
  }
  await trackAnalytics(config.id, 'messagesReplied');
}

// ---------------------------------------------------------------------------
// Name capture
// ---------------------------------------------------------------------------

async function handleNameCapture(
  conversation: ConversationRow,
  config: BarbershopConfig,
  text: string,
  token: string,
  msg: IncomingMessage,
  lang: Lang = 'es'
): Promise<void> {
  const name = text.trim();

  if (name.length < 2 || name.length > 50) {
    const askNameMsg = lang === 'en' ? 'Please tell me your name to continue.' : 'Por favor, dime tu nombre para continuar.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, askNameMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // Save name to customers table
  await setCustomerName(config.id, msg.from, name);

  // Update context with customer name
  const ctx = getContext(conversation);
  await updateConversation(conversation.id, {
    step: 'choosing_service',
    context: { ...ctx, customerName: name },
  });

  // Show services
  await sendServicePicker(msg, config, token, T[lang].askService(name), lang);
  await trackAnalytics(config.id, 'messagesReplied');
}

// ---------------------------------------------------------------------------
// Booking flow
// ---------------------------------------------------------------------------

async function startBookingFlow(
  conversation: ConversationRow,
  config: BarbershopConfig,
  token: string,
  msg: IncomingMessage,
  customerName: string | null,
  lang: Lang = 'es'
): Promise<void> {
  // Check customer reputation
  const [cust] = await db.select().from(customers)
    .where(and(eq(customers.clientId, config.id), eq(customers.phone, msg.from)));

  if (cust?.reputation === 'blocked') {
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, T[lang].blocked, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  if (cust?.reputation === 'warning') {
    const warningMsg = lang === 'en'
      ? '⚠️ Note: You have previous missed appointments. Please make sure to attend your next appointment or cancel in advance.'
      : '⚠️ Nota: Tienes citas previas sin asistir. Por favor, asegúrate de acudir a tu próxima cita o cancelar con antelación.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, warningMsg, token);
  }

  if (config.services.length === 0) {
    const noServicesMsg = lang === 'en'
      ? "We don't have any services configured right now. Please contact us directly."
      : 'Ahora mismo no tenemos servicios configurados. Contacta directamente con nosotros.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, noServicesMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // If we don't know the customer's name, ask for it first
  if (!customerName) {
    await updateConversation(conversation.id, { step: 'asking_name' });
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, T[lang].askName, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  await updateConversation(conversation.id, {
    step: 'choosing_service',
    context: { customerName },
  });

  await sendServicePicker(msg, config, token, T[lang].askService(customerName), lang);
  await trackAnalytics(config.id, 'messagesReplied');
}

async function sendServicePicker(
  msg: IncomingMessage,
  config: BarbershopConfig,
  token: string,
  headerText: string,
  lang: Lang = 'es'
): Promise<void> {
  if (config.services.length <= 3) {
    await sendWhatsAppButtons(
      msg.phoneNumberId,
      msg.from,
      headerText,
      buildServicesButtons(config.services),
      token
    );
  } else {
    await sendWhatsAppList(
      msg.phoneNumberId,
      msg.from,
      headerText,
      T[lang].btnViewSlots,
      buildServicesListSections(config.services, lang),
      token
    );
  }
}

async function handleServiceSelection(
  conversation: ConversationRow,
  config: BarbershopConfig,
  selection: string,
  token: string,
  msg: IncomingMessage,
  customerName: string | null,
  lang: Lang = 'es'
): Promise<void> {
  // Try to match by interactive reply id (e.g. "service_0")
  let serviceIndex = -1;
  const match = selection.match(/^service_(\d+)$/);
  if (match) {
    serviceIndex = parseInt(match[1], 10);
  } else {
    // Fuzzy match by name
    const lower = selection.toLowerCase();
    serviceIndex = config.services.findIndex((s) =>
      s.name.toLowerCase().includes(lower)
    );
  }

  if (serviceIndex < 0 || serviceIndex >= config.services.length) {
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, T[lang].noService, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  const service = config.services[serviceIndex];
  const ctx = getContext(conversation);

  // ----- Calendar flow: if googleCalendarId is configured -----
  if (config.googleCalendarId) {
    const baseContext: ConversationContext = {
      serviceDuration: service.duration,
      servicePrice: service.price,
      customerName: ctx.customerName || customerName || undefined,
      isChanging: ctx.isChanging,
    };

    // If barbers are configured, ask which barber first
    if (config.barbers.length > 0) {
      await updateConversation(conversation.id, {
        step: 'choosing_barber',
        selectedService: service.name,
        context: baseContext satisfies ConversationContext,
      });

      await sendBarberPicker(msg, config, token, service.name, service.duration, service.price, lang);
      await trackAnalytics(config.id, 'messagesReplied');
      return;
    }

    // No barbers — go straight to date selection
    await updateConversation(conversation.id, {
      step: 'choosing_date',
      selectedService: service.name,
      context: baseContext satisfies ConversationContext,
    });

    await sendDatePicker(msg, config, token, lang);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // ----- Fallback: no calendar configured -----
  await updateConversation(conversation.id, {
    step: 'idle',
    selectedService: null,
    selectedSlot: null,
  });

  const fallbackMsg = lang === 'en'
    ? `You chose: ${service.name} (${service.duration}min - ${service.price}EUR).\n\nCalendar integration is in progress. For now, please contact us directly to confirm your appointment.\n\nAnything else?`
    : `Has elegido: ${service.name} (${service.duration}min - ${service.price}EUR).\n\nLa integracion con calendario esta en proceso. Por ahora, contacta con nosotros para confirmar tu cita.\n\nQuieres hacer algo mas?`;

  await sendWhatsAppButtons(
    msg.phoneNumberId,
    msg.from,
    fallbackMsg,
    [
      { id: 'action_book', title: lang === 'en' ? 'Another booking' : 'Otra reserva' },
      { id: 'action_done', title: lang === 'en' ? "That's all" : 'Eso es todo' },
    ],
    token
  );
  await trackAnalytics(config.id, 'messagesReplied');
}

// ---------------------------------------------------------------------------
// Barber selection
// ---------------------------------------------------------------------------

/** Map JS day index (0=Sun) to Spanish day name (without accents, matching config keys) */
const DAY_INDEX_TO_SPANISH: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
};

/** Build the next 7 days, skipping days that are "Cerrado" per config hours or blocked */
function getNext7Days(
  hours: Record<string, string> | null,
  blockedDates: string[] = []
): Array<{ date: string; label: string }> {
  const days: Array<{ date: string; label: string }> = [];
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' })
  );

  for (let offset = 0; offset < 14 && days.length < 7; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);

    const dayName = DAY_INDEX_TO_SPANISH[d.getDay()];
    // Skip closed days
    if (hours && dayName) {
      const val = hours[dayName];
      if (val && val.toLowerCase() === 'cerrado') continue;
    }

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Skip blocked dates
    if (blockedDates.includes(dateStr)) continue;

    // Build human label
    const weekday = d.toLocaleDateString('es-ES', {
      weekday: 'long',
      timeZone: 'Europe/Madrid',
    });
    const dayNum = d.getDate();

    let label: string;
    if (offset === 0) {
      label = `Hoy, ${weekday} ${dayNum}`;
    } else if (offset === 1) {
      label = `Manana, ${weekday} ${dayNum}`;
    } else {
      // Capitalize first letter
      label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${dayNum}`;
    }

    days.push({ date: dateStr, label });
  }

  return days;
}

/** Get business hours for a specific date from the config */
function getBusinessHoursForDate(
  date: string,
  hours: Record<string, string> | null
): { start: string; end: string } | null {
  if (!hours) return null;

  const d = new Date(`${date}T12:00:00+02:00`);
  const dayName = DAY_INDEX_TO_SPANISH[d.getDay()];
  if (!dayName) return null;

  const val = hours[dayName];
  if (!val || val.toLowerCase() === 'cerrado') return null;

  // Expected format: "11:00-20:00"
  const parts = val.split('-');
  if (parts.length !== 2) return null;

  return { start: parts[0].trim(), end: parts[1].trim() };
}

async function sendBarberPicker(
  msg: IncomingMessage,
  config: BarbershopConfig,
  token: string,
  serviceName: string,
  duration: number,
  price: number,
  lang: Lang = 'es'
): Promise<void> {
  const barberOptions = [
    ...config.barbers.map((b, i) => ({
      id: `barber_${i}`,
      title: b.name.slice(0, 24),
    })),
    { id: 'barber_any', title: T[lang].noPreference },
  ];

  const bodyText = lang === 'en'
    ? `You chose: ${serviceName} (${duration}min - ${price}EUR).\n\n${T[lang].askBarber}`
    : `Has elegido: ${serviceName} (${duration}min - ${price}EUR).\n\n${T[lang].askBarber}`;

  if (barberOptions.length <= 3) {
    await sendWhatsAppButtons(msg.phoneNumberId, msg.from, bodyText, barberOptions, token);
  } else {
    await sendWhatsAppList(
      msg.phoneNumberId,
      msg.from,
      bodyText,
      lang === 'en' ? 'View barbers' : 'Ver barberos',
      [
        {
          title: lang === 'en' ? 'Barbers' : 'Barberos',
          rows: barberOptions.map((b) => ({ id: b.id, title: b.title })),
        },
      ],
      token
    );
  }
}

async function handleBarberSelection(
  conversation: ConversationRow,
  config: BarbershopConfig,
  selection: string,
  token: string,
  msg: IncomingMessage,
  lang: Lang = 'es'
): Promise<void> {
  const ctx = getContext(conversation);
  let barberName: string | null = null;

  if (selection === 'barber_any') {
    barberName = T[lang].noPreference;
  } else {
    const barberMatch = selection.match(/^barber_(\d+)$/);
    if (barberMatch) {
      const idx = parseInt(barberMatch[1], 10);
      if (idx >= 0 && idx < config.barbers.length) {
        barberName = config.barbers[idx].name;
      }
    } else {
      // Fuzzy match by name
      const lower = selection.toLowerCase();
      if (lower.includes('sin preferencia') || lower.includes('cualquier') || lower.includes('no preference') || lower.includes('any')) {
        barberName = T[lang].noPreference;
      } else {
        const found = config.barbers.find((b) =>
          b.name.toLowerCase().includes(lower)
        );
        if (found) barberName = found.name;
      }
    }
  }

  if (!barberName) {
    const noBarberMsg = lang === 'en'
      ? "I didn't understand. Please select a barber from the list."
      : 'No he entendido. Por favor, selecciona un barbero de la lista.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, noBarberMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  await updateConversation(conversation.id, {
    step: 'choosing_date',
    context: { ...ctx, selectedBarber: barberName } satisfies ConversationContext,
  });

  await sendDatePicker(msg, config, token, lang);
  await trackAnalytics(config.id, 'messagesReplied');
}

/** Send the 7-day date picker as a WhatsApp list */
async function sendDatePicker(
  msg: IncomingMessage,
  config: BarbershopConfig,
  token: string,
  lang: Lang = 'es'
): Promise<void> {
  const days = getNext7Days(config.hours, config.blockedDates);

  await sendWhatsAppList(
    msg.phoneNumberId,
    msg.from,
    lang === 'en' ? 'Which day would you like your appointment?' : 'Para cuando quieres la cita?',
    lang === 'en' ? 'View dates' : 'Ver fechas',
    [
      {
        title: lang === 'en' ? 'Available dates' : 'Fechas disponibles',
        rows: days.map((d) => ({
          id: `date_${d.date}`,
          title: d.label.slice(0, 24),
        })),
      },
    ],
    token
  );
}

// ---------------------------------------------------------------------------
// Date selection (calendar flow)
// ---------------------------------------------------------------------------

async function handleDateSelection(
  conversation: ConversationRow,
  config: BarbershopConfig,
  selection: string,
  token: string,
  msg: IncomingMessage,
  lang: Lang = 'es'
): Promise<void> {
  // Extract date from interactive id like "date_2026-04-02" or plain text
  let selectedDate: string | null = null;

  const dateMatch = selection.match(/^date_(\d{4}-\d{2}-\d{2})$/);
  if (dateMatch) {
    selectedDate = dateMatch[1];
  } else {
    // Try to interpret text like "hoy" / "manana"
    const lower = selection.toLowerCase();
    if (lower.includes('hoy') || lower.includes('today')) {
      selectedDate = getTodayDate();
    } else if (lower.includes('mana') || lower.includes('tomorrow')) {
      selectedDate = getTomorrowDate();
    }
  }

  if (!selectedDate) {
    const noDateMsg = lang === 'en'
      ? "I didn't understand the date. Please select one from the list."
      : 'No he entendido la fecha. Por favor, selecciona una de la lista.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, noDateMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  const ctx = getContext(conversation);
  const duration = ctx.serviceDuration || 30;

  // If this was triggered from an explicit waitlist flow, skip slot checking and just add to waitlist
  if (ctx.isWaitlistFlow) {
    await db.insert(waitlist).values({
      clientId: config.id,
      customerPhone: msg.from,
      customerName: ctx.customerName || null,
      date: selectedDate,
      service: conversation.selectedService || null,
      barber: ctx.selectedBarber || null,
    });
    const reply = lang === 'en'
      ? `✅ Done! You're on the waitlist for ${formatDateSpanish(selectedDate)}. I'll message you as soon as a slot opens up. 🔔`
      : `✅ ¡Listo! Te he apuntado a la lista de espera para el ${formatDateSpanish(selectedDate)}. Te aviso en cuanto se libere un hueco. 🔔`;
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, reply, token);
    await updateConversation(conversation.id, { step: 'idle', context: null });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  if (!config.googleCalendarId) {
    const internalErrMsg = lang === 'en' ? 'Internal error. Please try again.' : 'Error interno. Intenta de nuevo.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, internalErrMsg, token);
    await updateConversation(conversation.id, { step: 'idle', selectedService: null, selectedSlot: null, context: null });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // Determine business hours for the selected date
  const bh = getBusinessHoursForDate(selectedDate, config.hours);
  const businessHours = bh || { start: '10:00', end: '20:00' };

  try {
    const slots = await getAvailableSlots(config.googleCalendarId, selectedDate, duration, businessHours, ctx.selectedBarber, config.blockedDates);

    if (slots.length === 0) {
      const noSlotsMsg = lang === 'en'
        ? `No slots available for ${formatDateSpanish(selectedDate)}.\n\nWould you like us to notify you if one opens up?`
        : `No hay huecos disponibles para ${formatDateSpanish(selectedDate)}.\n\n¿Quieres que te avisemos si se libera uno?`;
      await sendWhatsAppButtons(
        msg.phoneNumberId,
        msg.from,
        noSlotsMsg,
        [
          { id: 'waitlist_yes', title: lang === 'en' ? 'Yes, notify me' : 'Sí, avísame' },
          { id: 'waitlist_no', title: lang === 'en' ? 'Try another date' : 'Probar otra fecha' },
        ],
        token
      );
      // Store the date in context for waitlist
      const ctxWait = getContext(conversation);
      await updateConversation(conversation.id, {
        context: { ...ctxWait, waitlistDate: selectedDate },
      });
      await trackAnalytics(config.id, 'messagesReplied');
      return;
    }

    const slotsHeader = lang === 'en'
      ? `Available slots for ${formatDateSpanish(selectedDate)}:`
      : `Huecos disponibles para ${formatDateSpanish(selectedDate)}:`;
    await sendSlotsMessage(msg, token, slots, selectedDate, slotsHeader, lang);

    await updateConversation(conversation.id, {
      step: 'choosing_slot',
      context: { ...ctx, selectedDate: selectedDate } satisfies ConversationContext,
    });
    await trackAnalytics(config.id, 'messagesReplied');
  } catch (error) {
    console.error('Error fetching calendar slots:', error);
    const calErrMsg = lang === 'en'
      ? 'There was an error checking availability. Please try again in a few minutes.'
      : 'Ha habido un error consultando la disponibilidad. Intenta de nuevo en unos minutos.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, calErrMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
  }
}

/** Send slots as a WhatsApp list (up to 10 rows) */
async function sendSlotsMessage(
  msg: IncomingMessage,
  token: string,
  slots: Array<{ start: string; end: string }>,
  date: string,
  headerText: string,
  lang: Lang = 'es'
): Promise<void> {
  const displaySlots = slots.slice(0, 10);

  await sendWhatsAppList(
    msg.phoneNumberId,
    msg.from,
    headerText,
    T[lang].btnViewSlots,
    [
      {
        title: formatDateSpanish(date),
        rows: displaySlots.map((s) => ({
          id: `slot_${date}_${s.start}`,
          title: s.start,
          description: `${s.start} - ${s.end}`,
        })),
      },
    ],
    token
  );
}

// ---------------------------------------------------------------------------
// Slot selection (calendar flow)
// ---------------------------------------------------------------------------

async function handleSlotSelection(
  conversation: ConversationRow,
  config: BarbershopConfig,
  selection: string,
  token: string,
  msg: IncomingMessage,
  lang: Lang = 'es'
): Promise<void> {
  const ctx = getContext(conversation);

  // Parse interactive id like "slot_2026-04-02_17:00" or plain time text
  let selectedTime: string | null = null;
  let selectedDate = ctx.selectedDate || getTodayDate();

  const slotMatch = selection.match(/^slot_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})$/);
  if (slotMatch) {
    selectedDate = slotMatch[1];
    selectedTime = slotMatch[2];
  } else {
    // Try to extract a time from plain text like "17:00" or "17"
    const timeMatch = selection.match(/(\d{1,2}):?(\d{2})?/);
    if (timeMatch) {
      const hour = timeMatch[1].padStart(2, '0');
      const minute = timeMatch[2] || '00';
      selectedTime = `${hour}:${minute}`;
    }
  }

  if (!selectedTime) {
    const noTimeMsg = lang === 'en'
      ? "I didn't understand the time. Please select a slot from the list."
      : 'No he entendido la hora. Por favor, selecciona un hueco de la lista.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, noTimeMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  await updateConversation(conversation.id, {
    step: 'confirming',
    selectedSlot: `${selectedDate}_${selectedTime}`,
    context: { ...ctx, selectedDate } satisfies ConversationContext,
  });

  const noPreferenceLabel = T[lang].noPreference;
  const barberLine = ctx.selectedBarber && ctx.selectedBarber !== noPreferenceLabel ? `\n💈 ${ctx.selectedBarber}` : '';
  const confirmSummary = lang === 'en'
    ? `📋 ${conversation.selectedService}${barberLine}\n📅 ${formatDateSpanish(selectedDate)}\n🕐 ${selectedTime}\n\n${ctx.customerName ? `${ctx.customerName}, shall we confirm?` : 'Shall we confirm?'}`
    : `📋 ${conversation.selectedService}${barberLine}\n📅 ${formatDateSpanish(selectedDate)}\n🕐 ${selectedTime}\n\n${ctx.customerName ? `${ctx.customerName}, ¿confirmamos la reserva?` : '¿Confirmamos la reserva?'}`;

  await sendWhatsAppButtons(
    msg.phoneNumberId,
    msg.from,
    confirmSummary,
    [
      { id: 'confirm_yes', title: lang === 'en' ? 'Yes, confirm' : 'Si, confirmar' },
      { id: 'confirm_no', title: lang === 'en' ? 'No, cancel' : 'No, cancelar' },
    ],
    token
  );
  await trackAnalytics(config.id, 'messagesReplied');
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

async function handleConfirmation(
  conversation: ConversationRow,
  config: BarbershopConfig,
  text: string,
  token: string,
  msg: IncomingMessage,
  lang: Lang = 'es'
): Promise<void> {
  const lower = text.toLowerCase();
  const isYes = lower.includes('si') || lower.includes('yes') || text === 'confirm_yes';

  if (isYes) {
    const ctx = getContext(conversation);
    const slot = conversation.selectedSlot; // "2026-04-02_17:00"

    // If we have calendar integration and a valid slot, create the event
    if (config.googleCalendarId && slot) {
      const [date, time] = slot.split('_');

      if (date && time) {
        const serviceName = conversation.selectedService || 'Servicio';
        const barber = ctx.selectedBarber;
        const custName = ctx.customerName || msg.from;

        // Build event title: "Service - Barber - CustomerName (Phone)"
        const result = await createBooking(
          config.googleCalendarId,
          date,
          time,
          serviceName,
          ctx.serviceDuration || 30,
          custName,
          `${custName} (${msg.from})`,
          barber
        );

        if (result.success) {
          // Save booking to DB
          try {
            await db.insert(bookings).values({
              clientId: config.id,
              customerPhone: msg.from,
              customerName: ctx.customerName || null,
              service: serviceName,
              barber: barber || null,
              date,
              time,
              duration: ctx.serviceDuration || 30,
              price: ctx.servicePrice || null,
              status: 'confirmed',
              googleEventId: result.eventId || null,
            });
          } catch (err) {
            console.error('Error saving booking to DB:', err);
          }

          // Increment customer bookings
          await incrementCustomerBookings(config.id, msg.from);

          // Track booking analytics
          await trackAnalytics(config.id, 'bookingsMade');

          const noPreferenceLabel = T[lang].noPreference;
          const barberConfirm = barber && barber !== noPreferenceLabel ? `\n💈 ${barber}` : '';
          const confirmedMsg = lang === 'en'
            ? `✅ ${ctx.customerName ? `${ctx.customerName}, your` : 'Your'} booking is confirmed!\n\n📋 ${serviceName}${barberConfirm}\n📅 ${formatDateSpanish(date)} at ${time}${config.address ? `\n📍 ${config.address}` : ''}\n\nSee you soon! 💈`
            : `✅ ${ctx.customerName ? `${ctx.customerName}, tu` : 'Tu'} cita esta confirmada!\n\n📋 ${serviceName}${barberConfirm}\n📅 ${formatDateSpanish(date)} a las ${time}${config.address ? `\n📍 ${config.address}` : ''}\n\n¡Te esperamos! 💈`;
          await sendWhatsAppButtons(
            msg.phoneNumberId,
            msg.from,
            confirmedMsg,
            [
              { id: 'action_cancel', title: lang === 'en' ? 'Cancel/Change' : 'Cancelar/Cambiar' },
              { id: 'action_book', title: lang === 'en' ? 'Another booking' : 'Otra reserva' },
              { id: 'action_done', title: lang === 'en' ? 'Done, thanks' : 'Listo, gracias' },
            ],
            token
          );
        } else {
          console.error('Booking creation failed:', result.error);
          const bookErrMsg = lang === 'en'
            ? 'There was an error creating your booking. Please try again or contact us directly.'
            : 'Ha habido un error al crear la reserva. Por favor, intenta de nuevo o contacta directamente con nosotros.';
          await sendWhatsAppMessage(msg.phoneNumberId, msg.from, bookErrMsg, token);
        }
      } else {
        // Malformed slot — fallback
        const fallbackConfirmMsg = lang === 'en'
          ? `Your appointment has been booked! See you at ${config.businessName}.${config.address ? `\n\nAddress: ${config.address}` : ''}`
          : `Tu cita ha sido reservada! Te esperamos en ${config.businessName}.${config.address ? `\n\nDireccion: ${config.address}` : ''}`;
        await sendWhatsAppMessage(msg.phoneNumberId, msg.from, fallbackConfirmMsg, token);
      }
    } else {
      // No calendar — basic confirmation
      const basicConfirmMsg = lang === 'en'
        ? `Your appointment has been booked! See you at ${config.businessName}.${config.address ? `\n\nAddress: ${config.address}` : ''}`
        : `Tu cita ha sido reservada! Te esperamos en ${config.businessName}.${config.address ? `\n\nDireccion: ${config.address}` : ''}`;
      await sendWhatsAppMessage(msg.phoneNumberId, msg.from, basicConfirmMsg, token);
    }
  } else {
    const notConfirmedMsg = lang === 'en'
      ? "No problem. Let me know if you need anything else."
      : 'Vale, no hay problema. Si necesitas algo mas, escribeme.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, notConfirmedMsg, token);
  }

  await updateConversation(conversation.id, {
    step: 'idle',
    selectedService: null,
    selectedSlot: null,
    context: null,
  });
  await trackAnalytics(config.id, 'messagesReplied');
}

// ---------------------------------------------------------------------------
// Cancellation flow
// ---------------------------------------------------------------------------

async function startCancellationFlow(
  conversation: ConversationRow,
  config: BarbershopConfig,
  token: string,
  msg: IncomingMessage,
  customerName: string | null,
  lang: Lang = 'es'
): Promise<void> {
  const today = getTodayDate();

  const upcomingBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, config.id),
        eq(bookings.customerPhone, msg.from),
        eq(bookings.status, 'confirmed'),
        gte(bookings.date, today)
      )
    );

  if (upcomingBookings.length === 0) {
    const noBookingsMsg = lang === 'en'
      ? (customerName ? `${customerName}, you don't have any upcoming bookings.` : "You don't have any upcoming bookings.")
      : (customerName ? `${customerName}, no tienes reservas pendientes.` : 'No tienes reservas pendientes.');
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, noBookingsMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  if (upcomingBookings.length === 1) {
    const booking = upcomingBookings[0];
    const barberLine = booking.barber ? (lang === 'en' ? ` with ${booking.barber}` : ` con ${booking.barber}`) : '';

    await updateConversation(conversation.id, {
      step: 'cancel_confirming',
      context: { cancelBookingId: booking.id },
    });

    const cancelConfirmMsg = lang === 'en'
      ? `Do you want to cancel your ${booking.service}${barberLine} appointment on ${formatDateSpanish(booking.date)} at ${booking.time}?`
      : `Quieres cancelar tu cita de ${booking.service}${barberLine} el ${formatDateSpanish(booking.date)} a las ${booking.time}?`;
    await sendWhatsAppButtons(
      msg.phoneNumberId,
      msg.from,
      cancelConfirmMsg,
      [
        { id: 'cancel_yes', title: T[lang].btnYesCancel },
        { id: 'cancel_no', title: T[lang].btnNoKeep },
      ],
      token
    );
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // Multiple bookings — show a list
  await updateConversation(conversation.id, { step: 'cancelling' });

  const rows = upcomingBookings.slice(0, 10).map((b) => {
    const barberLabel = b.barber ? ` - ${b.barber}` : '';
    return {
      id: `cancel_booking_${b.id}`,
      title: `${b.service}`.slice(0, 24),
      description: `${formatDateSpanish(b.date)} ${b.time}${barberLabel}`,
    };
  });

  await sendWhatsAppList(
    msg.phoneNumberId,
    msg.from,
    lang === 'en' ? 'Which booking would you like to cancel?' : 'Cual de tus citas quieres cancelar?',
    lang === 'en' ? 'View bookings' : 'Ver citas',
    [{ title: lang === 'en' ? 'Your bookings' : 'Tus citas', rows }],
    token
  );
  await trackAnalytics(config.id, 'messagesReplied');
}

async function handleCancelSelection(
  conversation: ConversationRow,
  config: BarbershopConfig,
  selection: string,
  token: string,
  msg: IncomingMessage,
  lang: Lang = 'es'
): Promise<void> {
  const cancelMatch = selection.match(/^cancel_booking_(.+)$/);
  if (!cancelMatch) {
    const noUnderstandMsg = lang === 'en'
      ? "I didn't understand. Please select a booking from the list."
      : 'No he entendido. Por favor, selecciona una cita de la lista.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, noUnderstandMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  const bookingId = cancelMatch[1];
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) {
    const notFoundMsg = lang === 'en'
      ? "I couldn't find that booking. Please try again."
      : 'No he encontrado esa cita. Intenta de nuevo.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, notFoundMsg, token);
    await updateConversation(conversation.id, { step: 'idle' });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  const barberLine = booking.barber ? (lang === 'en' ? ` with ${booking.barber}` : ` con ${booking.barber}`) : '';

  await updateConversation(conversation.id, {
    step: 'cancel_confirming',
    context: { cancelBookingId: booking.id },
  });

  const cancelConfirmMsg = lang === 'en'
    ? `Do you want to cancel your ${booking.service}${barberLine} appointment on ${formatDateSpanish(booking.date)} at ${booking.time}?`
    : `Quieres cancelar tu cita de ${booking.service}${barberLine} el ${formatDateSpanish(booking.date)} a las ${booking.time}?`;
  await sendWhatsAppButtons(
    msg.phoneNumberId,
    msg.from,
    cancelConfirmMsg,
    [
      { id: 'cancel_yes', title: T[lang].btnYesCancel },
      { id: 'cancel_no', title: T[lang].btnNoKeep },
    ],
    token
  );
  await trackAnalytics(config.id, 'messagesReplied');
}

async function handleCancelConfirmation(
  conversation: ConversationRow,
  config: BarbershopConfig,
  text: string,
  token: string,
  msg: IncomingMessage,
  lang: Lang = 'es'
): Promise<void> {
  const ctx = getContext(conversation);
  const lower = text.toLowerCase();
  const isYes = lower.includes('si') || lower.includes('yes') || text === 'cancel_yes';

  if (!isYes) {
    const keptMsg = lang === 'en'
      ? "Ok, your booking is kept. Let me know if you need anything else."
      : 'Vale, tu cita se mantiene. Si necesitas algo mas, escribeme.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, keptMsg, token);
    await updateConversation(conversation.id, { step: 'idle', context: null });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  const bookingId = ctx.cancelBookingId;
  if (!bookingId) {
    const internalErrMsg = lang === 'en' ? 'Internal error. Please try again.' : 'Error interno. Intenta de nuevo.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, internalErrMsg, token);
    await updateConversation(conversation.id, { step: 'idle', context: null });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) {
    const notFoundMsg = lang === 'en' ? "I couldn't find that booking." : 'No he encontrado esa cita.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, notFoundMsg, token);
    await updateConversation(conversation.id, { step: 'idle', context: null });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // Delete Google Calendar event
  if (booking.googleEventId && config.googleCalendarId) {
    await deleteCalendarEvent(config.googleCalendarId, booking.googleEventId);
  }

  // Update booking status
  await db
    .update(bookings)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(eq(bookings.id, bookingId));

  // Track cancellation
  await trackAnalytics(config.id, 'bookingsCancelled');
  await incrementCustomerCancellations(config.id, msg.from);

  // Notify waitlist for freed slot
  await notifyWaitlist(config, booking.date, booking.time, booking.service || '', booking.barber || null, token);

  // Check if this was a change flow
  if (ctx.isChanging) {
    await updateConversation(conversation.id, { step: 'idle', context: null });

    // Look up customer name for the new booking flow
    const customer = await getOrCreateCustomer(config.id, msg.from);

    const changingMsg = lang === 'en'
      ? 'Your previous appointment has been cancelled. Let\'s book a new one.'
      : 'Tu cita anterior ha sido cancelada. Vamos a reservar una nueva.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, changingMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');

    // Start new booking flow
    const freshConversation = await getOrCreateConversation(config.id, msg.from);
    await startBookingFlow(freshConversation, config, token, msg, customer.name, lang);
    return;
  }

  const cancelledMsg = lang === 'en'
    ? 'Your booking has been cancelled. Would you like to book another?'
    : 'Tu cita ha sido cancelada. Quieres reservar otra?';
  await sendWhatsAppButtons(
    msg.phoneNumberId,
    msg.from,
    cancelledMsg,
    [
      { id: 'action_book', title: lang === 'en' ? 'Book another' : 'Reservar otra' },
      { id: 'action_done', title: lang === 'en' ? 'No, thanks' : 'No, gracias' },
    ],
    token
  );

  await updateConversation(conversation.id, { step: 'idle', context: null });
  await trackAnalytics(config.id, 'messagesReplied');
}

// ---------------------------------------------------------------------------
// Change appointment flow
// ---------------------------------------------------------------------------

async function startChangeFlow(
  conversation: ConversationRow,
  config: BarbershopConfig,
  token: string,
  msg: IncomingMessage,
  customerName: string | null,
  lang: Lang = 'es'
): Promise<void> {
  const today = getTodayDate();

  const upcomingBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, config.id),
        eq(bookings.customerPhone, msg.from),
        eq(bookings.status, 'confirmed'),
        gte(bookings.date, today)
      )
    );

  if (upcomingBookings.length === 0) {
    const noChangeMsg = lang === 'en'
      ? (customerName ? `${customerName}, you don't have any upcoming bookings to change.` : "You don't have any upcoming bookings to change.")
      : (customerName ? `${customerName}, no tienes reservas pendientes para cambiar.` : 'No tienes reservas pendientes para cambiar.');
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, noChangeMsg, token);
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  if (upcomingBookings.length === 1) {
    const booking = upcomingBookings[0];
    const barberLine = booking.barber ? (lang === 'en' ? ` with ${booking.barber}` : ` con ${booking.barber}`) : '';

    await updateConversation(conversation.id, {
      step: 'changing',
      context: { cancelBookingId: booking.id, isChanging: true },
    });

    const changeConfirmMsg = lang === 'en'
      ? `Your current appointment: ${booking.service}${barberLine}, ${formatDateSpanish(booking.date)} at ${booking.time}.\n\nWould you like to change it?`
      : `Tu cita actual: ${booking.service}${barberLine}, ${formatDateSpanish(booking.date)} a las ${booking.time}.\n\nQuieres cambiarla?`;
    await sendWhatsAppButtons(
      msg.phoneNumberId,
      msg.from,
      changeConfirmMsg,
      [
        { id: 'change_yes', title: lang === 'en' ? 'Yes, change it' : 'Si, cambiar' },
        { id: 'change_no', title: lang === 'en' ? 'No, keep it' : 'No, mantener' },
      ],
      token
    );
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // Multiple bookings — show a list, same as cancel but with change context
  await updateConversation(conversation.id, { step: 'cancelling', context: { isChanging: true } });

  const rows = upcomingBookings.slice(0, 10).map((b) => {
    const barberLabel = b.barber ? ` - ${b.barber}` : '';
    return {
      id: `cancel_booking_${b.id}`,
      title: `${b.service}`.slice(0, 24),
      description: `${formatDateSpanish(b.date)} ${b.time}${barberLabel}`,
    };
  });

  await sendWhatsAppList(
    msg.phoneNumberId,
    msg.from,
    lang === 'en' ? 'Which booking would you like to change?' : 'Cual de tus citas quieres cambiar?',
    lang === 'en' ? 'View bookings' : 'Ver citas',
    [{ title: lang === 'en' ? 'Your bookings' : 'Tus citas', rows }],
    token
  );
  await trackAnalytics(config.id, 'messagesReplied');
}

async function handleChangeConfirmation(
  conversation: ConversationRow,
  config: BarbershopConfig,
  text: string,
  token: string,
  msg: IncomingMessage,
  lang: Lang = 'es'
): Promise<void> {
  const lower = text.toLowerCase();
  const isYes = lower.includes('si') || lower.includes('yes') || text === 'change_yes';

  if (!isYes) {
    const keptMsg = lang === 'en'
      ? "Ok, your booking is kept. Let me know if you need anything else."
      : 'Vale, tu cita se mantiene. Si necesitas algo mas, escribeme.';
    await sendWhatsAppMessage(msg.phoneNumberId, msg.from, keptMsg, token);
    await updateConversation(conversation.id, { step: 'idle', context: null });
    await trackAnalytics(config.id, 'messagesReplied');
    return;
  }

  // Proceed to cancel + rebook: use cancel confirmation flow with isChanging flag
  const ctx = getContext(conversation);
  await updateConversation(conversation.id, {
    step: 'cancel_confirming',
    context: { ...ctx, isChanging: true },
  });

  // Simulate a "yes" to cancel confirmation
  await handleCancelConfirmation(
    { ...conversation, step: 'cancel_confirming', context: { ...ctx, isChanging: true } },
    config,
    'cancel_yes',
    token,
    msg,
    lang
  );
}

// ---------------------------------------------------------------------------
// Waitlist notification
// ---------------------------------------------------------------------------

// Explicit waitlist entry — ask which date, then add them
async function startWaitlistFlow(
  conversation: ConversationRow,
  config: BarbershopConfig,
  token: string,
  msg: IncomingMessage,
  lang: Lang
): Promise<void> {
  // Show the same date picker so they pick a day
  const header = lang === 'en'
    ? "Which day would you like to join the waitlist for? If a slot opens up, I'll notify you right away. 🔔"
    : '¿Para qué día quieres apuntarte a la lista de espera? Si se libera un hueco, te aviso enseguida. 🔔';

  await sendWhatsAppMessage(msg.phoneNumberId, msg.from, header, token);
  await sendDatePicker(msg, config, token, lang);

  // Mark that the next date selection should go to waitlist, not booking
  const ctx = getContext(conversation);
  await updateConversation(conversation.id, {
    step: 'choosing_date',
    context: { ...ctx, isWaitlistFlow: true },
  });
  await trackAnalytics(config.id, 'messagesReplied');
}

async function notifyWaitlist(
  config: BarbershopConfig,
  date: string,
  time: string,
  service: string,
  barber: string | null,
  token: string
): Promise<void> {
  // Find people waiting for this date
  const waiting = await db.select().from(waitlist)
    .where(and(
      eq(waitlist.clientId, config.id),
      eq(waitlist.date, date),
      eq(waitlist.status, 'waiting')
    ))
    .orderBy(waitlist.createdAt)
    .limit(1); // Notify first person in line

  if (waiting.length === 0) return;

  const person = waiting[0];
  const name = person.customerName ? `${person.customerName}, ` : '';
  const barberText = barber ? ` con ${barber}` : '';
  const timeText = time ? ` a las ${time}` : '';

  if (!config.whatsappPhoneNumberId) return;

  await sendWhatsAppButtons(
    config.whatsappPhoneNumberId,
    person.customerPhone,
    `${name}se ha liberado un hueco!\n\n${service}${barberText}\n${formatDateSpanish(date)}${timeText}\n\n¿Lo quieres?`,
    [
      { id: 'waitlist_accept', title: 'Sí, resérvalo!' },
      { id: 'waitlist_decline', title: 'No, gracias' },
    ],
    token
  );

  // Mark as notified
  await db.update(waitlist)
    .set({ status: 'notified', notifiedAt: new Date() })
    .where(eq(waitlist.id, person.id));
}
