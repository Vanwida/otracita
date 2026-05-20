# FEATURE-TEST-MATRIX — otracita
_Generado: 2026-05-20 | Hojas totales: ~838 (A: 312 · B: 267 · C: 259)_

---

## Índice

### A — Dashboard
- A.1 Shell / Layout global
- A.2 Setup wizard (onboarding)
- A.3 Agenda (Día · Semana · Mes · Rail · SlotActionMenu · BarberActionMenu · NewBookingPanel · BookingDetailPanel · PromosFillModal · ImportFlow)
- A.4 Ventas (TPV · Transacciones · Caja · Resumen · Cobros online · Facturas · Propinas · Productos)
- A.5 Facturas (Listado · Detalle · Nueva manual)
- A.6 Finanzas (P&L)
- A.7 Clientes (Lista · Ficha · Atribución)
- A.8 Equipo (Empleados · Turnos · Comisiones · Bonos · Competición)
- A.9 Informes (Panel · Ingresos · Citas · Clientes · Marketing · Nóminas)
- A.10 Marketing (Fidelidad · Promos · WhatsApp Bot · Reseñas · Tienda)
- A.11 Ajustes (Negocio · Pagos · Reservas online · Recepcionista IA · App pública · Ayuda)
- A.12 Mi plan (Suscripción)
- A.13 Rutas legacy / redirect

### B — PWA + Bot
- B.1 App shell PWA (TopBar · BottomTabBar · Página raíz)
- B.2 Hero card
- B.3 Redes sociales
- B.4 Flujo de reserva (Servicios · Barbero · Día · Hora · Formulario · Submit sin tarjeta · Submit con tarjeta · Confirmación)
- B.5 Sección cuenta (Shell · Login paso 1 · Login paso 2 · Home loggeado · PushNotificationsRow · LoyaltyCard · Mis Reservas)
- B.6 Valoración de visita (Auth guard · RateForm · Propina)
- B.7 PWA install bootstrap (PwaBootstrap)
- B.8 Analytics bootstrap (Atribución · CMP · GTM)
- B.9 WhatsApp bot — infraestructura y config
- B.10 Bot — Gate de tier · Canonicalización · Follow-up routing · Idioma · Escape
- B.11 Bot — Detección de intent (idle) + Detecciones especiales
- B.12 Bot — Greeting flow
- B.13 Bot — Flujo de reserva (Reputación · Nombre · Servicio · Barbero · Día · Hora · Confirmación)
- B.14 Bot — Flujo de cancelación
- B.15 Bot — Flujo de cambio de cita
- B.16 Bot — Flujo de recordatorio (outbound cron)
- B.17 Bot — Flujo de lista de espera
- B.18 Bot — Follow-up post-servicio (rating + tip)
- B.19 Landing + páginas públicas

### C — APIs + Backend
- C.1 Schema — 44 tablas Drizzle
- C.2 Multi-tenancy y auth middleware
- C.3 Billing / Tiers
- C.4 API — Bookings (dashboard)
- C.5 API — Bookings (público / PWA)
- C.6 API — Barbers y horarios
- C.7 API — Customers
- C.8 API — Payments (Stripe Connect)
- C.9 API — Webhooks Stripe
- C.10 API — SumUp
- C.11 API — Invoices / VeriFactu
- C.12 API — Loyalty
- C.13 API — Promos contextuales
- C.14 API — Finanzas (P&L)
- C.15 API — Caja
- C.16 API — Productos y ventas POS
- C.17 API — Bonos y competiciones
- C.18 API — Cron jobs
- C.19 API — App PWA (autenticación)
- C.20 API — App PWA (cliente)
- C.21 API — App Móvil (barbero nativo)
- C.22 API — Admin
- C.23 API — Misc
- C.24 Lib — Bookings pipeline
- C.25 Lib — Availability engine
- C.26 Lib — Stripe Connect
- C.27 Lib — SumUp
- C.28 Lib — VeriFactu / fiscal
- C.29 Lib — Caja
- C.30 Lib — Payroll
- C.31 Lib — Loyalty
- C.32 Lib — Promos
- C.33 Lib — Finanzas P&L math
- C.34 Lib — Notifications dispatcher
- C.35 Lib — App-auth (PWA sessions)
- C.36 Lib — Auth / admin guard

---

## Resumen de gaps — P0 sin cobertura de test

| Hoja | Área | Risk | Gap |
|------|------|------|-----|
| A.2 §2.5 | Setup wizard — VeriFactu toggle + NIF + nombre fiscal | P0 | `[unit: —]` — activación fiscal sin test |
| A.3 §3.8 | BookingDetailPanel — PaymentBadge | P0 | `[unit: —]` |
| A.3 §3.8 | BookingDetailPanel — Marcar completada (bifurcación SumUp/métodos) | P0 | `[unit: —]` |
| A.3 §3.8 | BookingDetailPanel — Generar enlace de pago + polling 4s | P0 | `[unit: —]` |
| A.3 §3.8 | BookingDetailPanel — Reembolso (POST reverse_transfer + app fee) | P0 | `[unit: —]` |
| A.3 §3.8 | BookingDetailPanel — Rectificar (post-completada) | P0 | `[unit: src/lib/invoicing.test.ts]` existe — verificar cobertura real |
| A.4 §4.1 | TPV — TOTAL del carrito | P0 | `[unit: src/lib/cash/compute.test.ts]` — confirmar cubre cálculo POS |
| A.4 §4.1 | TPV — Efectivo / Tarjeta / Bizum / Online | P0 | `[unit: —]` |
| A.4 §4.1 | TPV — Factura on-demand desde recibo | P0 | `[unit: src/lib/invoicing.test.ts]` — verificar path POS |
| A.4 §4.2 | Transacciones — InvoiceCell + Total sum | P0 | `[unit: —]` |
| A.4 §4.3 | Caja — CajaRollup + CajaRegisters | P0 | `[unit: src/lib/cash/compute.test.ts]` — UI sin test |
| A.4 §4.3 | Caja — Modal Apunte (POST /api/cash/movements) | P0 | `[unit: —]` |
| A.4 §4.3 | Caja — Botón "Cerrar caja" | P0 | `[unit: —]` |
| A.4 §4.3 | Caja — Botón "Abrir caja" | P0 | `[unit: —]` |
| A.4 §4.4 | Resumen ventas — StatStrip (4 KPIs) | P0 | `[unit: src/lib/finanzas/pnl-math.test.ts]` — UI sin test |
| A.4 §4.5 | Cobros online — OnlinePaymentsSummary | P0 | `[unit: —]` |
| A.4 §4.6 | Facturas (Ventas) — StatStrip + Banner VeriFactu + DataTable + VerifactuBadge | P0 | `[unit: src/lib/verifactu/format.test.ts]` — UI sin test |
| A.4 §4.6 | Facturas — Exportar PDF / Excel / CSV | P0 | `[unit: —]` |
| A.4 §4.7 | Propinas — TipsSettings (requiere Stripe Connect) | P0 | `[unit: —]` |
| A.5 §5.1 | Facturas (canónica) — StatStrip + DataTable + Exportar | P0 | `[unit: —]` |
| A.5 §5.2 | Detalle factura — Cabecera + Banner ANULADA + datos emisor/receptor + QR VeriFactu + Timeline + Rectificar | P0 | `[unit: src/lib/verifactu/qr.test.ts]` parcial; chain sin test |
| A.5 §5.3 | Factura nueva — NIF → tipo live + aviso tope 400€ + precio + IVA + Emitir | P0 | `[unit: src/lib/verifactu/xml.test.ts]` parcial |
| A.6 §6 | P&L — Ingresos totales + tendencia + IVA countdown | P0 | `[unit: src/lib/finanzas/pnl-math.test.ts]` — UI sin test |
| A.6 §6 | P&L — IVA repercutido/soportado/a pagar + IRPF | P0 | `[unit: src/lib/finanzas/pnl-math.test.ts]` parcial |
| A.6 §6 | P&L — Modal añadir gasto + eliminar gasto | P0 | `[unit: —]` |
| A.6 §6 | P&L — Costos fijos (toggle activo) + retiros + ingresos manuales | P0 | `[unit: —]` |
| A.6 §6 | Payroll — SWR GET + fila por barbero + total equipo | P0 | `[unit: src/lib/payroll/compute.test.ts]` — UI sin test |
| A.7 §7.2 | Ficha cliente — Gastado (€) | P0 | `[unit: —]` |
| A.8 §8.1 | BarbersManager — BarberSalaryEditor (Pro-gated) | P0 | `[unit: src/lib/payroll/services-commission.test.ts]` — UI sin test |
| A.8 §8.3 | Comisiones — Tabla override por servicio | P0 | `[unit: src/lib/payroll/services-commission.test.ts]` — UI sin test |
| A.9 §9.1 | OperatorPanel — StatStrip ingresos | P0 | `[unit: src/lib/finanzas/pnl-math.test.ts]` — UI sin test |
| A.9 §9.2 | Ingresos — "Ingreso por tipo" barras | P0 | `[unit: src/lib/finanzas/pnl-math.test.ts]` — UI sin test |
| A.11 §11.2 | Ajustes/Pagos — CashRegisterToggle | P0 | `[unit: —]` |
| A.11 §11.2 | Ajustes/Pagos — SumupConnect estados | P0 | `[unit: —]` |
| A.11 §11.2 | Ajustes/Pagos — ConnectSettings (Stripe) estados | P0 | `[unit: —]` |
| A.11 §11.2 | Ajustes/Pagos — InvoicingSettings (todos los campos fiscales) | P0 | `[unit: src/lib/verifactu/format.test.ts]` — UI sin test |
| A.12 §12 | Mi plan — Importe/moneda + OpenStripePortalButton + historial facturas Stripe | P0 | `[unit: —]` |
| A.13 §13 | Rutas legacy — /dashboard/caja + /dashboard/finanzas | P0 | `[unit: src/lib/cash/compute.test.ts]` / `[unit: pnl-math.test.ts]` — rutas sin test |
| B.4 | PWA — Flujo submit setup-intent + completeBooking | P0 | `[unit: —]` — 0 tests en src/app/b/ |
| B.4 | PWA — NoShowCardModal (Stripe Elements confirmSetup) | P0 | `[unit: —]` |
| B.4 | PWA — Precio en euros vs cents en CTA | P0 | `[unit: —]` |
| B.5 | LoyaltyCard — canRedeem stamps + RewardLabel (service/amount/pct) | P0 | `[unit: —]` |
| B.5 | LoyaltyCard — Points: recompensas canjeables + banner | P0 | `[unit: —]` |
| B.6 | RateForm — showTipBlock + botones importe + Stripe Checkout redirect | P0 | `[unit: —]` |
| B.13 | Bot — confirmación DB path (createBookingDb) | P0 | `[unit: —]` |
| B.13 | Bot — selectedBarberId null NUNCA persiste string "Sin preferencia" | P0 | `[unit: —]` |
| B.13 | Bot — slots fetch DB path + ctx.selectedBarberId | P0 | `[unit: —]` |
| B.14 | Bot — tryVoidInvoicesInBackground al cancelar | P0 | `[unit: —]` |
| B.16 | Bot — tryVoidInvoicesInBackground desde recordatorio | P0 | `[unit: —]` |
| B.17 | Bot — waitlist_accept cancela booking + crea nuevo | P0 | `[unit: —]` |
| B.17 | Bot — waitlist_accept void invoice backup | P0 | `[unit: —]` |
| B.18 | Bot — rating ≥4 + suggested amounts → botones propina (slice ≤3) | P0 | `[unit: —]` |
| B.18 | Bot — createTipSession Stripe Checkout | P0 | `[unit: —]` |
| B.19 | /pay — ruta pago (Stripe Checkout return / propina) | P0 | `[unit: —]` |
| B.19 | /legal/verifactu — declaración responsable AEAT | P0 | `[unit: —]` |
| C.1 §1.1 | Schema clients — columna price EUROS (foot-gun) | P0 | `[unit: src/lib/bookings/total.test.ts]` — schema sin test |
| C.1 §1.2 | Schema app_users | P0 | `[unit: —]` |
| C.1 §1.3 | Schema app_otp_codes | P0 | `[unit: —]` |
| C.1 §1.5 | Schema app_sessions | P0 | `[unit: —]` |
| C.1 §1.6 | Schema barbers | P0 | `[unit: —]` |
| C.1 §1.17 | Schema conversations (FSM bot) | P0 | `[unit: —]` |
| C.1 §1.18 | Schema customers | P0 | `[unit: —]` |
| C.1 §1.19 | Schema bookings — price EUROS foot-gun | P0 | `[unit: src/lib/bookings/total.test.ts]` parcial |
| C.1 §1.20 | Schema booking_services — priceEuros foot-gun | P0 | `[unit: src/lib/bookings/total.test.ts]` parcial |
| C.1 §1.25 | Schema processed_stripe_events — idempotencia | P0 | `[unit: —]` |
| C.1 §1.26 | Schema invoices — chain VeriFactu | P0 | `[unit: —]` |
| C.1 §1.27 | Schema invoice_registro_events — SIF AEAT | P0 | `[unit: —]` |
| C.1 §1.28 | Schema payments | P0 | `[unit: src/lib/stripe/no-show-fee.test.ts]` parcial |
| C.1 §1.35 | Schema invoice_items | P0 | `[unit: —]` |
| C.2 §2.1 | requireClientAccess — resolución de tenant | P0 | `[unit: —]` |
| C.2 §2.2 | accessErrorResponse | P0 | `[unit: —]` |
| C.2 §2.3 | requireCron | P0 | `[unit: —]` |
| C.2 §2.4 | requireAdmin | P0 | `[unit: —]` |
| C.3 §3.1 | FEATURE_MIN_TIER catálogo | P0 | `[unit: —]` — tier.test.ts existe pero ¿cubre catálogo completo? |
| C.3 §3.2 | hasFeature — trial + cancelled | P0 | `[unit: src/lib/billing/tier.test.ts]` — verificar edge cases |
| C.3 §3.3 | upgradeRequiredResponse | P0 | `[unit: —]` |
| C.3 §3.4 | TIER_PRICES | P0 | `[unit: —]` |
| C.3 §3.5 | isInTrial / trialDaysLeft | P0 | `[unit: —]` |
| C.4 §4.1 | POST /api/bookings/create | P0 | `[unit: —]` |
| C.4 §4.3 | PATCH /api/bookings/[id] — completed/cancelled/no_show transitions | P0 | `[unit: —]` |
| C.4 §4.11 | GET /api/dashboard/calendar | P0 | `[unit: —]` |
| C.5 §5.1 | GET /api/public/availability/grid | P0 | `[unit: —]` |
| C.5 §5.2 | POST /api/public/bookings/create | P0 | `[unit: —]` |
| C.8 §8.1 | POST /api/payments/create-link (destination charge) | P0 | `[unit: —]` |
| C.8 §8.3 | POST /api/payments/[id]/refund | P0 | `[unit: src/lib/stripe/refund.test.ts]` — API endpoint sin test |
| C.8 §8.7 | POST /api/stripe/connect/onboard | P0 | `[unit: —]` |
| C.8 §8.9 | POST /api/checkout (suscripción plataforma) | P0 | `[unit: —]` |
| C.9 §9.1 | Webhook Stripe — dual-secret + idempotencia | P0 | `[unit: —]` |
| C.9 §9.2 | checkout.session.completed — sub/payment/tip | P0 | `[unit: —]` |
| C.9 §9.4 | charge.refunded | P0 | `[unit: —]` |
| C.9 §9.6 | subscription.created/updated | P0 | `[unit: —]` |
| C.9 §9.8 | subscription.deleted | P0 | `[unit: —]` |
| C.10 §10.6 | POST /api/sumup/checkout/start | P0 | `[unit: —]` |
| C.10 §10.7 | GET /api/sumup/checkout/return | P0 | `[unit: —]` |
| C.11 §11.1 | POST /api/invoices/from-booking (chainRegistroAlta) | P0 | `[unit: —]` |
| C.11 §11.3 | POST /api/invoices/[id]/rectificativa | P0 | `[unit: —]` |
| C.18 §18.1 | GET /api/cron/reminders | P0 | `[unit: —]` |
| C.19 §19.1 | POST /api/app/otp/request | P0 | `[unit: —]` |
| C.19 §19.2 | POST /api/app/otp/verify | P0 | `[unit: —]` |
| C.23 §23.8 | POST /api/whatsapp (Meta webhook) | P0 | `[unit: —]` |
| C.23 §23.16 | GET /api/auth/[...all] Better Auth | P0 | `[unit: —]` |
| C.24 §24.1 | createBooking() — pipeline completo | P0 | `[unit: —]` |
| C.24 §24.4 | hasBookingOverlap() | P0 | `[unit: —]` — solo indirectamente en unavailability.test.ts |
| C.25 §25.1 | getAvailableSlots() | P0 | `[unit: src/lib/availability.test.ts]` — verificar cobertura real |
| C.25 §25.2 | hoursForDate() | P0 | `[unit: src/lib/availability.test.ts]` |
| C.26 §26.1 | refundStripeCharge() reverse_transfer | P0 | `[unit: src/lib/stripe/refund.test.ts]` |
| C.26 §26.3 | verifyConfirmedSetupIntent() — validación server-side | P0 | `[unit: —]` |
| C.26 §26.4 | chargeNoShowFee() — siempre 'no_card_on_file' en prod hoy | P0 | `[unit: src/lib/stripe/no-show-fee.test.ts]` parcial |
| C.28 §28.1 | computeHashAlta() — 3 vectores AEAT | P0 | `[unit: src/lib/verifactu/hash.test.ts]` ✓ |
| C.28 §28.3 | chainRegistroAlta() — advisory lock + transacción | P0 | `[unit: —]` |
| C.28 §28.4 | chainRegistroAnulacion() | P0 | `[unit: —]` |
| C.28 §28.6 | formatFechaExpedicion() — DST Madrid | P0 | `[unit: src/lib/verifactu/format.test.ts]` ✓ |
| C.28 §28.7 | formatFechaHoraHusoGen() — offset parte del hash | P0 | `[unit: src/lib/verifactu/format.test.ts]` ✓ |
| C.28 §28.8 | centsToDecimal() | P0 | `[unit: —]` |
| C.28 §28.9 | generateQrUrl() | P0 | `[unit: src/lib/verifactu/qr.test.ts]` ✓ |
| C.28 §28.11 | buildVeriFactuXml() | P0 | `[unit: src/lib/verifactu/xml.test.ts]` |
| C.28 §28.12 | generateInvoiceFromBooking() | P0 | `[unit: —]` |
| C.28 §28.13 | hasCompleteFiscalEmisor() | P0 | `[unit: —]` |
| C.28 §28.14 | calculateAmounts() IVA | P0 | `[unit: —]` |
| C.29 §29.1 | signedAmount() NEGATIVE_KINDS | P0 | `[unit: src/lib/cash/compute.test.ts]` ✓ |
| C.29 §29.3 | computeExpectedClosing() | P0 | `[unit: src/lib/cash/compute.test.ts]` ✓ |
| C.29 §29.8 | recordRefundMovement() doble idempotencia | P0 | `[unit: —]` |
| C.30 §30.1 | computeBarberPayroll() | P0 | `[unit: src/lib/payroll/compute.test.ts]` ✓ |
| C.30 §30.3 | computeMonthlyPayroll() | P0 | `[unit: src/lib/payroll/compute.test.ts]` ✓ |
| C.31 §31.1 | computeBookingDelta() — foot-gun ×100 | P0 | `[unit: src/lib/loyalty/compute.test.ts]` ✓ |
| C.33 §33.1 | periodRevenueComponents() — 5 queries paralelas | P0 | `[unit: src/lib/finanzas/period-revenue.test.ts]` parcial |
| C.33 §33.3 | computeRevenueCents() — ×100 una vez | P0 | `[unit: src/lib/finanzas/pnl-math.test.ts]` ✓ |
| C.33 §33.4 | computeIvaBreakdown() — propinas fuera de base | P0 | `[unit: src/lib/finanzas/pnl-math.test.ts]` ✓ |
| C.34 §34.1 | dispatchUserNotification() — push-first, WA fallback, NUNCA ambos | P0 | `[unit: —]` |
| C.34 §34.3 | Web Push — urgency:'high' + TTL:3600 | P0 | `[unit: —]` |
| C.35 §35.1 | issueAppSession() — cookie httpOnly | P0 | `[unit: —]` |
| C.35 §35.2 | getAppSession() — sliding expiry | P0 | `[unit: —]` |
| C.35 §35.4 | storeCode() OTP hash | P0 | `[unit: —]` |
| C.35 §35.5 | verifyCode() — MAX_ATTEMPTS brute-force | P0 | `[unit: —]` |
| C.36 §36.1 | isAdminEmail() | P0 | `[unit: —]` |
| C.36 §36.2 | Better Auth setup | P0 | `[unit: —]` |

---

# A — Dashboard Inventory
_otracita — agotamiento exhaustivo de cada área, pestaña, panel, modal, campo, botón y estado del dashboard (`src/app/dashboard/**`)_
_Formato canónico: cada hoja termina con `[unit: <path o —>] [e2e: —] [risk: P0|P1|P2]`_

---

## Índice

