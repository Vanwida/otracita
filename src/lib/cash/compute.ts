// -----------------------------------------------------------------------------
// Cuadre de caja — funciones puras de agregación.
//
// Vive separado de los endpoints/queries para poder testear con node --test
// sin path alias `@/db`. Las usa `src/app/api/cash/*` y la UI del cierre.
//
// Convenciones:
//   - `amountCents` SIEMPRE positivo en cash_movements.
//   - El SIGNO lo marca `kind`:
//       · ingresos (suman):      booking, product_sale, tip_cash, deposit
//       · egresos (restan):      expense, withdrawal
//       · ajustes (configurable): adjustment — el caller pasa signo en
//         `notes` o lo marca con un kind aparte; aquí lo tratamos como
//         INGRESO (positivo) por defecto. Si necesitas restar, mete dos
//         apuntes (deposit positivo + withdrawal/expense por la diferencia).
//
//   - `method` separa columnas del cuadre:
//       · cash   → afecta al cajón físico (counted vs expected)
//       · card   → afecta al datáfono (counted vs expected)
//       · online → no se cuadra contra nada físico (Stripe ya está conciliado)
//
//   - Solo el efectivo arranca con `openingCents` (cambio inicial). Tarjeta
//     y online empiezan en 0 cada día.
// -----------------------------------------------------------------------------

export type MovementKind =
  | 'booking'
  | 'product_sale'
  | 'tip_cash'
  | 'expense'
  | 'withdrawal'
  | 'deposit'
  | 'adjustment'
  | 'refund';

export type PaymentMethod = 'cash' | 'card' | 'online';

export interface MovementForCompute {
  kind: MovementKind;
  method: PaymentMethod;
  amountCents: number;
}

/** Egresos: resto. Resto: suma. `refund` SALE del cajón/datáfono (devolución
 *  al cliente) — se escribe como apunte positivo (amount_cents siempre > 0)
 *  y el signo lo pone aquí, igual que expense/withdrawal. Sin esto un
 *  reembolso SUMABA al esperado y descuadraba la caja en sentido contrario. */
const NEGATIVE_KINDS: ReadonlySet<MovementKind> = new Set([
  'expense',
  'withdrawal',
  'refund',
]);

/**
 * Aplica signo según kind. Devuelve un valor con signo: positivo si ingresa
 * al cajón/datáfono, negativo si sale.
 */
export function signedAmount(m: Pick<MovementForCompute, 'kind' | 'amountCents'>): number {
  return NEGATIVE_KINDS.has(m.kind) ? -m.amountCents : m.amountCents;
}

export interface MethodTotals {
  cashCents: number;
  cardCents: number;
  onlineCents: number;
}

/**
 * Suma todos los movimientos por método, aplicando signo.
 * Resultado: cuánto debería haber en cash/card/online al cierre,
 * SIN incluir el `openingCents` (eso se suma aparte).
 */
export function sumByMethod(movements: readonly MovementForCompute[]): MethodTotals {
  const totals: MethodTotals = { cashCents: 0, cardCents: 0, onlineCents: 0 };
  for (const m of movements) {
    const signed = signedAmount(m);
    if (m.method === 'cash') totals.cashCents += signed;
    else if (m.method === 'card') totals.cardCents += signed;
    else totals.onlineCents += signed;
  }
  return totals;
}

export interface ExpectedClosing {
  /** Efectivo esperado en el cajón al cierre = opening + neto cash. */
  cashExpectedCents: number;
  /** Total tarjeta esperado en el datáfono = neto card del día. */
  cardExpectedCents: number;
  /** Total online del día (Stripe). Informativo, no se cuadra físicamente. */
  onlineExpectedCents: number;
}

/**
 * Saldo esperado por método al cierre. El efectivo arranca con `openingCents`
 * (cambio inicial); tarjeta y online empiezan en 0 cada día.
 */
export function computeExpectedClosing(
  openingCents: number,
  movements: readonly MovementForCompute[],
): ExpectedClosing {
  const totals = sumByMethod(movements);
  return {
    cashExpectedCents: openingCents + totals.cashCents,
    cardExpectedCents: totals.cardCents,
    onlineExpectedCents: totals.onlineCents,
  };
}

/**
 * Diferencia entre lo contado por el barbero (físico) y lo esperado por el
 * sistema. Positivo = sobra dinero, negativo = falta.
 *
 * `counted` puede ser null si el barbero no quiere o no aplica (ej: no tiene
 * datáfono, o cierra sin contar). En ese caso devolvemos null para no
 * contaminar con un descuadre falso.
 */
export function computeDescuadre(
  expectedCents: number,
  countedCents: number | null,
): number | null {
  if (countedCents === null || countedCents === undefined) return null;
  return countedCents - expectedCents;
}

// -----------------------------------------------------------------------------
// Helpers UX — etiquetas legibles para movimientos en la lista del día.
// -----------------------------------------------------------------------------

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  booking: 'Servicio',
  product_sale: 'Producto',
  tip_cash: 'Propina',
  expense: 'Gasto',
  withdrawal: 'Retirada',
  deposit: 'Aporte',
  adjustment: 'Ajuste',
  refund: 'Reembolso',
};

/**
 * TODOS los kinds, derivados de las claves de MOVEMENT_KIND_LABELS (que es
 * `Record<MovementKind, …>` → TS obliga a tener una entrada por kind). Single
 * source of truth: añadir un kind al type fuerza un label y este array se
 * actualiza solo. Consumido por la UI (ej. CajaRollup) para no re-listar
 * kinds a mano y divergir del signo de `isIncoming`/`NEGATIVE_KINDS`.
 */
export const ALL_MOVEMENT_KINDS = Object.keys(
  MOVEMENT_KIND_LABELS,
) as MovementKind[];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  online: 'Online',
};

/** True si el kind suma al saldo (positivo). False si resta (negativo). */
export function isIncoming(kind: MovementKind): boolean {
  return !NEGATIVE_KINDS.has(kind);
}
