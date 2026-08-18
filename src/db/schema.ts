import { pgTable, text, timestamp, integer, boolean, uuid, jsonb, primaryKey, date, unique, index, uniqueIndex, doublePrecision, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';


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
  // Geocoded coordinates of the local. Used by the Apple Wallet pass to
  // trigger lockscreen relevance when the customer walks past, and reserved
  // for future map/distance features. Nullable — the wallet pass omits the
  // geofence section when either is null. Barbers paste a Google Maps URL
  // in Ajustes → Negocio and we parse coords from it client-side.
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  // WhatsApp Cloud API
  whatsappPhoneNumberId: text('whatsapp_phone_number_id'), // Meta phone number ID
  whatsappAccessToken: text('whatsapp_access_token'), // per-client or shared token
  // Meta onboarding tracking (admin-only operational metadata)
  metaWebhookVerifiedAt: timestamp('meta_webhook_verified_at'),                // Alex marked webhook OK
  metaTokenExpiresAt: timestamp('meta_token_expires_at'),                      // token expiry for alerting
  onboardingTestMessageSentAt: timestamp('onboarding_test_message_sent_at'),   // first manual test OK
  onboardingNotes: text('onboarding_notes'),                                   // free-form admin notes
  // Self-service bot activation (#53). El barbero rellena un form en
  // /dashboard/marketing/whatsapp con el número que quiere usar, el nombre
  // legal del negocio y opcionalmente su Facebook Business ID. Lo guardamos
  // como jsonb crudo + timestamp; cuando el admin completa el alta en Meta
  // y rellena `whatsappPhoneNumberId`, la solicitud queda "ejecutada".
  whatsappBotRequest: jsonb('whatsapp_bot_request').$type<{
    phoneRequested: string;
    businessLegalName: string;
    fbBusinessId?: string | null;
    submittedAt: string;
  } | null>(),
  whatsappBotRequestedAt: timestamp('whatsapp_bot_requested_at', { withTimezone: true }),
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
  // Tarifa por no-show (céntimos). 0 = desactivado (default → callers
  // existentes no cobran nada). Cuando > 0 y la cita se marca no_show, se
  // INTENTA cobrar al método de pago consentido del cliente (Stripe
  // off_session). HOY no hay tarjeta guardada en reservas WhatsApp/PWA: el
  // cobro se salta con motivo 'no_card_on_file' hasta que se implemente la
  // captura+consentimiento de tarjeta en la reserva (ver propuesta de
  // diseño). El mecanismo de cobro/caja ya está listo y es aditivo.
  noShowFeeCents: integer('no_show_fee_cents').notNull().default(0),
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
  // en /[slug]/* y disparamos `booking_confirmed` en dataLayer al
  // confirmar reserva. Permite al barbero medir conversiones con sus
  // propios pixels (Meta, Google Ads, GA4) sin que tengamos que tocar
  // código por cada herramienta. Cookie consent obligatorio antes de
  // cargar (Consent Mode v2).
  gtmContainerId: text('gtm_container_id'),
  // Tracking pixels directos — alternativa / complemento a GTM. El barbero
  // pega los IDs de sus pixels (Meta, Google Ads, TikTok) y los inyectamos
  // directamente en /[slug]/* con Consent Mode v2 (denied por defecto;
  // grant tras aceptar cookies). Permite medir conversiones sin instalar
  // GTM, que muchos barberos no van a tocar. Todos los formatos validados
  // server-side antes de persistir.
  metaPixelId: text('meta_pixel_id'),
  googleAdsConversionId: text('google_ads_conversion_id'),
  googleAdsConversionLabel: text('google_ads_conversion_label'),
  tiktokPixelId: text('tiktok_pixel_id'),
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
  // Integración Google Business Profile — auto-respuesta a reseñas de Google
  // Maps. Mismo patrón OAuth que SumUp: tokens planos en columnas de
  // `clients`, refresh on-demand (ver src/lib/google-business/oauth.ts +
  // client.ts). `googleBusinessLocationPath` guarda el path COMPLETO
  // "accounts/{accountId}/locations/{locationId}" tal cual lo consume la
  // Business Profile Reviews API (v4) — evita reconstruirlo en cada
  // llamada. `googleReviewsAutoReply` es el opt-in real: conectar la cuenta
  // ya permite sincronizar reseñas, pero el cron solo genera/publica
  // respuestas cuando esto es true (por defecto false — el barbero activa
  // desde ajustes).
  googleBusinessAccessToken: text('google_business_access_token'),
  googleBusinessRefreshToken: text('google_business_refresh_token'),
  googleBusinessTokenExpiresAt: timestamp('google_business_token_expires_at', { withTimezone: true }),
  googleBusinessLocationPath: text('google_business_location_path'),
  // Nombre visible de la location ("Barbería X — Gràcia"), tal cual lo
  // devuelve Google. Solo para mostrar en el panel — el path de arriba
  // sigue siendo lo único que se usa para llamar a la API. Nullable a
  // propósito: tenants conectados ANTES de que existiera este campo no
  // tienen título — la UI cae a mostrar el path. No se hace backfill.
  googleBusinessLocationTitle: text('google_business_location_title'),
  googleBusinessConnectedAt: timestamp('google_business_connected_at', { withTimezone: true }),
  googleReviewsAutoReply: boolean('google_reviews_auto_reply').default(false).notNull(),
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
  // Public booking page (/[slug]) — the shareable link a barber can drop
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
  brandColorSecondary: text('brand_color_secondary'),          // deprecated — legacy; no longer read by /[slug]
  publicDescription: text('public_description'),             // short "about" paragraph
  instagramHandle: text('instagram_handle'),                 // without @
  tiktokHandle: text('tiktok_handle'),                       // without @
  facebookUrl: text('facebook_url'),
  websiteUrl: text('website_url'),
  // Admin-lock — bloqueo con PIN del JEFE para áreas sensibles del dashboard.
  // El dashboard vive en modo barbero por defecto (cualquiera del equipo
  // opera el iPad tras login admin inicial). El jefe marca con candado las
  // áreas confidenciales (P&L, nóminas, comisiones, ajustes técnicos, mi
  // plan) y al tocarlas se pide el PIN del jefe → cookie "admin-lock"
  // 30 min. Tras inactividad o "Cerrar gestión" → vuelve a bloquearse.
  //
  // Las columnas DB se reutilizan del concepto previo "modo equipo"
  // (revertido) con nombres team_* — mantenemos el nombre de COLUMNA para
  // no tocar la migración, pero el FIELD en código tiene semántica nueva.
  /** El jefe ha activado el lock con PIN. Si false, ningún área pide PIN. */
  lockEnabled: boolean('team_access_enabled').default(false).notNull(),
  /** Hash scrypt$N$r$p$saltHex$keyHex del PIN del jefe. Null = sin PIN. */
  adminPinHash: text('team_pin_hash'),
  adminPinUpdatedAt: timestamp('team_pin_updated_at', { withTimezone: true }),
  /**
   * Lista de áreas a BLOQUEAR. Claves estables — ver
   * src/lib/admin-lock/areas.ts (ADMIN_LOCKABLE_AREA_KEYS). Vacío/null →
   * ningún área bloqueada (el lock está activo pero no se aplica a nada).
   */
  adminLockedAreas: jsonb('team_allowed_areas').$type<string[]>().default([]),
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
  // Perfil del empleado.
  //  · role          → puesto libre ("Top barber", "Aprendiz"…). null = sin
  //                     puesto → la UI muestra "Profesional" por defecto.
  //  · onlineBookable → si el cliente puede reservar con él online.
  //                     Default true = comportamiento histórico (todos
  //                     reservables) → cero regresión.
  // Permisos de acceso reales viven en `user.role + isManager +
  // managerPermissions` (#72). El campo viejo `permissionLevel` se eliminó.
  role: text('role'),
  onlineBookable: boolean('online_bookable').default(true).notNull(),
  // Perfil de pago — 5 piezas que se combinan para calcular nómina mensual.
  // null en salaryType = sin configurar (no aparece en /finanzas/nóminas).
  // Tres presets en UI: fijo (solo base), mixto (base + comisiones),
  // autonomo (comisiones + alquiler de silla). Pero TODOS los campos son
  // independientes — el dueño puede combinar como quiera.
  salaryType: text('salary_type'),                                   // 'fijo' | 'mixto' | 'autonomo' | 'salaried_with_tier_bonus' | null
  salaryBaseCents: integer('salary_base_cents').default(0).notNull(),
  commissionServicesPct: integer('commission_services_pct').default(0).notNull(),  // 0-100
  commissionProductsPct: integer('commission_products_pct').default(0).notNull(),  // 0-100
  chairRentCents: integer('chair_rent_cents').default(0).notNull(),  // Lo que el barbero PAGA al local (autónomo)
  // F1 — Tramos de bono por facturación (4º preset "asalariado_with_tier_bonus").
  // Lista ordenable de {thresholdCents, bonusCents}; solo se paga el bono del
  // tramo MÁS ALTO alcanzado (no acumulativo). null o [] ⇒ sin bonos.
  tierBonuses: jsonb('tier_bonuses').$type<{ thresholdCents: number; bonusCents: number }[]>(),
  // -- Modo barbero v2 (#71 revisitado): cada barbero accede mediante una
  // cuenta Better Auth (`user` table) con `role='barber'`, `clientId` =
  // tenant y `barberId` = este registro. El acceso se concede via
  // invitación por email desde el dashboard del jefe (`barber_invites`).
  // No hay token personal: el link mágico anónimo del modelo viejo se
  // eliminó (drop columns `personal_access_token` + `personal_access_generated_at`).
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

// Excepciones de horario por fecha concreta a nivel de LOCAL. El semanal
// recurrente vive en `clients.chatbotHours` (lunes-domingo, "HH:MM-HH:MM"
// o "Cerrado"). Esta tabla permite override puntual: "el martes 28 abro
// 9-22 en vez de 10-20", o "cierro el día 1 a media tarde", etc. Es
// distinto de `clients.blockedDates` (que cierra el día COMPLETO):
//   · blockedDates  ⇒ no se ofrecen citas, día completo cerrado.
//   · clientDayHourOverrides ⇒ se ofrecen citas dentro de ESTE rango
//     (en vez del recurrente). Si `hours = 'Cerrado'` ⇒ día cerrado
//     vía override (equivalente a blockedDates pero con la posibilidad
//     de añadir una nota).
//
// Una sola fila por (clientId, date) — `unique` lo garantiza. El motor
// de availability comprueba esta tabla ANTES de mirar el semanal: si
// hay override, manda; si no, fallback a chatbotHours[weekday].
export const clientDayHourOverrides = pgTable('client_day_hour_overrides', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),                                       // YYYY-MM-DD
  hours: text('hours').notNull(),                                     // "HH:MM-HH:MM" o "Cerrado"
  note: text('note'),                                                 // texto libre opcional ("Festivo", "Evento", ...)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueClientDate: unique('client_day_hour_overrides_client_date_unique').on(
    table.clientId, table.date,
  ),
}));

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

