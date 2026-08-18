// -----------------------------------------------------------------------------
// P&L — matemática fiscal pura (sin DB, sin I/O). Testeada en pnl-math.test.ts.
//
// ÚNICA fuente de verdad del cálculo ingresos→IVA→neto del P&L. La usan TODOS
// los endpoints de finanzas (summary, quarterly, annual, trend, historical) y
// el SSR de informes/page.tsx. Antes cada uno copiaba la fórmula y divergían:
// unos sin extras, otros con 21/121 hardcoded, ninguno con productos/propinas.
//
// REGLAS FISCALES (España):
//   · Precios IVA-incluido (convención retail): base = total·100/(100+r),
//     IVA repercutido = total·r/(100+r). Con r=21 ⇒ 100/121 y 21/121 exactos
//     (idéntico al comportamiento histórico — sin regresión).
//   · La PROPINA no lleva IVA (gratuidad, fuera de la base imponible). Entra
//     al beneficio pero NO a la base de IVA. El neto le suma la propina tal
//     cual (ya es neta).
//   · `r` (ivaRate) es configurable por tenant (clients.ivaRate). Mismo valor
//     que respeta la factura (invoicing-math.ts calculateAmounts).
// -----------------------------------------------------------------------------

/** Componentes crudos de ingreso de un periodo, ya sumados. TODO en CÉNTIMOS
 *  desde L-05 — ya no hay columnas de dinero en euros en el schema. */
export interface RevenueComponents {
  /** SUM(bookings.price_cents) del periodo, en CÉNTIMOS. */
  bookingCents: number;
  /** SUM(booking_services.price_cents) — servicios EXTRA R7, en CÉNTIMOS. */
  extrasCents: number;
  /** SUM(manual_incomes.amountCents), en CÉNTIMOS. */
  manualCents: number;
  /** SUM(product_sales.totalCents), en CÉNTIMOS. */
  productsCents: number;
  /** SUM(tips.amountCents) status='paid', en CÉNTIMOS. */
  tipsCents: number;
}

export interface RevenueCents {
  /** Servicios (principal + extras) en cents. */
  bookingCents: number;
  manualCents: number;
  productsCents: number;
  tipsCents: number;
  /** Ingreso total del periodo = todo lo anterior. */
  totalCents: number;
}

/**
 * Agrega los componentes crudos (ya en céntimos) y devuelve el total. Sin
 * conversiones ni redondeos: desde L-05 todo llega en céntimos enteros, así
 * que no hay ningún punto donde se puedan perder los 50 céntimos de un
 * servicio de 12,50 €.
 */
export function computeRevenueCents(c: RevenueComponents): RevenueCents {
  const bookingCents = c.bookingCents + c.extrasCents;
  const totalCents =
    bookingCents + c.manualCents + c.productsCents + c.tipsCents;
  return {
    bookingCents,
    manualCents: c.manualCents,
    productsCents: c.productsCents,
    tipsCents: c.tipsCents,
    totalCents,
  };
}

export interface IvaBreakdown {
  /** Base imponible = ingresos SIN propinas (la propina no lleva IVA). */
  ivaBaseCents: number;
  /** IVA repercutido sobre la base (precios IVA-incluido). */
  ivaRepercutidoCents: number;
  /** IVA soportado sobre gastos con IVA. */
  ivaSoportadoCents: number;
  /** A pagar = repercutido − soportado, nunca negativo. */
  ivaAPagarCents: number;
  /** Ingreso neto (sin IVA) = base/(1+r) + propinas (ya netas). */
  ingresosNetosCents: number;
}

/**
 * Desglose de IVA del periodo. `ivaRate` en % entero (ej. 21). `ingresosCents`
 * incluye propinas; `tipsCents` se RESTA para la base (no llevan IVA) y se
 * SUMA de vuelta al neto a valor nominal. Con tipsCents=0 el resultado es
 * idéntico al cálculo histórico sobre ingresosCents.
 */
export function computeIvaBreakdown(args: {
  ingresosCents: number;
  tipsCents: number;
  gastosConIvaCents: number;
  ivaRate: number;
}): IvaBreakdown {
  const denom = 100 + args.ivaRate;
  const ivaBaseCents = args.ingresosCents - args.tipsCents;
  const ivaRepercutidoCents = Math.round((ivaBaseCents * args.ivaRate) / denom);
  const ivaSoportadoCents = Math.round(
    (args.gastosConIvaCents * args.ivaRate) / denom,
  );
  const ivaAPagarCents = Math.max(0, ivaRepercutidoCents - ivaSoportadoCents);
  const ingresosNetosCents =
    Math.round((ivaBaseCents * 100) / denom) + args.tipsCents;
  return {
    ivaBaseCents,
    ivaRepercutidoCents,
    ivaSoportadoCents,
    ivaAPagarCents,
    ingresosNetosCents,
  };
}
