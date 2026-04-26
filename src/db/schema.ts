import { pgTable, text, timestamp, integer, boolean, uuid, jsonb, primaryKey, date, unique } from 'drizzle-orm/pg-core';


// Clients (barbershops that buy our service)
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Business info
  businessName: text('business_name').notNull(),
  ownerName: text('owner_name').notNull(),
  email: text('email').notNull().unique(),
  // Email usado en Stripe Checkout — puede ser distinto del email de login.
  // Sirve para contactar por temas de facturación si hay pagos rechazados.
  // Stripe ya manda recibos a este email automáticamente.
  billingEmail: text('billing_email'),
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
  // Stripe (platform subscription — what the barber pays otracita)
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  // Stripe Connect (Express account — where the barber RECEIVES payments
  // from their own customers). The account is owned by the barber; we only
  // hold the reference. status transitions: 'none' -> 'pending' -> 'active'
  // (or 'restricted' if Stripe requires more info).
  stripeConnectAccountId: text('stripe_connect_account_id'),
  stripeConnectStatus: text('stripe_connect_status').default('none').notNull(),
  stripeConnectActivatedAt: timestamp('stripe_connect_activated_at', { withTimezone: true }),
  // Chatbot config
  // botName: the human name the bot introduces itself with ("Soy Raúl, el
  // asistente de Barbería X..."). Null ⇒ generic "Soy el asistente".
  botName: text('bot_name'),
  // botTone: define el registro que usa el LLM al responder. 'cercano' tutea
  // y usa emojis, 'neutro' sin emojis pero tuteo, 'formal' usa 'usted'.
  botTone: text('bot_tone').notNull().default('cercano'),
  chatbotGreeting: text('chatbot_greeting'),
  // Mensaje que el bot envía cuando un cliente escribe fuera del horario de
  // apertura. null = usa el mensaje genérico. Soporta placeholders como
  // {businessName} / {nextOpen}.
  botOutOfHoursMessage: text('bot_out_of_hours_message'),
  // Permitir al cliente cancelar su reserva escribiendo al WhatsApp del bot.
  // Si false, el bot le redirige a llamar / escribir al dueño.
  botAllowCancelWhatsapp: boolean('bot_allow_cancel_whatsapp').notNull().default(true),
  // Tras N no-shows el cliente se bloquea automáticamente del bot. Default 3.
  noShowBlockThreshold: integer('no_show_block_threshold').notNull().default(3),
  // Plantilla del recordatorio diario. null = plantilla por defecto.
  // Placeholders soportados: {name} {service} {time} {barber}.
  reminderTemplate: text('reminder_template'),
  // Link a la ficha de Google Reviews del negocio. Cuando el cliente valora
  // 5 estrellas en el follow-up, el bot le invita a dejar review con este link.
  googleReviewUrl: text('google_review_url'),
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
  // Tips / rating follow-up (post-servicio WhatsApp message asking for rating + optional tip).
  // Opt-in per barbershop — nothing fires if `tipsEnabled = false`. Amounts
  // in cents; 200/300/500 = 2€/3€/5€ defaults. `followupMinutesAfter` is the
  // delay (in minutes) between booking.endsAt and the follow-up message.
  tipsEnabled: boolean('tips_enabled').default(false).notNull(),
  tipsSuggestedCents: integer('tips_suggested_cents').array().default([200, 300, 500]).notNull(),
  followupMinutesAfter: integer('followup_minutes_after').default(30).notNull(),
  // Reseñas — opt-in independiente de propinas. Cuando está activo el cron
  // post-booking-followup envía la solicitud de valoración tras endsAt +
  // followupMinutesAfter. El barbero puede pedir reseñas sin tener Stripe
  // Connect ni propinas online configurados; si encima `tipsEnabled` está
  // activo, el flow de tip se inserta dentro del de rating cuando la nota
  // es ≥ 4.
  ratingsEnabled: boolean('ratings_enabled').default(false).notNull(),
  // Loyalty / fidelización — opt-in por barbería. Toda la config (sellos
  // necesarios, recompensa, servicios elegibles, precio mínimo, caducidad)
  // vive en `loyaltyConfig` jsonb cuya shape varía según `loyaltyMode`. Ver
  // src/lib/loyalty/types.ts para el contrato. El saldo por cliente se
  // computa vía SUM(delta) sobre la tabla `loyalty_ledger` (append-only).
  loyaltyEnabled: boolean('loyalty_enabled').default(false).notNull(),
  loyaltyMode: text('loyalty_mode').default('stamps').notNull(),         // 'stamps' | 'points'
  loyaltyConfig: jsonb('loyalty_config').default({}).notNull(),
  // Promos contextuales — opt-in. Cuando true, aparece el botón "Llenar
  // huecos" en /dashboard/agenda. El barbero declara que sus clientes han
  // consentido recibir comunicaciones de marketing al activarlo.
  promosEnabled: boolean('promos_enabled').default(false).notNull(),
  // Scheduling standards (Booksy/Treatwell conventions)
  // minLeadTimeMinutes: how far in advance a customer can book. Prevents
  //   "book in 2 minutes" scenarios where the barber wouldn't even see it.
  // maxBookingHorizonDays: how far into the future bookings can land.
  //   Caps "book 2 years from now" and keeps the slot picker useful.
  // serviceBufferMinutes: padding after each service for cleanup/prep. The
  //   slot picker adds this to `duration` when checking overlap.
  minLeadTimeMinutes: integer('min_lead_time_minutes').default(15).notNull(),
  maxBookingHorizonDays: integer('max_booking_horizon_days').default(45).notNull(),
  // slotStepMinutes: granularidad del paso al generar huecos (Booksy-style).
  // 15 = ofrecer slot cada 15 min si el servicio cabe entero (rellena micro-gaps).
  // 30 o 45 = más conservador, menos huecos pero más "limpios".
  slotStepMinutes: integer('slot_step_minutes').default(15).notNull(),
  serviceBufferMinutes: integer('service_buffer_minutes').default(5).notNull(),
  // Public booking page (/b/[slug]) — the shareable link a barber can drop
  // on Instagram, Google Business Profile, flyers, email signatures, etc.
  // Slug is globally unique and URL-safe. The branding fields below drive
  // the visual identity of that page and of any OG share preview.
  publicSlug: text('public_slug').unique(),
  publicEnabled: boolean('public_enabled').default(true).notNull(),
  brandLogoUrl: text('brand_logo_url'),
  brandLogoAltUrl: text('brand_logo_alt_url'),               // logo para fondo oscuro (solo si principal tira a oscuro)
  brandCoverUrl: text('brand_cover_url'),
  brandTheme: text('brand_theme').notNull().default('light'),  // 'light' | 'dark' — drives bg/ink tokens
  brandColor: text('brand_color'),                             // hex accent color (selected states, CTAs)
  brandColorSecondary: text('brand_color_secondary'),          // deprecated — legacy; no longer read by /b/[slug]
  publicDescription: text('public_description'),             // short "about" paragraph
  instagramHandle: text('instagram_handle'),                 // without @
  tiktokHandle: text('tiktok_handle'),                       // without @
  facebookUrl: text('facebook_url'),
  websiteUrl: text('website_url'),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  onboardedAt: timestamp('onboarded_at'),
});

