import { pgTable, text, timestamp, integer, boolean, uuid, jsonb, primaryKey, date, unique } from 'drizzle-orm/pg-core';


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
  // Meta onboarding tracking (admin-only operational metadata)
  metaWebhookVerifiedAt: timestamp('meta_webhook_verified_at'),                // Alex marked webhook OK
  metaTokenExpiresAt: timestamp('meta_token_expires_at'),                      // token expiry for alerting
  onboardingTestMessageSentAt: timestamp('onboarding_test_message_sent_at'),   // first manual test OK
  onboardingNotes: text('onboarding_notes'),                                   // free-form admin notes
  // Booksy integration
  booksyProfileUrl: text('booksy_profile_url'),
  booksyServices: jsonb('booksy_services'), // scraped services from Booksy
  booksyInboundEmail: text('booksy_inbound_email').unique(), // sync-{clientId}@inbound.otracita.es
  useDbAvailability: boolean('use_db_availability').notNull().default(false), // feature flag: use DB instead of GCal for availability
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
  // Invoicing (what the barber emits to THEIR customers — tickets/facturas)
  fiscalName: text('fiscal_name'),                                             // legal/trade name on emitted invoices
  fiscalNif: text('fiscal_nif'),                                               // NIF/CIF of the emitting business
  fiscalAddress: text('fiscal_address'),
  fiscalCity: text('fiscal_city'),
  fiscalPostalCode: text('fiscal_postal_code'),
  ivaRate: integer('iva_rate').default(21).notNull(),                          // IVA percentage applied (Spain default 21%)
  invoicingEnabled: boolean('invoicing_enabled').default(false).notNull(),
  invoiceNumberPrefix: text('invoice_number_prefix').default('').notNull(),    // e.g. "FAC-2026-" (empty = numbers only)
  invoiceNumberNext: integer('invoice_number_next').default(1).notNull(),
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
  source: text('source').notNull().default('bot'), // 'bot' | 'booksy'
  booksyBookingId: text('booksy_booking_id'), // Booksy reference ID for dedup + update matching
  rawEmailSnippet: text('raw_email_snippet'), // first 500 chars of parsed email, for debugging
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

// Observability log for every Booksy inbound email parsed by /api/email/inbound.
// Used by the admin email-health dashboard to detect silent regex failures and
// LLM-assisted fallbacks BEFORE the client notices double-bookings in their
// calendar. One row = one Postmark inbound webhook delivery we processed.
export const emailParseLog = pgTable('email_parse_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id), // nullable — email may not match any client
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  toEmail: text('to_email'),
  fromEmail: text('from_email'),
  subject: text('subject'),
  rawSnippet: text('raw_snippet'), // first 2000 chars of body
  status: text('status').notNull(), // 'full' | 'partial' | 'failed' | 'unmatched_client' | 'llm_assisted'
  parseSource: text('parse_source'), // 'regex' | 'llm'
  parsedFields: jsonb('parsed_fields'), // the BooksyBookingData output
  missingFields: text('missing_fields').array(), // which fields failed to extract
  bookingId: uuid('booking_id').references(() => bookings.id), // if the email generated a booking
  alertSent: boolean('alert_sent').default(false),
  errorMessage: text('error_message'),
});

// Invoices / tickets emitted by the client (barbershop) to their own customers.
// Amounts stored in integer cents to avoid float drift. One row per fiscal doc.
// `bookingId` is nullable to allow future manual invoices (not auto-generated).
export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  bookingId: uuid('booking_id').references(() => bookings.id), // null = manual invoice
  number: text('number').notNull(),                            // "FAC-2026-0001" (unique per client)
  issueDate: date('issue_date').notNull(),
  // Customer snapshot at issue time (we don't FK to customers — name/phone is enough, and customer may be walk-in)
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  customerNif: text('customer_nif'),                           // null => ticket (B2C); set => factura (B2B)
  customerAddress: text('customer_address'),
  // Service snapshot (copied from booking at generation time so edits don't distort history)
  serviceName: text('service_name').notNull(),
  barberName: text('barber_name'),
  // Amounts in cents (EUR by default). Convention: price includes IVA (Spanish retail norm).
  subtotalCents: integer('subtotal_cents').notNull(),          // base imponible
  ivaRate: integer('iva_rate').notNull(),                      // percentage applied at issue time
  ivaAmountCents: integer('iva_amount_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  currency: text('currency').default('EUR').notNull(),
  type: text('type').notNull(),                                // 'ticket' | 'invoice'
  status: text('status').default('issued').notNull(),          // 'issued' | 'voided' | 'rectified'
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  clientNumberUnique: unique('invoices_client_number_unique').on(table.clientId, table.number),
}));

