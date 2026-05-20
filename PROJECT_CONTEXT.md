# PROJECT_CONTEXT — otracita
_Actualizado: 2026-05-19_

## Estado
`main` local en 57a575d, todo lo gordo de esta sesión mergeado y cold-verificado (tsc 0, lint 0). NO pusheado a producción (instrucción previa de Alex: mira localhost, prod le da igual ahora). 0 clientes pagando.

## Última sesión
Sesión maratón. Mergeado:
- **Agenda Booksy-grade**: rejilla ventana dinámica (no hardcode 8-22), bloques 15/15/13.5/12 con contraste AA computado (cancelada 3.42→6.45), rail izquierdo colapsable, lenguaje plano "Descanso/Día libre" + motivo, picker servicios compartido, K1 menú-hueco wired, K4 typeahead cliente, G1 cabecera única, SlideOver primitivo.
- **Money**: extras multi-servicio en caja/nóminas/P&L (P0-1), refund sign (P0-2), CajaRollup refunds, IVA `client.ivaRate`, P&L incluye productos/propinas (tip fuera base IVA — ley ES), BarberBreakdown atribución por barber_id, 4 vistas P&L cuadran ingresos/IVA, nóminas-paridad batched, DRY pnl-math + period-revenue.
- **Pagos**: reembolso in-app Stripe Connect (reverse_transfer + app fee) + SumUp → caja idempotente. No-show fee + save-card consent web/PWA (SetupIntent off_session, bot exento). Migraciones 0035 + 0036 aplicadas a prod.
- **Identity**: teléfono E.164 en TODAS las escrituras (libphonenumber-js). **Dedupe ejecutado en prod** (24→21 customers, backup `/tmp/dedupe-backup-20260519-180756`).
- **#55 overlay-unification**: ~19 modales → `_components/Modal.tsx` + `SlideOver.tsx`, WCAG 2.5.8/2.5.5 close 44×44.
- **#73 a11y target-size**: 12 controles sub-24 dashboard → ≥24, focus-visible añadido.
- **#9 solape**: 3 impls → 1 `hasBookingOverlap`; fix bug PATCH reasignación.
- **#8 NumberInput**: 4 no-money migrados; ~24 fiscales correctamente NO migrados (NumberInput round diverge — corrupción de céntimos).
- Suite tests existente: 19 ficheros, `npm test` exit 0, fail 0.

## ➡️ Siguiente acción
**Retomar la lista exhaustiva recursiva de features** en `docs/inventory/` (de ahí salen los tests). Estado: 3 agentes paralelos por dominio disjunto, cada uno escribe su sección.
- **B (PWA + WhatsApp bot)** → DONE, 267 hojas, fichero `docs/inventory/B-pwa-bot.md` listo.
- **A (Dashboard exhaustivo)** → DONE 2026-05-20, 312 hojas, `docs/inventory/A-dashboard.md`.
- **C (APIs + Stripe + SumUp + VeriFactu + Caja + Payroll + Loyalty + Promos + notif + multi-tenancy + cron + schema tabla-level)** → INTERRUMPIDO por límite de tokens (reset 3:50am Madrid). NO escribió fichero. Relanzar en próxima sesión con misma brief que A: lee `B-pwa-bot.md` y `A-dashboard.md` ENTEROS primero para formato canónico, exhaustivo, write `docs/inventory/C-api-money.md`.

Cuando C esté: ensamblar los 3 en `docs/FEATURE-TEST-MATRIX.md` con TOC global. De ahí salen los tests E2E + unit.
Cuando A y C entreguen, ensamblar los 3 en `docs/FEATURE-TEST-MATRIX.md` con índice. De esa lista se construyen los tests (E2E human-emulating Playwright + 7 gaps unit: stripe/refund, stripe/no-show-fee, stripe/setup-intent, bookings/total, payroll/by-month, finanzas/period-revenue, notifications/dispatch). Plantilla del fichero ya establecida en B-pwa-bot.md — replicar formato. Cada hoja termina con `[unit: <path or —>] [e2e: —] [risk: P0|P1|P2]`.

## Bloqueantes
Ninguno técnico — la sesión anterior se interrumpió por coste, no por bug.

## Decisiones abiertas
- **#71** hex residual setup/page.tsx + app/page.tsx (low-pri, ortogonal).
- **#74** primitivo bottom-sheet + 3 sheets de FinanzasClient (money-block-owned).
- **#75** modo money-safe de NumberInput → migrar 24 inputs fiscales (necesita diseño para no corromper céntimos).
- **Push a producción**: todo está local. Cuándo desplegar = tu decisión.
