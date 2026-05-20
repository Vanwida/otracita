# Inventario C — APIs · Stripe · SumUp · VeriFactu · Caja · Payroll · Loyalty · Promos · Notificaciones · Multi-tenancy · Cron · Schema
_Versión: 2026-05-20 · Formato canónico B-pwa-bot.md · Cada hoja: `[unit: <path|—>] [e2e: —] [risk: P0|P1|P2]`_

---

## Índice
1. [Schema — 44 tablas Drizzle](#1-schema--44-tablas-drizzle)
2. [Multi-tenancy y auth middleware](#2-multi-tenancy-y-auth-middleware)
3. [Billing / Tiers](#3-billing--tiers)
4. [API — Bookings (dashboard)](#4-api--bookings-dashboard)
5. [API — Bookings (público / PWA)](#5-api--bookings-público--pwa)
6. [API — Barbers y horarios](#6-api--barbers-y-horarios)
7. [API — Customers](#7-api--customers)
8. [API — Payments (Stripe Connect)](#8-api--payments-stripe-connect)
9. [API — Webhooks Stripe](#9-api--webhooks-stripe)
10. [API — SumUp](#10-api--sumup)
11. [API — Invoices / VeriFactu](#11-api--invoices--verifactu)
12. [API — Loyalty](#12-api--loyalty)
13. [API — Promos contextuales](#13-api--promos-contextuales)
14. [API — Finanzas (P&L)](#14-api--finanzas-pl)
15. [API — Caja](#15-api--caja)
16. [API — Productos y ventas POS](#16-api--productos-y-ventas-pos)
17. [API — Bonos y competiciones](#17-api--bonos-y-competiciones)
18. [API — Cron jobs](#18-api--cron-jobs)
19. [API — App PWA (autenticación)](#19-api--app-pwa-autenticación)
20. [API — App PWA (cliente)](#20-api--app-pwa-cliente)
21. [API — App Móvil (barbero nativo)](#21-api--app-móvil-barbero-nativo)
22. [API — Admin](#22-api--admin)
23. [API — Misc (tips, ratings, voice, leads, email)](#23-api--misc-tips-ratings-voice-leads-email)
24. [Lib — Bookings pipeline](#24-lib--bookings-pipeline)
25. [Lib — Availability engine](#25-lib--availability-engine)
26. [Lib — Stripe Connect](#26-lib--stripe-connect)
27. [Lib — SumUp](#27-lib--sumup)
28. [Lib — VeriFactu / fiscal](#28-lib--verifactu--fiscal)
29. [Lib — Caja](#29-lib--caja)
30. [Lib — Payroll](#30-lib--payroll)
31. [Lib — Loyalty](#31-lib--loyalty)
32. [Lib — Promos](#32-lib--promos)
33. [Lib — Finanzas P&L math](#33-lib--finanzas-pl-math)
34. [Lib — Notifications dispatcher](#34-lib--notifications-dispatcher)
35. [Lib — App-auth (PWA sessions)](#35-lib--app-auth-pwa-sessions)
36. [Lib — Auth / admin guard](#36-lib--auth--admin-guard)
37. [Resumen y métricas](#37-resumen-y-métricas)

---

## 1. Schema — 44 tablas Drizzle

_`src/db/schema.ts` (1 307 líneas). Single source of truth — Drizzle ORM + Neon Postgres serverless._

### 1.1 `clients` — tenant master (barbería)
- `id` uuid PK · `businessName` · `ownerName` · `email` UNIQUE · `billingEmail` · `phone` · `whatsappNumber`
- `city` default 'Barcelona' · `address`
- **WhatsApp Cloud API**: `whatsappPhoneNumberId` · `whatsappAccessToken` · `metaWebhookVerifiedAt` · `metaTokenExpiresAt` · `onboardingTestMessageSentAt` · `onboardingNotes`
- **Booksy legacy**: `booksyProfileUrl` · `booksyServices` jsonb (FROZEN, nunca escribir) · `booksyInboundEmail` UNIQUE
- **Feature flags**: `useDbAvailability` bool
- **Google Calendar**: `googleCalendarId` · `googleCalendarConnected`
- **Status / Tier**: `status` ('pending'|'onboarding'|'active'|'paused'|'cancelled') · `plan` LEGACY ('chatbot'|'ads'|'full') · `tier` ('solo'|'pro'|'estudio') · `billingInterval` ('monthly'|'annual'|null) · `trialStartedAt` · `trialEndsAt`
- **Stripe platform**: `stripeCustomerId` · `stripeSubscriptionId`
- **Stripe Connect**: `stripeConnectAccountId` · `stripeConnectStatus` ('none'|'pending'|'active'|'restricted') · `stripeConnectActivatedAt`
- **Bot config**: `botName` · `botTone` ('cercano'|'neutro'|'formal') · `chatbotGreeting` · `botOutOfHoursMessage` · `botAllowCancelWhatsapp` · `noShowBlockThreshold` default 3 · `noShowFeeCents` default 0 · `reminderTemplate` · `googleReviewUrl` · `chatbotServices` jsonb · `chatbotHours` jsonb · `blockedDates` jsonb[]
- **Fiscal**: `fiscalName` · `fiscalNif` · `fiscalAddress` · `fiscalCity` · `fiscalPostalCode` · `ivaRate` int default 21 · `invoicingEnabled` · `invoiceNumberPrefix` · `invoiceNumberNext` int default 1
- **Tips / follow-up**: `tipsEnabled` · `tipsSuggestedCents` int[] default [200,300,500] · `followupMinutesAfter` default 30 · `ratingsEnabled`
- **Loyalty**: `loyaltyEnabled` · `loyaltyMode` ('stamps'|'points') · `loyaltyConfig` jsonb
- **Promos**: `promosEnabled`
- **GTM**: `gtmContainerId`
- **Caja**: `cashRegisterEnabled`
- **SumUp**: `sumupAccessToken` · `sumupRefreshToken` · `sumupMerchantCode` · `sumupTokenExpiresAt` · `sumupReaderId` · `sumupReaderName`
- **Scheduling**: `minLeadTimeMinutes` default 15 · `maxBookingHorizonDays` default 45 · `slotStepMinutes` default 15 · `serviceBufferMinutes` default 5
- **Public page**: `publicSlug` UNIQUE · `publicEnabled` · `brandLogoUrl` · `brandLogoAltUrl` · `brandCoverUrl` · `brandTheme` ('light'|'dark') · `brandColor` hex · `brandColorSecondary` DEPRECATED · `publicDescription` · `instagramHandle` · `tiktokHandle` · `facebookUrl` · `websiteUrl`
- `createdAt` · `updatedAt` · `onboardedAt`
- [unit: —] [e2e: —] [risk: P0]

### 1.2 `app_users` — cliente final (cross-tenant)
- `id` uuid PK · `phone` E.164 UNIQUE · `name` · `email` · `createdAt` · `updatedAt`
- Global: la misma persona en 2 barberías = 1 app_user, 2 customers
- [unit: —] [e2e: —] [risk: P0]

### 1.3 `app_otp_codes` — OTP PWA login
- `id` · `phone` · `codeHash` SHA-256 · `clientId` FK clients · `attempts` int default 0 · `expiresAt` 10 min · `consumedAt` · `createdAt`
- [unit: —] [e2e: —] [risk: P0]

### 1.4 `push_subscriptions` — Web Push VAPID
- `id` · `userId` FK app_users · `clientId` FK clients (nullable) · `endpoint` UNIQUE · `p256dh` · `authKey` · `userAgent` · `enabled` · `createdAt` · `lastUsedAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.5 `app_sessions` — PWA session tokens (hash)
- `id` · `userId` FK app_users · `tokenHash` UNIQUE SHA-256 · `clientId` FK clients · `userAgent` · `expiresAt` 90 días · `createdAt` · `lastUsedAt` (sliding)
- [unit: —] [e2e: —] [risk: P0]

### 1.6 `barbers` — equipo per tenant
- `id` · `clientId` FK · `name` · `hours` jsonb (null = inherit shop) · `blockedDates` jsonb[] · `displayOrder` · `active` bool · `photoUrl` · `bio`
- **Booksy profile**: `role` · `permissionLevel` ('empleado'|'admin') · `onlineBookable` default true
- **Payroll**: `salaryType` ('fijo'|'mixto'|'autonomo'|null) · `salaryBaseCents` · `commissionServicesPct` 0-100 · `commissionProductsPct` 0-100 · `chairRentCents`
- UNIQUE (clientId, name)
- [unit: —] [e2e: —] [risk: P0]

### 1.7 `barber_breaks` — descansos recurrentes semanales
- `id` · `clientId` FK · `barberId` FK cascade · `weekday` 0-6 (0=domingo) · `startTime` HH:MM · `endTime` HH:MM · `createdAt` · `updatedAt`
- [unit: src/lib/availability*.test.ts] [e2e: —] [risk: P1]

### 1.8 `barber_blocks` — bloqueos puntuales / ausencias
- `id` · `clientId` FK · `barberId` FK cascade · `date` YYYY-MM-DD · `startTime` HH:MM (null=día completo) · `endTime` HH:MM (null=día completo) · `kind` ('block'|'absence') · `reason` ('personal'|'enfermedad'|'vacaciones'|'formacion'|null) · `note` · `approved` bool default true · `createdAt` · `updatedAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.9 `bonuses` — catálogo de bonos por local
- `id` · `clientId` FK · `name` · `kind` ('meta'|'tramo') · `unit` ('units'|'euros') · `target` int (si euros → cents) · `rewardCents` · `active` · `createdAt` · `updatedAt`
- [unit: —] [e2e: —] [risk: P2]

### 1.10 `bonus_entries` — progreso diario por (barbero, bono)
- `id` · `clientId` FK · `bonusId` FK cascade · `barberId` FK · `value` int (unidades o cents) · `date` YYYY-MM-DD · `note` · `createdAt`
- [unit: —] [e2e: —] [risk: P2]

### 1.11 `barber_service_commissions` — override % comisión por servicio (R8)
- `id` · `clientId` FK · `barberId` FK cascade · `serviceName` text · `pct` 0-100
- UNIQUE (clientId, barberId, serviceName)
- [unit: —] [e2e: —] [risk: P2]

### 1.12 `barber_services` — whitelist servicios por barbero
- `id` · `clientId` FK · `barberId` FK cascade · `serviceName` text
- UNIQUE (clientId, barberId, serviceName)
- Sin filas = hace todos. Con ≥1 fila = solo esos. Tabla aditiva, no conectada aún al motor de disponibilidad
- [unit: —] [e2e: —] [risk: P2]

### 1.13 `team_competitions` — competición semanal equipo (R10)
- `id` · `clientId` FK · `name` · `metric` ('revenue'|'bookings') · `rewardCentsPerWeek` · `streakWeeksForBonus` default 4 · `streakBonusCents` default 0 · `active` · `createdAt` · `updatedAt`
- [unit: —] [e2e: —] [risk: P2]

### 1.14 `team_competition_weeks` — resultado congelado por semana ISO
- `id` · `clientId` FK · `competitionId` FK cascade · `isoWeekStart` YYYY-MM-DD (lunes ISO) · `winnerBarberId` FK barbers · `winnerMetricValue` (cents o nº citas) · `computedAt`
- UNIQUE (competitionId, isoWeekStart). Primera lectura congela — nunca se recomputa
- [unit: —] [e2e: —] [risk: P2]

### 1.15 `subscriptions` — histórico Stripe subscriptions
- `id` · `clientId` FK · `stripeSubscriptionId` · `plan` LEGACY · `tier` ('solo'|'pro'|'estudio') · `billingInterval` · `amount` cents · `currency` · `status` ('active'|'past_due'|'cancelled'|'trialing') · `trialEndsAt` · `currentPeriodStart` · `currentPeriodEnd` · `cancelledAt` · `createdAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.16 `analytics` — estadísticas de mensajes bot por día
- `id` · `clientId` FK · `date` timestamp · `messagesReceived` · `messagesReplied` · `bookingsMade` · `bookingsCancelled`
- [unit: —] [e2e: —] [risk: P2]

### 1.17 `conversations` — estado FSM del bot WhatsApp
- `id` · `clientId` FK · `customerPhone` · `step` (FSM: 'idle'|...) · `selectedService` · `selectedSlot` · `context` jsonb · `lastInteraction` · `createdAt`
- [unit: —] [e2e: —] [risk: P0]

### 1.18 `customers` — clientes del barbero (per-tenant)
- `id` · `clientId` FK · `phone` E.164 · `name` · `email`
- **Métricas**: `totalBookings` · `noShows` · `cancellations` · `reputation` ('good'|'warning'|'blocked') · `lastBookingAt`
- **Notas**: `barberNotes` (privado, solo dashboard)
- **Attribution first-touch**: `firstSource` · `firstSourceMedium` · `firstSourceCampaign` · `firstSourceCapturedAt`
- **No-show card**: `stripeCustomerId` · `defaultPaymentMethodId` · `cardConsentAt` · `cardConsentSource` ('web'|'pwa')
- `createdAt`
- [unit: —] [e2e: —] [risk: P0]

### 1.19 `bookings` — citas
- `id` · `clientId` FK · `customerPhone` · `customerName`
- **Servicio**: `service` · `barberId` FK barbers · `barber` snapshot text · `date` YYYY-MM-DD · `time` HH:MM · `duration` minutos · `price` **EUROS** (foot-gun schema)
- **Status**: `status` ('confirmed'|'cancelled'|'completed'|'no_show') · `googleEventId`
- **Source**: `source` ('bot'|'booksy'|'web'|'manual'|'voice') · `referrerSource` · `referrerMedium` · `referrerCampaign` · `booksyBookingId` · `rawEmailSnippet`
- **Flags**: `reminderSent` · `followupSentAt` · `paymentMethod` ('cash'|'card'|'online'|null) · `barberRequested` bool
- `cancelledAt` · `createdAt`
- **FOOT-GUN**: `price` es EUROS. Todo lo demás (invoices, payments, tips) es CENTS. ×100 al cruzar boundary
- [unit: src/lib/bookings/total.test.ts] [e2e: —] [risk: P0]

### 1.20 `booking_services` — servicios extra de cita multi-servicio (R7)
- `id` · `bookingId` FK cascade · `name` · `durationMin` (se SUMA a bookings.duration) · `priceEuros` **EUROS** (null = cortesía) · `displayOrder` · `createdAt`
- ON DELETE CASCADE en bookingId
- [unit: src/lib/bookings/total.test.ts] [e2e: —] [risk: P0]

### 1.21 `waitlist` — lista de espera
- `id` · `clientId` FK · `customerPhone` · `customerName` · `date` · `time` (null = cualquier hueco del día) · `service` · `barber` · `status` ('waiting'|'notified'|'booked'|'expired') · `notifiedAt` · `createdAt`
- [unit: —] [e2e: —] [risk: P2]

### 1.22 `leads` — pipeline comercial de nuevas barberías
- `id` · `name` · `businessName` · `phone` · `email` · `message` · `source` ('website'|'whatsapp'|'referral'|'manual'|'instagram'|'other') · `status` ('new'|'contacted'|'converted'|'lost') · `notes` · `nextActionAt` · `convertedToClientId` FK clients · `createdAt` · `updatedAt`
- [unit: —] [e2e: —] [risk: P2]

### 1.23 `admin_actions` — audit log operativo
- `id` · `adminEmail` · `intent` (mismo string de server actions) · `targetType` ('client'|'lead'|'invoice'|'system') · `targetId` · `summary` · `metadata` jsonb · `createdAt`
- [unit: —] [e2e: —] [risk: P2]

### 1.24 `email_parse_log` — observabilidad Booksy inbound email
- `id` · `clientId` FK nullable · `receivedAt` · `toEmail` · `fromEmail` · `subject` · `rawSnippet` 2000 chars · `status` ('full'|'partial'|'failed'|'unmatched_client'|'llm_assisted') · `parseSource` ('regex'|'llm') · `parsedFields` jsonb · `missingFields` text[] · `bookingId` FK bookings · `alertSent` · `errorMessage`
- [unit: —] [e2e: —] [risk: P2]

### 1.25 `processed_stripe_events` — idempotencia webhook Stripe
- `eventId` text PK · `processedAt`
- INSERT ON CONFLICT DO NOTHING → exactly-once delivery
- [unit: —] [e2e: —] [risk: P0]

### 1.26 `invoices` — facturas / tickets emitidos al cliente final
- `id` · `clientId` FK · `bookingId` FK (null = manual) · `number` UNIQUE per client · `issueDate` date · `customerName` · `customerPhone` · `customerNif` (null = ticket B2C) · `customerAddress`
- **Importes cents**: `subtotalCents` · `ivaRate` int · `ivaAmountCents` · `totalCents` · `currency` default 'EUR'
- **Flow**: `type` ('ticket'|'invoice') · `status` ('issued'|'voided'|'rectified') · `notes` · `paidOnlineAt`
- **VeriFactu**: `huella` SHA-256 64 chars · `huellaAnterior` · `isPrimerRegistro` · `tipoFactura` ('F1'|'F2'|'F3'|'R1'|'R5') · `fechaHoraHusoGen` · `qrUrl` · `verifactuStatus` ('pending'|'sent'|'accepted'|'accepted_with_errors'|'rejected'|'error') · `verifactuSentAt` · `verifactuResponseAt` · `verifactuErrorCode` · `verifactuErrorMsg` · `verifactuXmlSent` · `verifactuXmlResponse` · `verifactuRetryCount`
- **Rectificativa**: `rectifiesInvoiceId` · `rectificationMotivo`
- **Anulación**: `anuladaAt` · `anulacionHuella`
- UNIQUE (clientId, number)
- [unit: —] [e2e: —] [risk: P0]

### 1.27 `invoice_registro_events` — libro de eventos SIF (AEAT VeriFactu)
- `id` · `clientId` FK · `eventType` ('alta'|'anulacion'|'sistema') · `invoiceId` FK (nullable para eventos sistema) · `huella` · `huellaAnterior` · `fechaHoraHusoGen` · `xmlPayload` · `verifactuStatus` · `verifactuSentAt` · `verifactuResponseAt` · `verifactuErrorCode` · `verifactuErrorMsg` · `data` jsonb · `createdAt`
- [unit: —] [e2e: —] [risk: P0]

### 1.28 `payments` — cobros online Stripe Connect (destination charges)
- `id` · `clientId` FK · `bookingId` FK · `invoiceId` FK · `stripeCheckoutSessionId` UNIQUE · `stripePaymentIntentId` · `stripeChargeId`
- **Importes**: `amountCents` · `applicationFeeCents` default 0 · `currency`
- **Flow**: `type` ('full'|'deposit') · `status` ('pending'|'succeeded'|'failed'|'refunded'|'cancelled') · `description` · `paymentLinkUrl`
- `createdAt` · `paidAt` · `updatedAt`
- `type='no_show_fee'` cuando es el cobro off-session de no-show
- [unit: src/lib/stripe/no-show-fee.test.ts] [e2e: —] [risk: P0]

### 1.29 `tips` — propinas + valoraciones post-servicio
- `id` · `clientId` FK · `bookingId` FK (null = espontánea) · `stripeCheckoutSessionId` UNIQUE · `stripePaymentIntentId` · `stripeChargeId`
- `amountCents` default 0 (0 = solo rating, sin propina) · `currency`
- `status` ('pending'|'paid'|'expired'|'refunded'|'failed'|'rating_only')
- Snapshots: `customerPhone` · `barberName` · `rating` 1-5 · `ratingComment`
- `paymentLinkUrl` · `createdAt` · `paidAt` · `updatedAt`
- Las propinas NO llevan IVA (liberalidad, ley ES). Se incluyen en P&L pero fuera de base imponible
- [unit: —] [e2e: —] [risk: P1]

### 1.30 `loyalty_ledger` — ledger append-only de sellos/puntos
- `id` · `clientId` FK · `customerId` FK customers · `bookingId` FK (null = ajuste) · `delta` int (>0 earn, <0 canje) · `reason` ('booking_completed'|'redeem'|'adjustment_manual'|'expired') · `note` · `rewardSnapshot` jsonb · `createdBy` ('system_cron'|'barber:<id>'|'customer:<id>') · `createdAt`
- UNIQUE parcial sobre bookingId donde reason='booking_completed' → idempotencia cron
- [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

### 1.31 `ratings` — valoraciones independientes de propinas
- `id` · `clientId` FK · `bookingId` FK · `customerPhone` · `customerName` · `barberName` · `rating` 1-5 · `comment` · `channel` ('whatsapp'|'pwa') · `createdAt`
- UNIQUE parcial sobre bookingId → solo primera valoración por cita
- [unit: —] [e2e: —] [risk: P1]

### 1.32 `promo_pushes` — log de promos enviadas
- `id` · `clientId` FK · `customerPhone` · `customerName` · `discountPct` snapshot · `windowStart` / `windowEnd` string legible · `channel` ('push'|'whatsapp'|'none') · `message` snapshot · `createdAt`
- Rate limit: máx 1 promo / cliente / 7 días (WHERE createdAt > now()-7d)
- [unit: —] [e2e: —] [risk: P1]

### 1.33 `products` — catálogo de productos del local
- `id` · `clientId` FK · `name` · `description` · `imageUrl` Vercel Blob · `priceCents` IVA incluido · `stockQuantity` (null = ilimitado) · `active` soft-delete · `displayOrder` · `createdAt` · `updatedAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.34 `product_sales` — ventas individuales de productos
- `id` · `clientId` FK · `productId` FK · `bookingId` FK (null = standalone) · `barberId` FK lógica nullable · `quantity` · `unitPriceCents` snapshot · `totalCents` = unit×qty · `customerPhone` · `paymentMethod` ('cash'|'card'|'online') · `invoicedAt` · `soldAt` · `createdAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.35 `invoice_items` — líneas de factura
- `id` · `invoiceId` FK cascade · `kind` ('service'|'product') · `name` snapshot · `quantity` · `unitPriceCents` IVA inc · `subtotalCents` base imp · `ivaAmountCents` · `totalCents` · `productSaleId` FK product_sales · `displayOrder` · `createdAt`
- No entra en hash VeriFactu (solo totales agregados)
- [unit: —] [e2e: —] [risk: P0]

### 1.36 `cash_sessions` — sesión de caja diaria
- `id` · `clientId` FK · `openingCents` · `openedAt` · `openedByEmail`
- Cierre: `closedAt` · `closedByEmail` · `closingCentsExpected` · `closingCentsCounted` · `cashDescuadreCents` · `cardTerminalExpectedCents` · `cardTerminalCountedCents` · `cardDescuadreCents` · `notes` · `createdAt`
- UNIQUE parcial sobre (clientId WHERE closedAt IS NULL) → solo 1 sesión abierta
- [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P1]

### 1.37 `cash_movements` — apuntes del cuadre diario
- `id` · `clientId` FK · `sessionId` FK cascade · `kind` ('booking'|'product_sale'|'tip_cash'|'expense'|'withdrawal'|'deposit'|'adjustment'|'refund') · `method` ('cash'|'card'|'online') · `amountCents` SIEMPRE positivo — el signo lo pone compute.ts (NEGATIVE_KINDS) · `referenceType` ('booking'|'product_sale'|null) · `referenceId` uuid · `sumupTransactionId` UNIQUE (idempotencia SumUp + refunds) · `notes` · `createdByEmail` · `createdAt`
- [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P1]

### 1.38 `sumup_pending_transactions` — buffer transactions sin sesión
- `id` · `clientId` FK · `sumupTransactionId` UNIQUE · `amountCents` · `currency` · `status` · `paymentType` · `transactionTimestamp` · `rawPayload` jsonb · `createdAt` · `importedAt` (null hasta que se mueve a cash_movements)
- [unit: —] [e2e: —] [risk: P1]

### 1.39 `mobile_pins` — PINs emparejamiento app nativa del barbero
- `id` · `clientId` FK · `pinHash` SHA-256 · `expiresAt` 10 min · `redeemedAt` · `createdAt` · `createdByEmail`
- Verificación con timingSafeEqual
- [unit: —] [e2e: —] [risk: P1]

### 1.40 `mobile_sessions` — tokens long-lived app nativa (Bearer, Keychain)
- `id` · `clientId` FK · `tokenHash` UNIQUE SHA-256 · `deviceLabel` · `lastUsedAt` · `revokedAt` (null = activa) · `createdAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.41 `expenses` — gastos variables
- `id` · `clientId` FK · `date` date · `amountCents` · `category` ('productos'|'suministros'|'publicidad'|'personal'|'nomina'|'otro') · `notes` · `createdAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.42 `fixed_costs` — costes fijos recurrentes
- `id` · `clientId` FK · `name` · `amountCents` · `category` · `activeFrom` date · `active` · `sortOrder` · `createdAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.43 `owner_withdrawals` — retiradas de caja del dueño
- `id` · `clientId` FK · `date` date · `amountCents` · `notes` · `createdAt`
- [unit: —] [e2e: —] [risk: P1]

### 1.44 `manual_incomes` — ingresos manuales no recurrentes
- `id` · `clientId` FK · `date` date · `amountCents` · `notes` · `createdAt`
- [unit: —] [e2e: —] [risk: P1]

---

## 2. Multi-tenancy y auth middleware

_`src/lib/auth/require-client-access.ts`_

### 2.1 `requireClientAccess(request, options?)` — resolución de tenant
- Lee sesión Better Auth desde `request`
- Resuelve `clientId` del email de sesión → `clients` tabla. NUNCA acepta clientId del body o query
- Admins pueden impersonar con `expectedClientId` en options
- Retorna `ClientAccess` union: `{ ok: true, client, userEmail }` | `{ ok: false, reason: 'unauthenticated'|'no_client'|'forbidden' }`
- [unit: —] [e2e: —] [risk: P0]

### 2.2 `accessErrorResponse(access)` — respuesta HTTP 401/403
- Convierte `ClientAccess { ok: false }` en Response con status correcto
- [unit: —] [e2e: —] [risk: P0]

### 2.3 `requireCron(request)` — guard cron jobs
- `src/lib/auth/require-cron.ts`
- Verifica `Authorization: Bearer <CRON_SECRET>` del header
- Retorna `true` o lanza Response 401
- [unit: —] [e2e: —] [risk: P0]

### 2.4 `requireAdmin(request)` — guard panel admin
- `src/lib/auth/require-admin.ts`
- Verifica que el email de sesión esté en `isAdminEmail` list
- [unit: —] [e2e: —] [risk: P0]

### 2.5 `requireMobileSession(request)` — guard app nativa (Bearer)
- `src/lib/auth/mobile-session.ts`
- Lee header `Authorization: Bearer <token>` → SHA-256 hash → busca en `mobile_sessions` (revokedAt IS NULL)
- Retorna `{ clientId }` o null
- [unit: —] [e2e: —] [risk: P1]

---

## 3. Billing / Tiers

_`src/lib/billing/tier.ts`_

### 3.1 Catálogo de features por tier
- `FEATURE_MIN_TIER` record: `agenda|caja|pwaPublica|veriFactu|cobroOnlineQr|fidelidadBase` → 'solo'; `whatsappBot|multiBarber|sumupTapToPay|loyaltyAdvanced|promosContextuales|walkInsAvanzados|controlFinanciero|gtmContainer|teamBonuses` → 'pro'; `recepcionistaIA|subdominioPropio|onboarding1a1|soportePrioritario` → 'estudio'
- [unit: —] [e2e: —] [risk: P0]

### 3.2 `hasFeature(client, feature, now?)` — gating runtime
- Considera tier efectivo: trial activo → trata como 'pro' aunque tier='solo'
- Cancelled → solo features 'solo'
- [unit: —] [e2e: —] [risk: P0]

### 3.3 `upgradeRequiredResponse(feature)` — respuesta 403 estándar
- JSON `{ error: 'upgrade_required', feature, title, body, ctaTier }`
- [unit: —] [e2e: —] [risk: P0]

### 3.4 `TIER_PRICES` — precios de referencia en cents/mes
- `solo: {monthly:0, annual:0}` · `pro: {monthly:4900, annual:3900}` · `estudio: {monthly:16900, annual:11900}`
- [unit: —] [e2e: —] [risk: P0]

### 3.5 Trial
- `TRIAL_DAYS_BY_TIER`: solo=null, pro=14, estudio=null
- `isInTrial(client, now)` · `trialDaysLeft(client, now)`
- [unit: —] [e2e: —] [risk: P0]

### 3.6 `ESTUDIO_INCLUDED_CALLS_PER_MONTH = 200` · `ESTUDIO_OVERAGE_CENTS_PER_CALL = 30`
- [unit: —] [e2e: —] [risk: P2]

---

## 4. API — Bookings (dashboard)

### 4.1 `POST /api/bookings/create`
- `src/app/api/bookings/create/route.ts`
- Auth: `requireClientAccess`
- Body: `{service, date, time, barberId?, customerPhone, customerName?, price?, duration?}`
- Llama `createBooking()` con source='manual'
- [unit: —] [e2e: —] [risk: P0]

### 4.2 `GET /api/bookings/[id]`
- `src/app/api/bookings/[id]/route.ts`
- Auth: `requireClientAccess`. Devuelve booking con extras (booking_services)
- [unit: —] [e2e: —] [risk: P1]

### 4.3 `PATCH /api/bookings/[id]` — actualizar / completar
- Auth: `requireClientAccess`
- Soporta status transitions: → 'completed' (pide paymentMethod si cashRegisterEnabled → recordMovementInBackground), → 'cancelled' (actualiza noShows/cancellations en customer), → 'no_show' (incrementa noShows, dispara chargeNoShowFee fire-and-forget)
- Soporta reasignar barberId con re-check de solape (`hasBookingOverlap`)
- [unit: —] [e2e: —] [risk: P0]

### 4.4 `DELETE /api/bookings/[id]` — cancelar
- Auth: `requireClientAccess`
- [unit: —] [e2e: —] [risk: P1]

### 4.5 `GET /api/bookings/[id]/services` — extras multi-servicio
- Auth: `requireClientAccess`. Lista booking_services del booking
- [unit: —] [e2e: —] [risk: P1]

### 4.6 `POST /api/bookings/[id]/services` / `PUT /api/bookings/[id]/services`
- CRUD de extras. Actualiza también `bookings.duration` sumando todos los durationMin
- [unit: —] [e2e: —] [risk: P1]

### 4.7 `PATCH /api/bookings/[id]/status` — sólo el campo status
- Auth: `requireClientAccess`. Endpoint simplificado para cambio de status sin tocar otros campos
- [unit: —] [e2e: —] [risk: P1]

### 4.8 `POST /api/bookings/no-show`
- Auth: `requireClientAccess`. Marca booking como no_show + dispara chargeNoShowFee
- [unit: —] [e2e: —] [risk: P1]

### 4.9 `POST /api/bookings/undo-no-show`
- Auth: `requireClientAccess`. Revierte booking de no_show → confirmed/completed
- [unit: —] [e2e: —] [risk: P2]

### 4.10 `POST /api/bookings/import-vision`
- Auth: `requireClientAccess`. Import visual via imagen/screenshot
- [unit: —] [e2e: —] [risk: P2]

### 4.11 `GET /api/dashboard/calendar`
- Auth: `requireClientAccess`. Devuelve bookings del rango de fechas con join a barbers
- [unit: —] [e2e: —] [risk: P0]

---

## 5. API — Bookings (público / PWA)

### 5.1 `GET /api/public/availability/grid`
- Sin auth. Query params: `slug`, `date`, `serviceId?`
- Resuelve tenant por slug → llama motor de disponibilidad → devuelve slots libres
- [unit: —] [e2e: —] [risk: P0]

### 5.2 `POST /api/public/bookings/create`
- Sin auth (o sesión PWA opcional). Query param: `slug`
- Body: `{service, date, time, barberId?, customerPhone, customerName?, customerEmail?, setupIntentId?}`
- Si `setupIntentId` → llama `verifyConfirmedSetupIntent`, persiste stripeCustomerId + paymentMethodId en customers
- Llama `createBooking()` con source='web'
- Retorna booking id + confirmación
- [unit: —] [e2e: —] [risk: P0]

### 5.3 `POST /api/public/bookings/setup-intent`
- Sin auth. Rate limit: 10/window por IP, 5/window por phone
- Query param: `slug`
- Body: `{phone, name?, email?}`
- Verifica `noShowFeeCents > 0`. Llama `ensureCustomerSetupIntent`
- Retorna `{required: bool, feeCents, clientSecret, setupIntentId, publishableKey}`
- [unit: src/lib/stripe/setup-intent.test.ts] [e2e: —] [risk: P1]

---

## 6. API — Barbers y horarios

### 6.1 `GET /api/barbers` — lista equipo del tenant
- Auth: `requireClientAccess`. Devuelve barbers activos order by displayOrder
- [unit: —] [e2e: —] [risk: P1]

### 6.2 `POST /api/barbers` — crear barbero
- Auth: `requireClientAccess`. Verifica feature 'multiBarber' si count > 1
- [unit: —] [e2e: —] [risk: P1]

### 6.3 `GET /api/barbers/[id]` / `PATCH /api/barbers/[id]` / `DELETE /api/barbers/[id]`
- Auth: `requireClientAccess`. PATCH: edita nombre, horario, foto, bio, rol, payroll profile
- DELETE: soft-delete (active=false)
- [unit: —] [e2e: —] [risk: P1]

### 6.4 `GET /api/barbers/[id]/services` / `POST /api/barbers/[id]/services`
- CRUD whitelist servicios por barbero (barber_services)
- [unit: —] [e2e: —] [risk: P2]

### 6.5 `GET /api/barbers/[id]/blocks` / `POST /api/barbers/[id]/blocks` / `PATCH /api/barbers/[id]/blocks/[blockId]` / `DELETE ...`
- CRUD de barber_blocks (bloqueos puntuales y ausencias)
- [unit: —] [e2e: —] [risk: P1]

### 6.6 `GET /api/barbers/[id]/breaks` / `POST ...` / `PATCH .../breaks/[breakId]` / `DELETE ...`
- CRUD de barber_breaks (descansos semanales recurrentes)
- [unit: —] [e2e: —] [risk: P1]

### 6.7 `GET /api/blocked-dates` / `POST /api/blocked-dates` / `DELETE ...`
- Días completos bloqueados a nivel shop (clients.blockedDates jsonb[])
- Auth: `requireClientAccess`
- [unit: —] [e2e: —] [risk: P1]

---

## 7. API — Customers

### 7.1 `GET /api/customers/export` — CSV clientes
- Auth: `requireClientAccess`. Genera CSV con columnas phone, name, email, reputation, totalBookings, noShows, createdAt
- [unit: —] [e2e: —] [risk: P2]

### 7.2 `PATCH /api/customers/[id]/profile` — editar perfil cliente
- Auth: `requireClientAccess`. Edita name, email, reputation, notas
- [unit: —] [e2e: —] [risk: P1]

### 7.3 `POST /api/customers/[id]/email` — backfill email del cliente
- Auth: `requireClientAccess`. Permite al barbero añadir email a un customer existente
- [unit: —] [e2e: —] [risk: P2]

### 7.4 `PATCH /api/customers/[id]/notes` — notas privadas del barbero
- Auth: `requireClientAccess`
- [unit: —] [e2e: —] [risk: P2]

### 7.5 `POST /api/dashboard/customers/[customerId]/forgive` — perdonar no-shows
- Auth: `requireClientAccess`. Resetea noShows a 0 y reputation → 'good'
- [unit: —] [e2e: —] [risk: P2]

### 7.6 `POST /api/dashboard/customers/[customerId]/unblock` — desbloquear cliente
- Auth: `requireClientAccess`. reputation → 'good'
- [unit: —] [e2e: —] [risk: P2]

### 7.7 `GET /api/pos/customers` — búsqueda rápida para POS
- Auth: `requireClientAccess`. Typeahead por phone/name para registrar venta de producto
- [unit: —] [e2e: —] [risk: P2]

---

## 8. API — Payments (Stripe Connect)

### 8.1 `POST /api/payments/create-link`
- Auth: `requireClientAccess`
- Crea Stripe Checkout Session como destination charge con `transfer_data.destination = stripeConnectAccountId`
- Body: `{bookingId, amountCents, description}`
- Inserta row en `payments` status='pending'
- Retorna `{paymentLinkUrl}`
- [unit: —] [e2e: —] [risk: P0]

### 8.2 `GET /api/payments/[id]` — detalle pago
- Auth: `requireClientAccess`. Incluye status sincronizado con Stripe
- [unit: —] [e2e: —] [risk: P1]

### 8.3 `POST /api/payments/[id]/refund` — reembolso in-app
- Auth: `requireClientAccess`
- Lee payments row → `stripeChargeId` → llama `refundStripeCharge()` (reverse_transfer + refund_application_fee)
- Idempotency key: `otracita-refund-{paymentId}-{amountCents}`
- Actualiza payments.status → 'refunded'
- Llama `recordRefundMovement()` para la caja
- [unit: src/lib/stripe/refund.test.ts] [e2e: —] [risk: P0]

### 8.4 `GET /api/payments/by-booking` — pagos de una cita
- Auth: `requireClientAccess`. Query param: `bookingId`
- [unit: —] [e2e: —] [risk: P1]

### 8.5 `GET /api/payments/summary` — resumen de cobros del período
- Auth: `requireClientAccess`. Query params: `start`, `end`
- [unit: —] [e2e: —] [risk: P2]

### 8.6 `GET /api/stripe/connect/status` — estado cuenta Connect
- Auth: `requireClientAccess`. Devuelve stripeConnectStatus + accountId
- [unit: —] [e2e: —] [risk: P1]

### 8.7 `POST /api/stripe/connect/onboard` — iniciar onboarding Connect Express
- Auth: `requireClientAccess`
- Crea (o reutiliza) Express account → genera AccountLink con return_url + refresh_url
- Retorna `{url}` al dashboard
- [unit: —] [e2e: —] [risk: P0]

### 8.8 `GET /api/stripe/connect/login-link` — enlace al dashboard Connect
- Auth: `requireClientAccess`. Genera LoginLink para el barbero vea sus pagos en Stripe
- [unit: —] [e2e: —] [risk: P1]

### 8.9 `POST /api/checkout` — suscripción plataforma (Pro/Estudio signup)
- Auth: `requireClientAccess` o landing (nuevo signup)
- Body: `{tier, billingInterval}`
- Crea Stripe Checkout Session para subscription con `trial_period_days=14` si Pro
- [unit: —] [e2e: —] [risk: P0]

### 8.10 `POST /api/stripe/portal` — portal de billing Stripe (gestionar sub)
- Auth: `requireClientAccess`. Genera Customer Portal session URL
- [unit: —] [e2e: —] [risk: P1]

---

## 9. API — Webhooks Stripe

_`src/app/api/webhooks/stripe/route.ts` (765 líneas)_

### 9.1 Arquitectura dual-secret
- `STRIPE_WEBHOOK_SECRET` → eventos de la plataforma (subscriptions, tips, connect accounts)
- `STRIPE_CONNECT_WEBHOOK_SECRET` → eventos de cuentas Connect Express (destination charges)
- Idempotencia vía `processedStripeEvents` (INSERT ON CONFLICT DO NOTHING)
- [unit: —] [e2e: —] [risk: P0]

### 9.2 `checkout.session.completed` — pago completado
- **Sub-tipo subscription** (nuevo signup): crea row `clients` con tier+status+stripeIds; envía email onboarding
- **Sub-tipo payment** (destination charge): actualiza `payments.status='succeeded'`, guarda stripeChargeId, recordMovementInBackground
- **Sub-tipo tip**: actualiza `tips.status='paid'`, guarda stripeChargeId, actualiza customers.totalBookings si procede
- [unit: —] [e2e: —] [risk: P0]

### 9.3 `checkout.session.expired`
- Actualiza payments.status='cancelled' o tips.status='expired'
- [unit: —] [e2e: —] [risk: P1]

### 9.4 `charge.refunded`
- Actualiza payments.status='refunded'
- Llama `recordRefundMovement()` con dedupeKey=`refund.id` → idempotencia doble con la acción manual del barbero
- [unit: —] [e2e: —] [risk: P0]

### 9.5 `account.updated` — estado Connect
- Sincroniza `stripeConnectStatus` en clients ('none'|'pending'|'active'|'restricted')
- Si capabilities charges+transfers enabled → 'active' + `stripeConnectActivatedAt`
- [unit: —] [e2e: —] [risk: P1]

### 9.6 `customer.subscription.created` / `updated`
- Sincroniza `clients.tier`, `billingInterval`, `status`, `stripeSubscriptionId`
- Trial: si trialing → status='trialing'; si active → comprueba si tier cambió (upgrade/downgrade)
- Si paused/unpaid/canceled → plan downgrade a 'solo'
- [unit: —] [e2e: —] [risk: P0]

### 9.7 `customer.subscription.trial_will_end`
- Envía email aviso de fin de trial (7 días antes)
- [unit: —] [e2e: —] [risk: P1]

### 9.8 `customer.subscription.deleted`
- Clients.tier → 'solo', status → 'cancelled', stripeSubscriptionId → null
- [unit: —] [e2e: —] [risk: P0]

---

## 10. API — SumUp

### 10.1 `GET /api/sumup/oauth/start` — iniciar OAuth SumUp
- Auth: `requireClientAccess`. Genera state CSRF → redirecta a `buildAuthorizeUrl(state)`
- Scopes: transactions.history, user.profile_readonly, readers.read, readers.write, terminals.read
- [unit: —] [e2e: —] [risk: P1]

### 10.2 `GET /api/sumup/oauth/callback` — intercambio código
- Verifica state CSRF. Llama `exchangeCodeForTokens(code)` → persiste access+refresh tokens en clients
- [unit: —] [e2e: —] [risk: P1]

### 10.3 `POST /api/sumup/oauth/disconnect` — desconectar SumUp
- Auth: `requireClientAccess`. Borra sumupAccessToken + refreshToken + readerId de clients
- [unit: —] [e2e: —] [risk: P2]

### 10.4 `GET /api/sumup/readers` — lista readers del merchant
- Auth: `requireClientAccess`. Llama `listReaders()` con auto-refresh token
- [unit: —] [e2e: —] [risk: P1]

### 10.5 `POST /api/sumup/readers/select` — parejar reader
- Auth: `requireClientAccess`. Guarda sumupReaderId + sumupReaderName en clients
- [unit: —] [e2e: —] [risk: P1]

### 10.6 `POST /api/sumup/checkout/start` — iniciar cobro en reader
- Auth: `requireClientAccess`
- Body: `{bookingId, amountCents, description?}`
- Llama `createReaderCheckout()` → retorna checkout id + return_url
- El return_url apunta a /api/sumup/checkout/return
- [unit: —] [e2e: —] [risk: P0]

### 10.7 `GET /api/sumup/checkout/return` — SumUp llama aquí al completar
- Sin auth estricta (URL firmada con checkout_id)
- Verifica status del checkout en SumUp API
- Si SUCCESSFUL → inserta cash_movement kind='booking' (o 'product_sale'), actualiza booking.paymentMethod='card'
- Si FAILED → no hace nada (se reporta al UI)
- [unit: —] [e2e: —] [risk: P0]

### 10.8 `POST /api/sumup/refund` — reembolso SumUp
- Auth: `requireClientAccess`
- Body: `{transactionId, amountCents}`
- Llama `refundSumupTransaction()` → llama `recordRefundMovement()` con dedupeKey=transactionId
- [unit: src/lib/sumup/refund.test.ts] [e2e: —] [risk: P0]

### 10.9 `GET /api/app/mobile/sumup/credentials`
- Auth: Bearer mobile session
- Devuelve `{merchantCode, accessToken}` para que la app nativa llame directamente al SumUp Cloud API
- [unit: —] [e2e: —] [risk: P1]

---

## 11. API — Invoices / VeriFactu

### 11.1 `POST /api/invoices/from-booking` — factura automática de booking
- Auth: `requireClientAccess`
- Body: `{bookingId}`
- Llama `generateInvoiceFromBooking(bookingId)` → crea invoice + invoice_items (servicio + product_sales no facturados) + encadena VeriFactu (chainRegistroAlta)
- Incrementa atómicamente `clients.invoiceNumberNext`
- Verifica `hasCompleteFiscalEmisor(client)` antes de emitir
- [unit: —] [e2e: —] [risk: P0]

### 11.2 `POST /api/invoices/create-manual` — factura manual (sin booking)
- Auth: `requireClientAccess`
- Body: `{customerName, customerPhone, customerNif?, items[], date?}`
- [unit: —] [e2e: —] [risk: P1]

### 11.3 `POST /api/invoices/[id]/rectificativa` — factura rectificativa (R1-R5)
- Auth: `requireClientAccess`. Crea invoice con `tipoFactura='R1'`, `rectifiesInvoiceId`, encadena VeriFactu
- Actualiza original → status='rectified'
- [unit: —] [e2e: —] [risk: P0]

### 11.4 `GET /api/invoices/by-booking` — facturas de una cita
- Auth: `requireClientAccess`. Query param: `bookingId`
- [unit: —] [e2e: —] [risk: P1]

### 11.5 `GET /api/invoices/export` — exportar PDF/HTML de factura
- Auth: `requireClientAccess`. Renderiza HTML con datos fiscales + QR VeriFactu
- [unit: —] [e2e: —] [risk: P1]

### 11.6 `GET /api/invoices/export-xlsx` — exportar listado XLSX
- Auth: `requireClientAccess`. Exporta todas las facturas del período como XLSX para el gestor
- [unit: —] [e2e: —] [risk: P2]

### 11.7 `GET /api/invoicing/config` / `PATCH /api/invoicing/config` — configuración fiscal del tenant
- Auth: `requireClientAccess`. Edita fiscalName, fiscalNif, fiscalAddress, fiscalCity, fiscalPostalCode, ivaRate, invoiceNumberPrefix, invoiceNumberNext
- [unit: —] [e2e: —] [risk: P1]

---

## 12. API — Loyalty

### 12.1 `GET /api/loyalty/config` / `PATCH /api/loyalty/config`
- Auth: `requireClientAccess`. Lee/escribe `clients.loyaltyEnabled`, `loyaltyMode`, `loyaltyConfig` jsonb
- Valida shape con `sanitizeStampsConfig` / `sanitizePointsConfig`
- [unit: —] [e2e: —] [risk: P1]

### 12.2 `GET /api/loyalty/customer` — saldo y progreso de un cliente
- Auth: `requireClientAccess`. Query param: `phone`
- Suma loyalty_ledger.delta para (clientId, customerId) con expiración si configurada
- Devuelve `LoyaltyProgress` (StampsProgress | PointsProgress)
- [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

### 12.3 `POST /api/loyalty/redeem` — canjear recompensa (dashboard)
- Auth: `requireClientAccess`. Body: `{customerId, tierIndex?}`
- Verifica saldo suficiente → inserta loyalty_ledger delta negativo con reason='redeem'
- [unit: —] [e2e: —] [risk: P1]

### 12.4 `POST /api/loyalty/adjust` — ajuste manual de saldo
- Auth: `requireClientAccess`. Body: `{customerId, delta, note}`
- Inserta loyalty_ledger con reason='adjustment_manual', createdBy='barber:<clientId>'
- [unit: —] [e2e: —] [risk: P2]

### 12.5 `GET /api/app/loyalty` — saldo loyalty (cliente PWA)
- Auth: app session. Devuelve `LoyaltyProgress` del cliente autenticado para el tenant actual
- [unit: —] [e2e: —] [risk: P1]

---

## 13. API — Promos contextuales

### 13.1 `GET /api/promos/config` / `PATCH /api/promos/config`
- Auth: `requireClientAccess`. Lee/escribe `clients.promosEnabled` + defaults (descuento, texto promo)
- [unit: —] [e2e: —] [risk: P2]

### 13.2 `POST /api/promos/preview` — previsualizar promo antes de enviar
- Auth: `requireClientAccess`. Feature gate: 'promosContextuales'
- Llama `detectGaps(opts)` para el preset (today/tomorrow/weekend/next7) → retorna huecos + candidatos
- Llama `findEligibleCustomers(clientId)` → retorna lista de clientes a los que se enviaría
- [unit: —] [e2e: —] [risk: P1]

### 13.3 `POST /api/promos/send` — enviar promo
- Auth: `requireClientAccess`. Feature gate: 'promosContextuales'
- Para cada cliente elegible: llama `dispatchUserNotification()` (push o WhatsApp)
- Inserta fila en `promo_pushes` por cliente enviado (snapshot de mensaje + canal)
- Rate limit interno: `findEligibleCustomers` excluye ya a los que recibieron en los últimos 7 días
- [unit: —] [e2e: —] [risk: P1]

---

## 14. API — Finanzas (P&L)

### 14.1 `GET /api/finanzas/summary` — resumen del mes actual
- Auth: `requireClientAccess`. Feature gate: 'controlFinanciero'
- Llama `periodRevenueComponents()` → `computeRevenueCents()` → `computeIvaBreakdown()`
- Incluye: gastos variables (expenses), costes fijos (fixed_costs), retiros (owner_withdrawals), nóminas (computeMonthlyPayroll)
- [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P1]

### 14.2 `GET /api/finanzas/trend` — tendencia mensual (últimos 12 meses)
- Auth: `requireClientAccess`. Feature gate: 'controlFinanciero'
- Usa `periodRevenueComponents()` por mes + `computePayrollTotalsByMonth()` batch
- [unit: src/lib/finanzas/period-revenue.test.ts] [e2e: —] [risk: P1]

### 14.3 `GET /api/finanzas/quarterly` — trimestre actual
- Auth: `requireClientAccess`. Feature gate: 'controlFinanciero'
- Calcula IVA acumulado del trimestre (AEAT modelo 303 prep)
- [unit: —] [e2e: —] [risk: P1]

### 14.4 `GET /api/finanzas/annual` — año completo
- Auth: `requireClientAccess`. Feature gate: 'controlFinanciero'
- Usa `annualRevenueComponentsByMonth()` (5 queries batch con GROUP BY month, no 60 queries) + `computePayrollTotalsByMonth()`
- [unit: —] [e2e: —] [risk: P1]

### 14.5 `GET /api/finanzas/historical` — comparativa histórica multi-año
- Auth: `requireClientAccess`. Feature gate: 'controlFinanciero'
- [unit: —] [e2e: —] [risk: P2]

### 14.6 `GET /api/finanzas/payroll` — nóminas del mes
- Auth: `requireClientAccess`. Devuelve breakdown por barbero (base + comisiones + propinas + bonos - alquiler)
- [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P1]

### 14.7 Expenses CRUD
- `GET /api/finanzas/expenses` · `POST /api/finanzas/expenses` · `PATCH /api/finanzas/expenses/[id]` · `DELETE /api/finanzas/expenses/[id]`
- Auth: `requireClientAccess`. Feature gate: 'controlFinanciero'
- [unit: —] [e2e: —] [risk: P1]

### 14.8 Fixed costs CRUD
- `GET /api/finanzas/fixed-costs` · `POST /api/finanzas/fixed-costs` · `PATCH /api/finanzas/fixed-costs/[id]` · `DELETE /api/finanzas/fixed-costs/[id]`
- Auth: `requireClientAccess`. Feature gate: 'controlFinanciero'
- [unit: —] [e2e: —] [risk: P1]

### 14.9 Owner withdrawals CRUD
- `GET /api/finanzas/withdrawals` · `POST /api/finanzas/withdrawals` · `DELETE /api/finanzas/withdrawals/[id]`
- Auth: `requireClientAccess`. Feature gate: 'controlFinanciero'
- [unit: —] [e2e: —] [risk: P2]

### 14.10 Manual incomes CRUD
- `GET /api/finanzas/manual-incomes` · `POST /api/finanzas/manual-incomes` · `DELETE /api/finanzas/manual-incomes/[id]`
- Auth: `requireClientAccess`
- [unit: —] [e2e: —] [risk: P2]

---

## 15. API — Caja

### 15.1 `GET /api/cash/current` — sesión activa + movimientos del día
- Auth: `requireClientAccess`. Retorna sesión abierta (o null) + lista cash_movements + totales por método
- [unit: —] [e2e: —] [risk: P1]

### 15.2 `POST /api/cash/open` — abrir caja
- Auth: `requireClientAccess`. Body: `{openingCents}`
- Verifica UNIQUE (no hay otra abierta) → inserta cash_sessions
- Drena sumup_pending_transactions del día → inserta en cash_movements
- [unit: —] [e2e: —] [risk: P1]

### 15.3 `POST /api/cash/close` — cerrar caja
- Auth: `requireClientAccess`. Body: `{closingCentsCounted, cardTerminalCountedCents?, notes?}`
- Calcula expected via `computeExpectedClosing()` → calcula descuadre → actualiza cash_sessions
- [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P1]

### 15.4 `POST /api/cash/movements` — registrar movimiento manual
- Auth: `requireClientAccess`. Body: `{kind, method, amountCents, notes?}`
- Kinds permitidos manual: 'expense'|'withdrawal'|'deposit'|'adjustment'|'tip_cash'
- [unit: —] [e2e: —] [risk: P1]

### 15.5 `GET /api/cash/config` / `PATCH /api/cash/config`
- Auth: `requireClientAccess`. Edita `cashRegisterEnabled` en clients
- [unit: —] [e2e: —] [risk: P2]

---

## 16. API — Productos y ventas POS

### 16.1 `GET /api/products` / `POST /api/products`
- Auth: `requireClientAccess`. Catálogo de productos del tenant
- [unit: —] [e2e: —] [risk: P2]

### 16.2 `PATCH /api/products/[id]` / `DELETE /api/products/[id]`
- Auth: `requireClientAccess`. Soft-delete vía active=false
- [unit: —] [e2e: —] [risk: P2]

### 16.3 `POST /api/products/upload` — imagen de producto
- Auth: `requireClientAccess`. Sube a Vercel Blob → guarda URL en products.imageUrl
- [unit: —] [e2e: —] [risk: P2]

### 16.4 `GET /api/products/sales` — historial ventas de producto
- Auth: `requireClientAccess`. Con filtros de rango de fechas + barberId opcional
- [unit: —] [e2e: —] [risk: P2]

### 16.5 `POST /api/pos/sale` — registrar venta de producto (POS)
- Auth: `requireClientAccess`
- Body: `{productId, quantity, barberId?, customerPhone?, bookingId?, paymentMethod}`
- Valida stock atómicamente (UPDATE WHERE stock > 0) si stockQuantity != null
- Inserta product_sale → recordMovementInBackground
- [unit: —] [e2e: —] [risk: P1]

---

## 17. API — Bonos y competiciones

### 17.1 `GET /api/bonuses` / `POST /api/bonuses` — catálogo bonos
- Auth: `requireClientAccess`. Feature gate: 'teamBonuses'
- [unit: —] [e2e: —] [risk: P2]

### 17.2 `PATCH /api/bonuses/[id]` / `DELETE /api/bonuses/[id]`
- Auth: `requireClientAccess`
- [unit: —] [e2e: —] [risk: P2]

### 17.3 `GET /api/bonuses/entries` / `POST /api/bonuses/entries`
- Auth: `requireClientAccess`. Registra progreso diario por (barbero, bono)
- [unit: —] [e2e: —] [risk: P2]

### 17.4 `GET /api/competitions` / `POST /api/competitions`
- Auth: `requireClientAccess`. Feature gate: 'teamBonuses'. Competiciones semanales
- [unit: —] [e2e: —] [risk: P2]

### 17.5 `GET /api/competitions/leaderboard` — ranking semana ISO
- Auth: `requireClientAccess`. Computa (o lee congelado) ganador de la semana
- Si semana ya cerrada y no hay fila en team_competition_weeks → computa + persiste (freeze-once)
- [unit: src/lib/competitions/leaderboard.test.ts] [e2e: —] [risk: P2]

### 17.6 `GET /api/commissions/per-service` — ver overrides de comisión por servicio
- Auth: `requireClientAccess`. Lista barber_service_commissions del tenant
- [unit: —] [e2e: —] [risk: P2]

---

## 18. API — Cron jobs

_Schedules en `vercel.json`. Auth vía `requireCron()` → header `Authorization: Bearer <CRON_SECRET>`_

### 18.1 `GET /api/cron/reminders` — recordatorios diarios `0 10 * * *`
- Busca bookings de mañana (date = tomorrow) con reminderSent=false
- Para cada booking: llama `dispatchUserNotification()` (push o WhatsApp con template de reminder)
- Marca reminderSent=true
- También hace sweep: bookings pasados que siguen 'confirmed' → los marca 'completed' y dispara followup si procede
- [unit: —] [e2e: —] [risk: P0]

### 18.2 `GET /api/cron/loyalty-award` — asignación de sellos/puntos `0 22 * * *`
- Busca bookings completados hoy (status='completed') sin fila de loyalty_ledger (reason='booking_completed')
- Para cada booking: llama `computeBookingDelta()` → si delta > 0, inserta loyalty_ledger row
- Idempotente: UNIQUE parcial sobre (bookingId, reason='booking_completed') absorbe reinicios
- [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

---

## 19. API — App PWA (autenticación)

### 19.1 `POST /api/app/otp/request` — solicitar OTP por WhatsApp
- Sin auth. Body: `{phone, clientId}`
- Normaliza phone a E.164. Genera 6 dígitos con `randomInt`, almacena codeHash en app_otp_codes (expira en 10 min)
- Envía OTP vía WhatsApp sender
- Rate limit: máx N requests por (phone, window) para prevenir spam de SMS/WhatsApp
- [unit: —] [e2e: —] [risk: P0]

### 19.2 `POST /api/app/otp/verify` — verificar OTP y crear sesión
- Sin auth. Body: `{phone, code, clientId}`
- Llama `verifyCode(phone, code)` → MAX_ATTEMPTS=5 (brute-force cap)
- Si ok: upsert app_users (phone, name de customers si existe) → `issueAppSession()` → cookie httpOnly 90 días
- [unit: —] [e2e: —] [risk: P0]

### 19.3 `POST /api/app/logout` — cerrar sesión PWA
- Auth: app session. Llama `destroyAppSession()` → borra row DB + clear cookie
- [unit: —] [e2e: —] [risk: P1]

### 19.4 `POST /api/app/push/subscribe` — registrar Web Push subscription
- Auth: app session. Body: `{endpoint, p256dh, authKey, userAgent?}`
- Upsert en push_subscriptions con clientId del tenant actual
- [unit: —] [e2e: —] [risk: P1]

### 19.5 `POST /api/app/push/unsubscribe` — eliminar subscription push
- Auth: app session. Body: `{endpoint}`
- Actualiza enabled=false en push_subscriptions
- [unit: —] [e2e: —] [risk: P2]

---

## 20. API — App PWA (cliente)

### 20.1 `GET /api/app/me` — perfil del cliente autenticado
- Auth: app session. Devuelve `{phone, name, email, customerId?, loyaltyProgress?}` para el tenant actual
- [unit: —] [e2e: —] [risk: P1]

### 20.2 `GET /api/app/bookings` — citas del cliente
- Auth: app session. Devuelve historial de bookings del cliente para el tenant
- [unit: —] [e2e: —] [risk: P1]

### 20.3 `POST /api/app/bookings/[id]/cancel` — cancelar cita desde PWA
- Auth: app session. Verifica que el booking pertenece al cliente autenticado
- Solo cancela si `clients.botAllowCancelWhatsapp=true` y dentro del lead time mínimo
- [unit: —] [e2e: —] [risk: P1]

### 20.4 `POST /api/app/tips/create` — iniciar pago de propina desde PWA
- Auth: app session (o via token del follow-up link)
- Body: `{bookingId, amountCents}`
- Crea Stripe Checkout Session para propina como destination charge
- [unit: —] [e2e: —] [risk: P1]

### 20.5 `POST /api/app/ratings/submit` — enviar valoración desde PWA
- Auth: app session. Body: `{bookingId, rating, comment?}`
- Verifica UNIQUE parcial (una sola valoración por booking) → inserta en ratings
- [unit: —] [e2e: —] [risk: P1]

---

## 21. API — App Móvil (barbero nativo)

_Bearer token en header. `src/lib/auth/mobile-session.ts` para verificación._

### 21.1 `GET /api/app/mobile/me` — perfil barbero + tenant config
- Auth: Bearer mobile. Devuelve client config + barbero asociado si hay
- [unit: —] [e2e: —] [risk: P1]

### 21.2 `GET /api/app/mobile/today` — agenda del día
- Auth: Bearer mobile. Bookings de hoy del tenant, ordenados por time
- [unit: —] [e2e: —] [risk: P1]

### 21.3 `POST /api/app/mobile/checkout/record` — registrar cobro desde app
- Auth: Bearer mobile. Body: `{bookingId, amountCents, method, sumupTransactionId?}`
- Actualiza booking.paymentMethod → recordMovementFromReference
- [unit: —] [e2e: —] [risk: P1]

### 21.4 `POST /api/app/mobile/pin/generate` — generar PIN de emparejamiento
- Auth: `requireClientAccess` (dashboard web). Genera PIN 6 dígitos, almacena hasheado en mobile_pins (expira 10 min)
- [unit: —] [e2e: —] [risk: P1]

### 21.5 `POST /api/app/mobile/pin/redeem` — canjear PIN → emitir token Bearer
- Sin auth. Body: `{pin, deviceLabel?}`
- Busca mobile_pins (expiresAt > now, redeemedAt IS NULL) → timingSafeEqual del hash
- Si válido → genera token → inserta mobile_sessions → marca pin redeemedAt
- [unit: —] [e2e: —] [risk: P1]

### 21.6 `POST /api/app/mobile/logout` — revocar sesión app nativa
- Auth: Bearer mobile. Setea mobile_sessions.revokedAt = now
- [unit: —] [e2e: —] [risk: P2]

---

## 22. API — Admin

_Gateado por `requireAdmin()` (isAdminEmail list). Solo Alex puede acceder._

### 22.1 `GET /api/admin/export/clients.csv` — exportar todos los tenants
- Auth: requireAdmin. CSV con businessName, email, status, tier, createdAt, onboardedAt, etc.
- [unit: —] [e2e: —] [risk: P2]

### 22.2 `GET /api/admin/export/leads.csv` — exportar leads pipeline
- Auth: requireAdmin
- [unit: —] [e2e: —] [risk: P2]

### 22.3 `GET /api/admin/email-health/stats` — salud del parser Booksy email
- Auth: requireAdmin. Lee email_parse_log. Muestra tasa de éxito regex vs LLM, campos faltantes frecuentes
- [unit: —] [e2e: —] [risk: P2]

### 22.4 `POST /api/admin/email-health/reprocess` — reprocesar email fallado
- Auth: requireAdmin. Reprocesa un email_parse_log con status='failed' usando LLM fallback
- [unit: —] [e2e: —] [risk: P2]

### 22.5 `GET /api/leads` / `POST /api/leads`
- GET: sin auth (form público landing). POST: crea lead desde el form
- [unit: —] [e2e: —] [risk: P2]

### 22.6 `GET /api/session-info` — info de sesión actual (debug)
- Auth: cualquier sesión válida. Útil para diagnosticar problemas de auth en staging
- [unit: —] [e2e: —] [risk: P2]

---

## 23. API — Misc (tips, ratings, voice, email, chat, setup)

### 23.1 `GET /api/tips/config` / `PATCH /api/tips/config`
- Auth: `requireClientAccess`. Edita `tipsEnabled`, `tipsSuggestedCents`, `followupMinutesAfter`
- [unit: —] [e2e: —] [risk: P1]

### 23.2 `GET /api/tips/[id]` — detalle propina
- Auth: `requireClientAccess`
- [unit: —] [e2e: —] [risk: P2]

### 23.3 `GET /api/ratings/config` / `PATCH /api/ratings/config`
- Auth: `requireClientAccess`. Edita `ratingsEnabled`, `googleReviewUrl`
- [unit: —] [e2e: —] [risk: P1]

### 23.4 `GET /api/voice/token` — Twilio token (prototipo voz)
- Auth: `requireClientAccess`. Genera Twilio Access Token para browser SDK
- Sólo activo en staging / dashboard voice-test
- [unit: —] [e2e: —] [risk: P2]

### 23.5 `GET /api/voice/availability` — disponibilidad para bot de voz
- Sin auth estricta. Devuelve slots en formato que entiende el bot de voz
- [unit: —] [e2e: —] [risk: P2]

### 23.6 `POST /api/voice/book` — crear reserva desde bot de voz
- Sin auth estricta. Llama `createBooking()` con source='voice'
- [unit: —] [e2e: —] [risk: P2]

### 23.7 `POST /api/email/inbound` — Postmark inbound webhook (Booksy emails)
- Sin auth de usuario — Postmark firma el payload
- Parsea el email (regex → LLM fallback) → llama `createBooking()` con source='booksy'
- Inserta row en email_parse_log para observabilidad
- [unit: —] [e2e: —] [risk: P1]

### 23.8 `POST /api/whatsapp` — Meta WhatsApp webhook (bot)
- Sin auth de usuario — Meta firma con X-Hub-Signature-256
- GET (verificación webhook): devuelve challenge si token correcto
- POST: routea al WhatsApp engine (`src/lib/whatsapp/engine.ts`)
- [unit: —] [e2e: —] [risk: P0]

### 23.9 `POST /api/chat` — chat IA del dashboard
- Auth: `requireClientAccess`. Streaming SSE con LLM (modelo configurable). Contexto de bookings/clientes del tenant
- [unit: —] [e2e: —] [risk: P2]

### 23.10 `POST /api/dashboard-chat` — chat alternativo (landing / onboarding)
- Sin auth estricta. Chat de soporte / onboarding
- [unit: —] [e2e: —] [risk: P2]

### 23.11 `POST /api/setup` — inicialización de tenant
- Auth: `requireClientAccess`. Wizard post-signup: set botName, chatbotHours, chatbotServices, publicSlug
- [unit: —] [e2e: —] [risk: P1]

### 23.12 `POST /api/clients/gtm` — guardar GTM container ID
- Auth: `requireClientAccess`. Feature gate: 'gtmContainer'. Edita `clients.gtmContainerId`
- [unit: —] [e2e: —] [risk: P2]

### 23.13 `POST /api/public-page/upload` — subir imagen brand
- Auth: `requireClientAccess`. Sube a Vercel Blob → guarda URL en brandLogoUrl / brandCoverUrl
- [unit: —] [e2e: —] [risk: P2]

### 23.14 `GET /api/public-page/config` / `PATCH /api/public-page/config`
- Auth: `requireClientAccess`. Edita publicEnabled, brandTheme, brandColor, publicDescription, redes sociales
- [unit: —] [e2e: —] [risk: P1]

### 23.15 `POST /api/scrape-booksy` / `GET /api/scrape-booksy`
- Auth: `requireClientAccess`. Scraping de perfil Booksy del cliente para importar catálogo inicial
- [unit: —] [e2e: —] [risk: P2]

### 23.16 `GET /api/auth/create-account` / `GET /api/auth/[...all]`
- Better Auth handlers — login, signup, Google SSO, session management para el dashboard
- [unit: —] [e2e: —] [risk: P0]

---

## 24. Lib — Bookings pipeline

_`src/lib/bookings/create.ts` (607 líneas). Única fuente para todos los callers (bot, web, dashboard, voice)._

### 24.1 `createBooking(options: CreateBookingOptions)` — pipeline completo
- Input: `{clientId, service, date, time, barberId?, customerPhone, customerName?, price?, duration?, source, noCardRequiredOverride?, ...attribution}`
- **Validación**: serviceName · date format · time format · price/duration presentes
- **Lead time**: `date+time >= now + minLeadTimeMinutes`. Error: `'lead_time'`
- **Horizon**: `date <= now + maxBookingHorizonDays`. Error: `'horizon'`
- **Card consent**: si `noShowFeeCents > 0` y source != 'bot' y sin setupIntentId → error `'card_required'`
- **Barber resolution**: barberId explícito → verifica existe en tenant. Sin barberId → `pickBarberForCustomer()` (round-robin activos onlineBookable). Error: `'no_barber_available'`
- **Solape**: `hasBookingOverlap()` con serviceBufferMinutes. Error: `'overlap'`
- **DB insert**: `bookings` + `booking_services` si hay extras
- **Customer upsert**: busca por phone → crea si no existe → backfill email si hay app_user con ese phone
- **Notificación**: fire-and-forget `dispatchUserNotification()` con push o WhatsApp
- Retorna `CreateBookingResult: {booking, customer, barber}`
- [unit: —] [e2e: —] [risk: P0]

### 24.2 `CreateBookingError` type
- `'validation' | 'overlap' | 'lead_time' | 'horizon' | 'no_barber_available' | 'card_required'`
- [unit: —] [e2e: —] [risk: P0]

### 24.3 `bookingTotalCents(bookingId)` — total real de la cita en cents
- `src/lib/bookings/total.ts`
- `Math.round((bookings.price + Σ bookingServices.priceEuros) * 100)`
- El ×100 se aplica UNA VEZ sobre la suma en euros → mismo boundary de redondeo que la factura
- Sin extras devuelve `round(bookings.price * 100)` (no-regresión)
- [unit: src/lib/bookings/total.test.ts] [e2e: —] [risk: P0]

### 24.4 `hasBookingOverlap(params)` — único check de solape
- `src/lib/bookings/` (extraído de create.ts en refactor #9)
- Consulta DB por (clientId, barberId, date) en status != 'cancelled'. Incluye buffer
- [unit: —] [e2e: —] [risk: P0]

### 24.5 `computeBookingDuration(base, extras)` — duración total
- `src/lib/bookings/duration.ts`. `base + Σ extras.durationMin`
- [unit: —] [e2e: —] [risk: P1]

### 24.6 `isValidEmail(raw)` — validador email exportado
- Regex básico + format check. Usado en el pipeline para backfill email
- [unit: —] [e2e: —] [risk: P2]

---

## 25. Lib — Availability engine

_`src/lib/availability.ts` + `src/lib/availability-hours.ts`_

### 25.1 `getAvailableSlots(options: AvailabilityOptions)` — slots libres
- `AvailabilityOptions`: `{clientId, date, serviceDurationMinutes, barberId?, slotStepMinutes, minLeadTimeMinutes, serviceBufferMinutes, maxBookingHorizonDays}`
- Por barbero: lee `barber.hours` (o hereda `client.chatbotHours`) → rango apertura del día
- Resta: `barber.blockedDates`, `barber_blocks` del día, `barber_breaks` del weekday
- Genera slots cada `slotStepMinutes` donde el servicio cabe entero + buffer
- Filtra slots en el pasado (+ minLeadTimeMinutes desde now)
- [unit: src/lib/availability.test.ts] [e2e: —] [risk: P0]

### 25.2 `hoursForDate(hours, date)` — horario efectivo del día
- `src/lib/availability-hours.ts`
- Interpreta jsonb chatbotHours (days 0-6) para la fecha dada. Devuelve `{start: "HH:MM", end: "HH:MM"} | null` (null = cerrado ese día)
- [unit: src/lib/availability.test.ts] [e2e: —] [risk: P0]

---

## 26. Lib — Stripe Connect

### 26.1 `refundStripeCharge(input: StripeRefundInput)` — reembolso destination charge
- `src/lib/stripe/refund.ts`
- `reverse_transfer: true` + `refund_application_fee: true` → libros del barbero correctos
- Idempotency key: `otracita-refund-{paymentId}-{amountCents}` (re-intentos de red = no-op)
- `charge_already_refunded` code → no relanza (idempotente)
- [unit: src/lib/stripe/refund.test.ts] [e2e: —] [risk: P0]

### 26.2 `ensureCustomerSetupIntent(input)` — SetupIntent no-show
- `src/lib/stripe/setup-intent.ts`
- Customer en cuenta PLATAFORMA (no Connect). Multi-tenancy: (clientId, phone) = 2 Customers distintos en barberías distintas
- Busca Customer existente por id guardado o por metadata search
- Crea Customer si no existe → crea SetupIntent `usage:'off_session'`
- MIT mandate para cobro posterior sin cliente presente
- [unit: src/lib/stripe/setup-intent.test.ts] [e2e: —] [risk: P1]

### 26.3 `verifyConfirmedSetupIntent(args)` — validación server-side post-confirmación
- Re-lee SetupIntent del servidor. Verifica `status='succeeded'` + metadata (tenant + phone match)
- NUNCA se confía en el cliente — el id viene del cliente pero la validación es en Stripe API
- Retorna `{stripeCustomerId, paymentMethodId}` o null
- [unit: src/lib/stripe/setup-intent.test.ts] [e2e: —] [risk: P0]

### 26.4 `chargeNoShowFee(input)` — cobro off-session no-show
- `src/lib/stripe/no-show-fee.ts`
- Skip reasons: `'fee_not_configured'` (noShowFeeCents=0) · `'connect_inactive'` (stripeConnectStatus != 'active') · `'no_card_on_file'` (sin defaultPaymentMethodId — actualmente siempre en prod)
- Si cobra: PaymentIntent off-session con MIT mandate. Idempotency key `otracita-noshow-{bookingId}`
- Inserta payments row type='no_show_fee' + recordMovementInBackground
- Retorna `NoShowFeeOutcome: {charged: bool, reason?: string, paymentId?: string}`
- [unit: src/lib/stripe/no-show-fee.test.ts] [e2e: —] [risk: P1]

---

## 27. Lib — SumUp

_`src/lib/sumup/client.ts` + `src/lib/sumup/oauth.ts` + `src/lib/sumup/record-checkout.ts` + `src/lib/sumup/refund.ts`_

### 27.1 `ensureValidAccessToken(args)` — auto-refresh con margen 60s
- Si `tokenExpiresAt - now < 60s` → llama `refreshAccessToken()` → llama `persistFn` del caller para guardar en DB
- [unit: —] [e2e: —] [risk: P1]

### 27.2 `createReaderCheckout(token, merchantCode, readerId, input)` — cobro en reader físico
- Llama SumUp Cloud API `POST /v0.1/merchants/{merchant_code}/readers/{reader_id}/checkouts`
- Input: `{amount, currency, description, return_url}`
- [unit: —] [e2e: —] [risk: P0]

### 27.3 `refreshAccessToken(refreshToken, clientId, clientSecret)` — refresh OAuth
- `POST https://api.sumup.com/token` con grant_type=refresh_token
- [unit: —] [e2e: —] [risk: P1]

### 27.4 `buildAuthorizeUrl(state)` — URL OAuth
- `src/lib/sumup/oauth.ts`. Scopes: transactions.history, user.profile_readonly, readers.read, readers.write, terminals.read
- Env vars: `SUMUP_OAUTH_CLIENT_ID`, `SUMUP_OAUTH_CLIENT_SECRET`, `SUMUP_OAUTH_REDIRECT_URI`
- [unit: —] [e2e: —] [risk: P1]

### 27.5 `SumupApiError` class
- Extiende Error. `code?: string` para discriminar errores de la API
- [unit: —] [e2e: —] [risk: P1]

---

## 28. Lib — VeriFactu / fiscal

### 28.1 `computeHashAlta(input: RegistroAltaInput)` — SHA-256 RegistroAlta
- `src/lib/verifactu/hash.ts`
- 8 campos en orden fijo AEAT: IDEmisorFactura · NumSerieFactura · FechaExpedicionFactura · TipoFactura · CuotaTotal · ImporteTotal · Huella (anterior) · FechaHoraHusoGenRegistro
- SHA-256 → HEX MAYÚSCULAS 64 chars
- **Tests obligatorios**: 3 vectores oficiales PDF AEAT validados byte-a-byte en `hash.test.ts`
- [unit: src/lib/verifactu/hash.test.ts] [e2e: —] [risk: P0]

### 28.2 `computeHashAnulacion(input: RegistroAnulacionInput)` — SHA-256 RegistroAnulacion
- 5 campos: IDEmisorFacturaAnulada · NumSerieFacturaAnulada · FechaExpedicionFacturaAnulada · Huella · FechaHoraHusoGenRegistro
- [unit: src/lib/verifactu/hash.test.ts] [e2e: —] [risk: P0]

### 28.3 `chainRegistroAlta(args)` — encadenar factura en el SIF
- `src/lib/verifactu/chain.ts`
- `db.transaction` + `pg_advisory_xact_lock(hashtextextended(clientId, 0))` → serializa encadenamiento por tenant
- Lee último hash: `findLastHashForClient(tx, clientId)` → `invoiceRegistroEvents` ORDER BY fechaHoraHusoGen DESC
- Si sin previo: isPrimerRegistro=true, huellaAnterior=''
- Escribe en ambas tablas: invoices (huella, huellaAnterior, isPrimerRegistro, tipoFactura, fechaHoraHusoGen, qrUrl) + invoiceRegistroEvents (eventType='alta', xmlPayload, huella, huellaAnterior)
- [unit: —] [e2e: —] [risk: P0]

### 28.4 `chainRegistroAnulacion(args)` — encadenar anulación
- Mismo patrón con advisory lock. Escribe invoices (anuladaAt, anulacionHuella, status='voided') + invoiceRegistroEvents (eventType='anulacion')
- [unit: —] [e2e: —] [risk: P0]

### 28.5 `getEmisorNif(clientId)` — NIF del emisor
- Lee `clients.fiscalNif`. Lanza si null (el emisor no puede facturar sin NIF)
- [unit: —] [e2e: —] [risk: P0]

### 28.6 `formatFechaExpedicion(date)` — DD-MM-YYYY (TZ Madrid)
- `src/lib/verifactu/format.ts`
- Usa `Intl.DateTimeFormat` con timeZone 'Europe/Madrid' (DST correcto)
- [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]

### 28.7 `formatFechaHoraHusoGen(date)` — ISO 8601 con offset Madrid
- Calcula offset real incluyendo DST (+01:00 CET / +02:00 CEST)
- El offset es PARTE del hash → inmutable una vez escrito
- [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]

### 28.8 `centsToDecimal(cents)` — "N.DD" con 2 decimales
- AEAT admite 1 o 2 decimales. Siempre se emiten 2 para consistencia de hash
- [unit: —] [e2e: —] [risk: P0]

### 28.9 `generateQrUrl(invoice)` — URL cotejo AEAT (embebida en QR)
- `src/lib/verifactu/qr.ts`. Construye URL con parámetros de la factura para el servicio de cotejo AEAT
- [unit: —] [e2e: —] [risk: P0]

### 28.10 `renderQr(qrUrl)` — renderizar PNG del QR
- `src/lib/verifactu/qr-render.ts`. Devuelve base64 PNG del QR para incrustar en el PDF/HTML
- [unit: —] [e2e: —] [risk: P1]

### 28.11 `buildVeriFactuXml(invoice)` — generar XML AEAT
- `src/lib/verifactu/xml.ts`. Genera XML del RegistroAlta o RegistroAnulacion para envío AEAT
- [unit: —] [e2e: —] [risk: P0]

### 28.12 `generateInvoiceFromBooking(bookingId)` — orquestador factura
- `src/lib/invoicing.ts`
- Lee booking + booking_services + product_sales no facturados → construye invoice + invoice_items
- Incrementa atómicamente `clients.invoiceNumberNext`
- Llama `chainRegistroAlta()` al final
- [unit: —] [e2e: —] [risk: P0]

### 28.13 `hasCompleteFiscalEmisor(client)` — gate emisor fiscal completo
- Verifica fiscalName + fiscalNif + fiscalAddress + fiscalPostalCode + fiscalCity todos presentes
- [unit: —] [e2e: —] [risk: P0]

### 28.14 `calculateAmounts(priceCents, ivaRate)` — desglose IVA de línea
- `src/lib/invoicing-math.ts`. `subtotal = round(price * 100 / (100 + rate))` · `ivaAmount = price - subtotal`
- [unit: —] [e2e: —] [risk: P0]

---

## 29. Lib — Caja

### 29.1 `signedAmount(movement)` — importe con signo
- `src/lib/cash/compute.ts`
- NEGATIVE_KINDS: `['expense', 'withdrawal', 'refund']` → retorna `-amountCents`. Resto → `+amountCents`
- [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]

### 29.2 `sumByMethod(movements)` — total por método de pago
- `{ cash: number, card: number, online: number }` — suma signedAmount de cada método
- [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]

### 29.3 `computeExpectedClosing(openingCents, movements)` — cierre esperado
- `openingCents + sumByMethod(movements).cash`
- [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]

### 29.4 `computeDescuadre(expected, counted)` — diferencia
- `counted - expected`. Negativo si falta dinero
- [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]

### 29.5 `isIncoming(kind)` — ¿es ingreso?
- `!NEGATIVE_KINDS.includes(kind)`
- [unit: —] [e2e: —] [risk: P1]

### 29.6 `recordMovementFromReference(input)` — inserta movement si hay sesión abierta
- `src/lib/cash/record-movement.ts`
- No-op si sin sesión abierta. Returns `string | null` (id del movement o null)
- [unit: —] [e2e: —] [risk: P1]

### 29.7 `recordMovementInBackground(input)` — fire-and-forget
- Llama `recordMovementFromReference()` sin bloquear la respuesta principal. Errores logueados
- [unit: —] [e2e: —] [risk: P1]

### 29.8 `recordRefundMovement(input)` — reembolso en caja (doble idempotencia)
- `src/lib/cash/record-refund.ts`
- Candado 1: SELECT por dedupeKey (sumupTransactionId UNIQUE) antes de INSERT
- Candado 2: INSERT ON CONFLICT DO NOTHING sobre dedupeKey
- Sin sesión abierta → outcome='no_session' sin error (el PSP ya procesó el reembolso)
- Retorna `RecordRefundOutcome: 'inserted' | 'duplicate' | 'no_session' | 'error'`
- [unit: —] [e2e: —] [risk: P0]

---

## 30. Lib — Payroll

### 30.1 `computeBarberPayroll(profile, raw, precomputedServicesCommissionCents?)` — nómina pura
- `src/lib/payroll/compute.ts`. Sin DB, sin I/O. Testeado
- Fórmula: `base + commissionServices + commissionProducts + tips + bonuses - chairRent`
- Todos los campos en cents. `chairRent` lo PAGA el barbero (autónomo) → resta
- Parámetro opcional R8: si se pasa, usa ese valor en vez de calcular con `commissionServicesPct` global
- Retorna `PayrollBreakdown: {totalCents, baseCents, commissionServicesCents, commissionProductsCents, tipsCents, bonusesCents, chairRentCents}`
- [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]

### 30.2 `isProfileConfigured(profile)` — ¿barbero tiene perfil de nómina?
- True si salaryType != null O algún campo != 0
- [unit: —] [e2e: —] [risk: P1]

### 30.3 `computeMonthlyPayroll(clientId, bounds)` — nómina de UN mes
- `src/lib/payroll/monthly.ts`. ~8 queries. Calcula por barbero (activos)
- Tips por barberName (legacy) → match por nombre normalizado
- Bonos por barberId → `computeBonusProgress()`
- Per-service commission via `computeServicesCommissionCents()` + overrides R8
- [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]

### 30.4 `computePayrollTotalsByMonth(clientId, spanStart, spanEnd, monthKeys)` — batch multi-mes
- `src/lib/payroll/by-month.ts`. 8 queries con GROUP BY month (en vez de N×8)
- Para /annual (12 meses) y /quarterly (3 meses) — evita saturar pool Neon serverless
- No-regresión: misma matemática pura que computeMonthlyPayroll por mes
- [unit: src/lib/payroll/by-month.test.ts] [e2e: —] [risk: P1]

### 30.5 `computeServicesCommissionCents({rows, overrides, globalPct})` — comisión por servicio (R8)
- `src/lib/payroll/services-commission.ts`
- Por cada `ServiceRevenueRow`: si hay override para el serviceName usa ese %, si no usa globalPct
- [unit: —] [e2e: —] [risk: P1]

---

## 31. Lib — Loyalty

### 31.1 `computeBookingDelta(booking, config)` — sellos/puntos ganados por una cita
- `src/lib/loyalty/compute.ts`
- **FOOT-GUN**: convierte `booking.priceEuros * 100` a cents antes de comparar con minPriceCents
- Verifica servicio elegible (eligibleServiceNames null = todos)
- Stamps: devuelve 1 si todo OK. Points: `round(priceEuros * euroToPoints)`
- Devuelve 0 si precio insuficiente o servicio no elegible
- [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P0]

### 31.2 `computeBalance(rows, config, now)` — saldo actual
- Suma `loyalty_ledger.delta`. Si `expirationMonths` != null → descarta filas con createdAt < now - N meses
- [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

### 31.3 `computeProgress(balance, config)` — progreso para la UI
- Retorna `LoyaltyProgress` (`StampsProgress | PointsProgress`)
- Stamps: `{earned, needed, progress 0-1, canRedeem, reward}`
- Points: `{balance, tiers[{pointsCost, reward, canRedeem}], nextTier, progress 0-1}`
- [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

### 31.4 `sanitizeStampsConfig(input)` / `sanitizePointsConfig(input)` — validación de configuración
- stampsNeeded 2-50; euroToPoints 0.1-100; al menos 1 redeemTier
- [unit: —] [e2e: —] [risk: P1]

### 31.5 `LoyaltyConfig` — tipos
- `src/lib/loyalty/types.ts`
- `LoyaltyStampsConfig | LoyaltyPointsConfig`. Modo exclusivo. Reward types: 'service'|'discount_amount'|'discount_pct'
- Defaults: `DEFAULT_STAMPS_CONFIG` (10 sellos, 100% dto, min 10€) · `DEFAULT_POINTS_CONFIG` (1pt/€, 100pts=5€)
- [unit: —] [e2e: —] [risk: P1]

---

## 32. Lib — Promos

### 32.1 `detectGaps(opts)` — detectar huecos de agenda
- `src/lib/promos/detect-gaps.ts`
- Escanea `[start, end)` en pasos de 15 min. En cada step verifica si al menos 1 barbero free
- MIN_GAP_MINUTES = 30 (huecos de al menos 30 min se reportan)
- Retorna `{gaps: [{start, end, minutes}], totalMinutes, totalDays}`
- [unit: —] [e2e: —] [risk: P1]

### 32.2 `resolveWindow(preset)` — ventana temporal de la promo
- Presets: 'today'|'tomorrow'|'weekend'|'next7'
- Retorna `{start, end, label}` en zona horaria Madrid
- [unit: —] [e2e: —] [risk: P2]

### 32.3 `findEligibleCustomers(clientId)` — clientes a recibir la promo
- `src/lib/promos/eligible-customers.ts`
- SQL con CTEs:
  - `recent_visits`: ≥ LOYAL_VISITS_THRESHOLD visitas en LOYAL_VISITS_WINDOW_DAYS (clientes leales)
  - Exclusión: upcoming booking en 7 días → no necesitan promo
  - Exclusión: en cooldown RATE_LIMIT_DAYS (ya recibieron promo recientemente)
  - Exclusión: reputation='blocked'
  - Exclusión: noShows >= threshold
- Ordenado por last_visit_date DESC
- [unit: —] [e2e: —] [risk: P1]

### 32.4 `PROMO_DEFAULTS` — valores por defecto
- `src/lib/promos/defaults.ts`. `discountPct`, texto de mensaje por defecto
- [unit: —] [e2e: —] [risk: P2]

---

## 33. Lib — Finanzas P&L math

### 33.1 `periodRevenueComponents(clientId, start, end, opts)` — 5 queries paralelas
- `src/lib/finanzas/period-revenue.ts`
- Queries: bookings.price (servicios) + booking_services.priceEuros (extras R7) + manual_incomes.amountCents + product_sales.totalCents + tips.amountCents (status='paid')
- Extras en query SEPARADA del booking (no LEFT JOIN) → evita SUM inflation por fan-out
- `includeManual` flag (default true) para compat con endpoints legacy que no lo incluían
- Retorna `RevenueComponents: {bookingPriceEuros, extrasEuros, manualCents, productsCents, tipsCents}`
- [unit: src/lib/finanzas/period-revenue.test.ts] [e2e: —] [risk: P0]

### 33.2 `annualRevenueComponentsByMonth(clientId, yearStart, yearEnd)` — batch anual
- 5 queries con GROUP BY mes (no 12×5 = 60 queries). Devuelve `Map<month, RevenueComponents>`
- product_sales y tips: GROUP BY con `AT TIME ZONE 'Europe/Madrid'` para consistencia de mes
- [unit: —] [e2e: —] [risk: P1]

### 33.3 `computeRevenueCents(c: RevenueComponents)` — normalizar a cents
- `src/lib/finanzas/pnl-math.ts`
- `bookingCents = round((bookingPriceEuros + extrasEuros) * 100)` — ×100 UNA VEZ sobre la suma
- `totalCents = bookingCents + manualCents + productsCents + tipsCents`
- [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]

### 33.4 `computeIvaBreakdown(args)` — desglose fiscal
- `ivaBaseCents = ingresosCents - tipsCents` (propinas fuera de base IVA — ley ES)
- `ivaRepercutidoCents = round(ivaBase * rate / (100 + rate))`
- `ingresosNetosCents = round(ivaBase * 100 / (100 + rate)) + tipsCents`
- `ivaAPagarCents = max(0, repercutido - soportado)`
- [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]

---

## 34. Lib — Notifications dispatcher

_`src/lib/notifications/dispatch.ts`_

### 34.1 `dispatchUserNotification(opts)` — push-first, WhatsApp fallback
- `opts: {clientId, customerPhone, message, title?, body?, pushData?}`
- Llama `hasActivePushSubscription(phone, clientId)` → si tiene sub activa y enabled → Web Push
- Si no tiene push → WhatsApp (via `sendWhatsAppMessage()`)
- NUNCA ambos en el mismo evento (coste doble + doble vibración)
- Retorna `DispatchChannel: 'push' | 'whatsapp' | 'none'`
- [unit: —] [e2e: —] [risk: P0]

### 34.2 `hasActivePushSubscription(phone, clientId)` — check subscription activa
- Busca app_users por phone → push_subscriptions activas para ese user + clientId
- [unit: —] [e2e: —] [risk: P1]

### 34.3 Web Push config
- `src/lib/app-auth/push.ts`
- `urgency: 'high'` + `TTL: 3600` SIEMPRE — Apple silently retains 'normal' en iOS inactivo
- VAPID keys: `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` env vars
- [unit: —] [e2e: —] [risk: P0]

---

## 35. Lib — App-auth (PWA sessions)

_`src/lib/app-auth/session.ts` + `src/lib/app-auth/otp.ts`_

### 35.1 `issueAppSession(opts)` — crear sesión + cookie
- Token: `randomBytes(32).toString('hex')`. Almacena SHA-256 del token en DB
- Cookie `otracita_app_session`: httpOnly, secure, sameSite='lax', path='/', 90 días
- Scoped al dominio entero → funciona en cualquier /b/<slug> del mismo dominio
- [unit: —] [e2e: —] [risk: P0]

### 35.2 `getAppSession()` — verificar sesión
- Lee cookie → SHA-256 → busca en app_sessions (expiresAt > now)
- Sliding expiry: `lastUsedAt` actualizado en background (best-effort, no bloquea la respuesta)
- [unit: —] [e2e: —] [risk: P0]

### 35.3 `destroyAppSession()` — logout
- Borra row DB + clear cookie
- [unit: —] [e2e: —] [risk: P1]

### 35.4 `storeCode(opts)` — guardar OTP hasheado
- `src/lib/app-auth/otp.ts`
- `expiresAt = now + 10 min`. Almacena SHA-256 del código
- [unit: —] [e2e: —] [risk: P0]

### 35.5 `verifyCode(phone, code)` — verificar OTP
- Busca código no consumido + no caducado para ese phone. Ordena por createdAt → toma el último
- Si `attempts >= MAX_ATTEMPTS (5)` → marca consumedAt (brute-force ya capado)
- Incrementa attempts en cada intento fallido
- Si ok → marca consumedAt
- [unit: —] [e2e: —] [risk: P0]

---

## 36. Lib — Auth / admin guard

### 36.1 `isAdminEmail(email)` — check admin
- `src/lib/auth/admin.ts`. Lista hardcoded de emails admin (solo Alex)
- [unit: —] [e2e: —] [risk: P0]

### 36.2 Better Auth setup
- `src/lib/auth.ts`. email/password + Google SSO. Session management para el dashboard
- [unit: —] [e2e: —] [risk: P0]

### 36.3 Auth client
- `src/lib/auth/client.ts`. Cliente JS de Better Auth para el browser (sign-in, sign-out, session hooks)
- [unit: —] [e2e: —] [risk: P0]

---

## 37. Resumen y métricas

| Dimensión | Valor |
|---|---|
| Tablas DB (schema.ts) | 44 |
| Rutas API totales | ~130 |
| Rutas públicas (sin auth) | ~12 |
| Rutas dashboard (Better Auth) | ~90 |
| Rutas PWA app session | ~10 |
| Rutas mobile Bearer | ~6 |
| Rutas admin | ~6 |
| Rutas cron | 2 |
| Rutas webhook (Stripe + WhatsApp + Postmark) | 2 |
| Archivos lib | ~80 |
| Test files existentes (unitarios) | ~19 |
| Gaps de tests (unit no escritos) | ~35+ lib functions |
| Funciones P0 sin test | ~20 |

### Funciones críticas P0 sin test unitario:
- `createBooking()` end-to-end pipeline [P0]
- `chainRegistroAlta()` / `chainRegistroAnulacion()` [P0]
- `generateInvoiceFromBooking()` [P0]
- `periodRevenueComponents()` [P0 — solo parcialmente en period-revenue.test.ts]
- `computeIvaBreakdown()` [P0 — pnl-math.test.ts existe pero no cubriendo todos los edge cases]
- `dispatchUserNotification()` + push [P0]
- `getAvailableSlots()` + gap detection [P0]
- `hasBookingOverlap()` [P0]
- `refundStripeCharge()` con reverse_transfer [P0]
- `recordRefundMovement()` doble idempotencia [P0]
- Webhook Stripe handler multi-event [P0]

### Gaps de diseño / TODOs explícitos en código:
- Card capture en bot WhatsApp → chargeNoShowFee siempre `'no_card_on_file'` hoy (#36 en code comments)
- `barber_services` whitelist aún no conectada al motor de disponibilidad (tabla aditiva, metadato V1)
- Voice bot (Twilio) — sólo browser-test, no en producción
- Team competitions payout no integrado en nómina mensual (standalone V1)
- `brandColorSecondary` DEPRECATED — no se lee en /b/[slug]
- Migración `drizzle-kit generate` con snapshot desincronizado → siempre leer SQL generado y limpiar noise
