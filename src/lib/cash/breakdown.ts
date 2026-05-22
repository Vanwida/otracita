// -----------------------------------------------------------------------------
// Desglose del cierre de caja — funciones puras de agregación.
//
// Separado de `compute.ts` para que `compute.ts` siga siendo el cálculo
// mínimo del cuadre (totales por método + descuadre) y aquí vivan las
// agregaciones más ricas que necesita la UI de cierre:
//
//   - Totales por método con SIGNO (ingresos – egresos), N de movimientos
//     y desgloses de incoming/outgoing — Reni necesita saber cuánto entró
//     y cuánto salió por cash/card/online ANTES de pulsar "Cerrar caja".
//   - Totales por kind (booking, product_sale, tip_cash, expense, …) — para
//     ver "qué tipo de operación movió el día".
//   - Totales por barbero — quién facturó qué. Vive aquí porque la UI lo
//     necesita en el panel de cierre; la resolución barbero ↔ movimiento
//     se hace en SQL (subquery con bookings.barber_id) y aquí solo
//     agregamos lo ya resuelto.
//
// Es pure: no toca DB. La capa que llame a este módulo es la responsable
// de pasar `movements` ya enriquecidos con `barberId` (resolviéndolo desde
// `bookings.referenceId` cuando el movement no lo trae directo — los
// movements de booking se insertan SIN barberId hoy, ver record-movement.ts).
//
// El snapshot `CashClosingSnapshot` que se persiste en
// `cashSessions.closingSnapshot` USA exactamente este shape — single
// source of truth para UI live y UI histórica.
// -----------------------------------------------------------------------------

import {
  signedAmount,
  isIncoming,
  type MovementForCompute,
  type MovementKind,
  type PaymentMethod,
} from './compute.ts';

/** Movement enriquecido con el barbero resuelto para la atribución por equipo. */
export interface MovementForBreakdown extends MovementForCompute {
  /** Resuelto upstream (en SQL) — null si el movement no tiene barbero
   *  asignado ni un booking/sale con barbero detrás. */
  barberId: string | null;
}

export interface MethodSummaryRow {
  method: PaymentMethod;
  /** Neto firmado: ingresos – egresos. Puede ser negativo en card/online. */
  netCents: number;
  /** Total absoluto que entró por este método (sólo ingresos). */
  incomingCents: number;
  /** Total absoluto que salió por este método (sólo egresos). */
  outgoingCents: number;
  /** Conteo de movimientos del método (todos, incoming + outgoing). */
  count: number;
}

export interface KindSummaryRow {
  kind: MovementKind;
  /** Neto firmado del kind, sumando todos los métodos. */
  netCents: number;
  /** Conteo de movimientos de este kind. */
  count: number;
}

export interface BarberMethodSummaryRow {
  barberId: string | null;
  /** Snapshot legible del nombre — null se mapea a "Sin asignar" en UI. */
  barberName: string | null;
  cashCents: number;
  cardCents: number;
  onlineCents: number;
  /** Total ingresado por el barbero (suma de los tres, ya signado). */
  totalCents: number;
  count: number;
}

/**
 * Detalle por método granular de `payments.method` (split-payments épica
 * Reni #26/#27). Permite distinguir `card_physical` vs `bizum` vs
 * `card_online` vs `mixed` dentro del bucket card/online del cuadre. Sólo
 * cubre bookings cobrados — el cuadre del cajón sigue dictado por
 * `cash_movements.method` (cash | card | online).
 */
export type PaymentMethodDetail =
  | 'cash'
  | 'card_physical'
  | 'bizum'
  | 'card_online'
  | 'mixed'
  | 'unknown';

export interface PaymentMethodDetailRow {
  method: PaymentMethodDetail;
  totalCents: number;
  count: number;
}

