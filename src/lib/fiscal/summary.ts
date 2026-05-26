import 'server-only';

import { db } from '@/db';
import { invoices } from '@/db/schema';
import { and, eq, gte, lt, sql } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Cómputo del resumen fiscal IVA/IRPF para entregar a la gestoría.
//
// FUENTE: tabla `invoices` (cada fila ya tiene `ivaRate`, `subtotalCents`,
// `ivaAmountCents`, `totalCents`, `status`, `customerNif`, `tipoFactura`,
// `rectifiesInvoiceId`). NO derivamos del P&L de control financiero —
// ese mezcla productos/propinas/manual; aquí solo facturas FISCALES porque
// la gestoría solo declara lo facturado.
//
// REGLAS:
//   · status = 'issued' → suma (incluye F1-F5 + R1-R5 rectificativas).
//     Las rectificativas YA salen con base/IVA negativos en la factura
//     original (es como AEAT exige restar) — confiamos en el dato emitido.
//   · status IN ('voided', 'rectified') → se EXCLUYEN. Una anulada no
//     existe fiscalmente; una rectificada queda neutralizada por su R1-R5.
//   · IRPF: en B2C (sin NIF) la retención es 0. En B2B (con NIF) existe
//     POTENCIALMENTE 15% (servicios profesionales) pero la decide quien
//     RECIBE la factura — no la barbería. Mostramos las dos filas como
//     INFORMATIVAS (base e importe potencial) sin presumir retención.
//     Si el día de mañana se modeliza el campo `irpf_rate` por factura,
//     el cómputo cambia trivialmente — hasta entonces, datos honestos.
// -----------------------------------------------------------------------------

export interface IvaBreakdownRow {
  /** Tipo IVA en % entero. 21 / 10 / 4 / 0 (= exento). */
  ratePct: number;
  baseCents: number;
  ivaCents: number;
  totalCents: number;
  /** Nº de documentos fiscales agrupados en esta fila. */
  count: number;
}

export interface IrpfBreakdownRow {
  /**
   * Tipo de cliente:
   *   · 'b2c'   = ticket (sin NIF) → retención IRPF NO APLICA → 0.
   *   · 'b2b'   = factura con NIF → retención POTENCIAL 15% (decide el cliente).
   */
  kind: 'b2c' | 'b2b';
  /** Etiqueta legible. */
  label: string;
  baseCents: number;
  /** Importe que la barbería habría visto retenido si el cliente practicase 15%. */
  potentialRetencionCents: number;
  count: number;
}

export interface FiscalSummary {
  ivaRows: IvaBreakdownRow[];
  ivaTotals: {
    baseCents: number;
    ivaCents: number;
    totalCents: number;
    count: number;
  };
  irpfRows: IrpfBreakdownRow[];
  irpfTotals: {
    baseCents: number;
    potentialRetencionCents: number;
    count: number;
  };
}

/** % entero usado para la columna B2B (informativo). */
export const IRPF_B2B_DEFAULT_PCT = 15;

/**
 * Carga el resumen fiscal para un cliente y un rango `[startIso, endExclusiveIso)`.
 *
 * Tenancy: el caller resuelve `clientId` desde la sesión (NUNCA del request).
 * `issueDate` se filtra por rango medio-abierto para evitar que el primer
 * día del periodo siguiente se cuele.
 */
export async function loadFiscalSummary(
  clientId: string,
  startIso: string,
  endExclusiveIso: string,
): Promise<FiscalSummary> {
  // Una sola query para IVA agrupado por tipo. Voided/rectified excluidas.
  const ivaRowsRaw = await db
    .select({
      ratePct: invoices.ivaRate,
      baseCents: sql<number>`COALESCE(SUM(${invoices.subtotalCents}), 0)`,
      ivaCents: sql<number>`COALESCE(SUM(${invoices.ivaAmountCents}), 0)`,
      totalCents: sql<number>`COALESCE(SUM(${invoices.totalCents}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, clientId),
        gte(invoices.issueDate, startIso),
        lt(invoices.issueDate, endExclusiveIso),
        eq(invoices.status, 'issued'),
      ),
    )
    .groupBy(invoices.ivaRate);

  const ivaRows: IvaBreakdownRow[] = ivaRowsRaw
    .map((r) => ({
      ratePct: Number(r.ratePct),
      baseCents: Number(r.baseCents),
      ivaCents: Number(r.ivaCents),
      totalCents: Number(r.totalCents),
      count: Number(r.count),
    }))
    .sort((a, b) => b.ratePct - a.ratePct);

  const ivaTotals = ivaRows.reduce(
    (acc, r) => ({
      baseCents: acc.baseCents + r.baseCents,
      ivaCents: acc.ivaCents + r.ivaCents,
      totalCents: acc.totalCents + r.totalCents,
      count: acc.count + r.count,
    }),
    { baseCents: 0, ivaCents: 0, totalCents: 0, count: 0 },
  );

  // IRPF split — agrupado por presencia/ausencia de NIF (proxy fiable de
  // B2B vs B2C). Misma query, GROUP BY (customer_nif IS NULL).
  const irpfRowsRaw = await db
    .select({
      hasNif: sql<boolean>`${invoices.customerNif} IS NOT NULL AND ${invoices.customerNif} <> ''`,
      baseCents: sql<number>`COALESCE(SUM(${invoices.subtotalCents}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, clientId),
        gte(invoices.issueDate, startIso),
        lt(invoices.issueDate, endExclusiveIso),
        eq(invoices.status, 'issued'),
      ),
    )
    .groupBy(sql`${invoices.customerNif} IS NOT NULL AND ${invoices.customerNif} <> ''`);

  const irpfMap = new Map<'b2c' | 'b2b', { baseCents: number; count: number }>();
  for (const r of irpfRowsRaw) {
    const kind: 'b2c' | 'b2b' = r.hasNif ? 'b2b' : 'b2c';
    irpfMap.set(kind, {
      baseCents: Number(r.baseCents),
      count: Number(r.count),
    });
  }

  const irpfRows: IrpfBreakdownRow[] = [
    {
      kind: 'b2b',
      label: `Facturas con NIF (potencial ${IRPF_B2B_DEFAULT_PCT}%)`,
      baseCents: irpfMap.get('b2b')?.baseCents ?? 0,
      potentialRetencionCents: Math.round(
        ((irpfMap.get('b2b')?.baseCents ?? 0) * IRPF_B2B_DEFAULT_PCT) / 100,
      ),
      count: irpfMap.get('b2b')?.count ?? 0,
    },
    {
      kind: 'b2c',
      label: 'Tickets sin NIF (0%)',
      baseCents: irpfMap.get('b2c')?.baseCents ?? 0,
      potentialRetencionCents: 0,
      count: irpfMap.get('b2c')?.count ?? 0,
    },
  ];

  const irpfTotals = irpfRows.reduce(
    (acc, r) => ({
      baseCents: acc.baseCents + r.baseCents,
      potentialRetencionCents:
        acc.potentialRetencionCents + r.potentialRetencionCents,
      count: acc.count + r.count,
    }),
    { baseCents: 0, potentialRetencionCents: 0, count: 0 },
  );

  return { ivaRows, ivaTotals, irpfRows, irpfTotals };
}
