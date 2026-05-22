// -----------------------------------------------------------------------------
// Payment methods — single source of truth for the unified-charge flow
// (épica Reni 2026-05-22, tasks #26/#27).
//
// Used by:
//   · Frontend: ChargeFlow / SplitPaymentBuilder / paymentBadge in agenda.
//   · Backend:  /api/bookings/[id]/charge validation + cash_movements mapping.
//   · Payroll & caja rollup: see CASH_MOVEMENT_METHOD_FROM_PAYMENT below.
//
// Adding a new method here automatically tightens the type everywhere it is
// consumed. Do NOT inline literal strings — always import from here.
// -----------------------------------------------------------------------------

export const PAYMENT_METHODS = [
  'cash',
  'card_physical',
  'bizum',
  'card_online',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}

// Human label (es-ES). Centralizado para que un cambio de copy no requiera
// grep por toda la UI.
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card_physical: 'Tarjeta · Datáfono',
  bizum: 'Bizum',
  card_online: 'Online · Link de pago',
};

// Short label (para chips/badges densos en la agenda).
export const PAYMENT_METHOD_SHORT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card_physical: 'Tarjeta',
  bizum: 'Bizum',
  card_online: 'Online',
};

// ¿El cobro se considera completado en el mismo instante en que el barbero
// lo registra (offline / sin esperar a un proveedor externo)?
//
//   true  → status='succeeded' inmediato, cash_movement insertado en el acto.
//   false → status='pending' hasta que el webhook (Stripe) confirme.
//
// SumUp datáfono cuenta como offline porque cuando el barbero ve el OK en el
// terminal y vuelve al flow, el cobro ya está cerrado por el lado de SumUp;
// recordSumupCheckoutResult lo confirma pero no introduce latencia esperable.
export const PAYMENT_METHOD_IS_INSTANT: Record<PaymentMethod, boolean> = {
  cash: true,
  card_physical: true,
  bizum: true,
  card_online: false,
};

// Mapeo a `cash_movements.method` (que mantiene su dominio histórico
// 'cash' | 'card' | 'online' para no romper rollup ni reports legacy).
//
//   card_physical → 'card'  (cuadre tarjeta — datáfono SumUp o TPV externo)
//   bizum         → 'card'  (Reni lo cobra en su Bizum, cuadra como tarjeta;
//                            decisión Alex 2026-05-22, revisable cuando haya
//                            UX dedicada de cuadre Bizum separado)
//   cash          → 'cash'
//   card_online   → 'online'(link Stripe Checkout)
export type CashMovementMethod = 'cash' | 'card' | 'online';

export const CASH_MOVEMENT_METHOD_FROM_PAYMENT: Record<PaymentMethod, CashMovementMethod> = {
  cash: 'cash',
  card_physical: 'card',
  bizum: 'card',
  card_online: 'online',
};

// Lucide icon name (string para que el componente que lo consuma haga el
// import sin que este módulo arrastre react-icons al server bundle).
export const PAYMENT_METHOD_ICON: Record<PaymentMethod, string> = {
  cash: 'Banknote',
  card_physical: 'CreditCard',
  bizum: 'Smartphone',
  card_online: 'Globe',
};

// -----------------------------------------------------------------------------
// "mixed" — pseudo-método almacenado en `bookings.paymentMethod` cuando el
// cobro se hizo con > 1 método. El desglose real vive en `payments` (N rows).
// No es un PaymentMethod (no se puede cobrar con "mixed"), pero sí aparece en
// las badges de la agenda.
// -----------------------------------------------------------------------------
export const MIXED_METHOD_TOKEN = 'mixed' as const;
export type BookingPaymentMethodValue = PaymentMethod | typeof MIXED_METHOD_TOKEN;