/** Una fila por movimiento individual — feed del listado scrollable. */
export interface MovementListItem {
  id: string;
  kind: MovementKind;
  method: PaymentMethod;
  /** Positivo si ingresa, negativo si egresa (signo ya aplicado). */
  signedAmountCents: number;
  /** Importe absoluto (lo que está guardado en DB). */
  amountCents: number;
  barberId: string | null;
  barberName: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** Nota libre del apunte (gasto, propina, etc). */
  notes: string | null;
  /** Tipo de referencia (booking | product_sale | null para apuntes manuales). */
  referenceType: 'booking' | 'product_sale' | null;
  referenceId: string | null;
  /** Etiqueta legible de la referencia (ej. nombre cliente del booking). */
  referenceLabel: string | null;
}

export interface MovementBreakdown {
  byMethod: MethodSummaryRow[];
  byKind: KindSummaryRow[];
  byBarber: BarberMethodSummaryRow[];
  /** Granularidad fina sobre `payments.method` para bookings cobrados. */
  byPaymentDetail: PaymentMethodDetailRow[];
  /** Listado de movimientos enriquecido para el reporte de cierre. */
  movements: MovementListItem[];
  /** Sub-totales globales — atajo para el header del panel. */
  totals: {
    incomingCents: number;
    outgoingCents: number;
    netCents: number;
  };
  /** Movimientos con `method` legacy/NULL — no entran en el cuadre y se
   *  muestran como warning en UI. Vacío cuando todo está bien. */
  unknownMethodCount: number;
}

/**
 * Agrupa los movimientos por método. Orden estable: cash → card → online.
 */
export function summariseByMethod(
  movements: readonly MovementForBreakdown[],
): MethodSummaryRow[] {
  const order: PaymentMethod[] = ['cash', 'card', 'online'];
  const acc: Record<PaymentMethod, MethodSummaryRow> = {
    cash: { method: 'cash', netCents: 0, incomingCents: 0, outgoingCents: 0, count: 0 },
    card: { method: 'card', netCents: 0, incomingCents: 0, outgoingCents: 0, count: 0 },
    online: { method: 'online', netCents: 0, incomingCents: 0, outgoingCents: 0, count: 0 },
  };
  for (const m of movements) {
    if (m.method !== 'cash' && m.method !== 'card' && m.method !== 'online') continue;
    const row = acc[m.method];
    row.count += 1;
    if (isIncoming(m.kind)) {
      row.incomingCents += m.amountCents;
      row.netCents += m.amountCents;
    } else {
      row.outgoingCents += m.amountCents;
      row.netCents -= m.amountCents;
    }
  }
  return order.map((m) => acc[m]);
}

/**
 * Agrupa por kind con totales y conteos. Sólo devuelve kinds que aparecen
 * (no rellena ceros) — la UI dibuja las filas que existen. Orden: ingresos
 * primero, luego egresos; dentro de cada grupo por valor neto absoluto desc.
 */
export function summariseByKind(
  movements: readonly MovementForBreakdown[],
): KindSummaryRow[] {
  const acc = new Map<MovementKind, KindSummaryRow>();
  for (const m of movements) {
    const existing = acc.get(m.kind);
    if (existing) {
      existing.netCents += signedAmount(m);
      existing.count += 1;
    } else {
      acc.set(m.kind, {
        kind: m.kind,
        netCents: signedAmount(m),
        count: 1,
      });
    }
  }
  return [...acc.values()].sort((a, b) => {
    const aIn = isIncoming(a.kind) ? 0 : 1;
    const bIn = isIncoming(b.kind) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return Math.abs(b.netCents) - Math.abs(a.netCents);
  });
}

/**
 * Agrupa por barbero con split por método. Sólo devuelve filas con al menos
 * 1 movimiento — si no hay equipo o sólo hay movimientos sin barbero asignado,
 * el array puede tener 0 ó 1 fila. La UI decide si vale la pena renderizar
 * la tabla (típicamente: ≥2 barberos con movimiento).
 *
 * `barberNameById` es un mapping opcional para resolver el nombre legible. Si
 * no se pasa, `barberName` queda null y la UI imprime "Sin asignar" / id.
 */