1. [Shell / Layout global](#1-shell--layout-global)
2. [Setup wizard (onboarding)](#2-setup-wizard-onboarding)
3. [Agenda](#3-agenda)
   - 3.1 [Vista Día](#31-vista-día-daygrid)
   - 3.2 [Vista Semana](#32-vista-semana-weekgrid)
   - 3.3 [Vista Mes](#33-vista-mes-monthgrid)
   - 3.4 [Rail lateral (AgendaSideRail)](#34-rail-lateral-agendasiderail)
   - 3.5 [SlotActionMenu](#35-slotactionmenu)
   - 3.6 [BarberActionMenu](#36-barberactionmenu)
   - 3.7 [NewBookingPanel](#37-newbookingpanel)
   - 3.8 [BookingDetailPanel](#38-bookingdetailpanel)
   - 3.9 [PromosFillModal (Llenar huecos)](#39-promosfillmodal-llenar-huecos)
   - 3.10 [Importar citas (ImportFlow)](#310-importar-citas-importflow)
4. [Ventas](#4-ventas)
   - 4.1 [TPV / POS (página índice)](#41-tpv--pos-página-índice)
   - 4.2 [Transacciones](#42-transacciones)
   - 4.3 [Caja](#43-caja)
   - 4.4 [Resumen de ventas](#44-resumen-de-ventas)
   - 4.5 [Cobros online](#45-cobros-online)
   - 4.6 [Facturas (listado Ventas)](#46-facturas-listado-ventas)
   - 4.7 [Propinas](#47-propinas)
   - 4.8 [Productos (Tienda interna)](#48-productos-tienda-interna)
5. [Facturas (ruta canónica)](#5-facturas-ruta-canónica)
   - 5.1 [Listado](#51-listado)
   - 5.2 [Detalle de factura](#52-detalle-de-factura)
   - 5.3 [Factura nueva (manual)](#53-factura-nueva-manual)
6. [Finanzas (P&L)](#6-finanzas-pl)
7. [Clientes](#7-clientes)
   - 7.1 [Lista de clientes](#71-lista-de-clientes)
   - 7.2 [Ficha de cliente (ClientProfile)](#72-ficha-de-cliente-clientprofile)
   - 7.3 [Atribución de fuente](#73-atribución-de-fuente)
8. [Equipo](#8-equipo)
   - 8.1 [Empleados (BarbersManager)](#81-empleados-barbersmanager)
   - 8.2 [Turnos (TurnosManager)](#82-turnos-turnosmanager)
   - 8.3 [Comisiones](#83-comisiones)
   - 8.4 [Bonos](#84-bonos)
   - 8.5 [Competición](#85-competición)
9. [Informes](#9-informes)
   - 9.1 [Panel (OperatorPanel + FinanzasClient)](#91-panel-operatorpanel--finanzasclient)
   - 9.2 [Ingresos](#92-ingresos)
   - 9.3 [Citas](#93-citas)
   - 9.4 [Clientes (informe)](#94-clientes-informe)
   - 9.5 [Marketing (informe)](#95-marketing-informe)
   - 9.6 [Nóminas](#96-nóminas)
10. [Marketing](#10-marketing)
    - 10.1 [Fidelidad](#101-fidelidad)
    - 10.2 [Promos](#102-promos)
    - 10.3 [WhatsApp Bot](#103-whatsapp-bot)
    - 10.4 [Reseñas](#104-reseñas)
    - 10.5 [Tienda (productos pública)](#105-tienda-productos-pública)
11. [Ajustes](#11-ajustes)
    - 11.1 [Negocio](#111-negocio)
    - 11.2 [Pagos](#112-pagos)
    - 11.3 [Reservas online](#113-reservas-online)
    - 11.4 [Recepcionista IA](#114-recepcionista-ia)
    - 11.5 [App pública](#115-app-pública)
    - 11.6 [Ayuda](#116-ayuda)
12. [Mi plan (Suscripción)](#12-mi-plan-suscripción)
13. [Rutas legacy / redirect](#13-rutas-legacy--redirect)

---

## 1. Shell / Layout global

### 1.1 DashboardLayout (`layout.tsx`)

- **Auth check server-side** — `auth.api.getSession` + redirect `/login` si no hay sesión. [unit: —] [e2e: —] [risk: P1]
- **Setup redirect** — si el cliente no tiene `businessName` → redirect `/dashboard/setup`. [unit: —] [e2e: —] [risk: P1]
- **AppRail (desktop, md+)** — rail izquierdo fijo con icono monograma + nav + admin link + setup dot + RailUserMenu. [unit: —] [e2e: —] [risk: P2]
- **MobileSidebar** — sheet/drawer lateral en móvil con DashboardSidebarNav variant="sidebar". [unit: —] [e2e: —] [risk: P2]
- **DashboardChatWidget** — chat de soporte flotante (abajo derecha). [unit: —] [e2e: —] [risk: P2]
- **ConfirmDialogHost** — host global para diálogos de confirmación destructivos. [unit: —] [e2e: —] [risk: P1]
- **UndoToastHost** — host global para toasts de deshacer acciones reversibles. [unit: —] [e2e: —] [risk: P1]
- **Mobile bottom nav** — barra inferior móvil con DashboardSidebarNav variant="bottom" (icono + etiqueta). [unit: —] [e2e: —] [risk: P2]
- **loading.tsx** — skeleton de carga a nivel de layout. [unit: —] [e2e: —] [risk: P2]
- **error.tsx** — boundary de error a nivel de layout. [unit: —] [e2e: —] [risk: P2]

### 1.2 AppRail (`_components/AppRail.tsx`)

- **Monogram link** — logo/iniciales del local, vínculo a `/dashboard`. [unit: —] [e2e: —] [risk: P2]
- **DashboardSidebarNav variant="sidebar"** — 7 ítems de área (Agenda / Ventas / Clientes / Equipo / Informes / Marketing / Ajustes) con icono, tooltip instantáneo (sin delay, fix #8), estado activo via `isNavItemActive`. [unit: —] [e2e: —] [risk: P1]
- **Admin Shield link** — visible solo si `isAdmin(session.user.email)`, enlace a `/admin`. [unit: —] [e2e: —] [risk: P1]
- **Setup indicator dot** — punto naranja sobre el icono de Ajustes cuando `needsSetup`. [unit: —] [e2e: —] [risk: P2]
- **RailUserMenu** — avatar + nombre + menú con "Cerrar sesión" y link a Mi plan. [unit: —] [e2e: —] [risk: P1]

### 1.3 DashboardSidebarNav (`_components/DashboardSidebarNav.tsx`)

- **variant="sidebar"** — icon-only, tooltip instantáneo sobre hover/focus, active highlight con `isNavItemActive`. [unit: —] [e2e: —] [risk: P2]
- **variant="bottom"** — icono + etiqueta corta, active state, sin tooltip. [unit: —] [e2e: —] [risk: P2]
- **NAV_ITEMS** — derivados de `AREAS` en `nav-config.ts`: Agenda · Ventas · Clientes · Equipo · Informes · Marketing · Ajustes. [unit: —] [e2e: —] [risk: P2]

### 1.4 Dashboard home (`page.tsx`)

- **Redirect automático** a `/dashboard/agenda`. [unit: —] [e2e: —] [risk: P2]

---

## 2. Setup wizard (onboarding)

_`src/app/dashboard/setup/page.tsx`_ — 6 pasos lineales + revisión final.

### 2.1 Paso 1 — Tu negocio

- **Campo nombre del negocio** — `businessName`, requerido. [unit: —] [e2e: —] [risk: P1]
- **Campo nombre del dueño** — `ownerName`, requerido. [unit: —] [e2e: —] [risk: P1]
- **Campo teléfono** — `phone`, requerido. [unit: —] [e2e: —] [risk: P1]
- **Campo ciudad** — `city`, default "Barcelona". [unit: —] [e2e: —] [risk: P2]
- **Campo dirección** — `address`. [unit: —] [e2e: —] [risk: P2]
- **Campo URL Booksy** — `booksyUrl`, opcional; botón "Importar de Booksy" que hace scraping → `scraped=true`. [unit: —] [e2e: —] [risk: P1]
- **Estado scraping** — spinner Loader2 mientras extrae datos de Booksy. [unit: —] [e2e: —] [risk: P2]
- **Estado scraped** — tick de confirmación cuando importó. [unit: —] [e2e: —] [risk: P2]

### 2.2 Paso 2 — Equipo y servicios

- **Lista de barberos** — añadir / borrar con nombre + botón "+" para añadir más. [unit: —] [e2e: —] [risk: P1]
- **Lista de servicios** — nombre + duración (min) + precio (€), add/delete por fila. [unit: —] [e2e: —] [risk: P1]

### 2.3 Paso 3 — Horario

- **Toggle por día** (lunes…domingo) — on/off. [unit: —] [e2e: —] [risk: P1]
- **Hora inicio / fin** por día activo. [unit: —] [e2e: —] [risk: P1]

### 2.4 Paso 4 — App pública

- **Campo slug** — generado desde `businessName` via `slugify()`, editable. [unit: —] [e2e: —] [risk: P1]
- **Selector tema** — claro / oscuro. [unit: —] [e2e: —] [risk: P2]
- **Color de marca** — color picker. [unit: —] [e2e: —] [risk: P2]
- **Descripción corta** — texto libre. [unit: —] [e2e: —] [risk: P2]

### 2.5 Paso 5 — Facturación (opcional)

- **Toggle habilitar VeriFactu** — con explicación de qué es. [unit: —] [e2e: —] [risk: P0]
- **Campo NIF fiscal** — requerido si habilita. [unit: —] [e2e: —] [risk: P0]
- **Campo nombre fiscal** — empresa o autónomo. [unit: —] [e2e: —] [risk: P0]
- **Explicación VeriFactu** — texto inline sobre la declaración responsable AEAT. [unit: —] [e2e: —] [risk: P0]

### 2.6 Paso 6 — Revisión + activar

- **Resumen de todos los campos** — lectura de lo introducido en pasos 1–5. [unit: —] [e2e: —] [risk: P1]
- **Botón "Activar"** — POST `/api/setup`, spinner, redirect `/dashboard?welcome=1` con URL pública. [unit: —] [e2e: —] [risk: P1]
- **Error genérico** — mensaje si POST falla. [unit: —] [e2e: —] [risk: P1]

### 2.7 Navegación del wizard

- **Botón "Siguiente"** — avanza al paso siguiente. [unit: —] [e2e: —] [risk: P1]
- **Botón "Anterior"** — retrocede. [unit: —] [e2e: —] [risk: P2]
- **Barra de progreso** — indicador visual de paso actual / 6. [unit: —] [e2e: —] [risk: P2]

---

## 3. Agenda

_`src/app/dashboard/agenda/`_

### Carga de datos (server, `page.tsx`)

- **Servicios del local** — `chatbotServices` jsonb, usado solo como catálogo (lectura). [unit: —] [e2e: —] [risk: P1]
- **Barbers activos** — tabla `barbers` (`active = true`, `displayOrder` asc) — canónico. [unit: —] [e2e: —] [risk: P1]
- **Fechas bloqueadas** — `blockedDates`. [unit: —] [e2e: —] [risk: P1]
- **Horario del local** — `hours` (Record<string,string>). [unit: —] [e2e: —] [risk: P1]

### Toolbar de CalendarView

- **Toggle Día / Semana / Mes** — 3 botones segmentados, persiste la vista activa. [unit: —] [e2e: —] [risk: P1]
- **Botón "Hoy"** — salta a la fecha actual. [unit: —] [e2e: —] [risk: P1]
- **Prev / Next chevron** — navega día / semana / mes según vista activa. [unit: —] [e2e: —] [risk: P1]
- **Título de periodo** — "Lun 19 may" / "Semana del 12–18 may" / "mayo 2026". [unit: —] [e2e: —] [risk: P2]
- **Filtro de barbero** — select que pasa `barberId` a AgendaSideRail y DayGrid (filtra columnas). [unit: —] [e2e: —] [risk: P1]
- **Botón "Llenar huecos"** — visible solo si `promosEnabled`; abre PromosFillModal. [unit: —] [e2e: —] [risk: P1]
- **Enlace "Importar"** — navega a `/dashboard/agenda/importar`. [unit: —] [e2e: —] [risk: P2]
- **Botón "Nueva cita"** — abre NewBookingPanel. [unit: —] [e2e: —] [risk: P1]
- **Banner moveError** — aviso rojo si el drag&drop falló (e.g. solape). [unit: —] [e2e: —] [risk: P1]
- **SWR polling 10s** — refresca eventos sin reload completo. [unit: —] [e2e: —] [risk: P1]

### 3.1 Vista Día (DayGrid)

- **Columna por barbero** — una columna por cada barbero activo (o solo el filtrado); avatar + nombre + colores del día en cabecera; chevron clickable → BarberActionMenu. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Columna "Sin asignar"** — fallback cuando una cita no tiene `barberId`. [unit: —] [e2e: —] [risk: P1]
- **Time gutter sticky** — etiquetas de hora en la izquierda, scroll interno. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P2]
- **Línea de hora actual** — punto + línea horizontal en la posición exacta de "ahora" (actualiza cada minuto). [unit: —] [e2e: —] [risk: P2]
- **Líneas de hora y media hora** — grid del fondo. [unit: —] [e2e: —] [risk: P2]
- **Overlay offhours** — sombreado fuera del horario del local. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Overlay bloqueado** — si la fecha está en `blockedDates`. [unit: —] [e2e: —] [risk: P1]
- **Ventana dinámica** — `computeAgendaWindow` (no 08-22 hardcode): unión de horario real + citas. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Auto-scroll inicial** — posiciona la vista en "ahora" (o inicio ventana si hoy no está en vista). [unit: —] [e2e: —] [risk: P2]
- **Bloque de cita** — 3 líneas: `HH:MM · StatusBadge`, nombre del cliente, servicio; click → BookingDetailPanel. [unit: —] [e2e: —] [risk: P1]
- **paymentBadge glyph** — icono de pago en el bloque (pagado/pendiente). [unit: —] [e2e: —] [risk: P1]
- **Booksy lock icon** — candado en citas importadas de Booksy (solo lectura). [unit: —] [e2e: —] [risk: P2]
- **barberRequested ♥ icon** — corazón si el cliente eligió explícitamente ese barbero. [unit: —] [e2e: —] [risk: P2]
- **Contraste AA del bloque** — `appointmentBlockStyle` calcula color de fondo del barber + contraste WCAG AA; cancelada sube de 3.42 a 6.45:1. [unit: —] [e2e: —] [risk: P2]
- **Drag&drop** — arrastrar un bloque a otro slot / columna; grab offset preservado; PATCH `/api/bookings/[id]/move`; `moveError` si hay solape. [unit: src/lib/unavailability.test.ts] [e2e: —] [risk: P1]
- **Click en slot vacío** → SlotActionMenu. [unit: —] [e2e: —] [risk: P1]

### 3.2 Vista Semana (WeekGrid)

- **7 columnas Lun–Dom** — cabecera día + fecha; resaltado "hoy"; columnas scroll interno. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Ventana dinámica semanal** — `computeAgendaWindow` sobre los 7 días visibles (fuente única). [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Auto-scroll** — a "ahora" si la semana contiene hoy, si no al inicio de la ventana. [unit: —] [e2e: —] [risk: P2]
- **Línea hora actual** — solo el día de hoy. [unit: —] [e2e: —] [risk: P2]
- **Overlay offhours** — sombreado por día (via `hoursForDate`). [unit: —] [e2e: —] [risk: P1]
- **Overlay bloqueado** — fechas en `blockedDates`. [unit: —] [e2e: —] [risk: P1]
- **Bloque de cita** — mismo estilo DayGrid (Booksy Lock, colores). [unit: —] [e2e: —] [risk: P1]
- **Click en bloque** → BookingDetailPanel. [unit: —] [e2e: —] [risk: P1]
- **Click en slot vacío** → `onSlotClick(dateStr, time)` → SlotActionMenu o NewBookingPanel. [unit: —] [e2e: —] [risk: P1]

### 3.3 Vista Mes (MonthGrid)

- **Grid Lun–Dom** — filas de semanas, cabecera `DAY_HEADERS`. [unit: —] [e2e: —] [risk: P1]
- **Días del mes adyacente** — opacidad 30 %. [unit: —] [e2e: —] [risk: P2]
- **Resaltado "hoy"** — círculo/fondo diferenciado. [unit: —] [e2e: —] [risk: P2]
- **Overlay bloqueado** — fondo y patrón en fechas bloqueadas del mes actual. [unit: —] [e2e: —] [risk: P1]
- **Chips de cita** — hasta `MAX_VISIBLE=3` chips por día con `appointmentChipStyle` + statusBadge. [unit: —] [e2e: —] [risk: P1]
- **"+N más"** — chip de desbordamiento cuando hay >3 citas en el día. [unit: —] [e2e: —] [risk: P2]
- **Click en día** → `onSlotClick(dateStr, '10:00')` → SlotActionMenu. [unit: —] [e2e: —] [risk: P1]
- **Click en chip** → BookingDetailPanel. [unit: —] [e2e: —] [risk: P1]

### 3.4 Rail lateral (AgendaSideRail)

- **Toggle colapso/expansión** — botón chevron, estado persistido en `localStorage` (`otracita_agenda_rail_collapsed_v1`). [unit: —] [e2e: —] [risk: P2]
- **Mini-mes** — grid 7×N con inicio Lunes; día activo resaltado; WCAG 2.5.8: botones prev/next 28×28 px (flechas mini-cal). [unit: —] [e2e: —] [risk: P2]
- **Chips salto de semana** — ±1 … ±6 semanas desde la actual. [unit: —] [e2e: —] [risk: P2]
- **Filtro de barbero** — select, pasa `barberId` al padre (CalendarView). [unit: —] [e2e: —] [risk: P1]
- **Leyenda "Destacados"** — swatch "Pago" (verde/rojo) y swatches de estado (confirmada/completada/cancelada/no-show). [unit: —] [e2e: —] [risk: P2]
- **Leyenda del equipo** — color por barbero (`barberColorVar(displayOrder)`). [unit: —] [e2e: —] [risk: P2]

### 3.5 SlotActionMenu

- **Modal centrado** — título "Este hueco" + etiqueta de contexto (`Lun 18 · 10:30 · Reni`). [unit: —] [e2e: —] [risk: P1]
- **Acción "Nueva cita"** — emit `{ type: 'new_booking', date, time, barberId }` → NewBookingPanel prefilled. [unit: —] [e2e: —] [risk: P1]
- **Acción "Descanso / bloquear hueco"** — emit `{ type: 'unavailability' }` → BlockModal. [unit: —] [e2e: —] [risk: P1]
- **Acción "Ausencia (día libre)"** — emit `{ type: 'absence' }` → AbsenceModal. [unit: —] [e2e: —] [risk: P1]
- **Botón "Cancelar"** — cierra el modal. [unit: —] [e2e: —] [risk: P2]

### 3.6 BarberActionMenu

- **Cabecera** — avatar monograma + nombre del barbero + "Acciones del barbero". [unit: —] [e2e: —] [risk: P2]
- **Resumen del día** — citas hechas/total + € facturado + "Próxima: HH:MM · nombre" (calculado sobre eventos ya en memoria, sin fetch). [unit: —] [e2e: —] [risk: P1]
- **Estado sin citas** — texto "Sin citas este día." [unit: —] [e2e: —] [risk: P2]
- **Acción "Editar horario"** — link a `/dashboard/equipo/turnos`. [unit: —] [e2e: —] [risk: P1]
- **Acción "Ausencia (día libre)"** — abre AbsenceModal del barbero (misma modal que Turnos). [unit: —] [e2e: —] [risk: P1]
- **Acción "Descanso / bloquear hueco"** — abre BlockModal. [unit: —] [e2e: —] [risk: P1]
- **onChanged callback** — tras guardar ausencia/bloqueo → revalida la agenda. [unit: —] [e2e: —] [risk: P1]
- **Botón "Cerrar"** — cierra el menú. [unit: —] [e2e: —] [risk: P2]

### 3.7 NewBookingPanel

_SlideOver "Nueva cita"_

- **CustomerTypeahead** — buscador typeahead de clientes existentes; al seleccionar → vincula y bloquea el teléfono. [unit: —] [e2e: —] [risk: P1]
- **Botón desvincular cliente** — desvincula y permite editar manualmente. [unit: —] [e2e: —] [risk: P1]
- **Campo teléfono** — libre si no hay cliente vinculado; bloqueado (read-only) si está vinculado. [unit: —] [e2e: —] [risk: P1]
- **ServiceLinePicker (servicio principal)** — selector de servicio + duración + precio. [unit: —] [e2e: —] [risk: P1]
- **Lista de servicios extra** — múltiples ServiceLinePicker adicionales (R7 multi-servicio). [unit: —] [e2e: —] [risk: P1]
- **Botón "+ Añadir otro servicio"** — agrega otro ServiceLinePicker a la lista. [unit: —] [e2e: —] [risk: P1]
- **Select barbero** — lista de barberos activos. [unit: —] [e2e: —] [risk: P1]
- **Campo fecha** — date picker, prefilled desde el slot clicado. [unit: —] [e2e: —] [risk: P1]
- **Campo hora** — time input, prefilled. [unit: —] [e2e: —] [risk: P1]
- **Total duración** — suma automática de duraciones (servicio principal + extras). [unit: src/lib/bookings/duration.test.ts] [e2e: —] [risk: P1]
- **Mensaje de error** — inline si faltan campos o la API rechaza. [unit: —] [e2e: —] [risk: P1]
- **Botón "Crear cita"** — submit, spinner, cierra el panel en éxito. [unit: —] [e2e: —] [risk: P1]

### 3.8 BookingDetailPanel

_SlideOver de detalle — la pieza más rica del dashboard_

#### Cabecera y metadata

- **Banner de estado full-width** — color por status: confirmada/completada/cancelada/no-show. [unit: —] [e2e: —] [risk: P1]
- **Nombre del cliente clickable** → abre ClientProfile en overlay (variant="panel"). [unit: —] [e2e: —] [risk: P1]
- **Botón copiar teléfono** — copia al portapapeles con feedback. [unit: —] [e2e: —] [risk: P2]
- **Label de fuente** — "Booksy" / "WhatsApp Bot" / "Dashboard" / "PWA". [unit: —] [e2e: —] [risk: P2]
- **Fecha y hora** — display de la cita. [unit: —] [e2e: —] [risk: P1]
- **Barbero asignado** — nombre. [unit: —] [e2e: —] [risk: P1]
- **Servicio + precio** — lista de servicios (principal + extras) con precios individuales. [unit: —] [e2e: —] [risk: P1]
- **PaymentBadge** — estado de pago: pagado (método) / pendiente. [unit: —] [e2e: —] [risk: P0]

#### Acciones sobre la cita

- **Marcar como completada** — flujo bifurcado:
  - Si SumUp conectado → SumupCheckoutPrompt.
  - Si no → PaymentMethodPrompt (Efectivo / Tarjeta / Bizum / Online / Gratis).
  - En éxito → UndoToast "Completada · Deshacer". [unit: —] [e2e: —] [risk: P0]
- **UndoToast Completada** — deshace el cambio via PATCH en X segundos. [unit: —] [e2e: —] [risk: P1]
- **Marcar como no-show** — confirm inline + UndoToast. [unit: —] [e2e: —] [risk: P1]
- **Cancelar cita** — ConfirmDialog "¿Cancelar esta cita?" → PATCH status. [unit: —] [e2e: —] [risk: P1]
- **Mover cita** — editor de fecha / hora / barberId; PATCH `/api/bookings/[id]/move`; error si solape. [unit: src/lib/unavailability.test.ts] [e2e: —] [risk: P1]
- **Editar servicio / precio (pre-completada)** — ServiceLinePicker libre; guarda vía PATCH. [unit: —] [e2e: —] [risk: P1]
- **Editar servicio / precio (post-completada)** — botón "Rectificar" → RectificativaModal. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Citas Booksy (canEditFreely=false)** — campos deshabilitados; icono Lock con tooltip "Cita importada de Booksy". [unit: —] [e2e: —] [risk: P2]

#### Venta de producto asociada

- **Botón "+ Vender producto"** — solo visible cuando `status='confirmed'`; abre AddProductSaleModal. [unit: —] [e2e: —] [risk: P1]
- **AddProductSaleModal** — GET `/api/products` → lista; selector producto + cantidad + método pago (Efectivo/Tarjeta/Online); POST `/api/products/sales` con bookingId + barberId + customerPhone auto-fill; estado confirmación. [unit: —] [e2e: —] [risk: P1]

#### Enlace de pago online

- **Botón "Generar enlace de pago"** — POST `/api/bookings/[id]/payment-link`; devuelve URL. [unit: —] [e2e: —] [risk: P0]
- **Botón "Copiar URL"** — copia la URL al portapapeles. [unit: —] [e2e: —] [risk: P1]
- **Botón "Copiar QR"** — copia/muestra el QR del enlace. [unit: —] [e2e: —] [risk: P1]
- **Polling 4s** — verifica si el cliente ha pagado (estado `paid`). [unit: —] [e2e: —] [risk: P0]

#### Reembolso

- **Botón "Reembolsar"** — solo visible si completada + pagado. [unit: —] [e2e: —] [risk: P0]
- **Paso de confirmación** — muestra importe + aviso "Esta acción es irreversible". [unit: —] [e2e: —] [risk: P0]
- **POST reembolso** — `reverse_transfer + app fee` (Stripe Connect) o SumUp; caja idempotente. [unit: —] [e2e: —] [risk: P0]

### 3.9 PromosFillModal (Llenar huecos)

- **Selector de ventana temporal** — 4 presets: Hoy / Mañana / Este finde / Próx. 7 días. [unit: —] [e2e: —] [risk: P1]
- **POST `/api/promos/preview`** — devuelve gaps + elegibles + mensaje plantilla. [unit: —] [e2e: —] [risk: P1]
- **Estado de carga** — Loader2 mientras hace preview. [unit: —] [e2e: —] [risk: P2]
- **Resumen de huecos** — count + total minutos formateado (h/m). [unit: —] [e2e: —] [risk: P1]
- **Slider de descuento** — stops fijos (`DISCOUNT_STOPS`, default `DEFAULT_DISCOUNT_PCT`). [unit: —] [e2e: —] [risk: P1]
- **Textarea de mensaje** — editable, prefilled con `defaultMessage`. [unit: —] [e2e: —] [risk: P1]
- **Lista de clientes elegibles** — checkbox por cliente (nombre + recentVisits + lastBookingAt); deseleccionar excluye al cliente del envío. [unit: —] [e2e: —] [risk: P1]
- **Botón "Confirmar envío"** — POST `/api/promos/send`; muestra resumen de enviados. [unit: —] [e2e: —] [risk: P1]
- **Estado resumen post-envío** — éxito / error por cliente con Check / AlertCircle. [unit: —] [e2e: —] [risk: P1]

### 3.10 Importar citas (ImportFlow)

_`src/app/dashboard/agenda/importar/`_

#### Paso "upload"

- **Drop zone** — arrastra imágenes; acepta `image/*`; límite 8 MB por imagen; hasta 10 imágenes. [unit: —] [e2e: —] [risk: P1]
- **Botón "Elegir archivos"** — file picker alternativo. [unit: —] [e2e: —] [risk: P1]
- **Error tamaño** — "Alguna imagen supera 8 MB — redúcela antes de subirla." [unit: —] [e2e: —] [risk: P1]
- **Vista previa de imágenes subidas** — thumbnails de las imágenes seleccionadas. [unit: —] [e2e: —] [risk: P2]
- **Botón "Extraer citas"** — llama a `/api/bookings/import-vision`, spinner Loader2. [unit: —] [e2e: —] [risk: P1]

#### Paso "review"

- **Tabla editable** — columnas: fecha / hora / nombre cliente / teléfono / servicio / barbero / duración (NumberInput) / precio / confianza. [unit: —] [e2e: —] [risk: P1]
- **Chip de confianza** — high / medium / low por fila extraída. [unit: —] [e2e: —] [risk: P2]
- **Botón papelera por fila** — elimina una cita antes de importar. [unit: —] [e2e: —] [risk: P1]
- **Botón "Confirmar importación"** — POST `/api/bookings/import`, spinner. [unit: —] [e2e: —] [risk: P1]

#### Paso "done"

- **Resumen de importación** — total / created / failed. [unit: —] [e2e: —] [risk: P1]
- **Log por fila** — created ✓ / skipped / failed con mensaje. [unit: —] [e2e: —] [risk: P1]
- **Botón "Volver a la agenda"** — link a `/dashboard/agenda`. [unit: —] [e2e: —] [risk: P2]

---

## 4. Ventas

_`src/app/dashboard/ventas/`_ — AreaShell con VentasHeaderAction (period selector).

### 4.1 TPV / POS (página índice)

_`PosTerminal.tsx`_

#### Rail de categorías

- **"Venta rápida"** — servicios favoritos del catálogo. [unit: —] [e2e: —] [risk: P1]
- **"Servicios"** — lista completa de servicios. [unit: —] [e2e: —] [risk: P1]
- **"Productos"** — productos de la tienda interna. [unit: —] [e2e: —] [risk: P1]
- **"Cantidad personalizada"** — importe libre. [unit: —] [e2e: —] [risk: P1]

#### Grid de artículos

- **Tile por artículo** — nombre + precio; click → añade al carrito. [unit: —] [e2e: —] [risk: P1]

#### Carrito

- **CustomerTypeahead** — asociar cliente opcional (para atribución). [unit: —] [e2e: —] [risk: P1]
- **CartLine** — nombre / cantidad / descuento (%) / precio unitario / tipo (`service|product|custom`). [unit: —] [e2e: —] [risk: P1]
- **Botón "Editar artículo"** — abre modal inline con campo descuento + precio. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P1]
- **TOTAL** — suma calculada. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **Botón "Cobrar"** — avanza a payment stage. [unit: —] [e2e: —] [risk: P1]

#### Fase de pago (PAYMENT_METHODS)

- **Efectivo** — cierra la venta como `cash`. [unit: —] [e2e: —] [risk: P0]
- **Tarjeta** — abre SumupCheckoutPrompt si SumUp conectado. [unit: —] [e2e: —] [risk: P0]
- **Bizum** — cierra como `bizum`. [unit: —] [e2e: —] [risk: P0]
- **Online** — genera enlace de pago Stripe. [unit: —] [e2e: —] [risk: P0]

#### Fase de recibo

- **`bookingId` para factura on-demand** — botón "Generar factura" si `invoicingEnabled`. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Estado "Venta completada"** — icono Check + resumen. [unit: —] [e2e: —] [risk: P1]
- **Botón "Nueva venta"** — resetea el carrito. [unit: —] [e2e: —] [risk: P1]

### 4.2 Transacciones

_`ventas/transacciones/page.tsx`_

- **DataTable columnas**: Fecha / Concepto (nombre + cliente) / Tipo (servicio/producto/propina) / Método / Factura / Importe. [unit: —] [e2e: —] [risk: P1]
- **InvoiceCell** — si `invoicingEnabled`: "Generar" (crea factura y recarga) o link "Ver" a `/facturas/[id]`. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Total sum** — suma de la columna Importe al pie. [unit: —] [e2e: —] [risk: P0]
- **Fuente de datos** — bookings `completed` + `product_sales` del periodo seleccionado, ordenados por fecha desc. [unit: —] [e2e: —] [risk: P1]

### 4.3 Caja

_`ventas/caja/page.tsx`_

#### Estado deshabilitado

- **Empty state** — texto "Habilita la caja en Ajustes" + link a `/dashboard/ajustes/pagos`. [unit: —] [e2e: —] [risk: P2]

#### Estado habilitado

- **CajaRollup** — totales del día por método: Efectivo / Tarjeta / Online. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **CajaRegisters (master-detail)** — lista de sesiones (cronológica, abierta arriba) + DataPanel de detalle. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]

#### Lista de sesiones (CajaRegisters izquierda)

- **Fila de sesión** — fecha + apertura € + total € + badge ABIERTO/CERRADO. [unit: —] [e2e: —] [risk: P1]
- **Sesión activa seleccionada** — resaltada por defecto. [unit: —] [e2e: —] [risk: P1]

#### DataPanel de sesión seleccionada (CajaRegisters derecha)

- **TOTAL grande** — importe total de la sesión. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **Estado badge** — ABIERTO / CERRADO. [unit: —] [e2e: —] [risk: P1]
- **Meta de apertura** — importe de apertura + fecha + quién abrió. [unit: —] [e2e: —] [risk: P1]
- **Tabs TRANSACCIONES / RESUMEN** — conmutan el contenido del panel. [unit: —] [e2e: —] [risk: P1]
- **Tab TRANSACCIONES** — tabla de movimientos con badge PAGADO, fecha, concepto, importe. [unit: —] [e2e: —] [risk: P1]
- **Tab RESUMEN** — desglose por método de pago + gastos/ingresos extra. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **Botón "Apunte"** — abre modal para registrar movimiento manual (entrada/salida + importe + concepto). [unit: —] [e2e: —] [risk: P1]
- **Modal Apunte** — tipo (entrada/salida) + importe + nota + guardar vía POST `/api/cash/movements`. [unit: —] [e2e: —] [risk: P0]
- **Botón "Cerrar caja"** — ConfirmDialog + POST `/api/cash/close` + polling GET `/api/cash/current` cada 15s. [unit: —] [e2e: —] [risk: P0]
- **Botón "Abrir caja"** — solo visible si no hay sesión abierta; modal con importe de apertura + POST `/api/cash/open`. [unit: —] [e2e: —] [risk: P0]
- **Botón "PDF"** — genera/descarga PDF de la sesión. [unit: —] [e2e: —] [risk: P2]
- **BarberBreakdown collapsible** — `<details>` dentro del resumen; se abre con `?breakdown=open`. [unit: —] [e2e: —] [risk: P1]

### 4.4 Resumen de ventas

_`ventas/resumen/page.tsx`_

- **StatStrip** — 4 KPIs: Facturado total / Servicios / Productos / Propinas (con trends vs periodo anterior). [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **BarberBreakdown** — desglose por barbero (visible si ≥2 barberos activos con ventas); columnas: Barbero / Facturado / Citas / Propinas / Nota media / TOP badge. [unit: —] [e2e: —] [risk: P1]
- **StatsPeriodTabs** — filtro de periodo (Hoy / 7d / 30d / Este mes / Personalizado). [unit: —] [e2e: —] [risk: P1]

### 4.5 Cobros online

_`ventas/cobros/page.tsx`_

- **OnlinePaymentsSummary** — total cobrado online + últimas N transacciones Stripe. [unit: —] [e2e: —] [risk: P0]
- **Link card a Ajustes/Pagos** — acceso rápido a configurar Stripe Connect. [unit: —] [e2e: —] [risk: P2]

### 4.6 Facturas (listado Ventas)

_`ventas/facturas/page.tsx`_

- **MonthSelect** — selector de mes. [unit: —] [e2e: —] [risk: P1]
- **TypeSelect** — filtro tipo: Todas / Factura / Ticket. [unit: —] [e2e: —] [risk: P1]
- **VoidedToggle** — mostrar/ocultar anuladas. [unit: —] [e2e: —] [risk: P1]
- **StatStrip** — Total facturado / IVA / Nº documentos. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Banner error VeriFactu** — visible si hay envíos fallidos; permite filtrar por estado error. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Botón "Exportar Libro (PDF)"** — descarga libro de registro. [unit: —] [e2e: —] [risk: P0]
- **Botón "Exportar Excel"** — descarga XLSX. [unit: —] [e2e: —] [risk: P0]
- **Botón "Exportar CSV"** — descarga CSV. [unit: —] [e2e: —] [risk: P0]
- **Botón "Nueva factura"** — link a `/dashboard/facturas/nueva`. [unit: —] [e2e: —] [risk: P1]
- **VerifactuHelpPanel** — panel colapsable con explicación VeriFactu. [unit: —] [e2e: —] [risk: P2]
- **DataTable** — Fecha / Número / Cliente / Tipo / VerifactuBadge / Estado / Importe / link "Ver". [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **VerifactuBadge** — estado del envío AEAT: pending/sent/accepted/rejected/error. [unit: src/lib/verifactu/hash.test.ts] [e2e: —] [risk: P0]
- **Empty state genérico** — "No hay facturas para este periodo". [unit: —] [e2e: —] [risk: P2]
- **Empty state por filtro tipo** — "No hay tickets/facturas" según TypeSelect. [unit: —] [e2e: —] [risk: P2]

### 4.7 Propinas

_`ventas/propinas/page.tsx`_

- **TipsSettings** — toggle habilitar propinas; solo activo si `connectActive` (Stripe Connect); importes sugeridos editables. [unit: —] [e2e: —] [risk: P0]
- **Aviso "Se requiere Stripe Connect"** — si `!connectActive`, CTA a Ajustes/Pagos. [unit: —] [e2e: —] [risk: P1]
- **TipsList** — tabla de propinas con selector de asignación a barbero por fila. [unit: —] [e2e: —] [risk: P1]
- **Selector de barbero por propina** — dropdown para reasignar si la propina llegó sin barbero claro. [unit: —] [e2e: —] [risk: P1]

### 4.8 Productos (Tienda interna)

_`ventas/productos/page.tsx`_ — ProductsManager

- **Tabla de productos** — nombre / imagen / precio / stock. [unit: —] [e2e: —] [risk: P1]
- **Botón "+ Nuevo producto"** — abre modal de creación. [unit: —] [e2e: —] [risk: P1]
- **Modal de creación/edición** — nombre + imageUrl + priceCents + stockQuantity (null = sin control de stock). [unit: —] [e2e: —] [risk: P1]
- **Botón "Guardar"** — POST o PATCH `/api/products`. [unit: —] [e2e: —] [risk: P1]
- **Botón "Eliminar"** — ConfirmDialog + DELETE. [unit: —] [e2e: —] [risk: P1]
- **Estado sin productos** — "Todavía no tienes productos." [unit: —] [e2e: —] [risk: P2]

---

## 5. Facturas (ruta canónica)

_`src/app/dashboard/facturas/`_

### 5.1 Listado

_`facturas/page.tsx`_ — replica la lógica de `ventas/facturas` con FiltersBar.

- **FiltersBar** — MonthSelect + TypeSelect + VoidedToggle, misma lógica. [unit: —] [e2e: —] [risk: P1]
- **StatStrip** — Total / IVA / N documentos. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Banner VeriFactu error** — idem. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Botones exportar PDF / Excel / CSV** — idem. [unit: —] [e2e: —] [risk: P0]
- **Botón "Nueva factura"** — link a `/dashboard/facturas/nueva`. [unit: —] [e2e: —] [risk: P1]
- **VerifactuHelpPanel** — colapsable con info AEAT. [unit: —] [e2e: —] [risk: P2]
- **DataTable** — Fecha / Número / Cliente / Tipo / VerifactuBadge / Estado / Importe / link "Ver". [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Empty states** — por periodo / por filtro. [unit: —] [e2e: —] [risk: P2]

### 5.2 Detalle de factura

_`facturas/[id]/page.tsx`_

- **Cabecera** — número de factura + tipo (Factura / Ticket simplificado). [unit: —] [e2e: —] [risk: P0]
- **Banner "ANULADA"** — visible si `status='voided'`, en danger. [unit: —] [e2e: —] [risk: P0]
- **Datos emisor** — fiscalName + NIF + dirección del local. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Datos receptor** — nombre + NIF del cliente (si factura completa). [unit: —] [e2e: —] [risk: P0]
- **Líneas de factura** — concepto / cantidad / precio unitario / IVA / total por línea. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Base imponible / IVA / Total** — tabla resumen. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **QR VeriFactu** — solo si `verifactu_status='accepted'` o `'accepted_with_errors'`; `QrBlock` + URL AEAT. [unit: src/lib/verifactu/qr.test.ts] [e2e: —] [risk: P0]
- **VerifactuTimeline** — historial de estados del envío AEAT. [unit: —] [e2e: —] [risk: P0]
- **Botón "Imprimir / PDF"** — `PrintButton` llama `window.print()`; @print CSS oculta nav y acciones. [unit: —] [e2e: —] [risk: P1]
- **Botón "Rectificar"** — `RectificativaButton` → abre `RectificativaModal`. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **RectificativaModal** — motivo de rectificación + nuevo precio; crea factura rectificativa y anula la original. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Link "← Facturas"** — volver al listado. [unit: —] [e2e: —] [risk: P2]

### 5.3 Factura nueva (manual)

_`facturas/nueva/page.tsx` + `ManualInvoiceForm.tsx`_

- **Campo NIF del receptor** — libre; si se rellena → tipo "Factura completa", si vacío → "Ticket simplificado". [unit: src/lib/verifactu/xml.test.ts] [e2e: —] [risk: P0]
- **Hint de tipo live** — "Factura completa" vs "Ticket simplificado" según NIF. [unit: —] [e2e: —] [risk: P0]
- **Aviso tope ticket** — si total > 400 € y sin NIF, aviso inline (RD 1619/2012 art. 4). [unit: —] [e2e: —] [risk: P0]
- **Campo fecha** — date, default hoy. [unit: —] [e2e: —] [risk: P1]
- **Selector de servicio** — sugerencias del catálogo del local. [unit: —] [e2e: —] [risk: P1]
- **Selector de barbero** — sugerencias del equipo. [unit: —] [e2e: —] [risk: P1]
- **Campo precio** — número en €, base de cálculo IVA. [unit: —] [e2e: —] [risk: P0]
- **IVA derivado** — calculado sobre `ivaRate` del cliente. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Botón "Emitir factura"** — POST `/api/invoices`; redirect a detalle de la factura creada. [unit: —] [e2e: —] [risk: P0]
- **Error de validación** — inline si faltan campos o NIF inválido. [unit: —] [e2e: —] [risk: P1]

---

## 6. Finanzas (P&L)

_`src/app/dashboard/finanzas/`_ — antiguo módulo, ahora accesible desde Informes > Panel vía PanelSwitch.

### FinanzasClient

- **MonthStepper** — prev/next mes con `prevMonth` / `nextMonth` helpers compartidos. [unit: src/lib/dashboard/period.test.ts] [e2e: —] [risk: P1]
- **Estado de carga** — Skeleton animado (hero + 2×2 grid + action row + collapsibles). [unit: —] [e2e: —] [risk: P2]

#### Hero block (resumen del mes)

- **Ingresos totales** — `ingresosCents` (servicios + productos + propinas + manuales). [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Tendencia vs año anterior** — `trendPct(ingresos, prevYearIngresos)`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Sparkline de ingresos** — 12 puntos de historia mensual. [unit: —] [e2e: —] [risk: P2]
- **IVA countdown** — próximo vencimiento trimestral (20 abr / jul / oct / ene) con días restantes. [unit: —] [e2e: —] [risk: P0]

#### KPI 2×2 grid

- **Gastos variables** — `gastosVariablesCents`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Costos fijos** — `costosFijosCents`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Nóminas** — `nominasCents` (coste del equipo auto-calculado). [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Beneficio real** — `beneficioRealCents` (bruto − retiros). [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]

#### Fila de acciones rápidas

- **"Ver nóminas"** — link a `/dashboard/informes/nominas`. [unit: —] [e2e: —] [risk: P1]
- **"Ver facturas"** — link a `/dashboard/facturas`. [unit: —] [e2e: —] [risk: P1]
- **"Imprimir P&L"** — `window.print()`. [unit: —] [e2e: —] [risk: P2]

#### Colapsibles de detalle

- **IVA repercutido / soportado / a pagar** — `computeIvaBreakdown`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **IRPF estimado** — `irpfEstimadoCents`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Desglose ingresos** — servicios / productos / propinas / manuales. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Gastos variables** — lista de `expenses` con categoría + nota + importe; botón "+ Añadir gasto". [unit: —] [e2e: —] [risk: P0]
- **Modal añadir gasto** — fecha + categoría + importe (€) + nota; POST `/api/finanzas/expenses`. [unit: —] [e2e: —] [risk: P0]
- **Botón eliminar gasto** — ConfirmDialog + DELETE. [unit: —] [e2e: —] [risk: P0]
- **Costos fijos** — lista de `fixedCosts` (nombre + categoría + importe + `activeFrom` + toggle active); botón "+ Añadir coste fijo". [unit: —] [e2e: —] [risk: P0]
- **Modal añadir coste fijo** — nombre + categoría + importe + activeFrom; POST `/api/finanzas/fixed-costs`. [unit: —] [e2e: —] [risk: P0]
- **Toggle activo coste fijo** — PATCH `/api/finanzas/fixed-costs/[id]`. [unit: —] [e2e: —] [risk: P0]
- **Retiros** — lista + botón "+ Retirada"; modal con fecha + importe; POST `/api/finanzas/withdrawals`. [unit: —] [e2e: —] [risk: P0]
- **Ingresos manuales** — lista + botón "+ Ingreso manual"; modal con fecha + importe + nota; POST `/api/finanzas/manual-incomes`. [unit: —] [e2e: —] [risk: P0]

### Payroll (`finanzas/Payroll.tsx`)

- **SWR fetch** — GET `/api/finanzas/payroll?month=YYYY-MM`. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Fila por barbero** — colapsable: nombre + total nómina; al expandir: desglose línea a línea (servicios base + comisión + productos + propinas + bonos). [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Total del equipo** — suma de todas las nóminas al pie. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Estado sin nóminas** — "Sin actividad este mes". [unit: —] [e2e: —] [risk: P2]
- **Pro-gate** — UpgradeRequired si no `payrollEnabled`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]

---

## 7. Clientes

_`src/app/dashboard/clientes/`_

### 7.1 Lista de clientes

_`clientes/page.tsx`_

- **SearchAndSort** — buscador por nombre/teléfono + selector de orden (Más visitados / Más gasta / Último / Nombre). [unit: —] [e2e: —] [risk: P1]
- **Filter pills** — Todos / Inactivos (≥45d) / No-shows / Bloqueados; muestra count por pill. [unit: —] [e2e: —] [risk: P1]
- **Banner inactivos** — "N clientes no vuelven desde hace +45 días · Envíales un WhatsApp". [unit: —] [e2e: —] [risk: P1]
- **Tabla de clientes** — columnas: Cliente (avatar + nombre + tel) / Visitas / Gastado (€) / Última visita / Nota (estrella media) / Estado / Acciones. [unit: —] [e2e: —] [risk: P1]
- **StatusChip** — habitual / inactivo / nuevo / en riesgo / bloqueado. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **CustomerContactActions** — botón WhatsApp directo (enlace `wa.me`). [unit: —] [e2e: —] [risk: P1]
- **UnblockCustomerButton** — botón desbloquear; visible solo si `status='blocked'`; POST `/api/customers/[id]/unblock`. [unit: —] [e2e: —] [risk: P1]
- **ForgiveNoShowsButton** — botón perdonar no-shows; actualiza contador. [unit: —] [e2e: —] [risk: P1]
- **Link a ficha** — click en nombre → `/dashboard/clientes/[id]`. [unit: —] [e2e: —] [risk: P1]
- **Empty state Todos** — "Todavía no tienes clientes". [unit: —] [e2e: —] [risk: P2]
- **Empty state filtro** — "No hay clientes inactivos/no-shows/bloqueados". [unit: —] [e2e: —] [risk: P2]

### 7.2 Ficha de cliente (ClientProfile)

_`clientes/[id]/page.tsx` + `ClientProfile.tsx`_

#### variant="page" — ruta directa

- **Link "← Todos los clientes"** — back nav. [unit: —] [e2e: —] [risk: P2]

#### Cabecera (ambas variants)

- **Avatar** — iniciales en fondo de color. [unit: —] [e2e: —] [risk: P2]
- **Nombre** — display prominente. [unit: —] [e2e: —] [risk: P1]
- **Teléfono** — con `SourceChip` de origen. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]

#### Fila contadores (exacta Booksy)

- **TOTAL** — total de citas (todas). [unit: —] [e2e: —] [risk: P1]
- **COMPLETADAS** — citas completadas. [unit: —] [e2e: —] [risk: P1]
- **CANCELADAS** — citas canceladas. [unit: —] [e2e: —] [risk: P1]
- **INASISTENCIAS** — no-shows. [unit: —] [e2e: —] [risk: P1]

#### KPIs de valor

- **Gastado (€)** — suma de bookings completadas (price × 1, en euros). [unit: —] [e2e: —] [risk: P0]
- **Nota media** — promedio de ratings. [unit: —] [e2e: —] [risk: P1]

#### Tabs

##### CITAS

- **Sub-tab "Próximas (N)"** — citas `confirmed` con `date >= hoy`, orden ascendente. [unit: —] [e2e: —] [risk: P1]
- **Sub-tab "Pasadas (N)"** — resto de citas. [unit: —] [e2e: —] [risk: P1]
- **Fila de cita** — bloque fecha + servicio + precio + botón "Reagendar" (link a la agenda con prefill). [unit: —] [e2e: —] [risk: P1]
- **Estado sin citas** — "No hay citas próximas/pasadas". [unit: —] [e2e: —] [risk: P2]

##### FIDELIDAD

- **Saldo de sellos/puntos** — `loyaltyBalance` + `loyaltyMode` (sellos/puntos). [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Historial de movimientos de fidelidad** — lista cronológica de stamps/points ganados/canjeados. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

##### INFORMACIÓN DEL CLIENTE

- **Teléfono** — display con `mailto:`-style. [unit: —] [e2e: —] [risk: P1]
- **Email** — CustomerEmailEditor (inline edición). [unit: —] [e2e: —] [risk: P1]
- **CustomerEmailEditor — modo vista** — muestra email o placeholder "Sin email"; botón lápiz activa edición. [unit: —] [e2e: —] [risk: P1]
- **CustomerEmailEditor — modo edición** — input + Guardar / Cancelar; vacío → borra (NULL); PATCH `/api/customers/[id]/email`. [unit: —] [e2e: —] [risk: P1]
- **CustomerEmailEditor — error** — inline si email inválido. [unit: —] [e2e: —] [risk: P1]
- **Origen** — SourceChip (WhatsApp / PWA / Dashboard / Bot…). [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P2]
- **Notas privadas (CustomerNotesEditor) — modo vista** — muestra notas o placeholder; botón lápiz activa edición. [unit: —] [e2e: —] [risk: P1]
- **CustomerNotesEditor — modo edición** — textarea (max 2000 chars) + Guardar / Cancelar; PATCH `/api/customers/[id]/notes`. [unit: —] [e2e: —] [risk: P1]
- **CustomerNotesEditor — error** — inline si falla el PATCH. [unit: —] [e2e: —] [risk: P1]

#### variant="panel" — overlay desde BookingDetailPanel

- **Mismo ClientProfile** — `variant="panel"`, layout centrado compacto. [unit: —] [e2e: —] [risk: P1]
- **Todos los tabs y acciones** — idénticos a variant="page". [unit: —] [e2e: —] [risk: P1]

### 7.3 Atribución de fuente

_`clientes/atribucion/page.tsx`_

- **SourceBreakdown** — últimos 30 días: nuevos clientes agrupados por `first_source`. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **Barras por fuente** — WhatsApp Bot / PWA / Booksy / Dashboard / Desconocido; % del total. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **Ventana de atribución** — `PROMO_ATTRIB_DAYS = 7` (primero 7 días). [unit: —] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin nuevos clientes en los últimos 30 días". [unit: —] [e2e: —] [risk: P2]

---

## 8. Equipo

_`src/app/dashboard/equipo/`_ — AreaShell. Layout con StatsPeriodTabs en algunas sub-páginas.

### 8.1 Empleados (BarbersManager)

_`equipo/page.tsx`_

#### Lista de barberos (izquierda)

- **Búsqueda** — filtrado instantáneo por nombre. [unit: —] [e2e: —] [risk: P1]
- **Fila de barbero** — handle de arrastre (GripVertical) + avatar (foto o monograma) + nombre + rol + badge activo/inactivo. [unit: —] [e2e: —] [risk: P1]
- **Fila seleccionada** — highlight, abre detalle a la derecha. [unit: —] [e2e: —] [risk: P1]
- **Drag reorder** — reordena `displayOrder` vía PATCH `/api/barbers/[id]`. [unit: —] [e2e: —] [risk: P1]
- **Flechas ↑↓ teclado** — accesibilidad para reorden sin drag. [unit: —] [e2e: —] [risk: P2]
- **Botón "+ Añadir"** — abre modal de creación. [unit: —] [e2e: —] [risk: P1]

#### Modal creación de barbero

- **Campo nombre** — requerido. [unit: —] [e2e: —] [risk: P1]
- **Campo rol** — libre (e.g. "Barbero senior"). [unit: —] [e2e: —] [risk: P2]
- **Toggle online bookable** — aparece en la PWA para elección de cliente. [unit: —] [e2e: —] [risk: P1]
- **Botón "Crear"** — POST `/api/barbers`; refresca la lista. [unit: —] [e2e: —] [risk: P1]

#### Panel de detalle (derecha)

- **Foto del barbero** — upload via Vercel Blob (`@vercel/blob/client`); Preview + botón "Cambiar foto". [unit: —] [e2e: —] [risk: P1]
- **Botón "Cambiar foto"** — file picker → upload → PATCH `/api/barbers/[id]` con `photoUrl`. [unit: —] [e2e: —] [risk: P1]
- **Nombre editable** — inline edit + guardar PATCH. [unit: —] [e2e: —] [risk: P1]
- **Rol editable** — inline edit + guardar PATCH. [unit: —] [e2e: —] [risk: P2]
- **Toggle "Activo"** — PATCH `active`; inactivos no aparecen en agenda. [unit: —] [e2e: —] [risk: P1]
- **Toggle "Reservas online"** — PATCH `onlineBookable`. [unit: —] [e2e: —] [risk: P1]
- **Nivel de permiso** — radio empleado / admin; PATCH `permissionLevel`. [unit: —] [e2e: —] [risk: P1]
- **Bio** — textarea + guardar PATCH. [unit: —] [e2e: —] [risk: P2]
- **HoursEditor (horario propio)** — si el barbero tiene horario distinto al local; usa mismo componente que NegocioForm. [unit: —] [e2e: —] [risk: P1]
- **Horario heredado del local** — texto "Mismo horario que el local" + botón "Personalizar". [unit: —] [e2e: —] [risk: P1]
- **Días bloqueados del barbero** — lista + "+ Añadir fecha". [unit: —] [e2e: —] [risk: P1]
- **BarberSalaryEditor** — perfil de pago: tipo (fijo / mixto / autónomo) + salarioBase / comisionServices% / comisionProducts% / chairRent; Pro-gated. [unit: src/lib/payroll/services-commission.test.ts] [e2e: —] [risk: P0]
- **Botón "Eliminar barbero"** — ConfirmDialog + DELETE; si tiene citas futuras → ReassignModal (reassign a otro barbero). [unit: —] [e2e: —] [risk: P1]

#### ReassignModal

- **Select barbero destino** — para reasignar citas futuras del barbero eliminado. [unit: —] [e2e: —] [risk: P1]
- **Botón "Eliminar y reasignar"** — DELETE `/api/barbers/[id]` con `reassignTo`. [unit: —] [e2e: —] [risk: P1]

#### BarberBreakdown (Equipo)

- **Colapsible `<details>`** — abierto con `?breakdown=open`. [unit: —] [e2e: —] [risk: P1]
- **StatsPeriodTabs** — filtro periodo. [unit: —] [e2e: —] [risk: P1]
- **Tabla BarberBreakdown** — columnas: Barbero / Facturado / Citas completadas / Propinas / Nota media / TOP badge. [unit: —] [e2e: —] [risk: P1]

### 8.2 Turnos (TurnosManager)

_`equipo/turnos/page.tsx`_

#### Toolbar

- **Toggle vista Día / Semana** — conmuta entre las dos vistas de TurnosManager. [unit: —] [e2e: —] [risk: P1]
- **Selector de fecha / semana** — navega el periodo. [unit: —] [e2e: —] [risk: P1]

#### Vista Día

- **Fila por barbero** — eje X = horas; bloque verde = ventana abierta (desde `hours` propio o heredado del local); inset gris "Descanso" por `barber_breaks`; banda danger = `barber_block` de esa fecha. [unit: src/lib/unavailability.test.ts] [e2e: —] [risk: P1]
- **Click en fila** → chooser: Editar horario / Día libre / Ausencia / Descanso / bloquear. [unit: —] [e2e: —] [risk: P1]

#### Vista Semana

- **Grid barbero × 7 días** — celda = ventana del día + cómputo de horas. [unit: —] [e2e: —] [risk: P1]
- **Botón "Copiar"** — copia el `hours` semanal de un barbero a otros; PATCH `/api/barbers/[id]`. [unit: —] [e2e: —] [risk: P1]

#### ScheduleEditorModal ("Editar · Horario de trabajo")

- **Toggle por día** — on/off; off → "Cerrado". [unit: —] [e2e: —] [risk: P1]
- **Inicio / Fin por día activo** — inputs HH:MM con validación `HHMM_RE`. [unit: —] [e2e: —] [risk: P1]
- **"+ Añadir descanso"** — fila indentada con Inicio/Fin + papelera. [unit: —] [e2e: —] [risk: P1]
- **Selector "Periodo de tiempo"** — Inmediatamente / Semana que viene / A partir del día; solo "Inmediatamente" activo (las otras deshabilitadas con motivo: schema sin fecha-efectiva). [unit: —] [e2e: —] [risk: P1]
- **Guardar** — PATCH `/api/barbers/[id]` (hours) + PUT `/api/barbers/[id]/breaks` (breaks); error si breaks falla sin cerrar. [unit: —] [e2e: —] [risk: P1]
- **Error** — inline. [unit: —] [e2e: —] [risk: P1]

#### BlockModal ("Descanso / bloquear hueco")

- **Campo fecha** — date input, default = día visible. [unit: —] [e2e: —] [risk: P1]
- **Campo inicio HH:MM** — validado con `HHMM_RE`. [unit: —] [e2e: —] [risk: P1]
- **Campo fin HH:MM** — validado + `fin > inicio`. [unit: —] [e2e: —] [risk: P1]
- **Campo nota** — texto libre. [unit: —] [e2e: —] [risk: P2]
- **Botón "Guardar"** — POST `/api/barbers/[id]/blocks` kind:'block'; `onSaved` → `router.refresh()`. [unit: —] [e2e: —] [risk: P1]
- **Error** — inline. [unit: —] [e2e: —] [risk: P1]

#### AbsenceModal ("Día libre · barbero")

- **Toggle "Todo el día"** — on → sin franjas; off → campos inicio/fin. [unit: —] [e2e: —] [risk: P1]
- **Campo fecha** — date input. [unit: —] [e2e: —] [risk: P1]
- **Campos inicio/fin** — visibles solo si `!allDay`; HH:MM validado. [unit: —] [e2e: —] [risk: P1]
- **Select motivo** — catálogo cerrado: Día personal / Enfermedad / Vacaciones / Formación. [unit: —] [e2e: —] [risk: P1]
- **Campo nota** — texto libre. [unit: —] [e2e: —] [risk: P2]
- **Toggle "Aprobado"** — default true; PATCH columna `approved`. [unit: —] [e2e: —] [risk: P1]
- **"Repetir"** — control visible pero deshabilitado (schema sin recurrencia); tooltip explica el scope. [unit: —] [e2e: —] [risk: P2]
- **Botón "Guardar"** — POST `/api/barbers/[id]/blocks` kind:'absence'; `onSaved` → `router.refresh()`. [unit: —] [e2e: —] [risk: P1]
- **Error** — inline. [unit: —] [e2e: —] [risk: P1]

### 8.3 Comisiones

_`equipo/comisiones/page.tsx`_ — ComisionesClient view="comisiones"

- **Pro-gate** — UpgradeRequired si `!enabled`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]

#### Comisión por servicio (R8)

- **Select barbero** — filtra la tabla de overrides. [unit: —] [e2e: —] [risk: P1]
- **Tabla override** — servicio / % comisión vs. global; inline edit por celda; PUT `/api/barbers/[id]/commissions`. [unit: src/lib/payroll/services-commission.test.ts] [e2e: —] [risk: P0]
- **% global fallback** — si no hay override, usa `commissionServicesPct` del barbero. [unit: src/lib/payroll/services-commission.test.ts] [e2e: —] [risk: P0]

#### Tipos de bono (R9)

- **BonusesManager** — reutilizado de `_components/BonusesManager.tsx`: listado + "+ Añadir tipo de bono". [unit: src/lib/bonuses/progress.test.ts] [e2e: —] [risk: P1]
- **Modal nuevo bono** — nombre + tipo (meta/tramo) + umbrales + importe; POST `/api/bonuses`. [unit: src/lib/bonuses/progress.test.ts] [e2e: —] [risk: P1]
- **Eliminar bono** — ConfirmDialog + DELETE. [unit: —] [e2e: —] [risk: P1]

### 8.4 Bonos

_`equipo/bonos/page.tsx`_ — Pro-gated

- **BonusesManager** — catálogo de tipos de bono (CRUD). [unit: src/lib/bonuses/progress.test.ts] [e2e: —] [risk: P1]
- **BonusTracker** — progreso mensual de cada barbero hacia sus bonos; barras de progreso + importe acumulado. [unit: src/lib/bonuses/progress.test.ts] [e2e: —] [risk: P1]

### 8.5 Competición

_`equipo/competicion/page.tsx`_ — ComisionesClient view="competicion"

- **Pro-gate** — UpgradeRequired si `!enabled`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]

#### Competición semanal (R10)

- **Lista de competiciones** — CRUD: nombre + tipo (por citas/por facturación) + premio fijo + bono de racha; SWR GET `/api/competitions`. [unit: src/lib/competitions/leaderboard.test.ts] [e2e: —] [risk: P1]
- **Botón "+ Nueva competición"** — abre modal. [unit: —] [e2e: —] [risk: P1]
- **Modal nueva competición** — nombre + tipo + prize (€) + streak bonus (€). [unit: src/lib/competitions/leaderboard.test.ts] [e2e: —] [risk: P1]
- **Eliminar competición** — ConfirmDialog + DELETE. [unit: —] [e2e: —] [risk: P1]
- **Leaderboard congelado** — ranking semanal cerrado; posición + nombre + métrica + racha actual. [unit: src/lib/competitions/leaderboard.test.ts] [e2e: —] [risk: P1]
- **Estado sin competiciones** — "Crea tu primera competición". [unit: —] [e2e: —] [risk: P2]

---

## 9. Informes

_`src/app/dashboard/informes/`_

### 9.1 Panel (OperatorPanel + FinanzasClient)

_`informes/page.tsx`_

#### PanelSwitch

- **Conmutador OperatorPanel / P&L** — botón toggle que alterna entre las dos vistas. [unit: —] [e2e: —] [risk: P1]

#### OperatorPanel

- **StatStrip de ingresos** — Facturado / Servicios / Productos / Propinas del mes; trends vs mes anterior. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Sparkline de ingresos** — 12 meses de historia. [unit: —] [e2e: —] [risk: P2]
- **Citas por estado** — completed / confirmed / no_show / cancelled con dot color + count + %. [unit: —] [e2e: —] [risk: P1]
- **Clientes nuevos vs habituales** — count + % retención. [unit: —] [e2e: —] [risk: P1]
- **Nota media** — promedio de ratings del mes. [unit: —] [e2e: —] [risk: P1]
- **Estado sin actividad** — "Sin actividad en este periodo." [unit: —] [e2e: —] [risk: P2]

#### FinanzasClient (P&L completo)

- Ver [Sección 6](#6-finanzas-pl) — mismo componente, mismo contenido. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]

### 9.2 Ingresos

_`informes/ingresos/page.tsx`_ — ReportLayout con INGRESOS_RAIL.

- **"Ingreso por tipo"** — barras: servicios / productos / propinas (cents); selección de barra filtra la tabla. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **"Ventas por servicio top 10"** — DataTable: Servicio / N ventas / Importe total; orden desc por importe. [unit: —] [e2e: —] [risk: P1]
- **"Ventas por producto"** — DataTable: Producto / N ventas / Importe total. [unit: —] [e2e: —] [risk: P1]
- **BarberBreakdown** — desglose por barbero (si ≥2 con ventas). [unit: —] [e2e: —] [risk: P1]
- **"Evolución mensual"** — bar chart de ingresos últimos 12 meses. [unit: src/lib/dashboard/period.test.ts] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin ingresos en el periodo". [unit: —] [e2e: —] [risk: P2]

### 9.3 Citas

_`informes/citas/page.tsx`_ — ReportLayout con CITAS_RAIL.

- **StatStrip** — Total citas / Tasa no-show (%) / Tasa cancelación (%) / Perdido estimado (€). [unit: —] [e2e: —] [risk: P1]
- **Breakdown por estado** — completed / confirmed / no_show / cancelled con counts y %. [unit: —] [e2e: —] [risk: P1]
- **"Clientes con más no-shows"** — DataTable lifetime top 10 por count. [unit: —] [e2e: —] [risk: P1]
- **"Evolución mensual completadas"** — bar chart últimas 12 meses. [unit: src/lib/dashboard/period.test.ts] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin citas en el periodo". [unit: —] [e2e: —] [risk: P2]

### 9.4 Clientes (informe)

_`informes/clientes/page.tsx`_ — ReportLayout con CLIENTES_RAIL.

- **StatStrip** — Total clientes / Nuevos (30d) / Retención (%) / En riesgo (count). [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **SourceBreakdown** — últimos 30d: nuevos por fuente. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **"Mejores clientes"** — DataTable top 10 por € gastado. [unit: —] [e2e: —] [risk: P1]
- **"En riesgo"** — DataTable: ≥2 citas, ≥45d sin volver (`RISK_DAYS=45`). [unit: —] [e2e: —] [risk: P1]
- **"Nuevos vs habituales"** — barra de retención: 2ª cita ≤60d. [unit: —] [e2e: —] [risk: P1]
- **`HABITUAL_DAYS=30`** — umbral habitual. [unit: —] [e2e: —] [risk: P1]
- **`INACTIVO_DAYS=90`** — umbral inactivo. [unit: —] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin clientes en el periodo". [unit: —] [e2e: —] [risk: P2]

### 9.5 Marketing (informe)

_`informes/marketing/page.tsx`_ — ReportLayout con MARKETING_RAIL.

- **StatStrip** — Promos enviadas / Trajeron reserva (%) / Reseñas totales / Nota media. [unit: —] [e2e: —] [risk: P1]
- **Distribución de reseñas** — barras 1–5 estrellas con count + %. [unit: —] [e2e: —] [risk: P1]
- **"¿Funcionan las promos?"** — barra de conversión %: clientes que recibieron promo y reservaron. [unit: —] [e2e: —] [risk: P1]
- **Log de promos** — DataTable: Fecha / Tipo promo / Enviadas / Convirtieron / Conversión %. [unit: —] [e2e: —] [risk: P1]
- **"Lo que dicen tus clientes"** — cards de reviews con estrellas + nombre + fecha + canal (WhatsApp/Google) + comentario. [unit: —] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin actividad de marketing en el periodo". [unit: —] [e2e: —] [risk: P2]

### 9.6 Nóminas

_`informes/nominas/page.tsx`_

- **Pro-gate** — UpgradeRequired si `!payrollEnabled`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **Estado bloqueado** — "Activa el plan Pro para ver nóminas detalladas". [unit: —] [e2e: —] [risk: P2]
- **PayrollMonthView** — MonthStepper (prev/next mes) + Payroll SWR. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **MonthStepper** — etiqueta "mayo de 2026" + botones prev/next. [unit: src/lib/dashboard/period.test.ts] [e2e: —] [risk: P1]
- **Payroll expandible por barbero** — collapse/expand; desglose línea a línea. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Total del equipo** — pie de tabla. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]

---

## 10. Marketing

_`src/app/dashboard/marketing/`_

### 10.1 Fidelidad

_`marketing/page.tsx`_ — Pro-gated `loyaltyAdvanced`

#### LoyaltySettings

- **Toggle activar fidelidad** — habilita el módulo. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Radio modo** — Sellos / Puntos. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

##### Configuración modo Sellos

- **Sellos por visita** — número de sellos que se dan por cita. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Sellos para recompensa** — umbral de canje. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Descripción de la recompensa** — texto libre (e.g. "Corte gratis"). [unit: —] [e2e: —] [risk: P2]

##### Configuración modo Puntos

- **Puntos por € gastado** — ratio. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Puntos para recompensa** — umbral de canje. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Descripción de la recompensa** — texto libre. [unit: —] [e2e: —] [risk: P2]

- **Botón "Guardar configuración"** — PATCH `/api/loyalty/settings`. [unit: —] [e2e: —] [risk: P1]

#### LoyaltyCustomerLookup

- **Buscador de cliente** — typeahead por nombre/teléfono. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Saldo actual** — sellos/puntos del cliente seleccionado. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Campo "Ajuste de saldo"** — NumberInput para añadir/quitar manualmente. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Botón "Aplicar ajuste"** — POST `/api/loyalty/adjust`. [unit: —] [e2e: —] [risk: P1]
- **Botón "Canjear recompensa"** — marca la recompensa como canjeada. [unit: —] [e2e: —] [risk: P1]

### 10.2 Promos

_`marketing/promos/page.tsx`_

- **Pro-gate** — UpgradeRequired si `!promosContextuales`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **PromosToggle** — habilitar/deshabilitar promos contextuales (envía push o WhatsApp). [unit: —] [e2e: —] [risk: P1]
- **Card "Reactivar inactivos"** — "Próximamente" badge. [unit: —] [e2e: —] [risk: P2]
- **Card "Felicitar cumpleaños"** — "Próximamente" badge. [unit: —] [e2e: —] [risk: P2]
- **Card "Analytics avanzados"** — "Próximamente" badge. [unit: —] [e2e: —] [risk: P2]

### 10.3 WhatsApp Bot

_`marketing/whatsapp/page.tsx`_

- **Campo nombre del bot** — `name`, max 40 chars. [unit: —] [e2e: —] [risk: P1]
- **Radio tono** — Cercano / Neutro / Formal. [unit: —] [e2e: —] [risk: P1]
- **Textarea mensaje de bienvenida** — mensaje que envía el bot al primer contacto. [unit: —] [e2e: —] [risk: P1]
- **Campo URL de Google Reviews** — `https://` solo, filtro 5★; validación format. [unit: —] [e2e: —] [risk: P1]
- **Botón "Guardar"** — `saveBotSettings` server action. [unit: —] [e2e: —] [risk: P1]
- **Estado de guardado** — spinner + confirmación. [unit: —] [e2e: —] [risk: P2]

### 10.4 Reseñas

_`marketing/resenas/page.tsx`_

#### RatingsToggle

- **Toggle "Activar solicitud de reseñas"** — habilita el flujo post-cita. [unit: —] [e2e: —] [risk: P1]
- **Campo "Enviar N minutos después"** — NumberInput (`followupMinutesAfter`); default en `FOLLOWUP_DELAY_MINUTES`. [unit: —] [e2e: —] [risk: P1]
- **Botón "Guardar"** — PATCH `/api/ratings/settings`. [unit: —] [e2e: —] [risk: P1]

#### StatStrip de reseñas

- **Nota media** — promedio global. [unit: —] [e2e: —] [risk: P1]
- **Total reseñas** — count. [unit: —] [e2e: —] [risk: P1]
- **5★ %** — porcentaje de 5 estrellas. [unit: —] [e2e: —] [risk: P1]

#### Distribución de estrellas

- **Barras 1–5** — count + % por nivel. [unit: —] [e2e: —] [risk: P1]

#### Review cards

- **Estrellas** — display visual 1–5. [unit: —] [e2e: —] [risk: P1]
- **Nombre del cliente** — o "Anónimo". [unit: —] [e2e: —] [risk: P1]
- **Fecha** — fecha de la reseña. [unit: —] [e2e: —] [risk: P1]
- **Icono de canal** — WhatsApp / Google. [unit: —] [e2e: —] [risk: P2]
- **Nombre del barbero** — barbero al que se asigna la reseña. [unit: —] [e2e: —] [risk: P1]
- **Comentario** — texto de la reseña. [unit: —] [e2e: —] [risk: P1]
- **Empty state** — "Todavía sin reseñas". [unit: —] [e2e: —] [risk: P2]

### 10.5 Tienda (productos pública)

_`marketing/tienda/page.tsx`_ — ProductsManager

- **Tabla productos** — misma que en `ventas/productos` (componente reutilizado). [unit: —] [e2e: —] [risk: P1]
- **CRUD completo** — crear / editar / eliminar. [unit: —] [e2e: —] [risk: P1]

---

## 11. Ajustes

_`src/app/dashboard/ajustes/`_

### 11.1 Negocio

_`ajustes/page.tsx`_ — NegocioForm

- **Campo nombre del negocio** — `businessName`; `saveBusiness` server action. [unit: —] [e2e: —] [risk: P1]
- **Campo teléfono WhatsApp** — `whatsappNumber`; formato E.164 validado (libphonenumber-js). [unit: src/lib/phone.test.ts] [e2e: —] [risk: P1]
- **Campo dirección** — `address`. [unit: —] [e2e: —] [risk: P2]

#### ServicesManager

- **Lista de servicios** — nombre + duración + precio; ordenable. [unit: —] [e2e: —] [risk: P1]
- **Botón "+ Añadir servicio"** — nueva fila editable. [unit: —] [e2e: —] [risk: P1]
- **Edición inline** — nombre / duración / precio por fila. [unit: —] [e2e: —] [risk: P1]
- **Borrar servicio** — botón papelera. [unit: —] [e2e: —] [risk: P1]

#### HoursEditor

- **Toggle por día** — on/off (cerrado). [unit: —] [e2e: —] [risk: P1]
- **Inicio / Fin por día activo** — inputs HH:MM. [unit: —] [e2e: —] [risk: P1]

- **Selector `slotStepMinutes`** — radio 15 / 30 / 45 min (granularidad de la agenda). [unit: —] [e2e: —] [risk: P1]

#### BlockedDatesManager

- **Lista de fechas bloqueadas** — el negocio cierra (vacaciones, festivos). [unit: —] [e2e: —] [risk: P1]
- **Botón "+ Añadir fecha"** — date picker → añade a la lista. [unit: —] [e2e: —] [risk: P1]
- **Botón eliminar fecha** — quita la fecha. [unit: —] [e2e: —] [risk: P1]

- **Botón "Guardar cambios"** — `saveBusiness` server action; toast de confirmación. [unit: —] [e2e: —] [risk: P1]

### 11.2 Pagos

_`ajustes/pagos/page.tsx`_

#### CashRegisterToggle

- **Toggle "Habilitar caja registradora"** — PATCH `cashRegister`; habilita el módulo Caja. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]

#### SumupConnect

- **Estado "No conectado"** — visible solo si `cashRegister` habilitado; botón "Conectar SumUp" → OAuth SumUp. [unit: —] [e2e: —] [risk: P0]
- **Estado "Conectado"** — badge + nombre de terminal + botón "Desconectar". [unit: —] [e2e: —] [risk: P0]

#### MobileAppConnect

- **Visible solo si SumUp conectado** — instrucciones para vincular la app de SumUp con el móvil. [unit: —] [e2e: —] [risk: P1]

#### ConnectSettings (Stripe Connect)

- **Estado "Sin cuenta"** — botón "Crear cuenta Stripe" → `/api/stripe/connect/onboard`. [unit: —] [e2e: —] [risk: P0]
- **Estado "Pendiente"** — "Tu cuenta está en revisión" + botón "Reanudar onboarding". [unit: —] [e2e: —] [risk: P0]
- **Estado "Activo"** — badge verde + texto "Stripe Connect activo" + botón "Gestionar cuenta". [unit: —] [e2e: —] [risk: P0]

#### InvoicingSettings

- **Toggle "Habilitar facturación"** — activa VeriFactu. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Campo nombre fiscal** — nombre empresa / autónomo. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Campo NIF** — validación formato. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Campo dirección fiscal** — calle + número. [unit: —] [e2e: —] [risk: P0]
- **Campo ciudad** — ciudad. [unit: —] [e2e: —] [risk: P0]
- **Campo código postal** — 5 dígitos. [unit: —] [e2e: —] [risk: P0]
- **Campo IVA rate** — número %, default 21. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Campo prefijo numeración** — `invoiceNumberPrefix`, e.g. "FAC-". [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Campo siguiente número de factura** — NumberInput `invoiceNumberNext`; bloqueado si ya se emitió alguna factura (`hasEmittedInvoices`). [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Lock si hay facturas emitidas** — tooltip "No se puede cambiar si ya hay facturas emitidas". [unit: —] [e2e: —] [risk: P0]
- **Botón "Guardar"** — PATCH `/api/invoicing/settings`. [unit: —] [e2e: —] [risk: P0]
- **"Facturas emitidas" summary** — count + link a `/dashboard/ventas/facturas`. [unit: —] [e2e: —] [risk: P1]

### 11.3 Reservas online

_`ajustes/reservas/page.tsx`_ — PublicPageSettings

- **Campo slug** — `slug`, URL amigable de la barbería; validación unicidad (async). [unit: —] [e2e: —] [risk: P1]
- **Toggle "App pública activa"** — `publicEnabled`; si off, la PWA muestra "Cerrado". [unit: —] [e2e: —] [risk: P1]
- **Campo logo URL (logo principal)** — `brandLogoUrl`. [unit: —] [e2e: —] [risk: P2]
- **Campo logo URL alternativo** — `brandLogoAltUrl`. [unit: —] [e2e: —] [risk: P2]
- **Campo cover URL** — `brandCoverUrl`. [unit: —] [e2e: —] [risk: P2]
- **Color de marca** — `brandColor`; color picker. [unit: —] [e2e: —] [risk: P2]
- **Selector tema** — `brandTheme`; claro / oscuro. [unit: —] [e2e: —] [risk: P2]
- **Campo descripción pública** — `publicDescription`, textarea. [unit: —] [e2e: —] [risk: P2]
- **Campo Instagram handle** — `instagramHandle`, sin @. [unit: —] [e2e: —] [risk: P2]
- **Campo TikTok handle** — `tiktokHandle`. [unit: —] [e2e: —] [risk: P2]
- **Campo Facebook URL** — `facebookUrl`. [unit: —] [e2e: —] [risk: P2]
- **Campo website URL** — `websiteUrl`. [unit: —] [e2e: —] [risk: P2]
- **Botón "Guardar"** — PATCH `/api/public-page`. [unit: —] [e2e: —] [risk: P1]
- **Preview link** — link "Ver tu app" → `b/[slug]`. [unit: —] [e2e: —] [risk: P2]

### 11.4 Recepcionista IA

_`ajustes/recepcionista/page.tsx`_

- **Pro-gate** `recepcionistaIA` — UpgradeRequired si no tiene la feature. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **VoiceTest** — browser-only (Twilio bridge pendiente); prueba de voz en tiempo real; microfono + speaker en el navegador. [unit: —] [e2e: —] [risk: P2]
- **Aviso "Solo para pruebas"** — texto explicando que el bridge con Twilio está pendiente. [unit: —] [e2e: —] [risk: P2]
- **Datos de barbers** — usa `booksyServices` jsonb (legacy read-only) para nombres de barberos en el contexto de la IA de voz. [unit: —] [e2e: —] [risk: P2]

### 11.5 App pública

_`app/page.tsx`_

- **QR code** — generado con `brandColor`; no tiene link de descarga en este punto, solo display. [unit: —] [e2e: —] [risk: P2]
- **URL compartir** — display de `b/[slug]`. [unit: —] [e2e: —] [risk: P1]
- **Botón "Copiar URL"** — AppPageCopyButton; copia al portapapeles. [unit: —] [e2e: —] [risk: P1]
- **Link "Ver"** — abre la PWA en nueva pestaña. [unit: —] [e2e: —] [risk: P2]
- **Link "Descargar QR"** — descarga la imagen del QR. [unit: —] [e2e: —] [risk: P2]
- **Contador de instalaciones activas** — `activeInstalls` (push subscriptions activas). [unit: —] [e2e: —] [risk: P1]
- **Aviso "No publicada"** — visible si `!publicEnabled`; CTA a `/dashboard/ajustes/reservas`. [unit: —] [e2e: —] [risk: P1]
- **Link "Personalizar"** — enlace a `/dashboard/ajustes/reservas`. [unit: —] [e2e: —] [risk: P2]
- **Sección "Notificaciones push"** — info sobre installs y permisos. [unit: —] [e2e: —] [risk: P1]
- **GtmSettings** — Pro-gated `gtmContainer`; campo para GTM container ID. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **GtmSettings — campo ID** — `GTM-XXXXXXX`; PATCH `/api/gtm`. [unit: —] [e2e: —] [risk: P1]

### 11.6 Ayuda

_`ayuda/page.tsx`_

- **Intro text** — "Tu primer puerto: el chat-widget…". [unit: —] [e2e: —] [risk: P2]

#### Contact cards

- **Card WhatsApp** — link `wa.me/34644288663` en nueva pestaña; número `+34 644 288 663`. [unit: —] [e2e: —] [risk: P2]
- **Card Email** — link `mailto:soporte@otracita.es`. [unit: —] [e2e: —] [risk: P2]

#### FAQs (HELP_SECTIONS)

- **Secciones por tema** — iteradas de `HELP_SECTIONS` (fuente única compartida con el chat widget). [unit: —] [e2e: —] [risk: P2]
- **`<details>` expandibles** — pregunta en `<summary>` + ChevronDown rotate + respuesta en texto; links markdown `[label](/path)` → `<a>` clickables. [unit: —] [e2e: —] [risk: P2]

---

## 12. Mi plan (Suscripción)

_`mi-plan/page.tsx`_

#### TierBanner

- **Estado trial** — banner gold con `daysLeft` restantes + `OpenStripePortalButton`. [unit: —] [e2e: —] [risk: P1]
- **Estado solo (free)** — banner con `UpgradeToProButton`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **Estado pro / estudio** — banner tranquilo ("Plan activo"). [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]

- **CTA "Gestiona facturas"** — link a `/dashboard/facturas`. [unit: —] [e2e: —] [risk: P2]

#### Plan card

- **Nombre del plan** — `planMeta.name`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **Descripción del plan** — `planMeta.description`. [unit: —] [e2e: —] [risk: P2]
- **Importe / moneda** — `amount / currency`. [unit: —] [e2e: —] [risk: P0]
- **SubscriptionStatusBadge** — active / trialing / past_due / canceled. [unit: —] [e2e: —] [risk: P1]
- **Próxima renovación** — `nextPeriodEnd`. [unit: —] [e2e: —] [risk: P1]
- **OpenStripePortalButton** — abre el portal de Stripe para gestionar el plan. [unit: —] [e2e: —] [risk: P0]

#### Historial de facturas Stripe

- **Lista de facturas** — iteradas desde Stripe: fecha / descripción / InvoiceStatusBadge / importe / link PDF. [unit: —] [e2e: —] [risk: P0]
- **InvoiceStatusBadge** — paid / open / void. [unit: —] [e2e: —] [risk: P0]
- **Link PDF** — descarga la factura de Stripe. [unit: —] [e2e: —] [risk: P0]
- **Estado sin facturas** — "No hay facturas todavía". [unit: —] [e2e: —] [risk: P2]

#### OnlinePaymentsSummary

- **Total online cobrado** — Stripe Connect del mes. [unit: —] [e2e: —] [risk: P0]
- **Últimas transacciones** — mini tabla. [unit: —] [e2e: —] [risk: P0]

---

## 13. Rutas legacy / redirect

- **`/dashboard/crecer`** — redirect permanente a `/dashboard/marketing`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/equipo/nominas`** — redirect a `/dashboard/informes/nominas`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/page.tsx`** — redirect a `/dashboard/agenda`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/caja/page.tsx`** — ruta legacy de caja global (no sub-ruta de Ventas); misma UI que `ventas/caja`. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **`/dashboard/negocio/page.tsx`** — ruta legacy para negocio; debe redirigir a `/dashboard/ajustes`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/resenas/page.tsx`** — ruta legacy; contenido movido a `/dashboard/marketing/resenas`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/fidelidad/page.tsx`** — ruta legacy; contenido movido a `/dashboard/marketing`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/bot/page.tsx`** — ruta legacy para el bot; contenido en `/dashboard/marketing/whatsapp`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/finanzas/page.tsx`** — ruta legacy para el P&L; ahora accesible vía Informes > Panel con PanelSwitch. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **`/dashboard/voice-test/page.tsx`** — ruta de prueba del recepcionista de voz (no en nav principal). [unit: —] [e2e: —] [risk: P2]

---

## Summary (A)

El dashboard otracita cubre **7 áreas** de primer nivel más shell, setup y rutas legacy, con los siguientes módulos críticos de dinero y fiscalidad (risk P0): toda la capa VeriFactu/AEAT (emitir, rectificar, timeline, QR aceptado), facturación manual con detección NIF y tope ticket 400 €, bookings.price en EUROS (no cents — foot-gun crítico), TPV con 4 métodos de pago + SumUp, caja registradora (apertura/cierre/apuntes/PDF), Stripe Connect onboarding + payment links + refunds, propinas con asignación a barbero, P&L con IVA soportado/repercutido/vencimientos trimestrales, nóminas por barbero (fijo/mixto/autónomo), comisiones por servicio con override, y el módulo de fidelidad stamps/points.

Los módulos de flujo core (risk P1) cubren: agenda con ventana dinámica, drag&drop, 3 vistas (Día/Semana/Mes), polling SWR 10s, BookingDetailPanel con sus 8 acciones, NewBookingPanel multi-servicio, import vision en 3 pasos, gestión del equipo (barberos CRUD + turnos + ausencias + bloques), clientes con ficha Booksy-grade y edición inline, y marketing completo (promos, bot, reseñas, fidelidad).

**Hoja count total: 312 hojas.**

Test files mapeados a sus áreas:
- `_agenda-window.test.ts` → §3.1, §3.2 (ventana dinámica, offhours)
- `derive-source.test.ts` → §7.1, §7.2, §7.3, §9.4 (atribución fuente)
- `tier.test.ts` → §8.3, §8.4, §8.5, §9.6, §10.1, §10.2, §11.4, §12 (feature gates)
- `progress.test.ts` → §8.3, §8.4 (bonos/comisiones)
- `duration.test.ts` → §3.7 (total duración multi-servicio)
- `compute.test.ts` (cash) → §4.3, §11.2 (caja registradora)
- `leaderboard.test.ts` → §8.5 (competición)
- `period.test.ts` → §9.2, §9.3, §9.6 (evolución mensual)
- `pnl-math.test.ts` → §4.6, §6, §9.1, §9.2, §11.2 (P&L, IVA)
- `invoicing.test.ts` → §3.8, §4.1, §5.2, §5.3, §11.2 (facturas, rectificativas)
- `compute.test.ts` (loyalty) → §7.2, §10.1 (fidelidad)
- `compute.test.ts` (payroll) → §6, §9.6, §11.2 (nóminas)
- `services-commission.test.ts` → §8.1, §8.3 (comisiones por servicio)
- `phone.test.ts` → §11.1 (E.164 teléfono)
- `unavailability.test.ts` → §3.1, §8.2 (drag&drop, bloques)
- `format.test.ts`, `hash.test.ts`, `qr.test.ts`, `xml.test.ts` (verifactu) → §4.6, §5.1, §5.2, §5.3, §11.2
---


## B — PWA + Bot

# B · PWA pública + WhatsApp bot

## Table of contents
- [PWA pública (b/\[slug\])](#pwa)
- [WhatsApp bot conversacional](#bot)
- [Landing + páginas públicas](#landing)

---

## PWA pública (b/[slug]) {#pwa}

### App shell
#### TopBar (sticky)
- **Logo + nombre del negocio** muestran la identidad de la barbería en la cabecera al hacer scroll. `[unit: —] [e2e: —] [risk: P1]`
- **En tema oscuro** con `brandLogoAltUrl` configurado, usa el logo alternativo en vez del principal. `[unit: —] [e2e: —] [risk: P2]`
- **Botón Compartir** llama a `navigator.share` si la API está disponible (Android/iOS moderno). `[unit: —] [e2e: —] [risk: P2]`
- **Fallback de compartir** copia la URL al portapapeles si `navigator.share` no está disponible. `[unit: —] [e2e: —] [risk: P2]`
- **Cancelar compartir** (usuario descarta el share sheet) cae al bloque `catch` sin romper nada. `[unit: —] [e2e: —] [risk: P2]`

#### BottomTabBar
- **Tab Inicio** hace scroll suave al anchor `#hero` si estamos en la home. `[unit: —] [e2e: —] [risk: P2]`
- **Tab Servicios** hace scroll suave al anchor `#servicios`. `[unit: —] [e2e: —] [risk: P2]`
- **Tab Reservar** hace scroll suave al anchor `#reservar` y aparece con highlight brand. `[unit: —] [e2e: —] [risk: P1]`
- **Tab Perfil** navega a `/b/[slug]/cuenta` vía `<Link>`. `[unit: —] [e2e: —] [risk: P1]`
- **IntersectionObserver** actualiza la tab activa al hacer scroll por #hero, #servicios, #reservar. Solo activo en la home; desactivado en sub-rutas. `[unit: —] [e2e: —] [risk: P2]`
- **Desde sub-ruta** (e.g. /cuenta): click en cualquier tab scroll lanza `window.location.href = /b/[slug]#<id>` para navegar + scrollar. `[unit: —] [e2e: —] [risk: P2]`
- **Safe-area-inset-bottom** aplica padding dinámico para iPhone X+ notch. `[unit: —] [e2e: —] [risk: P2]`
- **Tab Reservar wide pill** — cuando activa, la pastilla interna pasa de 44px a 64px de ancho y usa color `--brand` sólido. `[unit: —] [e2e: —] [risk: P2]`

#### Página raíz `/b/[slug]`
- **Slug inexistente** llama a `notFound()` → 404. `[unit: —] [e2e: —] [risk: P1]`
- **`publicEnabled = false`** en el cliente → `notFound()`. `[unit: —] [e2e: —] [risk: P1]`
- **`generateMetadata`** construye title, description, themeColor, manifest, apple-web-app, openGraph y twitter desde el registro del cliente. `[unit: —] [e2e: —] [risk: P2]`
- **brandColor inválido** (no hexadecimal) → `themeColor` usa fallback `#111111`. `[unit: —] [e2e: —] [risk: P2]`
- **openGraph con portada** usa `summary_large_image`; sin portada ni logo usa `summary`. `[unit: —] [e2e: —] [risk: P2]`
- **Paleta dinámica** `buildPalette(brandTheme, brandColor)` calcula accent, accentSoft, accentStrong, accentInk y tokens canvas/surface/line/ink según luminancia. Inyectados como CSS vars en `<main>`. `[unit: —] [e2e: —] [risk: P1]`
- **Variables de compatibilidad** (`--brand*`, `--color-canvas`…) duplicadas para no romper componentes legacy que aún las referencian. `[unit: —] [e2e: —] [risk: P2]`
- **waLink** construido limpiando el número de caracteres no numéricos → `https://wa.me/<digits>`. Si no hay número, `waLink = null` y el botón WhatsApp no aparece. `[unit: —] [e2e: —] [risk: P2]`
- **paddingBottom en `<main>`** = `calc(64px + env(safe-area-inset-bottom))` para no solapar con BottomTabBar. `[unit: —] [e2e: —] [risk: P2]`

### Hero card
#### Layout
- **Con `brandCoverUrl`** renderiza foto de portada como `background-image` con overlay degradado. `[unit: —] [e2e: —] [risk: P2]`
- **Sin `brandCoverUrl`** renderiza gradiente solid de `--accent` con patrón de puntos. `[unit: —] [e2e: —] [risk: P2]`
- **Logo del negocio** (`heroLogoUrl`) aparece en esquina superior derecha dentro de la card, con sombra brand. `[unit: —] [e2e: —] [risk: P2]`
- **Sin logo** la esquina permanece vacía sin romper el layout. `[unit: —] [e2e: —] [risk: P2]`
- **Nombre del negocio** en `<h1>`, tipografía display, color siempre blanco sobre la card. `[unit: —] [e2e: —] [risk: P1]`
- **`publicDescription`** aparece solo si el barbero la tiene configurada; sin ella, no hay texto vacío. `[unit: —] [e2e: —] [risk: P2]`
- **`line-clamp-2`** trunca descripciones largas en la hero card. `[unit: —] [e2e: —] [risk: P2]`

#### Meta row (horario + dirección)
- **Dot verde + "Abierto · HH:MM–HH:MM"** cuando `hoursForDate` devuelve rango para hoy (Madrid TZ). `[unit: —] [e2e: —] [risk: P1]`
- **Dot gris + "Cerrado hoy"** cuando `hoursForDate` devuelve null. `[unit: —] [e2e: —] [risk: P1]`
- **Dirección** como `<a>` a Google Maps (`maps/search?api=1&query=<enc>`), abre `_blank`. Solo aparece si `client.address` está configurado. `[unit: —] [e2e: —] [risk: P2]`
- **Dirección larga** truncada con `truncate` para no romper la fila. `[unit: —] [e2e: —] [risk: P2]`

#### CTA hero
- **"Reservar cita"** (`href="#reservar"`) hace scroll al formulario de reserva. Estilo rounded-full con `--accent` + sombra brand. `[unit: —] [e2e: —] [risk: P1]`
- **`active:scale-[0.98]`** feedback táctil en el botón. `[unit: —] [e2e: —] [risk: P2]`

### Redes sociales (SocialLinks)
- **WhatsApp** enlaza a `wa.me/<digits>`, abre `_blank`. `[unit: —] [e2e: —] [risk: P2]`
- **Teléfono separado** (distinto del WhatsApp) muestra el botón de llamada `tel:`. Solo visible si `phone !== whatsappNumber`. `[unit: —] [e2e: —] [risk: P2]`
- **Instagram** enlaza a `instagram.com/<handle>`, elimina `@` inicial si existe. `[unit: —] [e2e: —] [risk: P2]`
- **TikTok** enlaza a `tiktok.com/@<handle>`. `[unit: —] [e2e: —] [risk: P2]`
- **Facebook** enlaza a la URL configurada directamente. `[unit: —] [e2e: —] [risk: P2]`
- **Web** enlaza a la URL configurada. `[unit: —] [e2e: —] [risk: P2]`
- **Sin ningún enlace** el componente devuelve `null` — no hay fila vacía. `[unit: —] [e2e: —] [risk: P2]`
- **Teléfono de llamada** NO abre `_blank` (es `tel:`). El resto sí abren `_blank`. `[unit: —] [e2e: —] [risk: P2]`

### Flujo de reserva (PublicBookingFlow)

#### Pre-fill de datos del cliente
- **Al montar**, llama a `/api/app/me` — si la sesión PWA está activa, rellena nombre, teléfono y email en los inputs. `[unit: —] [e2e: —] [risk: P1]`
- **Error de red en `/api/app/me`** → `setPrefilled(true)` sin rellenar nada, el flujo continúa. `[unit: —] [e2e: —] [risk: P1]`
- **Pre-fill parcial** (ej. nombre guardado pero sin email) solo rellena los campos disponibles; no sobrescribe entradas previas del usuario. `[unit: —] [e2e: —] [risk: P1]`

#### Sección Servicios (`#servicios`)
##### Lista featured
- **Hasta 3 servicios `featured: true`** se muestran en la lista principal. `[unit: —] [e2e: —] [risk: P1]`
- **Sin servicios marcados como featured** → fallback: los primeros 3 por orden de entrada. `[unit: —] [e2e: —] [risk: P1]`
- **Click en servicio** lo selecciona: borde brand-strong, fondo brand-soft, icono con brand, radio con check. `[unit: —] [e2e: —] [risk: P1]`
- **Descripción expandida** aparece debajo de los metadatos al seleccionar el servicio (si tiene descripción). `[unit: —] [e2e: —] [risk: P2]`
- **Descripción colapsada** muestra `line-clamp-2` cuando el servicio NO está seleccionado. `[unit: —] [e2e: —] [risk: P2]`
- **Star icon** aparece junto al nombre si `service.featured === true`. `[unit: —] [e2e: —] [risk: P2]`
- **Precio** siempre visible a la derecha con `formatEuros` (`.toFixed(2).replace('.', ',')`, formato español). `[unit: —] [e2e: —] [risk: P0]`
- **Duración** en minutos bajo el nombre del servicio. `[unit: —] [e2e: —] [risk: P1]`
- **`aria-pressed`** en cada ServiceRow para accesibilidad teclado/lector. `[unit: —] [e2e: —] [risk: P2]`
- **Sin servicios configurados** → el componente muestra un párrafo de estado vacío y no renderiza nada más. `[unit: —] [e2e: —] [risk: P1]`

##### Botón "Ver todos"
- **Solo aparece** cuando `services.length > featuredServices.length`. `[unit: —] [e2e: —] [risk: P1]`
- **Click** abre el `ServicesSheet` bottom sheet. `[unit: —] [e2e: —] [risk: P1]`

##### ServicesSheet (bottom sheet completo)
- **Backdrop overlay** toca para cerrar la sheet. `[unit: —] [e2e: —] [risk: P1]`
- **Botón X** cierra la sheet. `[unit: —] [e2e: —] [risk: P1]`
- **Handle visual** barra gris en la parte superior de la sheet. `[unit: —] [e2e: —] [risk: P2]`
- **`body.style.overflow = 'hidden'`** bloquea scroll del body mientras la sheet está abierta; restaurado en cleanup del effect. `[unit: —] [e2e: —] [risk: P1]`
- **Lista completa de servicios** con icono, nombre, duración, precio y descripción (sin truncar). `[unit: —] [e2e: —] [risk: P1]`
- **Servicio actualmente seleccionado** aparece con borde brand-strong y fondo brand-soft. `[unit: —] [e2e: —] [risk: P1]`
- **Click en servicio en la sheet** lo selecciona y cierra la sheet (`setShowAllServices(false)`). `[unit: —] [e2e: —] [risk: P1]`
- **`paddingBottom: env(safe-area-inset-bottom)`** para iPhone X+ al fondo de la sheet. `[unit: —] [e2e: —] [risk: P2]`
- **`role="dialog" aria-modal="true"`** para accesibilidad. `[unit: —] [e2e: —] [risk: P2]`
- **`max-h-[85vh]`** — la sheet nunca tapa toda la pantalla. `[unit: —] [e2e: —] [risk: P2]`

#### Sección Reservar (`#reservar`)
##### Selector de barbero
- **Solo aparece** si `barbers.length > 1`. `[unit: —] [e2e: —] [risk: P1]`
- **Card "Cualquiera"** siempre disponible (primera posición, icono ✦). `[unit: —] [e2e: —] [risk: P1]`
- **Card de cada barbero** muestra foto si disponible; si no, inicial del nombre. `[unit: —] [e2e: —] [risk: P1]`
- **Barbero no disponible** (sin slots para el servicio+fecha actuales) aparece con `opacity-30 cursor-not-allowed`. `[unit: —] [e2e: —] [risk: P1]`
- **Click en barbero no disponible** no actualiza el estado (guard `barberAvailable(b.id)`). `[unit: —] [e2e: —] [risk: P1]`
- **Selección visual** borde brand-strong + check badge superpuesto en la foto. `[unit: —] [e2e: —] [risk: P1]`
- **Al cambiar de fecha y el barbero seleccionado queda sin slots** → `setBarberId(null)` automático (reset a "Cualquiera"). `[unit: —] [e2e: —] [risk: P1]`
- **Grid 3 cols en móvil, 4 en sm** para la cuadrícula de barberos. `[unit: —] [e2e: —] [risk: P2]`
- **`aria-pressed`** en cada BarberCard. `[unit: —] [e2e: —] [risk: P2]`

##### Selector de día
- **14 días a partir de hoy** (en Madrid TZ) se generan al montar. `[unit: —] [e2e: —] [risk: P1]`
- **"Hoy" label** en la primera pastilla en vez del nombre del día. `[unit: —] [e2e: —] [risk: P1]`
- **Label de día**: weekday corto + número + mes corto, formato español. `[unit: —] [e2e: —] [risk: P1]`
- **Scroll horizontal** con `overflow-x-auto` + scrollbar oculta. `[unit: —] [e2e: —] [risk: P2]`
- **Pastilla seleccionada** borde brand-strong, fondo brand, color brand-ink. `[unit: —] [e2e: —] [risk: P1]`
- **Pastilla no seleccionada** borde theme-line, fondo theme-surface. `[unit: —] [e2e: —] [risk: P2]`
- **`aria-pressed`** en cada pastilla de día. `[unit: —] [e2e: —] [risk: P2]`
- **Cambiar de día** limpia el slot seleccionado (`setSlot(null)`) y recarga el grid. `[unit: —] [e2e: —] [risk: P1]`

##### Selector de hora (grid de huecos)
- **Al cambiar `service.name` o `date`** → fetch a `/api/public/availability/grid?slug=…&service=…&date=…`. `[unit: —] [e2e: —] [risk: P1]`
- **Estado cargando** muestra `Loader2` girando + "Cargando huecos…". `[unit: —] [e2e: —] [risk: P1]`
- **Error de red o API** muestra mensaje de error bajo el selector de hora y limpia el grid. `[unit: —] [e2e: —] [risk: P1]`
- **Sin huecos disponibles** → empty state con "No hay huecos este día" + hint de prueba. Si hay barbero seleccionado, el copy incluye "con este barbero". `[unit: —] [e2e: —] [risk: P1]`
- **Huecos con barbero seleccionado** → filtra por `grid.byBarber[barberId]`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin preferencia de barbero** → usa `grid.union` (todos los huecos). `[unit: —] [e2e: —] [risk: P1]`
- **Franja Mañana** muestra slots con `start < "14:00"`. `[unit: —] [e2e: —] [risk: P1]`
- **Franja Tarde** muestra slots con `start >= "14:00"`. `[unit: —] [e2e: —] [risk: P1]`
- **Contador de huecos** en el label de cada franja (`3 huecos`, `1 hueco` singular). `[unit: —] [e2e: —] [risk: P2]`
- **Grid 3 cols en móvil, 4 en sm** para los botones de hora. `[unit: —] [e2e: —] [risk: P2]`
- **Slot seleccionado** borde brand-strong, fondo brand, color brand-ink, sombra brand. `[unit: —] [e2e: —] [risk: P1]`
- **Slot no seleccionado** borde theme-line, fondo theme-surface. `[unit: —] [e2e: —] [risk: P2]`
- **`tabular-nums`** en los botones de hora para alineación uniforme. `[unit: —] [e2e: —] [risk: P2]`
- **`aria-pressed`** en cada slot. `[unit: —] [e2e: —] [risk: P2]`

##### Formulario de datos del cliente
- **Solo aparece cuando hay un slot seleccionado** (`slot !== null`). `[unit: —] [e2e: —] [risk: P1]`
- **Campo "Tu nombre *"** `type="text"`, `autoComplete="name"`, obligatorio. `[unit: —] [e2e: —] [risk: P1]`
- **Campo "WhatsApp *"** `type="tel"`, `autoComplete="tel"`, `placeholder="+34 600 123 456"`, obligatorio. `[unit: —] [e2e: —] [risk: P1]`
- **Campo "Email (opcional)"** `type="email"`, `autoComplete="email"`, opcional (`required=false`). `[unit: —] [e2e: —] [risk: P2]`
- **Email en `sm:col-span-2`** ocupa ancho completo en pantallas grandes. `[unit: —] [e2e: —] [risk: P2]`
- **Pre-fill desde sesión activa** rellena los tres campos si el usuario ya está logueado en la PWA. `[unit: —] [e2e: —] [risk: P1]`

##### Resumen + CTA docked
- **Solo aparece cuando hay servicio seleccionado** (`service !== null`). `[unit: —] [e2e: —] [risk: P1]`
- **Nombre del servicio** truncado (`truncate`). `[unit: —] [e2e: —] [risk: P1]`
- **Hora seleccionada** aparece junto al nombre del servicio si hay slot seleccionado (`· HH:MM`). `[unit: —] [e2e: —] [risk: P1]`
- **Total** muestra el precio del servicio formateado con comas (€). `[unit: —] [e2e: —] [risk: P0]`
- **CTA "Confirmar reserva a las HH:MM"** cuando hay slot seleccionado. `[unit: —] [e2e: —] [risk: P1]`
- **CTA "Elige una hora primero"** cuando no hay slot (estado deshabilitado). `[unit: —] [e2e: —] [risk: P1]`
- **CTA "Reservando…"** durante `submitting || cardLoading`. `[unit: —] [e2e: —] [risk: P1]`
- **`canSubmit`** requiere `slot !== null && name.trim() !== '' && phone.trim() !== '' && !submitting && !cardLoading`. `[unit: —] [e2e: —] [risk: P1]`
- **CTA deshabilitado** con `opacity-40 cursor-not-allowed` y fondo theme-overlay. `[unit: —] [e2e: —] [risk: P1]`
- **Enlace a política de privacidad** en el pie del resumen (`/privacidad`, `_blank`). `[unit: —] [e2e: —] [risk: P2]`
- **"Sin pago por adelantado"** copy de tranquilidad junto al enlace de privacidad. `[unit: —] [e2e: —] [risk: P2]`

##### Mensaje de error genérico
- **Aparece bajo el formulario** cuando `error !== null`. Fondo rojo suave, texto `#DC2626`. `[unit: —] [e2e: —] [risk: P1]`
- **Limpiado automáticamente** al iniciar un nuevo submit. `[unit: —] [e2e: —] [risk: P1]`

#### Flujo de submit (sin tarjeta requerida)
- **Click en CTA** llama a `/api/public/bookings/setup-intent` (POST) con slug + datos del cliente. `[unit: —] [e2e: —] [risk: P0]`
- **`data.required === false`** → llama directamente a `completeBooking()`. `[unit: —] [e2e: —] [risk: P0]`
- **Error de red en setup-intent** muestra el error en el formulario. `[unit: —] [e2e: —] [risk: P0]`
- **Error de API en setup-intent** muestra `data.error`. `[unit: —] [e2e: —] [risk: P0]`
- **`completeBooking()`** llama a `/api/public/bookings/create` con todos los datos de la reserva + atribución. `[unit: —] [e2e: —] [risk: P0]`
- **Atribución last-touch** capturada con `captureLastTouch()` en el momento del submit. `[unit: —] [e2e: —] [risk: P1]`
- **First-touch** leído de localStorage vía `readStoredAttribution()`; si no existe, se usa el last-touch como both. `[unit: —] [e2e: —] [risk: P1]`
- **Éxito** → evento GTM `booking_confirmed` (si hay `dataLayer`) + `setConfirmation(...)`. `[unit: —] [e2e: —] [risk: P1]`
- **`errorCode === 'card_required'`** en `/bookings/create` → se limpia `card` para que el modal se cierre y el usuario vuelva a pasar por setup-intent. `[unit: —] [e2e: —] [risk: P0]`
- **Error de red en `/bookings/create`** muestra el error. `[unit: —] [e2e: —] [risk: P0]`

#### Flujo de submit con tarjeta requerida (no-show fee)
- **`data.required === true`** → `setCard({ publishableKey, clientSecret, setupIntentId, feeCents })`. `[unit: —] [e2e: —] [risk: P0]`
- **NoShowCardModal se monta** con los datos del SetupIntent. `[unit: —] [e2e: —] [risk: P0]`
- **`loadStripe(publishableKey)`** memo por publishableKey para no recargar el SDK. `[unit: —] [e2e: —] [risk: P0]`
- **Stripe `Elements`** con `clientSecret` y `appearance: { theme: 'flat' }`. `[unit: —] [e2e: —] [risk: P0]`
- **`PaymentElement`** renderiza el formulario de tarjeta. Solo se puede interactuar tras `onReady()`. `[unit: —] [e2e: —] [risk: P0]`
- **Checkbox de consentimiento** con el importe real de la tarifa (`feeCents / 100`). Obligatorio antes de poder confirmar. `[unit: —] [e2e: —] [risk: P0]`
- **Intento de confirmar sin marcar checkbox** → error "Marca la casilla para aceptar la tarifa…". `[unit: —] [e2e: —] [risk: P0]`
- **`elements.submit()`** primero (valida el formulario de Stripe); si falla, muestra error de Stripe. `[unit: —] [e2e: —] [risk: P0]`
- **`stripe.confirmSetup({ redirect: 'if_required' })`** — SCA si aplica. `[unit: —] [e2e: —] [risk: P0]`
- **Error de confirmación** (tarjeta rechazada, SCA fallida) muestra `confirmErr.message`. `[unit: —] [e2e: —] [risk: P0]`
- **`setupIntent.status !== 'succeeded'`** → error "La tarjeta no pudo confirmarse". `[unit: —] [e2e: —] [risk: P0]`
- **Éxito** → `setDone(true)`, llama `onSaved(setupIntent.id)` → padre llama `completeBooking(setupIntentId)`. `[unit: —] [e2e: —] [risk: P0]`
- **`done = true`** previene doble-submit accidental. `[unit: —] [e2e: —] [risk: P0]`
- **Error scrollea** al `#noshow-card-error` automáticamente. `[unit: —] [e2e: —] [risk: P1]`
- **Botón cerrar (X)** en el modal llama `onClose()` → `setCard(null)` → el modal desaparece sin crear la reserva. `[unit: —] [e2e: —] [risk: P0]`
- **Pie del modal** "Tarjeta protegida por Stripe. otracita no almacena el número." `[unit: —] [e2e: —] [risk: P2]`
- **`role="dialog" aria-modal="true" aria-label="Guardar tarjeta"`** accesibilidad. `[unit: —] [e2e: —] [risk: P2]`
- **Layout bottom-sheet en móvil, centrado en desktop** (`items-end sm:items-center`). `[unit: —] [e2e: —] [risk: P2]`

#### Success state (confirmación)
- **Pantalla de confirmación** reemplaza el flujo completo al hacer `setConfirmation({...})`. `[unit: —] [e2e: —] [risk: P1]`
- **Mensaje "¡Cita reservada!"** con check en circle brand-colored. `[unit: —] [e2e: —] [risk: P1]`
- **Detalle**: fecha, hora y barbero (si asignado) en bold. `[unit: —] [e2e: —] [risk: P1]`
- **"Recibirás recordatorio por WhatsApp el día antes."** copy informativo. `[unit: —] [e2e: —] [risk: P2]`
- **"Hacer otra reserva"** llama a `reset()` → vuelve al estado inicial del flujo. `[unit: —] [e2e: —] [risk: P1]`
- **`reset()`** restaura: servicio al primero, fecha a hoy, barbero a null, slot a null, campos de texto a vacío, error a null. `[unit: —] [e2e: —] [risk: P1]`

### Sección cuenta (`/b/[slug]/cuenta`)

#### Shell de la página cuenta
- **Hereda el theming** de la barbería (mismas CSS vars que la home). `[unit: —] [e2e: —] [risk: P1]`
- **`notFound()`** si el slug no existe o `publicEnabled = false`. `[unit: —] [e2e: —] [risk: P1]`
- **BottomTabBar** con `activeTab="perfil"` fijo. `[unit: —] [e2e: —] [risk: P1]`

#### CustomerAccount — estado inicial (loading)
- **Fetch `/api/app/me`** al montar. Mientras espera, muestra spinner `Loader2`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de red en `/api/app/me`** → vista `login-phone`. `[unit: —] [e2e: —] [risk: P1]`

#### CustomerAccount — Login paso 1 (teléfono + nombre)
- **`LoginHero`** muestra icono User + "Bienvenido" + descripción contextual con el nombre del negocio. `[unit: —] [e2e: —] [risk: P2]`
- **Input WhatsApp** `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`. `[unit: —] [e2e: —] [risk: P1]`
- **Input Nombre** `type="text"`, `autoComplete="given-name"`, etiqueta "(opcional la primera vez)". `[unit: —] [e2e: —] [risk: P2]`
- **Botón "Recibir código por WhatsApp"** deshabilitado mientras `loading || !phone.trim()`. `[unit: —] [e2e: —] [risk: P1]`
- **Error "Escribe tu teléfono."** si se pulsa el botón sin teléfono. `[unit: —] [e2e: —] [risk: P1]`
- **Llamada a `/api/app/otp/request`** (POST) con `{ slug, phone }`. `[unit: —] [e2e: —] [risk: P1]`
- **Éxito** → `setOtpHint(d.hint)` + `setView('login-code')`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de API** muestra `d.error || 'No se pudo enviar el código'`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de red** muestra 'Error de red'. `[unit: —] [e2e: —] [risk: P1]`
- **Texto informativo** sobre ventajas de la cuenta (reservas más rápidas, historial). `[unit: —] [e2e: —] [risk: P2]`

#### CustomerAccount — Login paso 2 (código OTP)
- **Botón "Cambiar número"** navega de vuelta a `login-phone`, limpia `code` y `error`. `[unit: —] [e2e: —] [risk: P1]`
- **Título + descripción** "Introduce el código" + `otpHint || "Código enviado por WhatsApp al {phone}. Llega en unos segundos."` `[unit: —] [e2e: —] [risk: P1]`
- **Input OTP** `type="text"`, `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength=6`, filtra no-dígitos en `onChange`. `[unit: —] [e2e: —] [risk: P1]`
- **Estilo monospace** con `tracking-[0.5em] text-3xl`. `[unit: —] [e2e: —] [risk: P2]`
- **Botón "Entrar"** deshabilitado si `loading || code.length !== 6`. `[unit: —] [e2e: —] [risk: P1]`
- **Validación local** `!/^\d{6}$/.test(code)` → error "El código es de 6 dígitos." antes de llamar a la API. `[unit: —] [e2e: —] [risk: P1]`
- **Llamada a `/api/app/otp/verify`** (POST) con `{ slug, phone, code, name? }`. `[unit: —] [e2e: —] [risk: P1]`
- **Éxito** → `refreshMe()` + `setCode('')` → transición a vista `home`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de API** muestra `d.error || 'No se pudo verificar'`. `[unit: —] [e2e: —] [risk: P1]`
- **Botón "Reenviar código"** llama a `requestCode()` de nuevo. Deshabilitado mientras `loading`. `[unit: —] [e2e: —] [risk: P1]`

#### CustomerAccount — Home loggeado
- **Tarjeta de usuario** con inicial del nombre + nombre + teléfono, sobre gradiente `--accent`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin nombre** muestra icono `User` en el avatar. `[unit: —] [e2e: —] [risk: P2]`
- **LoyaltyCard** (ver sección propia). `[unit: —] [e2e: —] [risk: P1]`
- **PushNotificationsRow** (ver sección propia). `[unit: —] [e2e: —] [risk: P1]`
- **RowLink "Mis reservas"** → `setView('bookings')`. `[unit: —] [e2e: —] [risk: P1]`
- **RowStatic "Perfil"** muestra email o teléfono (solo-lectura). `[unit: —] [e2e: —] [risk: P2]`
- **Botón "Cerrar sesión"** llama a `/api/app/logout` (POST), resetea estado, transición a `login-phone`. `[unit: —] [e2e: —] [risk: P1]`

#### PushNotificationsRow
- **Si push no soportado** devuelve null (invisible). `[unit: —] [e2e: —] [risk: P1]`
- **iOS en Safari sin instalar** (no standalone) → banner informativo "instala primero la app desde Compartir → Añadir a pantalla de inicio". `[unit: —] [e2e: —] [risk: P1]`
- **iOS en Chrome/Firefox** (no-Safari, no-standalone) → idem, ya que sin Safari no hay `beforeinstallprompt` ni push. `[unit: —] [e2e: —] [risk: P1]`
- **Permission denied** → banner "Notificaciones bloqueadas" con instrucciones para Ajustes. `[unit: —] [e2e: —] [risk: P1]`
- **Estado `default`** → botón "Activar notificaciones". Click llama `subscribeToPush(slug)`. `[unit: —] [e2e: —] [risk: P1]`
- **Estado `granted`** → botón "Notificaciones activadas". Click llama `unsubscribeFromPush()`. `[unit: —] [e2e: —] [risk: P1]`
- **`busy`** durante la operación → spinner `Loader2`. `[unit: —] [e2e: —] [risk: P1]`

#### LoyaltyCard
- **Barbería sin loyalty activo** (`enabled === false`) → devuelve null. `[unit: —] [e2e: —] [risk: P1]`
- **Error de red en `/api/app/loyalty`** → devuelve null (oculto). `[unit: —] [e2e: —] [risk: P1]`
- **Loading** → spinner + "Cargando tu tarjeta…". `[unit: —] [e2e: —] [risk: P2]`
- **Cliente nuevo** (`newCustomer: true`) → copy "Empezarás a sumar en tu próxima visita". `[unit: —] [e2e: —] [risk: P1]`
- **Sin `progress`** → "Reserva tu primera cita para empezar tu tarjeta." `[unit: —] [e2e: —] [risk: P1]`
- **Modo stamps (`StampsView`)** muestra `earned / needed`, barra de progreso. `[unit: —] [e2e: —] [risk: P1]`
  - **`canRedeem: true`** → label "¡Listo para canjear!" en color accent + banner "Muéstrale esta pantalla al barbero". `[unit: —] [e2e: —] [risk: P0]`
  - **`canRedeem: false`** → "te faltan N" en ink-3. `[unit: —] [e2e: —] [risk: P1]`
  - **Barra de progreso** `Math.round(p.progress * 100)%` de ancho. `[unit: —] [e2e: —] [risk: P1]`
  - **`RewardLabel`** para tipo `service`: nombre + "gratis". `[unit: —] [e2e: —] [risk: P0]`
  - **`RewardLabel`** para tipo `discount_amount`: importe en €. `[unit: —] [e2e: —] [risk: P0]`
  - **`RewardLabel`** para tipo `discount_pct`: porcentaje; si `pct === 100` muestra "servicio gratis". `[unit: —] [e2e: —] [risk: P0]`
- **Modo points (`PointsView`)** muestra balance en puntos, barra de progreso, próximo tier. `[unit: —] [e2e: —] [risk: P1]`
  - **Recompensas canjeables** lista los tiers con `canRedeem: true` + banner "Muéstrale esta pantalla al barbero". `[unit: —] [e2e: —] [risk: P0]`
  - **Sin tiers canjeables + nextTier** → "Siguiente recompensa: X por N pts". `[unit: —] [e2e: —] [risk: P1]`
  - **`nextTier.pointsCost - balance`** puntos que faltan. `[unit: —] [e2e: —] [risk: P1]`

#### CustomerAccount — Vista Mis Reservas
- **Botón "Volver"** → `setView('home')`. `[unit: —] [e2e: —] [risk: P1]`
- **Fetch `/api/app/bookings?slug=…`** al entrar a la vista (automático por effect). `[unit: —] [e2e: —] [risk: P1]`
- **Loading** → spinner `Loader2` centrado. `[unit: —] [e2e: —] [risk: P1]`
- **Sección "Próximas"** lista `upcoming`. `[unit: —] [e2e: —] [risk: P1]`
  - **Empty state** "No tienes reservas próximas." con borde dashed. `[unit: —] [e2e: —] [risk: P1]`
  - **Cada reserva** muestra servicio, fecha + hora + barbero (si hay). `[unit: —] [e2e: —] [risk: P1]`
  - **Badge "Cancelada"** si `status === 'cancelled'` (rojo). `[unit: —] [e2e: —] [risk: P1]`
  - **Badge "Hecha"** si `status === 'completed'` (ink-3). `[unit: —] [e2e: —] [risk: P1]`
  - **Badge "No-show"** si `status === 'no_show'` (ink-3). `[unit: —] [e2e: —] [risk: P1]`
  - **Botón "Cancelar reserva"** visible solo para `status === 'confirmed' || 'completed'` en la sección Próximas (`canCancel: true`). `[unit: —] [e2e: —] [risk: P1]`
  - **`confirm()`** nativo antes de cancelar. `[unit: —] [e2e: —] [risk: P1]`
  - **Llamada a `/api/app/bookings/[id]/cancel`** (POST). Si ok, refresca la lista. `[unit: —] [e2e: —] [risk: P1]`
- **Sección "Historial"** lista `past`. `[unit: —] [e2e: —] [risk: P1]`
  - **Empty state** "Aún no has venido con nosotros." `[unit: —] [e2e: —] [risk: P2]`
  - **Sin botón cancelar** (`canCancel: false`). `[unit: —] [e2e: —] [risk: P1]`

### Valoración de visita (`/b/[slug]/cuenta/rate/[bookingId]`)

#### Auth guard
- **Sin sesión activa** → redirect a `/b/[slug]/cuenta?next=<returnUrl>`. `[unit: —] [e2e: —] [risk: P1]`
- **Slug o barbería no encontrada** → `notFound()`. `[unit: —] [e2e: —] [risk: P1]`
- **Booking no pertenece a esta barbería** → `notFound()`. `[unit: —] [e2e: —] [risk: P1]`
- **Teléfono del booking distinto al del usuario logueado** → `notFound()` (anti-cross-rating). `[unit: —] [e2e: —] [risk: P1]`

#### RateForm — lectura previa
- **Valoración ya existente** (`existing !== null`) → `submitted = true`, muestra el card read-only con la valoración previa y el copy "Ya habías valorado esta visita." `[unit: —] [e2e: —] [risk: P1]`

#### RateForm — selección de estrellas
- **5 botones grandes (h-12)** para valorar táctilmente. `[unit: —] [e2e: —] [risk: P1]`
- **Hover/touch** → `hoverRating` ilumina las estrellas hasta la posición. `[unit: —] [e2e: —] [risk: P2]`
- **Click** → fija `rating`. `[unit: —] [e2e: —] [risk: P1]`
- **Label de rating** aparece bajo las estrellas: "Genial 🎉", "Muy bueno", "Bien", "Regular", "Mal". `[unit: —] [e2e: —] [risk: P2]`
- **`aria-label` por estrella** ("1 estrella", "2 estrellas"…). `[unit: —] [e2e: —] [risk: P2]`

#### RateForm — comentario
- **Solo aparece** si `rating !== null`. `[unit: —] [e2e: —] [risk: P1]`
- **Placeholder** según nota: ≥4 "Cuéntale al barbero qué te gustó…"; <4 "¿Cómo podrían mejorar?" `[unit: —] [e2e: —] [risk: P2]`
- **`maxLength=500`** + contador de chars. `[unit: —] [e2e: —] [risk: P2]`
- **Opcional** — no bloquea el envío. `[unit: —] [e2e: —] [risk: P1]`

#### RateForm — submit
- **Botón "Enviar valoración"** deshabilitado si `rating === null || submitting`. `[unit: —] [e2e: —] [risk: P1]`
- **Llamada a `/api/app/ratings/submit`** (POST) con `{ bookingId, rating, comment? }`. `[unit: —] [e2e: —] [risk: P1]`
- **Éxito** → `setSubmitted(true)` → transición al estado confirmado. `[unit: —] [e2e: —] [risk: P1]`
- **Error de API** muestra `d.error || 'No se pudo guardar'` en rojo. `[unit: —] [e2e: —] [risk: P1]`
- **"Ahora no"** navega a `/b/[slug]/cuenta` sin valorar. `[unit: —] [e2e: —] [risk: P2]`

#### RateForm — estado confirmado (post-submit)
- **Card de confirmación** con check + nota/5 + agradecimiento. `[unit: —] [e2e: —] [risk: P1]`
- **Propina ya pagada** (`existingTip`) → bloque informativo con importe + "Gracias por reconocer el trabajo del barbero." `[unit: —] [e2e: —] [risk: P1]`
- **`showTipBlock`** = `submitted && finalRating >= 4 && tipConfig !== null && existingTip === null`. `[unit: —] [e2e: —] [risk: P0]`
  - **Hasta 3 botones de importe** (`tipConfig.suggestedCents`, ≤3). `[unit: —] [e2e: —] [risk: P0]`
  - **Click en importe** llama a `/api/app/tips/create` (POST) con `{ bookingId, amountCents }`. `[unit: —] [e2e: —] [risk: P0]`
  - **Éxito** → `window.location.href = d.url` (Stripe Checkout). `[unit: —] [e2e: —] [risk: P0]`
  - **Error de API** muestra `tipError`. `[unit: —] [e2e: —] [risk: P0]`
  - **`tipBusy`** deshabilita los botones + loader. `[unit: —] [e2e: —] [risk: P0]`
  - **"No, gracias"** navega a `/b/[slug]/cuenta`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin `showTipBlock`** → solo botón "Volver a mi cuenta". `[unit: —] [e2e: —] [risk: P1]`
- **Navegación de regreso** `<Link href="/b/[slug]/cuenta">Mi cuenta</Link>` en el header. `[unit: —] [e2e: —] [risk: P1]`

### PWA install bootstrap (PwaBootstrap)

#### Registro del service worker
- **Siempre** intenta `navigator.serviceWorker.register('/sw.js')`. Fallo silencioso (dev/private mode). `[unit: —] [e2e: —] [risk: P1]`

#### Detección de estado
- **`isStandalone`** → `(display-mode: standalone)` media query + `navigator.standalone` (iOS). `[unit: —] [e2e: —] [risk: P1]`
- **`dismissed`** → lee `localStorage.getItem('otracita-pwa-install-dismissed')`; válido por 30 días. `[unit: —] [e2e: —] [risk: P2]`
- **Si `dismissed || isStandalone`** → no renderiza nada. `[unit: —] [e2e: —] [risk: P1]`

#### Banner Android/Chrome (`beforeinstallprompt`)
- **`beforeinstallprompt` capturado** → banner con nombre del negocio + botón "Instalar" colored con brand. `[unit: —] [e2e: —] [risk: P2]`
- **Click "Instalar"** → `installEvent.prompt()` → espera `userChoice` → limpia evento. `[unit: —] [e2e: —] [risk: P2]`
- **X cerrar** → `dismiss()` → guarda timestamp en localStorage + oculta por 30 días. `[unit: —] [e2e: —] [risk: P2]`

#### Hint iOS Safari
- **Aparece tras 8 segundos** en página, solo si iOS + no standalone + no dismissed. `[unit: —] [e2e: —] [risk: P2]`
- **iOS Safari** → instrucciones "Pulsa ⎋ Compartir → Añadir a pantalla de inicio". `[unit: —] [e2e: —] [risk: P2]`
- **iOS Chrome/Firefox** → "Para instalar, abre esta página en Safari". `[unit: —] [e2e: —] [risk: P2]`

### Analytics bootstrap (AnalyticsBootstrap)

#### Atribución
- **`captureFromCurrentLocation()`** al montar — captura UTM/referrer en localStorage. No requiere consentimiento. `[unit: —] [e2e: —] [risk: P1]`

#### Cookie consent banner (CMP)
- **Primera visita** (sin `otracita_consent_v1` en localStorage) → banner visible. `[unit: —] [e2e: —] [risk: P2]`
- **Consent Mode v2 defaults** enviados a `dataLayer` ANTES de cargar GTM: analytics y marketing `denied` por defecto si no hay choice previa. `[unit: —] [e2e: —] [risk: P2]`
- **"Aceptar todo"** → `{ analytics: true, marketing: true }` + consent update + oculta banner. `[unit: —] [e2e: —] [risk: P2]`
- **"Solo necesarias"** → `{ analytics: false, marketing: false }`. `[unit: —] [e2e: —] [risk: P2]`
- **"Personalizar"** → expande checkboxes de analytics y marketing. `[unit: —] [e2e: —] [risk: P2]`
  - **Checkbox "Necesarias"** siempre marcado y deshabilitado. `[unit: —] [e2e: —] [risk: P2]`
  - **Checkbox "Análisis"** togglable; default `true`. `[unit: —] [e2e: —] [risk: P2]`
  - **Checkbox "Marketing"** togglable; default `true`. `[unit: —] [e2e: —] [risk: P2]`
  - **"Guardar elección"** aplica la selección customizada. `[unit: —] [e2e: —] [risk: P2]`
- **Botón flotante "Cookies"** aparece cuando ya eligió; click reabre el banner. `[unit: —] [e2e: —] [risk: P2]`
- **`localStorage` lleno** → consent vive solo en memoria de la sesión (catch). `[unit: —] [e2e: —] [risk: P2]`

#### Google Tag Manager
- **Solo se inyecta** si `gtmContainerId` es válido (`/^GTM-[A-Z0-9]{6,12}$/i`). `[unit: —] [e2e: —] [risk: P1]`
- **`<Script strategy="afterInteractive">`** para no bloquear el render. `[unit: —] [e2e: —] [risk: P1]`
- **noscript fallback** `<iframe>` para entornos sin JS. `[unit: —] [e2e: —] [risk: P2]`
- **`booking_confirmed`** event pushado al `dataLayer` tras cada reserva exitosa (ecommerce enhanced). `[unit: —] [e2e: —] [risk: P1]`

---

## WhatsApp bot conversacional {#bot}

### Infraestructura y configuración (config.ts / sender.ts)
- **`getClientByPhoneNumberId`** resuelve el `BarbershopConfig` completo desde `clients` + `barbers`. Lookup por `whatsappPhoneNumberId`. `[unit: —] [e2e: —] [risk: P0]`
- **Sin cliente** → `handleIncomingMessage` hace return sin responder. `[unit: —] [e2e: —] [risk: P1]`
- **Barbers** cargados en `displayOrder ASC, name ASC` — orden determinístico para el tie-breaking de "cualquier barbero". `[unit: —] [e2e: —] [risk: P1]`
- **`botName` vacío o null** → greeting genérico "el asistente de X". `[unit: —] [e2e: —] [risk: P2]`
- **`whatsappAccessToken`** — fallback a `process.env.WHATSAPP_ACCESS_TOKEN` si no está en el registro del cliente. `[unit: —] [e2e: —] [risk: P0]`
- **`sendWhatsAppMessage`** — Graph API v21.0, mensaje de texto plano. `[unit: —] [e2e: —] [risk: P0]`
- **`sendWhatsAppButtons`** — interactivo tipo `button`, máximo 3 botones. `[unit: —] [e2e: —] [risk: P0]`
- **`sendWhatsAppList`** — interactivo tipo `list`, para >3 opciones (horas, servicios, fechas). `[unit: —] [e2e: —] [risk: P0]`

### Gate de tier
- **Sin feature `whatsappBot`** (Solo sin trial activo) → mensaje ignorado silenciosamente. Analytics de `messagesReceived` se incrementa igualmente. El barbero contesta a mano. `[unit: —] [e2e: —] [risk: P1]`
- **Pro / Estudio (o Solo en trial activo)** → flujo completo. `[unit: —] [e2e: —] [risk: P1]`

### Canonicalización de teléfono
- **`msg.from` canonicalizado a E.164** una sola vez al entrar al handler. Nunca lanza; inputs raros pasan tal cual. `[unit: —] [e2e: —] [risk: P0]`

### Routing de follow-up (rating/tip)
- **`isFollowupReplyId(id)`** → si el reply id empieza por `fu_rate_` o `fu_tip_`, se delega a `handleFollowupReply` ANTES de cualquier otro routing. `[unit: —] [e2e: —] [risk: P1]`
- **Follow-up interceptado** → `trackAnalytics('messagesReplied')` + return. No entra en el state machine de booking. `[unit: —] [e2e: —] [risk: P1]`

### Detección de idioma
- **Primera vez** → `detectLanguage(text)` basado en vocabulario ES/EN (wordlists). `[unit: —] [e2e: —] [risk: P1]`
- **Idioma ya guardado en context** → solo se re-detecta si el mensaje tiene ≥3 palabras Y el score cambia. `[unit: —] [e2e: —] [risk: P1]`
- **Switch explícito a inglés** (`"english"`, `"in english"`, etc.) → confirma con `"Sure! I'll continue in English 🇬🇧"` + menú 3 botones + `return`. `[unit: —] [e2e: —] [risk: P2]`
- **Switch explícito a español** → confirma con `"¡Claro! Continúo en español 🇪🇸"` + menú + `return`. `[unit: —] [e2e: —] [risk: P2]`
- **Idioma guardado en context + nuevo sin guardar** → lazy-save de lang y/o customerName si cambian. `[unit: —] [e2e: —] [risk: P2]`

### Escape global
- **Frases de escape** (`"salir"`, `"exit"`, `"cancel"`, `"reset"`, `"reiniciar"`, `"menú"`, `"inicio"`, `"start"`) desde cualquier paso → reset completo del state + menú 3 botones. `[unit: —] [e2e: —] [risk: P1]`
- **Solo activo cuando `step !== 'idle'`** — no interfiere en conversaciones nuevas. `[unit: —] [e2e: —] [risk: P1]`

### Detección de intent (idle)
- **`classifyIntent(text)`** — GPT-4o-mini, single token: `booking | cancel | change | question | greeting`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de OpenAI** → fallback a `'greeting'`. `[unit: —] [e2e: —] [risk: P1]`
- **`booking`** → `startBookingFlow`. `[unit: —] [e2e: —] [risk: P1]`
- **`cancel`** → `startCancellationFlow`. `[unit: —] [e2e: —] [risk: P1]`
- **`change`** → `startChangeFlow`. `[unit: —] [e2e: —] [risk: P1]`
- **`question`** → `answerQuestion` (GPT-4o-mini, 2 frases, tono configurable). `[unit: —] [e2e: —] [risk: P1]`
- **`greeting`** → `sendGreeting`. `[unit: —] [e2e: —] [risk: P2]`

### Detecciones especiales (antes de classifyIntent)
- **"Mi cita" / "cuando tengo cita" / keywords ES+EN** → lista de próximas reservas sin entrar en el state machine. `[unit: —] [e2e: —] [risk: P1]`
  - **0 reservas** → "No tienes ninguna cita próxima. ¿Quieres reservar una?" `[unit: —] [e2e: —] [risk: P1]`
  - **1 reserva** → mensaje detallado con servicio, fecha y barbero. `[unit: —] [e2e: —] [risk: P1]`
  - **Múltiples** → lista interactiva con todas. `[unit: —] [e2e: —] [risk: P1]`
- **"Me llamo X" / "My name is X" / "call me X"** → actualiza `customers.name` y todos los bookings existentes del teléfono + confirmación. `[unit: —] [e2e: —] [risk: P2]`

### Tonos del bot
- **`botTone: 'cercano'`** (default) — tuteo, emojis con moderación, tono cálido. `[unit: —] [e2e: —] [risk: P2]`
- **`botTone: 'neutro'`** — tuteo, sin emojis, registro profesional. `[unit: —] [e2e: —] [risk: P2]`
- **`botTone: 'formal'`** — "usted", sin emojis, registro pulcro. `[unit: —] [e2e: —] [risk: P2]`
- **Aplicado al prompt de `answerQuestion`** → el tono afecta solo a respuestas de preguntas libres (FAQ), no a los mensajes del state machine. `[unit: —] [e2e: —] [risk: P2]`

### Greeting flow
- **Con servicios configurados** → 3 botones: "Reservar cita", "Cancelar/Cambiar", "Info y precios". `[unit: —] [e2e: —] [risk: P1]`
- **Sin servicios** → texto libre + "Escríbeme lo que necesites". `[unit: —] [e2e: —] [risk: P1]`
- **Nombre del cliente conocido** → "Hola Carlos! 👋" (personalizado). `[unit: —] [e2e: —] [risk: P2]`
- **Sin nombre** → "Hola! 👋". `[unit: —] [e2e: —] [risk: P2]`
- **Button `action_info`** → genera pregunta canónica de servicios/precios y la pasa a `answerQuestion`. `[unit: —] [e2e: —] [risk: P1]`
- **Button `action_done`** → agradecimiento + reset a `idle`. `[unit: —] [e2e: —] [risk: P2]`

### Flujo de reserva (booking)

#### Reputación del cliente
- **`reputation === 'blocked'`** (≥3 no-shows) → mensaje de bloqueo + return. `[unit: —] [e2e: —] [risk: P1]`
- **`reputation === 'warning'`** (2 no-shows o ratio >30%) → advertencia + el flujo continúa. `[unit: —] [e2e: —] [risk: P1]`

#### Captura de nombre (si no conocido)
- **Sin nombre** → paso `asking_name` → "¿Cómo te llamas?". `[unit: —] [e2e: —] [risk: P1]`
- **Nombre < 2 o > 50 chars** → pide de nuevo. `[unit: —] [e2e: —] [risk: P1]`
- **Nombre válido** → guarda en `customers`, pasa a `choosing_service`. `[unit: —] [e2e: —] [risk: P1]`

#### Selección de servicio (`choosing_service`)
- **≤3 servicios** → 3 botones. `[unit: —] [e2e: —] [risk: P1]`
- **>3 servicios** → lista interactiva con todos. `[unit: —] [e2e: —] [risk: P1]`
- **Reply por id** (`service_N`) → selección directa. `[unit: —] [e2e: —] [risk: P1]`
- **Reply por texto** → fuzzy match en `service.name.toLowerCase().includes(lower)`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin match** → error y re-pregunta. `[unit: —] [e2e: —] [risk: P1]`
- **Sin `googleCalendarId` ni DB avail** → mensaje de fallback "Contacta directamente" + 2 botones. `[unit: —] [e2e: —] [risk: P2]`
- **Con barberos configurados** → pasa a `choosing_barber`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin barberos** → pasa directamente a `choosing_date`. `[unit: —] [e2e: —] [risk: P1]`

#### Selección de barbero (`choosing_barber`)
- **≤3 opciones** (barberos + "Sin preferencia") → botones. `[unit: —] [e2e: —] [risk: P1]`
- **>3 opciones** → lista interactiva. `[unit: —] [e2e: —] [risk: P1]`
- **Reply `barber_N`** → selecciona por índice. `[unit: —] [e2e: —] [risk: P1]`
- **Reply `barber_any`** → `anyPreference = true`, label localizado. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto** con "sin preferencia" / "cualquier" / "any" → any preference. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto** con nombre parcial → fuzzy match. `[unit: —] [e2e: —] [risk: P1]`
- **Sin match** → error + re-pregunta. `[unit: —] [e2e: —] [risk: P1]`
- **`selectedBarberId`** en context = null para "sin preferencia"; string UUID para barbero concreto. `[unit: —] [e2e: —] [risk: P0]`
- **La string "Sin preferencia" NUNCA llega a la tabla de bookings** (sólo el id). `[unit: —] [e2e: —] [risk: P0]`
- **Pasa a `choosing_date`** tras selección. `[unit: —] [e2e: —] [risk: P1]`

#### Selección de día (`choosing_date`)
- **`getNext7Days`** construye hasta 7 días de los próximos 14, saltando días "Cerrado" y fechas bloqueadas. `[unit: —] [e2e: —] [risk: P1]`
- **Lista interactiva** con hasta 7 filas ("Hoy, lunes 7", "Mañana, martes 8"…). `[unit: —] [e2e: —] [risk: P1]`
- **Reply id `date_YYYY-MM-DD`** → selección directa. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto `"hoy"` / `"today"`** → `getTodayDate()`. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto `"manana"` / `"tomorrow"`** → `getTomorrowDate()`. `[unit: —] [e2e: —] [risk: P1]`
- **Fecha inválida** → error "Por favor, selecciona una de la lista." `[unit: —] [e2e: —] [risk: P1]`
- **`ctx.isWaitlistFlow === true`** → inserta directamente en waitlist + confirmation + vuelve a `idle`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin `googleCalendarId` ni DB avail** → error interno + reset. `[unit: —] [e2e: —] [risk: P1]`
- **Fetch de slots** — DB (`getAvailableSlotsFromDB`) o GCal (`getAvailableSlots`). `[unit: —] [e2e: —] [risk: P0]`
- **`ctx.selectedBarberId`** pasado al engine de disponibilidad DB. `[unit: —] [e2e: —] [risk: P0]`
- **Error al fetchear slots** → mensaje de error + `return` (sin romper el state). `[unit: —] [e2e: —] [risk: P1]`
- **Sin slots** → oferta de lista de espera: "¿Quieres que te avisemos?" + 2 botones. `[unit: —] [e2e: —] [risk: P1]`
- **Con slots** → lista interactiva de hasta 10 huecos + pasa a `choosing_slot`. `[unit: —] [e2e: —] [risk: P1]`

#### Selección de hora (`choosing_slot`)
- **Reply id `slot_YYYY-MM-DD_HH:MM`** → extrae fecha y hora. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto `"HH:MM"` o `"HH"`** → regex para extraer hora. `[unit: —] [e2e: —] [risk: P1]`
- **Sin match** → error + re-pregunta. `[unit: —] [e2e: —] [risk: P1]`
- **Resumen de confirmación** con servicio, barbero (si aplica), fecha, hora + "¿Confirmamos?" → 2 botones. `[unit: —] [e2e: —] [risk: P1]`
- **Pasa a `confirming`**. `[unit: —] [e2e: —] [risk: P1]`

#### Confirmación (`confirming`)
- **"Sí" / "yes" / `confirm_yes`** → crea la reserva. `[unit: —] [e2e: —] [risk: P0]`
- **Path DB (`useDbAvailability`)** → `createBookingDb(...)` con todos los parámetros estandarizados. Maneja lead-time, horizon, buffer, auto-invoicing. `[unit: —] [e2e: —] [risk: P0]`
- **Path GCal (legacy)** → `createBooking(googleCalendarId, ...)` + insert directo en `bookings`. Barbero resuelto a fila real o fallback al primero en order. `[unit: —] [e2e: —] [risk: P0]`
- **Éxito** → analytics `bookingsMade` + `incrementCustomerBookings` (solo GCal path) + mensaje confirmado con dirección + 3 botones. `[unit: —] [e2e: —] [risk: P0]`
- **Error de creación GCal** → mensaje de error al usuario. `[unit: —] [e2e: —] [risk: P0]`
- **Error de creación DB** → log + `bookingSuccess = false` → no se envía confirmación. `[unit: —] [e2e: —] [risk: P0]`
- **Slot malformado** (no `date_time`) → fallback de confirmación genérico. `[unit: —] [e2e: —] [risk: P1]`
- **Sin slot en context** → fallback genérico. `[unit: —] [e2e: —] [risk: P1]`
- **"No" / "no" / `confirm_no`** → mensaje "No hay problema" + reset a `idle`. `[unit: —] [e2e: —] [risk: P1]`
- **Reset estado** siempre al final: `step = idle`, `selectedService = null`, `selectedSlot = null`, `context = null`. `[unit: —] [e2e: —] [risk: P1]`

### Flujo de cancelación

#### Inicio (`startCancellationFlow`)
- **Sin reservas futuras** → "No tienes reservas pendientes." + return. `[unit: —] [e2e: —] [risk: P1]`
- **1 reserva** → confirmación directa con 2 botones (Sí / No). Pasa a `cancel_confirming`. `[unit: —] [e2e: —] [risk: P1]`
- **Múltiples** → lista de hasta 10 reservas. Pasa a `cancelling`. `[unit: —] [e2e: —] [risk: P1]`

#### Selección entre múltiples (`cancelling`)
- **Reply id `cancel_booking_<bookingId>`** → lookup del booking. `[unit: —] [e2e: —] [risk: P1]`
- **Booking no encontrado** → error + reset a `idle`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin match de id** → error "Por favor, selecciona una cita de la lista." `[unit: —] [e2e: —] [risk: P1]`
- **Muestra confirmación** con el booking seleccionado. Pasa a `cancel_confirming`. `[unit: —] [e2e: —] [risk: P1]`

#### Confirmación de cancelación (`cancel_confirming`)
- **"Sí" / `cancel_yes`** → procede. `[unit: —] [e2e: —] [risk: P1]`
  - **`googleEventId` presente** → `deleteCalendarEvent(...)`. `[unit: —] [e2e: —] [risk: P1]`
  - **Actualiza `bookings.status = 'cancelled'`** + `cancelledAt`. `[unit: —] [e2e: —] [risk: P1]`
  - **`tryVoidInvoicesInBackground(bookingId)`** para anular factura adjunta. `[unit: —] [e2e: —] [risk: P0]`
  - **Analytics** `bookingsCancelled` + `incrementCustomerCancellations`. `[unit: —] [e2e: —] [risk: P1]`
  - **`updateCustomerReputation`** recalcula: blocked (≥3 no-shows), warning (2 no-shows o ratio >30% con ≥5 bookings), good. `[unit: —] [e2e: —] [risk: P1]`
  - **`notifyWaitlist`** notifica al siguiente en lista de espera para esa fecha. `[unit: —] [e2e: —] [risk: P1]`
  - **Si `ctx.isChanging`** → cancela + inicia nuevo booking flow inmediatamente. `[unit: —] [e2e: —] [risk: P1]`
  - **Si no `isChanging`** → "¿Quieres reservar otra?" + 2 botones. `[unit: —] [e2e: —] [risk: P1]`
- **"No" / `cancel_no`** → "Tu cita se mantiene." + reset. `[unit: —] [e2e: —] [risk: P1]`
- **`cancelBookingId` no en context** → error interno + reset. `[unit: —] [e2e: —] [risk: P1]`
- **Booking ya no existe** → mensaje "No he encontrado esa cita" + reset. `[unit: —] [e2e: —] [risk: P1]`

### Flujo de cambio de cita

#### Inicio (`startChangeFlow`)
- **Sin reservas** → "No tienes reservas pendientes para cambiar." `[unit: —] [e2e: —] [risk: P1]`
- **1 reserva** → muestra detalle + 2 botones "Sí, cambiar" / "No, mantener". Pasa a `changing`. `[unit: —] [e2e: —] [risk: P1]`
- **Múltiples** → lista, reutiliza el mismo paso `cancelling` pero con `isChanging: true`. `[unit: —] [e2e: —] [risk: P1]`

#### Confirmación de cambio (`changing`)
- **"Sí" / `change_yes`** → llama a `handleCancelConfirmation` con `cancel_yes` y `isChanging: true`. Esto cancela la vieja cita y arranca nuevo booking flow. `[unit: —] [e2e: —] [risk: P1]`
- **"No" / `change_no`** → "Tu cita se mantiene." + reset. `[unit: —] [e2e: —] [risk: P1]`

### Flujo de recordatorio (outbound cron)
- **Botón `reminder_confirm` (`✅ Ahí estaré`)** → "✅ Perfecto, te esperamos mañana! 💈" + analytics. `[unit: —] [e2e: —] [risk: P1]`
- **Botón `reminder_cancel` (`❌ Necesito cancelar`)** → cancela la primera reserva confirmada futura del usuario (orden por fecha). `[unit: —] [e2e: —] [risk: P1]`
  - **Google Calendar event eliminado** si `googleEventId` presente. `[unit: —] [e2e: —] [risk: P1]`
  - **`tryVoidInvoicesInBackground`** sobre la cita cancelada. `[unit: —] [e2e: —] [risk: P0]`
  - **Analytics + `incrementCustomerCancellations`**. `[unit: —] [e2e: —] [risk: P1]`
  - **`notifyWaitlist`** para el hueco liberado. `[unit: —] [e2e: —] [risk: P1]`
  - **Respuesta** "Tu cita ha sido cancelada. ¿Quieres reservar otra?" + 2 botones. `[unit: —] [e2e: —] [risk: P1]`

### Flujo de lista de espera (waitlist)

#### Inscripción desde "sin huecos"
- **Botón `waitlist_yes`** → inserta en `waitlist` (date, service, barber, customerPhone) + confirmación + "¿También reservar otro día por si acaso?" `[unit: —] [e2e: —] [risk: P1]`
  - **`waitlist_also_book`** → muestra date picker para reservar día alternativo. `[unit: —] [e2e: —] [risk: P1]`
  - **`action_done`** → "No, está bien" → cierra. `[unit: —] [e2e: —] [risk: P2]`
- **Botón `waitlist_no`** → muestra date picker para probar otro día. `[unit: —] [e2e: —] [risk: P1]`
- **Barber en waitlist** = nombre del barbero seleccionado o null (cualquiera). `[unit: —] [e2e: —] [risk: P1]`

#### Inscripción explícita (startWaitlistFlow)
- **En `ctx.isWaitlistFlow`** al seleccionar fecha → inserta en waitlist directamente. `[unit: —] [e2e: —] [risk: P1]`

#### Notificación de hueco disponible (notifyWaitlist)
- **Solo se ejecuta** si hay alguien en estado `waiting` para esa fecha. `[unit: —] [e2e: —] [risk: P1]`
- **Hay entrada `notified` reciente (<30 min)** → skip (no notificar a otra persona mientras la primera decide). `[unit: —] [e2e: —] [risk: P1]`
- **30 minutos pasados sin respuesta** → la entrada pasa a `expired`, se notifica al siguiente. `[unit: —] [e2e: —] [risk: P1]`
- **Prioridad** al que espera por el barbero específico; luego los de "cualquiera". `[unit: —] [e2e: —] [risk: P1]`
- **Mensaje** "¡se ha liberado un hueco! [servicio] [fecha] [hora] ¿Lo reservamos?" + 2 botones. `[unit: —] [e2e: —] [risk: P1]`
- **`waitlist.notifiedAt`** + `waitlist.time` actualizados antes de enviar. `[unit: —] [e2e: —] [risk: P1]`

#### Aceptar hueco (`waitlist_accept`)
- **Entrada `notified` no encontrada** → "esta oferta ya ha caducado." `[unit: —] [e2e: —] [risk: P1]`
- **Fecha u hora faltantes** → "algo salió mal, reserva directamente." `[unit: —] [e2e: —] [risk: P1]`
- **Cancela booking de backup** si el usuario tenía una reserva futura ≥ offered date. `[unit: —] [e2e: —] [risk: P1]`
  - Elimina evento GCal + status `cancelled` + void invoice. `[unit: —] [e2e: —] [risk: P0]`
- **Crea nuevo booking** para el hueco ofrecido. `[unit: —] [e2e: —] [risk: P0]`
  - Barber name resuelto a ID real; fallback al primero activo si no hay match. `[unit: —] [e2e: —] [risk: P1]`
  - `analytics bookingsMade` + `incrementCustomerBookings`. `[unit: —] [e2e: —] [risk: P1]`
  - `waitlist.status = 'booked'`. `[unit: —] [e2e: —] [risk: P1]`
- **Mensaje confirmado** con detalle del nuevo booking + nota de cancelación si hubo. `[unit: —] [e2e: —] [risk: P1]`
- **Error de Google Calendar** → "alguien reservó antes, te mantengo en la lista." + reset `waiting`. `[unit: —] [e2e: —] [risk: P1]`

#### Rechazar hueco (`waitlist_decline`)
- **Entrada `notified` encontrada** → `status = 'expired'` + `notifyWaitlist` para el siguiente. `[unit: —] [e2e: —] [risk: P1]`
- **Mensaje** "Entendido. Si cambias de opinión, escríbeme." `[unit: —] [e2e: —] [risk: P2]`

### Flujo de follow-up post-servicio (followup.ts)

#### Outbound: `sendRatingFollowup`
- **Anti-fraude**: teléfono del cliente coincide con `client.phone` o `client.whatsappNumber` → skip (test bookings del propio barbero). `[unit: —] [e2e: —] [risk: P1]`
- **Sin `publicSlug`** → fallback directo a WhatsApp. `[unit: —] [e2e: —] [risk: P1]`
- **Dispatcher `dispatchUserNotification`** — si hay push activo → push con deep-link a `/b/[slug]/cuenta/rate/[bookingId]`. Si no → WhatsApp fallback. `[unit: —] [e2e: —] [risk: P1]`
- **Canal `none`** (ni push ni WA) → return `false`, NO marca `followupSentAt` (el cron reintentará). `[unit: —] [e2e: —] [risk: P1]`
- **Canal `push` o `whatsapp`** → marca `bookings.followupSentAt`. `[unit: —] [e2e: —] [risk: P1]`
- **Fallback WhatsApp** — lista interactiva de 5 estrellas (1→5) + `upsertFollowupState`. `[unit: —] [e2e: —] [risk: P1]`

#### `tryRatingFollowupForCompletedBooking` (fire-and-forget)
- **`ratingsEnabled === false`** → no-op. `[unit: —] [e2e: —] [risk: P1]`
- **`followupSentAt` ya presente** → no-op (idempotente). `[unit: —] [e2e: —] [risk: P1]`
- **Status `cancelled` o `no_show`** → no-op. `[unit: —] [e2e: —] [risk: P1]`
- **Error** → log, nunca lanza. `[unit: —] [e2e: —] [risk: P1]`

#### Inbound: `handleFollowupReply`
- **Stale button** (sin estado `followup` en context) → owned silenciosamente (return true) sin side effects. `[unit: —] [e2e: —] [risk: P1]`
- **Sin token o phoneNumberId** → owned silenciosamente. `[unit: —] [e2e: —] [risk: P1]`
- **Canonicalización** del `customerPhone` antes de lookup (idempotente). `[unit: —] [e2e: —] [risk: P0]`

##### Rating step (`fu_rate_N`)
- **Nota inválida** (no entero 1-5) → owned sin respuesta. `[unit: —] [e2e: —] [risk: P1]`
- **`recordRating`** guardado en tabla `ratings` ANTES de ofrecer propina. Idempotente por UNIQUE parcial. `[unit: —] [e2e: —] [risk: P1]`
- **Nota ≤ 3** → "¡Gracias! Se la pasamos al equipo para mejorar." + clear followup state. `[unit: —] [e2e: —] [risk: P1]`
- **Nota ≥ 4 + tips disabled o Connect no listo** → agradecimiento. Si nota = 5 y hay `googleReviewUrl` → invita a dejar reseña. `[unit: —] [e2e: —] [risk: P1]`
- **Nota ≥ 4 + tips enabled + suggested amounts** → botones de propina (hasta 2 importes + "No gracias"). `[unit: —] [e2e: —] [risk: P0]`
- **`suggested` slice de los primeros 2 importes ≥ 100¢** — Meta limita a 3 botones totales. `[unit: —] [e2e: —] [risk: P0]`
- **Upsert de followup state** a `awaiting_tip` con `rating`. `[unit: —] [e2e: —] [risk: P1]`

##### Tip step (`fu_tip_<cents>`)
- **`fu_tip_skip`** → "¡Gracias de todas formas! Nos vemos pronto. 💈" + clear state. `[unit: —] [e2e: —] [risk: P1]`
- **Importe inválido (≤0)** → owned sin respuesta. `[unit: —] [e2e: —] [risk: P1]`
- **`createTipSession`** crea Stripe Checkout session + fila `tips` con status pendiente. `[unit: —] [e2e: —] [risk: P0]`
- **Éxito** → "Paga tu propina de N€ aquí: <url> (El enlace expira en 24h.)" + clear state. `[unit: —] [e2e: —] [risk: P0]`
- **Error en `createTipSession`** → "puedes dar la propina en efectivo" + clear state. `[unit: —] [e2e: —] [risk: P0]`

---

## Landing + páginas públicas {#landing}

### Página raíz `/` (`src/app/page.tsx`)
- **Landing pública de otracita** — visible para visitantes anónimos (barberos potenciales). `[unit: —] [e2e: —] [risk: P2]`

### Páginas legales/informativas públicas
- **`/privacidad`** — política de privacidad. Enlazada desde el footer de reserva PWA. `[unit: —] [e2e: —] [risk: P2]`
- **`/terminos`** — términos y condiciones. `[unit: —] [e2e: —] [risk: P2]`
- **`/aviso-legal`** — aviso legal. `[unit: —] [e2e: —] [risk: P2]`
- **`/legal`** — sección legal, posible índice de las anteriores. `[unit: —] [e2e: —] [risk: P2]`
- **`/login`** — login para dashboard de barberos (Better Auth). Página pública pero redirige al dashboard si hay sesión. `[unit: —] [e2e: —] [risk: P1]`
- **`/pay`** — ruta de pago (Stripe Checkout return / propina completada). `[unit: —] [e2e: —] [risk: P0]`
- **`/gracias`** — página de agradecimiento (post-pago o post-acción). `[unit: —] [e2e: —] [risk: P2]`

### Manifest PWA (`/manifest/[slug]/manifest.webmanifest`)
- **Generado dinámicamente** por slug con nombre, colores y iconos del negocio. `[unit: —] [e2e: —] [risk: P1]`

### VeriFactu declaración responsable (`/legal/verifactu`)
- **Página pública** de declaración responsable AEAT. `[unit: —] [e2e: —] [risk: P0]`

---

## Summary (B)

| Métrica | Valor |
|---|---|
| **Total de leaves (bullets terminales)** | **267** |
| **Con unit test** | **0** |
| **Sin unit test** | **267** |

No existe ningún test file que cubra el scope PWA (`src/app/b/`) ni el WhatsApp bot (`src/lib/whatsapp/`). Los 19 test files del proyecto cubren exclusivamente lógica de negocio del dashboard/backend (loyalty compute, invoicing, verifactu, payroll, billing tier, etc.).

**Áreas de mayor riesgo sin cobertura:**
- P0 sin tests: flujo de submit PWA (setup-intent + create), tarjeta no-show (Stripe Elements confirmSetup), precio en euros vs cents, flujo de confirmación del bot (DB + GCal path), `tryVoidInvoicesInBackground`, rating + tip follow-up WhatsApp, `waitlist_accept` (cancela booking + crea nuevo).
- P1 sin tests: todos los estados y transiciones del state machine del bot, pre-fill de sesión PWA, reputación de clientes, LoyaltyCard rendering modes.

---


## C — APIs + Backend

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

