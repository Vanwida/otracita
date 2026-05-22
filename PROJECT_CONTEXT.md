# PROJECT_CONTEXT — otracita
_Actualizado: 2026-05-22_

## Estado
`main` local con épica Reni "Cobro unificado + propina inline + pago fraccionado" terminada (tsc 0, lint 0, 98 tests payroll+payments+bookings verdes). Migración `0031_split_payments.sql` aplicada local — 4 columnas nuevas en `payments`. 0 clientes pagando aún.

## Última sesión
Épica Reni 2026-05-22 — flujo de cobro nuevo end-to-end:
- **#26 — Endpoint unificado /api/bookings/[id]/charge** (Agente A): reemplaza el combo histórico PATCH bookings + create-link. Acepta N tramos `payments[]`, tip opcional con barberId obligatorio, idempotencyKey. Valida suma, whitelist de métodos, multiple_online. Inserta N filas en `payments`, cash_movements en mismo tx, marca booking completed (o confirmed + checkout si hay tramo online). Webhook Stripe ya conoce el dominio extendido.
- **#27 — Pago fraccionado UI** (Agente B): drawer `ChargeFlow` con `SplitPaymentBuilder` (1..N tramos), validación cliente, propina inline con selector de barbero. Badge "Mixto" en agenda + tooltip con desglose.
- **#28 partes 1+2 — Atribución propinas por barbero + cierre mensual cash vs card** (Agente C verificado):
  - Motor `monthly.ts` ya hace SQL FILTER cash vs COALESCE card (L204-211).
  - `compute.ts` `normalizeTipsSplit` enforza invariante `tipsCents === cash + card`, total solo suma card.
  - UI `TipsList.tsx` badge "Cash" / "Card".
  - Tests añadidos: `payroll-tips.test.ts`, `booking-total.test.ts`, `methods-mapping.test.ts` (37 casos nuevos, 98 totales verdes).
  - Helper pure `computeBookingTotalCentsFromRows` extraído de `total.ts` → `total-compute.ts` para testabilidad sin DB.
- **Smoke script** `scripts/smoke-charge.sh`: 5 casos (100% cash, split + tip, sum_mismatch, invalid_method, tip_without_barber). Requiere setup manual (AUTH_COOKIE, TEST_BOOKING_ID, TEST_BARBER_ID).
- **Gap detectado #28 — atribución barberId**: flows que crean tips vía Stripe Checkout (PWA `/api/app/tips/create` + WhatsApp followup `/lib/whatsapp/followup.ts`) NO rellenan `tips.barberId`, solo `barberName`. Webhook `handleTipPaymentCompleted` tampoco lo añade al flippear a 'paid'. PATCH `/api/tips/[id]` solo edita `barberName`, no `barberId`. El motor payroll resuelve por `barberName.toLowerCase()` matching (monthly.ts L230), así que las cuentas cuadran HOY pero la atribución directa por FK queda inconsistente — auditoría futura.

## ➡️ Siguiente acción
**#28 parte 3 — IVA propinas** (bloqueado por asesor fiscal — ¿están fuera de base IVA del local?). Mientras llega la respuesta: atacar **#29-#38** según prioridad de Reni (R1-R10 backlog). Candidatos cercanos: cerrar gap de atribución barberId en los 3 flows detectados (rellenar `barberId` al crear tip Stripe + al cobrar en webhook + al PATCH); luego inventory recursivo `docs/inventory/C-api-money.md` (interrumpido en sesión 2026-05-19).

## Bloqueantes
Ninguno técnico — la sesión anterior se interrumpió por coste, no por bug.

## Decisiones abiertas
- **#71** hex residual setup/page.tsx + app/page.tsx (low-pri, ortogonal).
- **#74** primitivo bottom-sheet + 3 sheets de FinanzasClient (money-block-owned).
- **#75** modo money-safe de NumberInput → migrar 24 inputs fiscales (necesita diseño para no corromper céntimos).
- **Push a producción**: todo está local. Cuándo desplegar = tu decisión.