// App users — end-customer accounts for the per-barbería PWA.
// Identity is phone-based and GLOBAL across barberías (one Alex logs in
// once, can use any barbería's app). Linkage to per-barbería `customers`
// rows is done on-the-fly by phone when needed for reservations, loyalty,
// reputation. Kept separate so a customer deletion at tenant level doesn't
// nuke their cross-tenant account.
export const appUsers = pgTable('app_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: text('phone').notNull().unique(),        // E.164 (+34...)
  name: text('name'),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Short-lived OTP codes sent via WhatsApp for PWA login. Code is stored
// hashed (SHA-256) — even a DB leak doesn't let an attacker login within
// the 10-minute window. Attempts counter rate-limits brute force.
export const appOtpCodes = pgTable('app_otp_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  attempts: integer('attempts').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Web Push subscriptions — one per installed-device per app_user. Each
// subscription is tied to a specific barbería context so we only send
// push from barberías the user cares about (if they installed 2 apps,
// they get 2 subscriptions with the same user but different clientId).
// endpoint is globally unique across the push service; we dedupe on it.
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => appUsers.id),
  clientId: uuid('client_id').references(() => clients.id),   // nullable for cross-barbería nudges
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  authKey: text('auth_key').notNull(),
  userAgent: text('user_agent'),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
});