// Asignación servicio↔barbero (Booksy "SERVICIOS" del detalle de empleado,
// screenshot 10.16.45/58: qué servicios HACE cada barbero).
//
// Semántica deliberada: **un barbero SIN filas aquí hace TODOS los
// servicios** (cero regresión — hoy todos hacen todo; el motor de
// disponibilidad no filtra por servicio). En cuanto el barbero tiene ≥1
// fila, su catálogo queda RESTRINGIDO a esas filas (lista blanca). El dueño
// activa/desactiva en "EDITAR SERVICIOS".
//
// Mismo patrón que `barberServiceCommissions`: el catálogo
// (`clients.chatbotServices`) es jsonb sin ID estable, así que el match es
// por NOMBRE exacto (igual que loyalty/promos). Tabla ADITIVA, nada la lee
// aún en el motor de reservas v1 — es metadato del perfil; conectar el
// filtro a la disponibilidad/PWA es follow-up explícito.
export const barberServices = pgTable('barber_services', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  barberId: uuid('barber_id').notNull().references(() => barbers.id, { onDelete: 'cascade' }),
  serviceName: text('service_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePerService: unique('barber_services_unique').on(
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
  // Tarjeta guardada + consentimiento para la tarifa de no-show. Se rellena
  // SOLO cuando el negocio tiene `clients.noShowFeeCents > 0` y el cliente
  // reserva por web/PWA (el bot WhatsApp está EXENTO — no hay superficie de
  // tarjeta). El Customer y el PaymentMethod viven en la cuenta PLATAFORMA
  // (no en la Connect del barbero): el cobro off-session se hace como
  // destination charge igual que el resto. Null = sin tarjeta consentida →
  // no-show no cobra (motivo 'no_card_on_file'). Único registro de
  // consentimiento explícito del cliente (timestamp + origen del checkbox).
  stripeCustomerId: text('stripe_customer_id'),
  defaultPaymentMethodId: text('default_payment_method_id'),
  cardConsentAt: timestamp('card_consent_at', { withTimezone: true }),
  cardConsentSource: text('card_consent_source'),      // 'web' | 'pwa'
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
  // F3 Reni — OVERRIDE manual del barbero al cerrar la cita ("preguntale al
  // cliente de dónde te conoció y marca el chip"). Convive con la atribución
  // pasiva (`referrerSource`/customer `firstSource`): si está set, gana sobre
  // ellos en los reportes (COALESCE(source_manual, derived_from_referrer)).
  // Opcional — null = sin override, queda la pasiva. Valores cerrados:
  // 'instagram' | 'tiktok' | 'facebook' | 'google_maps' | 'referral' | 'walk_in'.
  // Click en el chip activo lo desmarca (vuelve a null). Aditivo: callers
  // existentes no necesitan tocar nada.
  sourceManual: text('source_manual'),
  booksyBookingId: text('booksy_booking_id'), // Booksy reference ID for dedup + update matching
  // iCalendar UID del VEVENT origen cuando esta cita vino de una importación
  // de archivo .ics (Booksy export, Treatwell, Google Calendar). Clave de
  // idempotencia: si el barbero re-importa el mismo .ics, los eventos con UID
  // ya presente se omiten. UNIQUE per (clientId, importedIcalUid) en el index
  // parcial — null para bookings normales (la inmensa mayoría) no consume el
  // índice. Ver `src/lib/imports/ical-bookings.ts` y migration 0052.
  importedIcalUid: text('imported_ical_uid'),
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

// -----------------------------------------------------------------------------
// booking_events — log inmutable de TODO lo que le pasa a una cita (task #107).
//
// Append-only. Cada transición de una cita (creada, movida, cancelada,
// no-show, completada, cobrada, recordatorio enviado…) inserta una fila
// aquí. Es la herramienta permanente de Reni para responder "¿qué pasó con
// esa cita?" — sobre todo ahora que las canceladas se ocultan del grid de la
// agenda (#108): el dato no se pierde, vive aquí.
//
// `clientId` SIEMPRE del session (multi-tenancy, nunca del body). `bookingId`
// referencia la cita (sin onDelete cascade: las citas no se borran, se
// cancelan; el evento debe sobrevivir aunque algún día se purgue la cita).
// `actor`/`actorLabel`: QUIÉN lo hizo (cliente, barbero, admin, bot, sistema)
// + nombre legible. `summary`: texto humano corto en castellano para pintar
// directo en el timeline. `metadata`: antes/después opcional (fromTime/toTime,
// amountCents, …) para detalle sin parsear el summary.
//
// El INSERT vive en `logBookingEvent` (src/lib/bookings/events.ts) — fuente
// única, secuencial (neon-http no soporta transactions), envuelto en try/catch
// para que un fallo de log NUNCA aborte la operación principal (un cobro o una
// reserva no se caen porque el log falle).
// -----------------------------------------------------------------------------
export const bookingEvents = pgTable('booking_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  // 'created' | 'confirmed' | 'moved' | 'resized' | 'cancelled' | 'no_show'
  // | 'completed' | 'charged' | 'reminder_sent'
  type: text('type').notNull(),
  // 'customer' | 'barber' | 'admin' | 'bot' | 'system'
  actor: text('actor').notNull(),
  // Nombre legible del actor si aplica ("Reni", "Bot WhatsApp", nombre del
  // cliente). null = actor anónimo / sistema sin nombre.
  actorLabel: text('actor_label'),
  // Texto humano corto en castellano: "Cita movida de 15:00 a 16:30".
  summary: text('summary').notNull(),
  // Antes/después opcional: { fromTime, toTime, fromBarber, toBarber,
  // amountCents, method, ... }. null cuando el summary ya lo dice todo.
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Timeline de UNA cita (orden cronológico).
  byBooking: index('booking_events_client_booking_created_idx').on(
    table.clientId, table.bookingId, table.createdAt,
  ),
  // Vista global de actividad del tenant (orden desc por fecha).
  byClient: index('booking_events_client_created_idx').on(
    table.clientId, table.createdAt,
  ),
}));

