import { pgTable, text, timestamp, integer, boolean, uuid, jsonb, primaryKey } from 'drizzle-orm/pg-core';


// Clients (barbershops that buy our service)
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Business info
  businessName: text('business_name').notNull(),
  ownerName: text('owner_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  whatsappNumber: text('whatsapp_number'), // their business WhatsApp number
  city: text('city').default('Barcelona'),
  address: text('address'),
  // WhatsApp Cloud API
  whatsappPhoneNumberId: text('whatsapp_phone_number_id'), // Meta phone number ID
  whatsappAccessToken: text('whatsapp_access_token'), // per-client or shared token
  // Booksy integration
  booksyProfileUrl: text('booksy_profile_url'),
  booksyServices: jsonb('booksy_services'), // scraped services from Booksy
  // Google Calendar
  googleCalendarId: text('google_calendar_id'),
  googleCalendarConnected: boolean('google_calendar_connected').default(false),
  // Status
  status: text('status').notNull().default('pending'), // pending, onboarding, active, paused, cancelled
  plan: text('plan').notNull().default('chatbot'), // chatbot, ads, full
  // Stripe
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  // Chatbot config
  chatbotGreeting: text('chatbot_greeting'),
  chatbotServices: jsonb('chatbot_services'), // array of services they offer
  chatbotHours: jsonb('chatbot_hours'), // business hours
  blockedDates: jsonb('blocked_dates').$type<string[]>().default([]),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  onboardedAt: timestamp('onboarded_at'),
});

// Subscriptions tracking
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull(),
  plan: text('plan').notNull(), // chatbot, ads, full
  amount: integer('amount').notNull(), // in cents
  currency: text('currency').default('eur'),
  status: text('status').notNull(), // active, past_due, cancelled, trialing
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Analytics per client
export const analytics = pgTable('analytics', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  date: timestamp('date').notNull(),
  messagesReceived: integer('messages_received').default(0),
  messagesReplied: integer('messages_replied').default(0),
  bookingsMade: integer('bookings_made').default(0),
  bookingsCancelled: integer('bookings_cancelled').default(0),
});

// Conversation state for the WhatsApp chatbot
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  customerPhone: text('customer_phone').notNull(),
  step: text('step').notNull().default('idle'),
  selectedService: text('selected_service'),
  selectedSlot: text('selected_slot'),
  context: jsonb('context'), // any extra state
  lastInteraction: timestamp('last_interaction').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Customers (end-users who message the bot)
export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  phone: text('phone').notNull(),
  name: text('name'),
  totalBookings: integer('total_bookings').default(0),
  noShows: integer('no_shows').default(0),
  cancellations: integer('cancellations').default(0),
  reputation: text('reputation').default('good'), // good, warning, blocked
  lastBookingAt: timestamp('last_booking_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Bookings
export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerName: text('customer_name'),
  service: text('service').notNull(),
  barber: text('barber'),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time').notNull(), // HH:MM
  duration: integer('duration').notNull(), // minutes
  price: integer('price'), // euros
  status: text('status').notNull().default('confirmed'), // confirmed, cancelled, completed, no_show
  googleEventId: text('google_event_id'),
  reminderSent: boolean('reminder_sent').default(false),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Waitlist (customers waiting for a slot to open)
export const waitlist = pgTable('waitlist', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerName: text('customer_name'),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time'), // HH:MM — null means "any slot on that day"
  service: text('service'),
  barber: text('barber'),
  status: text('status').notNull().default('waiting'), // waiting, notified, booked, expired
  notifiedAt: timestamp('notified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Leads from the website (people who submit the contact form but haven't paid yet)
export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  businessName: text('business_name'),
  phone: text('phone').notNull(),
  email: text('email'),
  message: text('message'),
  source: text('source').default('website'), // website, whatsapp, referral
  status: text('status').default('new'), // new, contacted, converted, lost
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