// Active PWA sessions. Token cookie stores the raw value; DB stores
// SHA-256 hash of it. Refreshed lastUsedAt on every request.
export const appSessions = pgTable('app_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => appUsers.id),
  tokenHash: text('token_hash').notNull().unique(),
  clientId: uuid('client_id').references(() => clients.id),   // where they first logged in
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
});

// Barbers (staff per client) — before this table existed the team lived as a
// loose jsonb array of {name} on clients.booksyServices. That couldn't hold
// per-person schedule or blocked dates, which is the Booksy/Treatwell norm:
// each staff member works their own hours, takes their own days off, and the
// availability picker intersects them.
//
// `hours` and `blockedDates` are nullable so a barber can *inherit* the
// shop-wide clients.chatbotHours / clients.blockedDates — new barbershops
// start simple (everyone on shop hours) and add per-person exceptions when
// they need them, matching how barbers onboard in Booksy.
export const barbers = pgTable('barbers', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  hours: jsonb('hours'),                                             // same shape as clients.chatbotHours; null = inherit
  blockedDates: jsonb('blocked_dates').$type<string[]>().default([]).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  // Public-page assets. Optional — falls back to name-only rendering.
  photoUrl: text('photo_url'),
  bio: text('bio'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  clientNameUnique: unique('barbers_client_name_unique').on(table.clientId, table.name),
}));

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
  // Canonical barber reference — every new booking must resolve this to a
  // real row in `barbers` at confirmation time. The free-text `barber`
  // column is kept for backward compat and historic rows; new writes set
  // both (barberId → barbers.id, barber → barbers.name snapshot) so legacy
  // reads keep working.
  barberId: uuid('barber_id'),
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
  // Set when the post-service follow-up WhatsApp (rating + optional tip) has
  // been sent for this booking. Prevents duplicate sends when the cron runs
  // every 10 minutes. Null = not sent yet (or barbershop has tipsEnabled=false).
  followupSentAt: timestamp('followup_sent_at', { withTimezone: true }),
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

// Stripe webhook idempotency ledger. Every incoming event is INSERT-ed on
// arrival with `ON CONFLICT DO NOTHING`; if the insert returns no row, the
// event was already processed and we ack without doing anything else. This
// turns Stripe's at-least-once delivery into effectively exactly-once.
export const processedStripeEvents = pgTable('processed_stripe_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
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
  // When the associated online payment (via Stripe Checkout) succeeds we
  // record the timestamp here. We do NOT change `status` — the fiscal
  // lifecycle (issued/voided/rectified) is independent from whether the
  // customer chose to settle via the QR-code flow.
  paidOnlineAt: timestamp('paid_online_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // ── VeriFactu (RD 1007/2023 + Orden HAC/1177/2024) ─────────────────────
  // huella: SHA-256 hex upper 64 chars del RegistroAlta de esta factura.
  // huella_anterior: huella del registro anterior del MISMO emisor (clientId).
  // Chain completa → auditable. Si huella_anterior IS NULL → primer registro
  // del SIF para ese emisor (is_primer_registro=true).
  huella: text('huella'),
  huellaAnterior: text('huella_anterior'),
  isPrimerRegistro: boolean('is_primer_registro').default(false).notNull(),
  // tipo_factura L1 AEAT: F1 (ordinaria) | F2 (simplificada) | F3 (sust. asentada) | R1..R5 (rectificativas)
  tipoFactura: text('tipo_factura').default('F1').notNull(),
  // Timestamp de GENERACIÓN del registro (parte del hash; DEBE quedar fijo).
  fechaHoraHusoGen: timestamp('fecha_hora_huso_gen', { withTimezone: true }),
  // URL completa al servicio de cotejo AEAT (embebida en el QR).
  qrUrl: text('qr_url'),
  // Estado del envío a AEAT: pending|sent|accepted|accepted_with_errors|rejected|error
  verifactuStatus: text('verifactu_status').default('pending').notNull(),
  verifactuSentAt: timestamp('verifactu_sent_at', { withTimezone: true }),
  verifactuResponseAt: timestamp('verifactu_response_at', { withTimezone: true }),
  verifactuErrorCode: text('verifactu_error_code'),
  verifactuErrorMsg: text('verifactu_error_msg'),
  verifactuXmlSent: text('verifactu_xml_sent'),
  verifactuXmlResponse: text('verifactu_xml_response'),
  verifactuRetryCount: integer('verifactu_retry_count').default(0).notNull(),
  // Rectificativa: referencia a la factura original + motivo R1-R5.
  rectifiesInvoiceId: uuid('rectifies_invoice_id'),
  rectificationMotivo: text('rectification_motivo'),
  // Anulación: timestamp + hash del RegistroAnulacion encadenado.
  anuladaAt: timestamp('anulada_at', { withTimezone: true }),
  anulacionHuella: text('anulacion_huella'),
}, (table) => ({
  clientNumberUnique: unique('invoices_client_number_unique').on(table.clientId, table.number),
}));