// Waitlist (customers waiting for a slot to open)
//
// Tabla compartida entre dos flujos:
//
//  1. Bot WhatsApp legacy (`src/lib/whatsapp/engine.ts`) — un cliente que
//     pregunta por un día sin huecos puede "apuntarse" → entra con
//     `time=null` (cualquier hora ese día) y `barber` como TEXT libre.
//     `notifyWaitlist` busca al siguiente cuando se cancela una cita.
//
//  2. Lista de espera por slot específico (#88) — un cliente en la PWA o el
//     dashboard pulsa "avísame si se libera" sobre una hora concreta. Entra
//     con `desiredTimeStart`/`desiredTimeEnd` (rango HH:MM), `barberId`
//     canónico (uuid), `expiresAt` (auto-vence al pasar la fecha+hora).
//     Al cancelarse cualquier cita, `onBookingCancelled`
//     (src/lib/waitlist/match.ts) busca matches y usa
//     `dispatchUserNotification` (push o WhatsApp, nunca ambos).
//
// Convivencia: ambos flujos comparten status/createdAt/notifiedAt. Las
// columnas nuevas son nullable + aditivas → el bot legacy no se ve afectado.
export const waitlist = pgTable('waitlist', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerName: text('customer_name'),
  date: text('date').notNull(), // YYYY-MM-DD
  // Bot legacy: HH:MM o null (cualquier hora ese día).
  // Slot-específico (#88): HH:MM "ancla" deseada (normalmente == desiredTimeStart).
  time: text('time'),
  // Rango deseado en el flujo slot-específico (#88). null en bot legacy.
  // Si están set, una cancelación cuya hora caiga dentro
  // [desiredTimeStart, desiredTimeEnd) cuenta como match.
  desiredTimeStart: text('desired_time_start'), // HH:MM
  desiredTimeEnd: text('desired_time_end'),     // HH:MM
  service: text('service'),
  // Bot legacy: nombre libre del barbero ("Reni") o null = cualquiera.
  barber: text('barber'),
  // Slot-específico (#88): referencia canónica. null = cualquier barbero.
  barberId: uuid('barber_id'),
  // 'waiting' | 'notified' | 'booked' | 'converted' | 'expired' | 'cancelled'
  status: text('status').notNull().default('waiting'),
  notifiedAt: timestamp('notified_at'),
  // Booking que la entrada terminó generando cuando el cliente aceptó el
  // aviso. null hasta que se convierta. Útil para reporting.
  convertedBookingId: uuid('converted_booking_id'),
  // Auto-expire: pasada esta fecha+hora la entrada ya no tiene sentido.
  // Default al crear (#88): fecha + 23:59 Madrid. Lo lee el job de limpieza
  // y los matchers para no notificar a cosas caducas.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
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
  // Split-payment support (épica Reni 2026-05-22, #26/#27):
  //   · `method` = qué método usó este tramo concreto del cobro. Un booking
  //     puede tener N rows con distintos métodos (cash + card_physical = pago
  //     fraccionado). NULL en filas legacy (asumir card_online por origen
  //     Stripe Checkout). Whitelist: cash | card_physical | bizum | card_online.
  //   · `sumupTransactionId` = idempotencia para tramos cobrados con SumUp.
  //   · `recordedByEmail` = quién registró el cobro manual (offline). Audit.
  //   · `notes` = texto libre opcional ("Bizum +34 6XX...").
  method: text('method'),
  sumupTransactionId: text('sumup_transaction_id').unique(),
  recordedByEmail: text('recorded_by_email'),
  notes: text('notes'),
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
  /**
   * Método de pago de la propina.
   * - 'card' → flow Stripe Checkout (post-booking-followup, FK paymentLinkUrl).
   * - 'cash' → propina en efectivo registrada manualmente en /caja (espejo en cash_movements).
   * - NULL  → filas legacy anteriores a este split (asumir 'card' implícito en queries).
   *
   * Lo dejamos nullable para no romper datos pre-migración. UI nueva siempre lo rellena.
   */
  paymentMethod: text('payment_method'),                                   // 'cash' | 'card' | null (legacy = card)
  /**
   * Barbero al que va la propina (100% suyo, no entra en motor de comisión).
   * Snapshot histórico — si se borra el barbero el FK pasa a NULL (ON DELETE SET NULL)
   * y queda `barberName` como referencia de auditoría.
   * Nullable porque tips legacy (pre-V1 Reni) no tenían barbero asignado a nivel directo
   * y se resolvían vía bookings.barber_id; ahora la asignación es explícita.
   */
  barberId: uuid('barber_id').references(() => barbers.id, { onDelete: 'set null' }),
  // Rating (1-5). Null = customer didn't rate (e.g. only paid a tip).
  rating: integer('rating'),
  ratingComment: text('rating_comment'),
  paymentLinkUrl: text('payment_link_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  // Liquidación al barbero (épica Reni #28 parte 3b 2026-05-22).
  // Cuando el jefe le ha pagado al barbero (transferencia, cash, o ya
  // incluido en su nómina), se rellenan estas columnas. Hasta entonces
  // `paidOutAt IS NULL` → la propina sigue contando como pendiente en el
  // motor de payroll (cláusula AND paid_out_at IS NULL en monthly.ts).
  paidOutAt: timestamp('paid_out_at', { withTimezone: true }),
  paidOutMethod: text('paid_out_method'),  // 'cash' | 'transfer' | 'card_payroll'
  paidOutByEmail: text('paid_out_by_email'),
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
}, (table) => ({
  // Idempotencia del cron de awards. El INSERT de
  // `/api/cron/loyalty-award` hace ON CONFLICT (booking_id)
  // WHERE reason = 'booking_completed' — Postgres infiere el árbitro por
  // (columna + predicado), así que el predicado de ESTE índice tiene que
  // coincidir literalmente con el del ON CONFLICT. Si divergen,
  // Postgres lanza 42P10 en cada insert y no se otorga ni un sello.
  //
  // Parcial a propósito: los canjes y ajustes manuales pueden repetir
  // booking_id (o traerlo a null) sin chocar con el award automático.
  bookingCompletedUniq: uniqueIndex('loyalty_ledger_booking_completed_uniq')
    .on(table.bookingId)
    .where(sql`reason = 'booking_completed'`),
}));

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