export function summariseByBarber(
  movements: readonly MovementForBreakdown[],
  barberNameById?: ReadonlyMap<string, string>,
): BarberMethodSummaryRow[] {
  const acc = new Map<string, BarberMethodSummaryRow>();
  for (const m of movements) {
    const key = m.barberId ?? '__unassigned__';
    let row = acc.get(key);
    if (!row) {
      row = {
        barberId: m.barberId,
        barberName: m.barberId ? barberNameById?.get(m.barberId) ?? null : null,
        cashCents: 0,
        cardCents: 0,
        onlineCents: 0,
        totalCents: 0,
        count: 0,
      };
      acc.set(key, row);
    }
    const signed = signedAmount(m);
    if (m.method === 'cash') row.cashCents += signed;
    else if (m.method === 'card') row.cardCents += signed;
    else if (m.method === 'online') row.onlineCents += signed;
    row.totalCents += signed;
    row.count += 1;
  }
  return [...acc.values()].sort((a, b) => {
    // Sin asignar al final.
    if (a.barberId === null && b.barberId !== null) return 1;
    if (b.barberId === null && a.barberId !== null) return -1;
    return b.totalCents - a.totalCents;
  });
}

/**
 * Compone el desglose completo. Es la función de entrada que llama tanto la
 * UI live (current) como el endpoint de cierre (para persistir snapshot).
 *
 * `unknownMethodCount` cuenta movimientos cuyo `method` no es cash/card/online
 * (NULL legacy o string inválido). La UI bloquea el cierre si > 0.
 *
 * `movementList` y `paymentDetail` se pasan ya resueltos por la capa de
 * carga (`load-breakdown.ts`) — son agregados que requieren JOIN con
 * bookings/payments y no pueden derivarse en pure compute.
 */
export function buildMovementBreakdown(
  movements: readonly MovementForBreakdown[],
  barberNameById?: ReadonlyMap<string, string>,
  movementList: readonly MovementListItem[] = [],
  paymentDetail: readonly PaymentMethodDetailRow[] = [],
): MovementBreakdown {
  let unknownMethodCount = 0;
  let incoming = 0;
  let outgoing = 0;
  for (const m of movements) {
    if (m.method !== 'cash' && m.method !== 'card' && m.method !== 'online') {
      unknownMethodCount += 1;
      continue;
    }
    if (isIncoming(m.kind)) incoming += m.amountCents;
    else outgoing += m.amountCents;
  }
  return {
    byMethod: summariseByMethod(movements),
    byKind: summariseByKind(movements),
    byBarber: summariseByBarber(movements, barberNameById),
    byPaymentDetail: [...paymentDetail],
    movements: [...movementList],
    totals: {
      incomingCents: incoming,
      outgoingCents: outgoing,
      netCents: incoming - outgoing,
    },
    unknownMethodCount,
  };
}

// -----------------------------------------------------------------------------
// Snapshot persistido en cash_sessions.closing_snapshot al cerrar.
// Versionado por si añadimos columnas al desglose más adelante — la UI
// histórica lee `version` para saber qué shape esperar.
// -----------------------------------------------------------------------------
export interface CashClosingSnapshot {
  version: 1;
  /** Apertura repetida aquí para que el snapshot sea autocontenido. */
  openingCents: number;
  /** = opening + Σ cash neto, ya calculado en compute.ts. */
  cashExpectedCents: number;
  cardExpectedCents: number;
  onlineExpectedCents: number;
  /** Total general = cash + card + online. */
  totalExpectedCents: number;
  byMethod: MethodSummaryRow[];
  byKind: KindSummaryRow[];
  byBarber: BarberMethodSummaryRow[];
  byPaymentDetail: PaymentMethodDetailRow[];
  movements: MovementListItem[];
  totals: {
    incomingCents: number;
    outgoingCents: number;
    netCents: number;
  };
  /** Counted que metió el barbero al cerrar (efectivo y datáfono). */
  cashCountedCents: number;
  cardCountedCents: number | null;
  cashDescuadreCents: number | null;
  cardDescuadreCents: number | null;
  /** Quién cerró + timestamp ISO del cierre. */
  closedByEmail: string | null;
  closedAt: string;
}
