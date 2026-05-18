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
  plan: text('plan').notNull().default('chatbot'), // LEGACY chatbot/ads/full — kept for compat, prefer `tier` below
  // New tier system per PRODUCT.md (Solo gratis / Pro 49€ / Estudio 99€).
  // Backfill rule: chatbot→pro, full→estudio, anything else→solo.
  // `solo` is the default for new signups (free tier, no Stripe).
  tier: text('tier').notNull().default('solo'), // solo | pro | estudio
  // null when on `solo` (no Stripe). monthly | annual otherwise.
  billingInterval: text('billing_interval'), // monthly | annual | null
  // Trial window. Set on Pro signup (14 días). null on Solo y Estudio.
  trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
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
  // Reseñas — opt-in independiente de propinas. La solicitud de valoración
  // se dispara cuando la cita pasa a status='completed' (botón manual del
  // barbero o sweep diario del cron de reminders pasados 3 días). El
  // barbero puede pedir reseñas sin tener Stripe Connect ni propinas
  // online configurados; si encima `tipsEnabled` está activo, el flow
  // de tip se inserta dentro del de rating cuando la nota
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
  // Google Tag Manager — opcional, feature Pro. Si el barbero pega aquí
  // su container ID (formato GTM-XXXXXX), inyectamos el snippet de GTM
  // en /b/[slug]/* y disparamos `booking_confirmed` en dataLayer al
  // confirmar reserva. Permite al barbero medir conversiones con sus
  // propios pixels (Meta, Google Ads, GA4) sin que tengamos que tocar
  // código por cada herramienta. Cookie consent obligatorio antes de
  // cargar (Consent Mode v2).
  gtmContainerId: text('gtm_container_id'),
  // Caja efectivo — opt-in. Cuando true, el barbero puede abrir/cerrar
  // sesión de caja en /dashboard/caja, y al marcar una cita como completada
  // se le pide método de pago (cash/card/online) para alimentar el cuadre
  // del día. Pensado para locales con efectivo y/o datáfono físico que
  // necesitan conciliar al final del día. Sin esto activo, nada cambia.
  cashRegisterEnabled: boolean('cash_register_enabled').default(false).notNull(),
  // Integración SumUp — el barbero conecta su cuenta SumUp via OAuth +
  // parea su Reader físico. Cobros se inician desde otracita via Cloud
  // API; SumUp llama a return_url cuando termina y cash_movement se
  // crea al instante (push, no polling).
  sumupAccessToken: text('sumup_access_token'),
  sumupRefreshToken: text('sumup_refresh_token'),
  sumupMerchantCode: text('sumup_merchant_code'),
  sumupTokenExpiresAt: timestamp('sumup_token_expires_at', { withTimezone: true }),
  sumupReaderId: text('sumup_reader_id'),                // Reader pareado para iniciar checkouts
  sumupReaderName: text('sumup_reader_name'),            // nombre legible para UI
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
  // Perfil de pago — 5 piezas que se combinan para calcular nómina mensual.
  // null en salaryType = sin configurar (no aparece en /finanzas/nóminas).
  // Tres presets en UI: fijo (solo base), mixto (base + comisiones),
  // autonomo (comisiones + alquiler de silla). Pero TODOS los campos son
  // independientes — el dueño puede combinar como quiera.
  salaryType: text('salary_type'),                                   // 'fijo' | 'mixto' | 'autonomo' | null
  salaryBaseCents: integer('salary_base_cents').default(0).notNull(),
  commissionServicesPct: integer('commission_services_pct').default(0).notNull(),  // 0-100
  commissionProductsPct: integer('commission_products_pct').default(0).notNull(),  // 0-100
  chairRentCents: integer('chair_rent_cents').default(0).notNull(),  // Lo que el barbero PAGA al local (autónomo)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  clientNameUnique: unique('barbers_client_name_unique').on(table.clientId, table.name),
}));