// -----------------------------------------------------------------------------
// google_reviews — espejo local de las reseñas de Google Business Profile
// de cada barbería, más el estado de la respuesta (IA o manual).
//
// Se llena vía sync (src/lib/google-business/sync.ts), llamado por el cron
// `/api/cron/google-reviews` cada 3h. `googleReviewId` es el ID que asigna
// Google (NO nuestro uuid); el índice UNIQUE (clientId, googleReviewId) es
// la garantía de idempotencia del upsert — sincronizar dos veces la misma
// reseña actualiza la fila en vez de duplicarla.
//
// `replyStatus`:
//   pending   → detectada, sin respuesta generada aún
//   draft     → IA generó una respuesta pero la reseña es ≤3★ → se emailea
//               al barbero para que la revise/publique manualmente (fuera
//               del scope de este cron; UI pendiente)
//   published → respuesta ya viva en Google (`replySource` dice si la
//               publicó la IA automáticamente o el barbero a mano desde la
//               app de Google — en ese caso el sync la detecta vía
//               `reviewReply` en la respuesta de Google y NUNCA la
//               sobrescribe)
//   failed    → se agotaron los reintentos (`attempts` >= 5)
//   skipped   → reservado para exclusiones futuras (p.ej. reseña marcada
//               como spam por el barbero)
//
// `attempts`/`lastError` alimentan el backoff del cron: cada fallo al
// generar/publicar incrementa `attempts`; a la 5ª se marca `failed` y deja
// de reintentarse.
// -----------------------------------------------------------------------------
export const googleReviews = pgTable('google_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  googleReviewId: text('google_review_id').notNull(),
  reviewerName: text('reviewer_name'),                                     // null si el reviewer es anónimo
  starRating: integer('star_rating').notNull(),                            // 1-5, normalizado desde el enum de Google
  comment: text('comment'),                                                // null si el cliente no dejó texto (muy común)
  reviewCreatedAt: timestamp('review_created_at', { withTimezone: true }).notNull(),
  reviewUpdatedAt: timestamp('review_updated_at', { withTimezone: true }).notNull(),
  replyText: text('reply_text'),
  replyStatus: text('reply_status').default('pending').notNull(),          // 'pending' | 'draft' | 'published' | 'failed' | 'skipped'
  replySource: text('reply_source'),                                       // 'ia' | 'manual' | null
  replyPublishedAt: timestamp('reply_published_at', { withTimezone: true }),
  lastError: text('last_error'),
  attempts: integer('attempts').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  clientReviewUnique: unique('google_reviews_client_review_unique').on(table.clientId, table.googleReviewId),
}));

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
// /[slug] vendrá en una fase posterior si los datos lo justifican.
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
  // Coste de compra unitario (lo que le cuesta al local cada unidad, IVA
  // incluido). NULL = no configurado; en ese caso el motor de P&L usa
  // `priceCents` (precio de venta) como fallback conservador para que el
  // consumo interno / merma se contabilice como gasto desde el día 1 sin
  // pedirle al jefe que configure nada. Cuando el jefe edita el producto y
  // mete el coste real, el desglose pasa a ser preciso.
  costPriceCents: integer('cost_price_cents'),
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
// admitimos null por flexibilidad. Para `consumptionKind = 'internal'` el
// endpoint POST exige `barberId` (control de gasto + comisiones futuras,
// task #89) — la merma (`damage`) sigue admitiendo null porque es del
// local, no de un barbero concreto.
//
// FK real a `barbers.id` (#89) con `onDelete: 'set null'`: si un barbero
// se borra duro (raro — el flow es soft-delete vía `active=false`), la
// histórica de consumos no se pierde, simplemente queda "Sin asignar".
//
// `unitPriceCents` snapshot del precio en el momento de la venta — si el
// barbero cambia el precio del producto después, el histórico no se ve
// afectado.
export const productSales = pgTable('product_sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  barberId: uuid('barber_id').references(() => barbers.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),                   // snapshot
  totalCents: integer('total_cents').notNull(),                            // = unitPriceCents * quantity (sanity check)
  customerPhone: text('customer_phone'),
  paymentMethod: text('payment_method').notNull(),                         // 'cash' | 'card' | 'online'
  // Tipo de "salida" de stock. NULL = venta normal a cliente (con flujo de
  // dinero → entra en revenue + caja). 'internal' = consumo del barbero
  // (gomina/cera de uso interno) y 'damage' = merma/rotura — ambos
  // decrementan stock pero NO mueven dinero (sin cash_movement) y NO
  // computan en P&L de ingresos por productos.
  consumptionKind: text('consumption_kind'),
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

  // -----------------------------------------------------------------------
  // Carryover (task #91): el saldo de cierre del día anterior se convierte
  // automáticamente en la apertura del día siguiente (carryover físico de
  // efectivo). Al abrir caja, la UI sugiere el `closingCentsCounted` de la
  // última sesión cerrada del cliente; el barbero puede aceptarlo
  // (`openingCarriedFromSessionId` apunta a esa sesión) o modificarlo (en
  // ese caso `openingManualAdjustmentReason` captura el motivo opcional —
  // saqué efectivo del cajón por la noche, arqueo manual, etc.).
  //
  // `openingCarriedCents` snapshotea el valor SUGERIDO en el momento de
  // la apertura, aunque el barbero introduzca otro distinto. Sirve para
  // auditar discrepancias después.
  //
  // Los tres campos son NULL en sesiones abiertas antes de esta migración
  // (legacy) y en la PRIMERA sesión del cliente (no había cierre previo
  // del que arrastrar).
  // -----------------------------------------------------------------------
  openingCarriedFromSessionId: uuid('opening_carried_from_session_id')
    .references((): AnyPgColumn => cashSessions.id, { onDelete: 'set null' }),
  openingCarriedCents: integer('opening_carried_cents'),
  openingManualAdjustmentReason: text('opening_manual_adjustment_reason'),

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

  /**
   * Snapshot inmutable del desglose que el barbero vio justo al cerrar la
   * sesión: totales por método, por kind y (si hay equipo) por barbero. Se
   * persiste al cerrar para histórico — aunque luego se editen/borren
   * movimientos (no debería), el cierre conserva la foto exacta de ese
   * momento. Forma del payload: ver `CashClosingSnapshot` en
   * `src/lib/cash/breakdown.ts` (single source of truth).
   *
   * Null en sesiones cerradas antes de la migración (legacy) y en sesiones
   * abiertas. La UI cae al cálculo en vivo cuando es null.
   */
  closingSnapshot: jsonb('closing_snapshot'),

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
//   - 'refund'       → devolución al cliente (SumUp REFUNDED / reembolso)
//
// `amount_cents` es SIEMPRE positivo. La dirección la marca `kind`:
// los expense/withdrawal/refund RESTAN; el resto suman. Esto se calcula en
// `src/lib/cash/compute.ts` (puro, testeado). `kind` es columna text (no
// pg enum) — añadir un kind nuevo NO requiere migración.
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

  /**
   * Barbero asignado al movimiento (relevante sobre todo para kind='tip_cash'
   * — la propina es 100% del barbero y necesitamos atribuirla en Payroll /
   * BarberBreakdown). Para otros kinds (expense, withdrawal…) suele ser NULL.
   * ON DELETE SET NULL: si se borra el barbero, conservamos el movimiento.
   */
  barberId: uuid('barber_id').references(() => barbers.id, { onDelete: 'set null' }),

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

// -----------------------------------------------------------------------------
// Better Auth — `user` table (Modo barbero v2 #71 revisitado).
//
// Better Auth provisiona automáticamente esta tabla (id, name, email,
// emailVerified, image, createdAt, updatedAt) y la gestiona via su propio
// Pool. La declaramos aquí en Drizzle para poder hacer joins/queries en
// helpers de auth (resolver tenant a partir de session.userId, validar
// role='barber', etc.). NO cambiamos la forma de los campos originales
// de Better Auth — solo añadimos los aditivos del modelo v2.
//
// Campos aditivos (migración 0049_barber_user_invites.sql):
//   · role        — 'admin' | 'barber'. Default 'admin' (el dueño que
//                   se registra). Los invitados se crean con 'barber'.
//   · clientId    — tenant del que es miembro. Un user pertenece a UN
//                   solo tenant. Para admins, redundante con clients.email,
//                   pero lo mantenemos por consistencia y para evitar
//                   lookups extra.
//   · barberId    — si role='barber', enlaza al registro `barbers`. Es
//                   la pieza que une la sesión Better Auth con la fila
//                   de equipo.
//   · disabledAt  — soft-disable. Si != null, el usuario no puede
//                   iniciar sesión (revocar acceso sin perder histórico
//                   de FKs).
// -----------------------------------------------------------------------------
export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
  // Modo barbero v2 ------------------------------------------------------
  role: text('role').notNull().default('admin'),
  clientId: uuid('clientId').references(() => clients.id, { onDelete: 'set null' }),
  barberId: uuid('barberId').references(() => barbers.id, { onDelete: 'set null' }),
  disabledAt: timestamp('disabledAt', { withTimezone: true }),
  // Permisos granulares (#72) — capa Manager sobre el rol Barber.
  //   · isManager           — flag toggle desde el editor del barbero.
  //   · managerPermissions  — jsonb array de claves (MANAGER_PERMISSION_KEYS).
  // Operator (default): solo ve sus citas/ventas/propinas y cobra lo suyo.
  // Manager: además, lo que cada `managerPermissions` desbloquee (ver finanzas,
  // editar citas de otros, cerrar caja, etc.). Solo el dueño (admin) lo edita.
  isManager: boolean('isManager').notNull().default(false),
  managerPermissions: jsonb('managerPermissions')
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
});

// -----------------------------------------------------------------------------
// Barber invites — invitación por email del jefe para que un barbero
// cree su cuenta Better Auth con role='barber' (Modo barbero v2 #71).
//
// Lifecycle:
//   1. Jefe pulsa "Invitar por email" en /dashboard/equipo/[id] →
//      POST /api/barber-invites { barberId, email } → row con token
//      random hex + expiresAt = now()+7d + email enviado vía Postmark.
//   2. Barbero abre el link `/aceptar-invitacion/[token]`, ve form
//      password → POST /api/barber-invites/[token]/accept crea user
//      Better Auth con role='barber', clientId, barberId. Marca
//      `acceptedAt`. Setea sesión y redirect a /yo.
//   3. Si el jefe revoca antes de aceptar: marca `revokedAt`. Si el
//      barbero pierde el link / caducó: nueva invitación reemplaza la
//      anterior (row nueva — no editamos la vieja).
// -----------------------------------------------------------------------------
export const barberInvites = pgTable('barber_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  barberId: uuid('barber_id').references(() => barbers.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  invitedByUserId: text('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