// -----------------------------------------------------------------------------
// invoice_registro_events — Libro de eventos del SIF (AEAT VeriFactu).
//
// RD 1007/2023 exige registrar eventos del sistema de facturación: altas,
// anulaciones y eventos propios del sistema (arranque, error, cambio de
// versión). Cada evento encadena con el anterior (huella SHA-256).
//
// El campo `invoice_id` es nullable porque los eventos del sistema no
// referencian a una factura concreta.
// -----------------------------------------------------------------------------
export const invoiceRegistroEvents = pgTable('invoice_registro_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  eventType: text('event_type').notNull(),  // 'alta' | 'anulacion' | 'sistema'
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  huella: text('huella'),
  huellaAnterior: text('huella_anterior'),
  fechaHoraHusoGen: timestamp('fecha_hora_huso_gen', { withTimezone: true }).defaultNow().notNull(),
  xmlPayload: text('xml_payload'),
  verifactuStatus: text('verifactu_status').default('pending').notNull(),
  verifactuSentAt: timestamp('verifactu_sent_at', { withTimezone: true }),
  verifactuResponseAt: timestamp('verifactu_response_at', { withTimezone: true }),
  verifactuErrorCode: text('verifactu_error_code'),
  verifactuErrorMsg: text('verifactu_error_msg'),
  data: jsonb('data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Online payments — money flowing from the END CUSTOMER to the BARBER via
// Stripe Connect (destination charges). Rows are created when the barber
// generates a payment link for a booking; the Stripe webhook flips status
// to 'succeeded' on `checkout.session.completed`.
//
// Amount fields are in cents (EUR). `stripeCheckoutSessionId` is UNIQUE to
// make webhook retries idempotent at the DB level (belt + braces with the
// `processed_stripe_events` ledger).
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  // Stripe identifiers — populated as the flow progresses
  stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  // Amounts (cents)
  amountCents: integer('amount_cents').notNull(),
  applicationFeeCents: integer('application_fee_cents').default(0).notNull(),
  currency: text('currency').default('eur').notNull(),
  // Flow
  type: text('type').notNull(),       // 'full' | 'deposit'  (MVP only 'full')
  status: text('status').notNull(),   // 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled'
  description: text('description'),   // shown on Stripe Checkout and receipt
  paymentLinkUrl: text('payment_link_url'),  // hosted Stripe Checkout URL
  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Tips — customer-chosen amounts paid AFTER a service, plus the rating
// (1-5 ⭐) the customer gave. Completely separate from `payments` because:
//   · tips are NEVER invoiceable in ES (liberalidad, no contraprestación)
//   · rating is a concept that only exists for tips / post-service flows
//   · exports for the gestor treat tips as a separate section (renta but
//     not factura)
//
// Lifecycle:
//   pending  -> checkout session created, waiting for customer
//   paid     -> webhook confirmed, funds in barber's Stripe balance
//   expired  -> checkout session expired before customer paid
//   refunded -> barber refunded the tip (rare)
//   failed   -> payment attempt failed
//
// A row may exist with `status = 'pending'` and no payment at all when the
// customer gave a rating but skipped the tip. In that case `amountCents = 0`
// and `stripeCheckoutSessionId = null` — the row is kept for the rating.
export const tips = pgTable('tips', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  bookingId: uuid('booking_id').references(() => bookings.id),     // may be null for spontaneous tips
  // Stripe identifiers — populated when an actual payment is initiated
  stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  // Amount in cents (0 = rating without tip)
  amountCents: integer('amount_cents').default(0).notNull(),
  currency: text('currency').default('eur').notNull(),
  status: text('status').notNull(),  // 'pending' | 'paid' | 'expired' | 'refunded' | 'failed' | 'rating_only'
  // Snapshots (so history stays correct even if barber renames)
  customerPhone: text('customer_phone').notNull(),
  barberName: text('barber_name'),
  // Rating (1-5). Null = customer didn't rate (e.g. only paid a tip).
  rating: integer('rating'),
  ratingComment: text('rating_comment'),
  paymentLinkUrl: text('payment_link_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Loyalty ledger — append-only record de cada sello/punto. El saldo del
// cliente = SUM(delta) filtrado por (clientId, customerId). Nunca mutamos
// filas, solo añadimos. Auditoría completa si un cliente reclama.
//
// delta > 0 = earn (normalmente booking_completed en el cron).
// delta < 0 = canje / ajuste a la baja.
// reason clasifica el motivo; note admite texto libre del barbero para
// ajustes manuales. rewardSnapshot captura qué se canjeó, para que
// renombrar servicios no rompa la auditoría.
//
// Idempotencia del cron: índice parcial UNIQUE sobre (booking_id) donde
// reason='booking_completed'. El awarder puede reintentar sin duplicar.
export const loyaltyLedger = pgTable('loyalty_ledger', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  bookingId: uuid('booking_id').references(() => bookings.id),             // null para ajustes manuales
  delta: integer('delta').notNull(),                                       // +N earn / -N canje
  reason: text('reason').notNull(),                                        // 'booking_completed' | 'redeem' | 'adjustment_manual' | 'expired'
  note: text('note'),                                                      // texto libre del barbero
  rewardSnapshot: jsonb('reward_snapshot'),                                // snapshot de la recompensa canjeada
  createdBy: text('created_by').notNull(),                                 // 'system_cron' | 'barber:<clientId>' | 'customer:<userId>'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Reseñas — almacén canónico de valoraciones de clientes a barberías.
//
// Antes vivían embebidas en la tabla `tips` con `status='rating_only'`
// porque el flow original las acoplaba al pago de propina. Ahora son una
// entidad independiente: el barbero puede pedir reseñas sin haber
// configurado Stripe Connect (recibe la valoración por WhatsApp/PWA pero
// no la propina). Si encima tiene propinas activas, se crea además un
// `tips` row enlazado por bookingId.
//
// `channel` distingue el origen para métricas: WhatsApp envía interactive
// list (5 estrellas tappables); PWA muestra una pantalla rica con estrellas
// + comentario opcional + opcionalmente CTA propina.
//
// UNIQUE parcial sobre booking_id evita doble valoración de la misma
// reserva (el barbero podría tener un cliente que respondió tanto en
// WhatsApp como en la PWA — solo guardamos la primera).
export const ratings = pgTable('ratings', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  customerPhone: text('customer_phone').notNull(),
  customerName: text('customer_name'),
  barberName: text('barber_name'),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  channel: text('channel').notNull(),                                      // 'whatsapp' | 'pwa'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Promo pushes log — una fila por cada cliente al que se le mandó una
// promo "llenar huecos". Sirve para dos cosas:
//   1. Rate limiting: máx 1 promo / cliente / 7 días (consultable vía
//      WHERE customerPhone=X AND createdAt > now()-7d).
//   2. Auditoría: el barbero puede ver el histórico de qué promos mandó
//      y a quién, por si hay reclamaciones del cliente.
//
// `discountPct` se snapshot-ea aquí porque el barbero podría cambiar el
// default después y queremos preservar lo que efectivamente se ofreció.
export const promoPushes = pgTable('promo_pushes', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  customerPhone: text('customer_phone').notNull(),
  customerName: text('customer_name'),
  discountPct: integer('discount_pct').notNull(),
  windowStart: text('window_start').notNull(),                             // YYYY-MM-DD HH:MM legible
  windowEnd: text('window_end').notNull(),
  channel: text('channel').notNull(),                                      // 'push' | 'whatsapp' | 'none'
  message: text('message').notNull(),                                      // snapshot del texto enviado
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