// Descansos recurrentes (semanales) por barbero — el "Descanso" inset bajo
// cada día en el editor de turnos (screenshots 10.17.35 / 10.18.21). UNA fila
// por (barbero, weekday, franja): un barbero puede tener varios descansos el
// mismo día (p.ej. 13:00-14:00 comida + 17:00-17:15 café).
//
// IMPORTANTE: tabla ADITIVA. El campo `barbers.hours` (string legacy
// "10:00-20:00") NO se toca jamás — sigue siendo la fuente del horario de
// apertura. La disponibilidad RESTA estas franjas del rango abierto. Un
// barbero sin filas aquí produce exactamente los mismos slots que antes
// (no-regresión, ver availability.test.ts).
//
// `weekday`: 0=domingo … 6=sábado (mismo índice que Date.getUTCDay(), el que
// ya usa hoursForDate en availability.ts — un solo convenio en todo el motor).
export const barberBreaks = pgTable('barber_breaks', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  barberId: uuid('barber_id').notNull().references(() => barbers.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),                              // 0=dom … 6=sáb
  startTime: text('start_time').notNull(),                            // HH:MM
  endTime: text('end_time').notNull(),                                // HH:MM
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Bloqueos puntuales por barbero — "Falta de disponibilidad" (franja de un
// día concreto, screenshot 09.39.52) y "Ausencias" de día completo
// (vacaciones / enfermedad / formación, screenshot 10.22.23). A diferencia de
// barberBreaks (recurrente semanal), esto es EXCEPCIONAL: una fecha concreta.
//
// `startTime`/`endTime` null ⇒ día completo (ausencia "Todo el día"). Con
// valores ⇒ franja parcial de ese día ("Falta de disponibilidad" 16:00-16:15).
// `kind`: 'block' = falta de disponibilidad ad-hoc · 'absence' = ausencia con
// motivo. `reason` solo aplica a 'absence' (Día personal/Enfermedad/
// Vacaciones/Formación). `note` es texto libre opcional (campo "Nota" de
// 09.39.52). También aditiva — la disponibilidad la resta igual que los
// breaks; `barbers.blockedDates` (días completos legacy) sigue funcionando
// en paralelo sin cambios.
export const barberBlocks = pgTable('barber_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  barberId: uuid('barber_id').notNull().references(() => barbers.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),                                       // YYYY-MM-DD
  startTime: text('start_time'),                                      // HH:MM · null = todo el día
  endTime: text('end_time'),                                          // HH:MM · null = todo el día
  kind: text('kind').notNull(),                                       // 'block' | 'absence'
  reason: text('reason'),                                             // solo absence: 'personal'|'enfermedad'|'vacaciones'|'formacion'|null
  note: text('note'),                                                 // texto libre opcional
  approved: boolean('approved').default(true).notNull(),              // toggle "Aprobado" de 10.22.23
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Bonos del local. UN catálogo por barbería: el dueño define qué bonos
// existen (reseñas, upsell, cortes, etc.) y cualquier barbero puede
// acumular progreso hacia ellos. Manual-only v1 — el dueño teclea desde
// caja al cierre del día.
//
// `unit`: 'units' (reseñas, ventas, cortes) o 'euros' (€ facturados).
// `target`: lo que hay que alcanzar para cobrar la recompensa.
// `rewardCents`: lo que cobra QUIEN llegue al target (cada barbero
// independientemente).
export const bonuses = pgTable('bonuses', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),                                       // p.ej. "Reseñas Google"
  // Tipo de bono (R9). 'meta' = todo-o-nada (comportamiento histórico,
  // único hasta ahora). 'tramo' = pago proporcional al progreso (cobras
  // la fracción alcanzada del objetivo, capada a la recompensa total).
  // DEFAULT 'meta' → filas existentes y el cálculo previo intactos.
  kind: text('kind').default('meta').notNull(),                       // 'meta' | 'tramo'
  unit: text('unit').notNull(),                                       // 'units' | 'euros'
  target: integer('target').notNull(),                                // si unit=euros, en cents
  rewardCents: integer('reward_cents').notNull(),                     // siempre cents
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Entries de progreso. Cada fila = "el barbero X sumó Y al bono Z el día D".
// Multiple barberos pueden sumar al MISMO bono — cada uno acumula su propio
// progreso. El día del cierre el dueño introduce N entries (uno por
// barbero × bono que sumó algo).
//
// `value` sigue la misma unidad del bono:
//   bonuses.unit='units' → entries.value es unidades enteras
//   bonuses.unit='euros' → entries.value es cents
export const bonusEntries = pgTable('bonus_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  bonusId: uuid('bonus_id').notNull().references(() => bonuses.id, { onDelete: 'cascade' }),
  barberId: uuid('barber_id').notNull().references(() => barbers.id),
  value: integer('value').notNull(),
  date: text('date').notNull(),                                       // YYYY-MM-DD
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// R8 — comisión de servicios POR-SERVICIO (override del % global).
//
// La base Pro tiene UN `barbers.commissionServicesPct` global por barbero.
// Esta tabla permite afinar: "Dani cobra 50% en cortes pero 30% en barba".
// Sin fila para (barbero, servicio) ⇒ se usa el % global de antes (no hay
// regresión: un local que nunca toque esto calcula la nómina igual).
//
// `serviceName` = nombre del servicio. El catálogo es jsonb sin ID estable
// (`clients.chatbotServices`) y `bookings.service` es texto libre, así que
// el match es por NOMBRE exacto — mismo patrón que loyalty/promos.
export const barberServiceCommissions = pgTable('barber_service_commissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  barberId: uuid('barber_id').notNull().references(() => barbers.id, { onDelete: 'cascade' }),
  serviceName: text('service_name').notNull(),
  pct: integer('pct').notNull(),                                      // 0-100
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePerService: unique('barber_service_commissions_unique').on(
    table.clientId, table.barberId, table.serviceName,
  ),
}));

// R10 — competición semanal de equipo. El local define UNA competición
// (o varias) con una métrica; cada semana ISO hay UN ganador zero-sum que
// cobra `rewardCentsPerWeek`. Si el mismo barbero gana `streakWeeksForBonus`
// semanas seguidas, cobra además `streakBonusCents`.
//
// Payout STANDALONE v1: no entra en la nómina mensual ni en el P&L —
// vive en su propio panel en la pestaña Comisiones. Estructura preparada
// para plegarlo a nóminas más adelante sin migración destructiva.
export const teamCompetitions = pgTable('team_competitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  // Métrica que decide el ganador de la semana.
  //   'revenue'  → € facturados (bookings.price completados)
  //   'bookings' → nº de citas completadas
  metric: text('metric').notNull(),                                   // 'revenue' | 'bookings'
  rewardCentsPerWeek: integer('reward_cents_per_week').notNull(),
  streakWeeksForBonus: integer('streak_weeks_for_bonus').default(4).notNull(),
  streakBonusCents: integer('streak_bonus_cents').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Resultado CONGELADO de una semana ISO (lazy-compute-but-freeze-once).
// El ganador se computa al LEER; la PRIMERA lectura tras cerrarse la
// semana ISO persiste aquí `winnerBarberId` + `computedAt` y nunca se
// recomputa — blinda el histórico contra ediciones retroactivas de
// ventas o rectificativas. UNA fila por (competición, semana) = zero-sum.
export const teamCompetitionWeeks = pgTable('team_competition_weeks', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  competitionId: uuid('competition_id').notNull()
    .references(() => teamCompetitions.id, { onDelete: 'cascade' }),
  isoWeekStart: text('iso_week_start').notNull(),                     // YYYY-MM-DD (lunes ISO)
  winnerBarberId: uuid('winner_barber_id').references(() => barbers.id),
  winnerMetricValue: integer('winner_metric_value'),                  // € en cents o nº citas
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePerWeek: unique('team_competition_weeks_unique').on(
    table.competitionId, table.isoWeekStart,
  ),
}));

// Subscriptions tracking
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull(),
  plan: text('plan').notNull(), // LEGACY chatbot/ads/full
  // Mirrors clients.tier — useful for historical record (a client could have
  // upgraded/downgraded over time).
  tier: text('tier'), // solo | pro | estudio
  billingInterval: text('billing_interval'), // monthly | annual
  amount: integer('amount').notNull(), // in cents
  currency: text('currency').default('eur'),
  status: text('status').notNull(), // active, past_due, cancelled, trialing
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
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
  // Email del cliente (opcional). Lo captura el form público de reserva
  // o lo edita el barbero en /dashboard/clientes. Per-tenant igual que
  // phone/name: la misma persona en 2 barberías son 2 filas distintas
  // (no dedup cross-tenant — sería un problema de multi-tenancy). Si el
  // teléfono coincide con un app_users con email, se rellena UNA vez al
  // crear el customer (nunca sobrescribe un email puesto por el barbero).
  email: text('email'),
  totalBookings: integer('total_bookings').default(0),
  noShows: integer('no_shows').default(0),
  cancellations: integer('cancellations').default(0),
  reputation: text('reputation').default('good'), // good, warning, blocked
  lastBookingAt: timestamp('last_booking_at'),
  // Notas libres del barbero sobre este cliente, visibles solo en el
  // dashboard. Útil para apuntar cosas tipo "alérgico a X", "no le
  // gustan los degradados", "siempre llega tarde 5 min". Privadas: nunca
  // se exponen al cliente vía PWA ni se mandan por WhatsApp.
  barberNotes: text('barber_notes'),
  // First-touch attribution — de dónde vino este cliente la PRIMERA vez.
  // Se setea al crear el customer (primera reserva) y NO se sobrescribe
  // después. Sirve para el barbero saber qué canal le trae clientes
  // nuevos (decisión de inversión en ads). Valores normalizados:
  // 'instagram', 'google_ads', 'google_organic', 'facebook', 'tiktok',
  // 'whatsapp_bot', 'walk_in', 'referral', 'direct', 'other'.
  firstSource: text('first_source'),
  firstSourceMedium: text('first_source_medium'),     // cpc | organic | social | referral | none
  firstSourceCampaign: text('first_source_campaign'), // utm_campaign si vino vía ads
  firstSourceCapturedAt: timestamp('first_source_captured_at', { withTimezone: true }),
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
  source: text('source').notNull().default('bot'), // 'bot' | 'booksy' | 'web' | 'manual' | 'voice'
  // Last-touch attribution — de dónde vino el cliente en ESTA reserva
  // concreta. Distinto a `source` (canal técnico: bot/web/manual). El
  // mismo cliente puede tener bookings con `referrerSource` distintos
  // (vino primero por Instagram, luego directo, luego Google Ads).
  // Sirve para optimizar campañas tácticas. Null si no se capturó UTM
  // ni referrer útil (caso normal en bot/manual/voice).
  referrerSource: text('referrer_source'),
  referrerMedium: text('referrer_medium'),
  referrerCampaign: text('referrer_campaign'),
  booksyBookingId: text('booksy_booking_id'), // Booksy reference ID for dedup + update matching
  rawEmailSnippet: text('raw_email_snippet'), // first 500 chars of parsed email, for debugging
  reminderSent: boolean('reminder_sent').default(false),
  // Set when the post-service follow-up WhatsApp (rating + optional tip) has
  // been sent for this booking. Prevents duplicate sends when the cron runs
  // every 10 minutes. Null = not sent yet (or barbershop has tipsEnabled=false).
  followupSentAt: timestamp('followup_sent_at', { withTimezone: true }),
  // Método de cobro — registrado al marcar la cita como `completed` cuando
  // el cliente tiene caja efectivo activa (cashRegisterEnabled). Null para
  // bookings legacy, futuros, o tenants sin caja activa. Alimenta el cuadre
  // diario en /dashboard/caja: cash, card (datáfono), online (Stripe).
  paymentMethod: text('payment_method'),
  // true SOLO si el cliente pidió explícitamente a este barbero al reservar
  // (vs auto-asignado por el resolver pickBarberForCustomer). Lo pinta el
  // ♥ "Solicitado por el cliente" en agenda + panel detalle (feedback A2).
  // Aditiva, default false → callers existentes no se ven afectados; se
  // pone a true en createBooking solo cuando barberId vino explícito.
  barberRequested: boolean('barber_requested').default(false).notNull(),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// booking_services — servicios EXTRA de una cita multi-servicio (R7).
//
// Tabla ADITIVA. El servicio PRINCIPAL sigue viviendo en las columnas snapshot
// de `bookings` (`service`/`duration`/`price`) — eso mantiene compatibles la
// agenda, loyalty, followup y los 4 callers de createBooking que no envían
// multi-servicio. Aquí solo se guardan los servicios añadidos por encima del
// principal.
//
// `durationMin` se SUMA al snapshot `bookings.duration` al crear/editar
// (ver src/lib/bookings/duration.ts) para que el chequeo de solape reserve el
// hueco real. `priceEuros` es EUROS (igual que `bookings.price`, foot-gun del
// schema) — la factura emite una línea por servicio (ver invoicing.ts).
// `displayOrder` 0..n para pintar en orden estable.
//
// ON DELETE CASCADE: si se borra/cancela la cita, sus extras se van con ella.
// -----------------------------------------------------------------------------
export const bookingServices = pgTable('booking_services', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  durationMin: integer('duration_min').notNull(), // minutos, > 0
  priceEuros: integer('price_euros'),             // EUROS (no céntimos), null = cortesía
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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

// Leads — pipeline de barberías a las que ofrecer otracita. Se llenan por
// tres vías: formulario público de la web (`/api/leads`), entrada manual
// desde el admin (`/admin/leads/nuevo`), o referrals importados a mano.
//
// `notes` es un cuaderno libre del admin: lo que se habló por teléfono,
// objeciones, contexto. Se acumula, no se sobreescribe convencionalmente
// (el admin puede prepender la fecha cada vez que añade).
//
// `nextActionAt` programa el próximo follow-up. Cuando vence (o está hoy)
// aparece como alerta en /admin home y como badge rojo en el sidebar.
//
// `convertedToClientId` cierra el loop: si el lead acaba pagando o se le
// crea cuenta manual, se enlaza al row de `clients`. Trazabilidad completa
// del funnel sin perder el contexto original (mensaje, fuente, fechas).
export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  businessName: text('business_name'),
  phone: text('phone').notNull(),
  email: text('email'),
  message: text('message'),
  source: text('source').default('website'),                                 // website | whatsapp | referral | manual | instagram | other
  status: text('status').default('new'),                                     // new | contacted | converted | lost
  notes: text('notes'),                                                      // cuaderno libre del admin
  nextActionAt: timestamp('next_action_at', { withTimezone: true }),         // próximo follow-up programado
  convertedToClientId: uuid('converted_to_client_id').references(() => clients.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Audit log — traza de toda acción operativa que un admin ejecuta desde el
// panel. La pregunta operativa habitual es "¿quién pausó al cliente X y
// cuándo?". Sin esta tabla, la respuesta vive en logs aplicación que
// caducan. Con ella, queda en DB para siempre.
//
// `intent` matchea el `intent` string que cada server action ya usa para
// rutar — así pasamos el mismo identificador al log sin reinventar enums.
// `targetType + targetId` apunta al objeto afectado (`client:<uuid>`,
// `lead:<uuid>`). `summary` es texto humano corto para mostrar.
// `metadata` admite jsonb si la acción merece guardar antes/después.
export const adminActions = pgTable('admin_actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  adminEmail: text('admin_email').notNull(),
  intent: text('intent').notNull(),
  targetType: text('target_type').notNull(),                                 // 'client' | 'lead' | 'invoice' | 'system'
  targetId: text('target_id'),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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

// Productos que la barbería vende (champú, ceras, peines, etc.). Modelo
// inicial = venta MANUAL al cobrar — el barbero registra cada venta desde
// el dashboard cuando vende un producto al cliente. La tienda online en
// /b/[slug] vendrá en una fase posterior si los datos lo justifican.
//
// `stockQuantity` nullable significa stock ilimitado (no se trackea). Si
// se pone valor concreto, el endpoint de venta valida con UPDATE atómico.
//
// `imageUrl` opcional — Vercel Blob pathname. UI muestra placeholder si null.
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  priceCents: integer('price_cents').notNull(),                            // IVA incluido — el barbero ingresa precio final
  stockQuantity: integer('stock_quantity'),                                // null = ilimitado / no trackeado
  active: boolean('active').default(true).notNull(),                       // soft-delete via active=false
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Ventas individuales de productos. Una fila por venta (no agrupado por
// ticket). Atribución per-barbero alimenta la columna 'Upsells' del
// BarberBreakdown en /dashboard/caja.
//
// `bookingId` nullable: la venta puede asociarse a un booking concreto
// (cliente que vino para corte y se llevó cera) o ser standalone (cliente
// pasaba por la tienda y se llevó algo, sin cita).
//
// `barberId` nullable: ideal asignar quién vendió (atribución), pero
// admitimos null por flexibilidad.
//
// `unitPriceCents` snapshot del precio en el momento de la venta — si el
// barbero cambia el precio del producto después, el histórico no se ve
// afectado.
export const productSales = pgTable('product_sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  barberId: uuid('barber_id'),                                             // FK lógica a barbers.id; nullable
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),                   // snapshot
  totalCents: integer('total_cents').notNull(),                            // = unitPriceCents * quantity (sanity check)
  customerPhone: text('customer_phone'),
  paymentMethod: text('payment_method').notNull(),                         // 'cash' | 'card' | 'online'
  // Idempotencia frente a auto-facturación: cuando una venta ya está incluida
  // en una factura emitida (booking → completed → factura con items), se
  // estampa este timestamp. Las ventas con `invoicedAt != null` NO vuelven a
  // entrar en facturas posteriores aunque el booking sufra reaperturas.
  invoicedAt: timestamp('invoiced_at', { withTimezone: true }),
  soldAt: timestamp('sold_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// invoice_items — líneas individuales de una factura (1→N).
//
// Necesario para que una factura pueda combinar el SERVICIO del booking con
// los PRODUCTOS vendidos durante la cita. Hasta ahora `invoices.serviceName`
// guardaba un único concepto (texto plano) y `total_cents` era el importe del
// servicio puro — los productos no se reflejaban en la factura.
//
// Convenciones (mismas que invoices):
//   · Importes en céntimos enteros, currency siempre EUR de momento.
//   · `unit_price_cents` y `total_cents` son IVA INCLUIDO (precio retail).
//   · `subtotal_cents` (base imponible) e `iva_amount_cents` se calculan a
//     partir del `total_cents` con el `iva_rate` heredado de la factura.
//   · `kind` discrimina servicio vs producto en UI/exports.
//   · `productSaleId` enlaza a la venta concreta para idempotencia y trazas.
//
// VeriFactu: NO entra en el hash AEAT (el hash usa solo totales agregados de
// la factura). Es seguro añadir items sin invalidar la cadena existente.
// -----------------------------------------------------------------------------
export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  // 'service' = línea del servicio del booking; 'product' = venta de producto.
  kind: text('kind').notNull(),
  // Snapshot del nombre en el momento de emisión (productos pueden renombrarse después).
  name: text('name').notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),                   // IVA incluido
  subtotalCents: integer('subtotal_cents').notNull(),                      // base imponible
  ivaAmountCents: integer('iva_amount_cents').notNull(),
  totalCents: integer('total_cents').notNull(),                            // = unit * qty, IVA incluido
  productSaleId: uuid('product_sale_id').references(() => productSales.id),
  displayOrder: integer('display_order').default(0).notNull(),             // 0 = servicio primero
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// cash_sessions — sesión de caja diaria del local.
//
// Una sesión por barbería en cada momento (UNIQUE partial index garantiza
// que no haya dos abiertas a la vez para el mismo cliente). Se abre por la
// mañana con el saldo inicial de cambio (`opening_cents`) y se cierra al
// final del día.
//
// Cierre: el barbero cuenta físicamente el cajón (`closing_cents_counted`)
// y, si tiene datáfono, el total que dice el TPV físico
// (`card_terminal_counted_cents`). El sistema calcula los `_expected`
// sumando los movimientos del día filtrados por método. El descuadre =
// counted - expected (puede ser negativo si falta dinero).
//
// `closing_cents_expected` y `card_terminal_expected_cents` se snapshot-ean
// en el cierre para tener histórico inmutable aunque luego se editen
// movimientos (que NO se debería pero por si acaso).
// -----------------------------------------------------------------------------
export const cashSessions = pgTable('cash_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),

  // Apertura
  openingCents: integer('opening_cents').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  openedByEmail: text('opened_by_email').notNull(),

  // Cierre — null mientras la sesión sigue abierta
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedByEmail: text('closed_by_email'),

  // Efectivo
  closingCentsExpected: integer('closing_cents_expected'),                 // = opening + cash_in - cash_out
  closingCentsCounted: integer('closing_cents_counted'),                   // contado por el barbero
  cashDescuadreCents: integer('cash_descuadre_cents'),                     // counted - expected (puede ser <0)

  // Datáfono (tarjeta) — opcional. Si el local no tiene TPV físico, queda null.
  cardTerminalExpectedCents: integer('card_terminal_expected_cents'),      // = SUM movimientos card del día
  cardTerminalCountedCents: integer('card_terminal_counted_cents'),        // total que muestra el TPV físico
  cardDescuadreCents: integer('card_descuadre_cents'),                     // counted - expected

  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// cash_movements — todos los apuntes que afectan al cuadre del día.
//
// Cada movimiento pertenece a UNA sesión abierta. Tipos:
//   - 'booking'      → cobro de un servicio completado (ref booking)
//   - 'product_sale' → venta de producto (ref product_sale)
//   - 'tip_cash'     → propina en efectivo registrada manualmente
//   - 'expense'      → gasto pagado en cash (proveedor, café, etc.)
//   - 'withdrawal'   → retirada de cash (al banco, a bolsillo)
//   - 'deposit'      → ingreso manual (cambio adicional)
//   - 'adjustment'   → ajuste manual de cuadre (raro, traza)
//
// `amount_cents` es SIEMPRE positivo. La dirección la marca `kind`:
// los expense/withdrawal restan; el resto suman. Esto se calcula en
// `src/lib/cash/compute.ts` (puro, testeado).
//
// `method` discrimina la columna del cuadre afectada (cash/card/online).
// Movimientos con method='card' u 'online' NO afectan al efectivo en cajón
// pero sí al cuadre del datáfono / Stripe report.
// -----------------------------------------------------------------------------
export const cashMovements = pgTable('cash_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  sessionId: uuid('session_id').notNull().references(() => cashSessions.id, { onDelete: 'cascade' }),

  kind: text('kind').notNull(),                                            // ver enum arriba
  method: text('method').notNull(),                                        // 'cash' | 'card' | 'online'
  amountCents: integer('amount_cents').notNull(),                          // siempre > 0

  // Referencia opcional al booking/sale que originó el movimiento (para
  // auditoría inversa: "¿de qué venta vino este cash de 25€?").
  referenceType: text('reference_type'),                                   // 'booking' | 'product_sale' | null
  referenceId: uuid('reference_id'),

  // Idempotencia para SumUp polling: si el polling trae una transaction
  // que ya está en la tabla (mismo id), lo salta. UNIQUE garantiza que
  // ningún movement manual + polling pueda duplicarse para la misma
  // transaction física del datáfono.
  sumupTransactionId: text('sumup_transaction_id').unique(),

  notes: text('notes'),
  createdByEmail: text('created_by_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// sumup_pending_transactions — buffer para transactions de SumUp recibidas
// cuando NO hay sesión de caja abierta. Se importan al cuadre cuando el
// barbero abre caja (igual que el backfill actual de bookings).
//
// Pattern: el polling cron NUNCA pierde transactions. Si hay sesión abierta
// las inserta directo en cash_movements; si no, aquí. Al abrir caja se
// drenan TODAS las pending del día y se mueven a cash_movements.
// -----------------------------------------------------------------------------
export const sumupPendingTransactions = pgTable('sumup_pending_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  sumupTransactionId: text('sumup_transaction_id').unique().notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('EUR').notNull(),
  status: text('status').notNull(),                                        // SUCCESSFUL | REFUNDED | etc
  paymentType: text('payment_type'),                                       // POS | ECOM | ...
  transactionTimestamp: timestamp('transaction_timestamp', { withTimezone: true }).notNull(),
  rawPayload: jsonb('raw_payload'),                                        // backup completo para debug
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }),            // null hasta que se mueve a cash_movements
});

// -----------------------------------------------------------------------------
// mobile_pins — PINs efímeros para emparejar la app móvil "otracita Cobros".
//
// Flow:
//   1. Barbero entra en /dashboard/caja desde la PWA → "Conectar app móvil"
//   2. Generamos un PIN de 6 dígitos atado a su client_id, vence en 10 min
//   3. Barbero escribe el PIN en la app móvil
//   4. App llama /api/app/mobile/pin/redeem con el PIN
//   5. Si válido + no caducado + no usado → emitimos session_token long-lived
//      en mobile_sessions y marcamos el PIN como redeemed_at
//
// El PIN se almacena hasheado (no en claro) — si se filtra la DB no se puede
// usar. Lo verificamos con timingSafeEqual.
// -----------------------------------------------------------------------------
export const mobilePins = pgTable('mobile_pins', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  pinHash: text('pin_hash').notNull(),                                     // sha-256 del PIN en claro
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),            // null hasta canjeo
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdByEmail: text('created_by_email'),
});

// -----------------------------------------------------------------------------
// mobile_sessions — tokens long-lived para la app móvil del barbero.
//
// Diferencia con Better Auth (dashboard): esto es para la app nativa, NO usa
// cookies. Token opaco se guarda en Keychain del iPhone. Al hacer requests
// va en header `Authorization: Bearer <token>`.
//
// Token se genera con crypto.randomBytes(32).toString('hex'). Se guarda
// hasheado en `token_hash`. Cada request lo compara con timingSafeEqual.
// -----------------------------------------------------------------------------
export const mobileSessions = pgTable('mobile_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  tokenHash: text('token_hash').notNull().unique(),
  deviceLabel: text('device_label'),                                       // "iPhone 14 Pro de Reni"
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),              // null = sesión activa
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// Finanzas — módulo Pro+ de control financiero.
//
// Tres tablas independientes que alimentan /dashboard/finanzas:
//   - expenses: gastos variables diarios (proveedor, café, producto puntual).
//   - fixed_costs: costes recurrentes mensuales (alquiler, Spotify, gestor).
//   - owner_withdrawals: retiradas de caja a bolsillo del dueño (autónomo).
//
// Todos los importes en cents. El summary del módulo cruza estas tablas con
// bookings.price (que está en EUROS, ×100 para normalizar) para calcular
// beneficio bruto, IVA a pagar e IRPF estimado.
// -----------------------------------------------------------------------------

export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  date: date('date').notNull(),
  amountCents: integer('amount_cents').notNull(),
  category: text('category').notNull().default('otro'),  // productos|suministros|publicidad|personal|nomina|otro
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const fixedCosts = pgTable('fixed_costs', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  amountCents: integer('amount_cents').notNull(),
  category: text('category').notNull().default('otro'),
  activeFrom: date('active_from').notNull(),
  active: boolean('active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ownerWithdrawals = pgTable('owner_withdrawals', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  date: date('date').notNull(),
  amountCents: integer('amount_cents').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Ingresos manuales: efectivo, propinas, ventas de producto o cualquier ingreso
// que el barbero quiere reflejar en sus cuentas pero que no pasa por bookings.
export const manualIncomes = pgTable('manual_incomes', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  date: date('date').notNull(),
  amountCents: integer('amount_cents').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

