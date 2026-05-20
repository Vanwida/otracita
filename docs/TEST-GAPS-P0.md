# TEST-GAPS-P0 — otracita
_Extraído de FEATURE-TEST-MATRIX.md · 2026-05-20 · 137 items_

Leyenda de columna Gap:
- `[unit: —]` → sin test
- `[unit: path]` parcial → test existe pero cobertura no verificada
- `[unit: path]` ✓ → cubierto

| Hoja | Área | Gap |
|------|------|-----|
| A.2 §2.5 | Setup wizard — VeriFactu toggle + NIF + nombre fiscal | `[unit: —]` — activación fiscal sin test |
| A.3 §3.8 | BookingDetailPanel — PaymentBadge | `[unit: —]` |
| A.3 §3.8 | BookingDetailPanel — Marcar completada (bifurcación SumUp/métodos) | `[unit: —]` |
| A.3 §3.8 | BookingDetailPanel — Generar enlace de pago + polling 4s | `[unit: —]` |
| A.3 §3.8 | BookingDetailPanel — Reembolso (POST reverse_transfer + app fee) | `[unit: —]` |
| A.3 §3.8 | BookingDetailPanel — Rectificar (post-completada) | `[unit: src/lib/invoicing.test.ts]` parcial |
| A.4 §4.1 | TPV — TOTAL del carrito | `[unit: src/lib/cash/compute.test.ts]` parcial |
| A.4 §4.1 | TPV — Efectivo / Tarjeta / Bizum / Online | `[unit: —]` |
| A.4 §4.1 | TPV — Factura on-demand desde recibo | `[unit: src/lib/invoicing.test.ts]` parcial |
| A.4 §4.2 | Transacciones — InvoiceCell + Total sum | `[unit: —]` |
| A.4 §4.3 | Caja — CajaRollup + CajaRegisters | `[unit: src/lib/cash/compute.test.ts]` — UI sin test |
| A.4 §4.3 | Caja — Modal Apunte (POST /api/cash/movements) | `[unit: —]` |
| A.4 §4.3 | Caja — Botón "Cerrar caja" | `[unit: —]` |
| A.4 §4.3 | Caja — Botón "Abrir caja" | `[unit: —]` |
| A.4 §4.4 | Resumen ventas — StatStrip (4 KPIs) | `[unit: src/lib/finanzas/pnl-math.test.ts]` — UI sin test |
| A.4 §4.5 | Cobros online — OnlinePaymentsSummary | `[unit: —]` |
| A.4 §4.6 | Facturas (Ventas) — StatStrip + Banner VeriFactu + DataTable + VerifactuBadge | `[unit: src/lib/verifactu/format.test.ts]` — UI sin test |
| A.4 §4.6 | Facturas — Exportar PDF / Excel / CSV | `[unit: —]` |
| A.4 §4.7 | Propinas — TipsSettings (requiere Stripe Connect) | `[unit: —]` |
| A.5 §5.1 | Facturas (canónica) — StatStrip + DataTable + Exportar | `[unit: —]` |
| A.5 §5.2 | Detalle factura — Cabecera + Banner ANULADA + QR VeriFactu + Timeline + Rectificar | `[unit: src/lib/verifactu/qr.test.ts]` parcial; chain sin test |
| A.5 §5.3 | Factura nueva — NIF → tipo live + aviso tope 400€ + IVA + Emitir | `[unit: src/lib/verifactu/xml.test.ts]` parcial |
| A.6 §6 | P&L — Ingresos totales + tendencia + IVA countdown | `[unit: src/lib/finanzas/pnl-math.test.ts]` — UI sin test |
| A.6 §6 | P&L — IVA repercutido/soportado/a pagar + IRPF | `[unit: src/lib/finanzas/pnl-math.test.ts]` parcial |
| A.6 §6 | P&L — Modal añadir gasto + eliminar gasto | `[unit: —]` |
| A.6 §6 | P&L — Costos fijos (toggle activo) + retiros + ingresos manuales | `[unit: —]` |
| A.6 §6 | Payroll — SWR GET + fila por barbero + total equipo | `[unit: src/lib/payroll/compute.test.ts]` — UI sin test |
| A.7 §7.2 | Ficha cliente — Gastado (€) | `[unit: —]` |
| A.8 §8.1 | BarbersManager — BarberSalaryEditor (Pro-gated) | `[unit: src/lib/payroll/services-commission.test.ts]` — UI sin test |
| A.8 §8.3 | Comisiones — Tabla override por servicio | `[unit: src/lib/payroll/services-commission.test.ts]` — UI sin test |
| A.9 §9.1 | OperatorPanel — StatStrip ingresos | `[unit: src/lib/finanzas/pnl-math.test.ts]` — UI sin test |
| A.9 §9.2 | Ingresos — "Ingreso por tipo" barras | `[unit: src/lib/finanzas/pnl-math.test.ts]` — UI sin test |
| A.11 §11.2 | Ajustes/Pagos — CashRegisterToggle | `[unit: —]` |
| A.11 §11.2 | Ajustes/Pagos — SumupConnect estados | `[unit: —]` |
| A.11 §11.2 | Ajustes/Pagos — ConnectSettings (Stripe) estados | `[unit: —]` |
| A.11 §11.2 | Ajustes/Pagos — InvoicingSettings (campos fiscales) | `[unit: src/lib/verifactu/format.test.ts]` — UI sin test |
| A.12 §12 | Mi plan — Importe/moneda + OpenStripePortalButton + historial facturas Stripe | `[unit: —]` |
| A.13 §13 | Rutas legacy — /dashboard/caja + /dashboard/finanzas | `[unit: —]` — rutas sin test |
| B.4 | PWA — Flujo submit setup-intent + completeBooking | `[unit: —]` — 0 tests en src/app/b/ |
| B.4 | PWA — NoShowCardModal (Stripe Elements confirmSetup) | `[unit: —]` |
| B.4 | PWA — Precio en euros vs cents en CTA | `[unit: —]` |
| B.5 | LoyaltyCard — canRedeem stamps + RewardLabel (service/amount/pct) | `[unit: —]` |
| B.5 | LoyaltyCard — Points: recompensas canjeables + banner | `[unit: —]` |
| B.6 | RateForm — showTipBlock + botones importe + Stripe Checkout redirect | `[unit: —]` |
| B.13 | Bot — confirmación DB path (createBookingDb) | `[unit: —]` |
| B.13 | Bot — selectedBarberId null NUNCA persiste string "Sin preferencia" | `[unit: —]` |
| B.13 | Bot — slots fetch DB path + ctx.selectedBarberId | `[unit: —]` |
| B.14 | Bot — tryVoidInvoicesInBackground al cancelar | `[unit: —]` |
| B.16 | Bot — tryVoidInvoicesInBackground desde recordatorio | `[unit: —]` |
| B.17 | Bot — waitlist_accept cancela booking + crea nuevo | `[unit: —]` |
| B.17 | Bot — waitlist_accept void invoice backup | `[unit: —]` |
| B.18 | Bot — rating ≥4 + suggested amounts → botones propina (slice ≤3) | `[unit: —]` |
| B.18 | Bot — createTipSession Stripe Checkout | `[unit: —]` |
| B.19 | /pay — ruta pago (Stripe Checkout return / propina) | `[unit: —]` |
| B.19 | /legal/verifactu — declaración responsable AEAT | `[unit: —]` |
| C.1 §1.1 | Schema clients — columna price EUROS (foot-gun) | `[unit: src/lib/bookings/total.test.ts]` parcial |
| C.1 §1.2 | Schema app_users | `[unit: —]` |
| C.1 §1.3 | Schema app_otp_codes | `[unit: —]` |
| C.1 §1.5 | Schema app_sessions | `[unit: —]` |
| C.1 §1.6 | Schema barbers | `[unit: —]` |
| C.1 §1.17 | Schema conversations (FSM bot) | `[unit: —]` |
| C.1 §1.18 | Schema customers | `[unit: —]` |
| C.1 §1.19 | Schema bookings — price EUROS foot-gun | `[unit: src/lib/bookings/total.test.ts]` parcial |
| C.1 §1.20 | Schema booking_services — priceEuros foot-gun | `[unit: src/lib/bookings/total.test.ts]` parcial |
| C.1 §1.25 | Schema processed_stripe_events — idempotencia | `[unit: —]` |
| C.1 §1.26 | Schema invoices — chain VeriFactu | `[unit: —]` |
| C.1 §1.27 | Schema invoice_registro_events — SIF AEAT | `[unit: —]` |
| C.1 §1.28 | Schema payments | `[unit: src/lib/stripe/no-show-fee.test.ts]` parcial |
| C.1 §1.35 | Schema invoice_items | `[unit: —]` |
| C.2 §2.1 | requireClientAccess — resolución de tenant | `[unit: —]` |
| C.2 §2.2 | accessErrorResponse | `[unit: —]` |
| C.2 §2.3 | requireCron | `[unit: —]` |
| C.2 §2.4 | requireAdmin | `[unit: —]` |
| C.3 §3.1 | FEATURE_MIN_TIER catálogo | `[unit: —]` |
| C.3 §3.2 | hasFeature — trial + cancelled | `[unit: src/lib/billing/tier.test.ts]` parcial |
| C.3 §3.3 | upgradeRequiredResponse | `[unit: —]` |
| C.3 §3.4 | TIER_PRICES | `[unit: —]` |
| C.3 §3.5 | isInTrial / trialDaysLeft | `[unit: —]` |
| C.4 §4.1 | POST /api/bookings/create | `[unit: —]` |
| C.4 §4.3 | PATCH /api/bookings/[id] — completed/cancelled/no_show transitions | `[unit: —]` |
| C.4 §4.11 | GET /api/dashboard/calendar | `[unit: —]` |
| C.5 §5.1 | GET /api/public/availability/grid | `[unit: —]` |
| C.5 §5.2 | POST /api/public/bookings/create | `[unit: —]` |
| C.8 §8.1 | POST /api/payments/create-link (destination charge) | `[unit: —]` |
| C.8 §8.3 | POST /api/payments/[id]/refund | `[unit: src/lib/stripe/refund.test.ts]` — API endpoint sin test |
| C.8 §8.7 | POST /api/stripe/connect/onboard | `[unit: —]` |
| C.8 §8.9 | POST /api/checkout (suscripción plataforma) | `[unit: —]` |
| C.9 §9.1 | Webhook Stripe — dual-secret + idempotencia | `[unit: —]` |
| C.9 §9.2 | checkout.session.completed — sub/payment/tip | `[unit: —]` |
| C.9 §9.4 | charge.refunded | `[unit: —]` |
| C.9 §9.6 | subscription.created/updated | `[unit: —]` |
| C.9 §9.8 | subscription.deleted | `[unit: —]` |
| C.10 §10.6 | POST /api/sumup/checkout/start | `[unit: —]` |
| C.10 §10.7 | GET /api/sumup/checkout/return | `[unit: —]` |
| C.11 §11.1 | POST /api/invoices/from-booking (chainRegistroAlta) | `[unit: —]` |
| C.11 §11.3 | POST /api/invoices/[id]/rectificativa | `[unit: —]` |
| C.18 §18.1 | GET /api/cron/reminders | `[unit: —]` |
| C.19 §19.1 | POST /api/app/otp/request | `[unit: —]` |
| C.19 §19.2 | POST /api/app/otp/verify | `[unit: —]` |
| C.23 §23.8 | POST /api/whatsapp (Meta webhook) | `[unit: —]` |
| C.23 §23.16 | GET /api/auth/[...all] Better Auth | `[unit: —]` |
| C.24 §24.1 | createBooking() — pipeline completo | `[unit: —]` |
| C.24 §24.4 | hasBookingOverlap() | `[unit: —]` |
| C.25 §25.1 | getAvailableSlots() | `[unit: src/lib/availability.test.ts]` parcial |
| C.25 §25.2 | hoursForDate() | `[unit: src/lib/availability.test.ts]` parcial |
| C.26 §26.1 | refundStripeCharge() reverse_transfer | `[unit: src/lib/stripe/refund.test.ts]` ✓ |
| C.26 §26.3 | verifyConfirmedSetupIntent() — validación server-side | `[unit: —]` |
| C.26 §26.4 | chargeNoShowFee() — siempre 'no_card_on_file' en prod hoy | `[unit: src/lib/stripe/no-show-fee.test.ts]` parcial |
| C.28 §28.1 | computeHashAlta() — 3 vectores AEAT | `[unit: src/lib/verifactu/hash.test.ts]` ✓ |
| C.28 §28.3 | chainRegistroAlta() — advisory lock + transacción | `[unit: —]` |
| C.28 §28.4 | chainRegistroAnulacion() | `[unit: —]` |
| C.28 §28.6 | formatFechaExpedicion() — DST Madrid | `[unit: src/lib/verifactu/format.test.ts]` ✓ |
| C.28 §28.7 | formatFechaHoraHusoGen() — offset parte del hash | `[unit: src/lib/verifactu/format.test.ts]` ✓ |
| C.28 §28.8 | centsToDecimal() | `[unit: —]` |
| C.28 §28.9 | generateQrUrl() | `[unit: src/lib/verifactu/qr.test.ts]` ✓ |
| C.28 §28.11 | buildVeriFactuXml() | `[unit: src/lib/verifactu/xml.test.ts]` parcial |
| C.28 §28.12 | generateInvoiceFromBooking() | `[unit: —]` |
| C.28 §28.13 | hasCompleteFiscalEmisor() | `[unit: —]` |
| C.28 §28.14 | calculateAmounts() IVA | `[unit: —]` |
| C.29 §29.1 | signedAmount() NEGATIVE_KINDS | `[unit: src/lib/cash/compute.test.ts]` ✓ |
| C.29 §29.3 | computeExpectedClosing() | `[unit: src/lib/cash/compute.test.ts]` ✓ |
| C.29 §29.8 | recordRefundMovement() doble idempotencia | `[unit: —]` |
| C.30 §30.1 | computeBarberPayroll() | `[unit: src/lib/payroll/compute.test.ts]` ✓ |
| C.30 §30.3 | computeMonthlyPayroll() | `[unit: src/lib/payroll/compute.test.ts]` ✓ |
| C.31 §31.1 | computeBookingDelta() — foot-gun ×100 | `[unit: src/lib/loyalty/compute.test.ts]` ✓ |
| C.33 §33.1 | periodRevenueComponents() — 5 queries paralelas | `[unit: src/lib/finanzas/period-revenue.test.ts]` parcial |
| C.33 §33.3 | computeRevenueCents() — ×100 una vez | `[unit: src/lib/finanzas/pnl-math.test.ts]` ✓ |
| C.33 §33.4 | computeIvaBreakdown() — propinas fuera de base | `[unit: src/lib/finanzas/pnl-math.test.ts]` ✓ |
| C.34 §34.1 | dispatchUserNotification() — push-first, WA fallback, NUNCA ambos | `[unit: —]` |
| C.34 §34.3 | Web Push — urgency:'high' + TTL:3600 | `[unit: —]` |
| C.35 §35.1 | issueAppSession() — cookie httpOnly | `[unit: —]` |
| C.35 §35.2 | getAppSession() — sliding expiry | `[unit: —]` |
| C.35 §35.4 | storeCode() OTP hash | `[unit: —]` |
| C.35 §35.5 | verifyCode() — MAX_ATTEMPTS brute-force | `[unit: —]` |
| C.36 §36.1 | isAdminEmail() | `[unit: —]` |
| C.36 §36.2 | Better Auth setup | `[unit: —]` |
