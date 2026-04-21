import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

// -----------------------------------------------------------------------------
// Libro de Facturas Emitidas — React-PDF component.
//
// This is the document the gestor physically attaches to Modelo 303 filings.
// Compliance requirements (AEAT):
//   - Numeración correlativa y visible (invoice numbers must be sequential)
//   - Identificación del emisor (nombre fiscal, NIF, domicilio)
//   - Periodo del libro
//   - Desglose de IVA por factura (base + tipo + cuota)
//   - Totales del periodo
//
// Style is intentionally conservative (black on white, thin lines) — this is a
// legal document, not a marketing piece. The only brand accents are the
// header stripe and the footer wordmark.
// -----------------------------------------------------------------------------

// Use Helvetica — bundled with PDF readers, zero asset cost, no Font.register
// required. Works predictably in serverless.
Font.registerHyphenationCallback((word) => [word]);

// ── Brand colors (match globals.css) ─────────────────────────────────────
const BRAND = '#C9653C';
const BRAND_SOFTER = '#F4E3D4';
const INK = '#2A1D14';
const INK_2 = '#6B5D4F';
const INK_3 = '#9C8F7E';
const LINE = '#E8DDD0';
const OVERLAY = '#F0EBE3';

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
  },
  // ── Header ─────────────────────────────────────────────────────────────
  headerStripe: {
    height: 4,
    backgroundColor: BRAND,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  titleBlock: {
    flexDirection: 'column',
  },
  eyebrow: {
    fontSize: 8,
    color: BRAND,
    letterSpacing: 2,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    color: INK,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  period: {
    fontSize: 10,
    color: INK_2,
  },
  emisorBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    maxWidth: '55%',
  },
  emisorName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    marginBottom: 1,
    textAlign: 'right',
  },
  emisorLine: {
    fontSize: 9,
    color: INK_2,
    textAlign: 'right',
  },
  generatedAt: {
    fontSize: 8,
    color: INK_3,
    marginBottom: 10,
  },
  // ── Table ──────────────────────────────────────────────────────────────
  table: {
    borderTopWidth: 0.6,
    borderTopColor: LINE,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: OVERLAY,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.3,
    borderBottomColor: LINE,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRowLast: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  totalsRow: {
    flexDirection: 'row',
    backgroundColor: BRAND_SOFTER,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderTopWidth: 0.6,
    borderTopColor: BRAND,
    borderBottomWidth: 0.6,
    borderBottomColor: BRAND,
  },
  th: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  td: {
    fontSize: 8.5,
    color: INK,
  },
  tdMuted: {
    fontSize: 8.5,
    color: INK_2,
  },
  tdBold: {
    fontSize: 8.5,
    color: INK,
    fontFamily: 'Helvetica-Bold',
  },
  // Columns — widths sum to 100%
  colNumber: { width: '11%' },
  colDate: { width: '9%' },
  colCustomer: { width: '18%' },
  colNif: { width: '10%' },
  colBase: { width: '10%', textAlign: 'right' },
  colIvaRate: { width: '7%', textAlign: 'right' },
  colIvaAmount: { width: '11%', textAlign: 'right' },
  colTotal: { width: '12%', textAlign: 'right' },
  colType: { width: '12%', textAlign: 'right' },
  // ── Footer / page number ───────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.4,
    borderTopColor: LINE,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: INK_3,
  },
  empty: {
    padding: 20,
    textAlign: 'center',
    fontSize: 10,
    color: INK_3,
  },
});

export interface LibroInvoiceRow {
  number: string;
  issueDate: string; // YYYY-MM-DD
  customerName: string | null;
  customerNif: string | null;
  subtotalCents: number;
  ivaRate: number;
  ivaAmountCents: number;
  totalCents: number;
  type: string; // 'ticket' | 'invoice'
}

export interface LibroEmisor {
  fiscalName: string;
  fiscalNif: string | null;
  fiscalAddress: string | null;
  fiscalPostalCode: string | null;
  fiscalCity: string | null;
}

export interface LibroFacturasProps {
  period: string;      // e.g. "Abril 2026"
  generatedAt: string; // e.g. "20/04/2026"
  emisor: LibroEmisor;
  rows: LibroInvoiceRow[];
}

function formatEurosES(cents: number): string {
  // Spanish locale: thousands separator = '.', decimal = ','.
  const euros = cents / 100;
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatDateES(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return '';
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}

export function LibroFacturasDocument({
  period,
  generatedAt,
  emisor,
  rows,
}: LibroFacturasProps): React.ReactElement {
  const totals = rows.reduce(
    (acc, r) => ({
      subtotal: acc.subtotal + r.subtotalCents,
      iva: acc.iva + r.ivaAmountCents,
      total: acc.total + r.totalCents,
    }),
    { subtotal: 0, iva: 0, total: 0 },
  );

  return (
    <Document
      title={`Libro de Facturas Emitidas - ${period}`}
      author={emisor.fiscalName}
      creator="otracita"
      producer="otracita"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerStripe} fixed />

        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>LIBRO REGISTRO</Text>
            <Text style={styles.title}>Facturas Emitidas</Text>
            <Text style={styles.period}>{period}</Text>
          </View>
          <View style={styles.emisorBlock}>
            <Text style={styles.emisorName}>{emisor.fiscalName}</Text>
            {emisor.fiscalNif ? (
              <Text style={styles.emisorLine}>NIF: {emisor.fiscalNif}</Text>
            ) : null}
            {emisor.fiscalAddress ? (
              <Text style={styles.emisorLine}>{emisor.fiscalAddress}</Text>
            ) : null}
            {emisor.fiscalPostalCode || emisor.fiscalCity ? (
              <Text style={styles.emisorLine}>
                {[emisor.fiscalPostalCode, emisor.fiscalCity]
                  .filter(Boolean)
                  .join(' ')}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.generatedAt}>
          Generado el {generatedAt} · {rows.length}{' '}
          {rows.length === 1 ? 'documento' : 'documentos'}
        </Text>

        {rows.length === 0 ? (
          <View style={[styles.table]}>
            <Text style={styles.empty}>
              No se emitieron facturas en este periodo.
            </Text>
          </View>
        ) : (
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.tableHeader} fixed>
              <Text style={[styles.th, styles.colNumber]}>Nº Factura</Text>
              <Text style={[styles.th, styles.colDate]}>Fecha</Text>
              <Text style={[styles.th, styles.colCustomer]}>Cliente</Text>
              <Text style={[styles.th, styles.colNif]}>NIF</Text>
              <Text style={[styles.th, styles.colBase]}>Base (€)</Text>
              <Text style={[styles.th, styles.colIvaRate]}>% IVA</Text>
              <Text style={[styles.th, styles.colIvaAmount]}>Cuota IVA (€)</Text>
              <Text style={[styles.th, styles.colTotal]}>Total (€)</Text>
              <Text style={[styles.th, styles.colType]}>Tipo</Text>
            </View>

            {/* Rows */}
            {rows.map((row, idx) => {
              const rowStyle =
                idx === rows.length - 1 ? styles.tableRowLast : styles.tableRow;
              return (
                <View style={rowStyle} key={row.number} wrap={false}>
                  <Text style={[styles.tdBold, styles.colNumber]}>
                    {row.number}
                  </Text>
                  <Text style={[styles.tdMuted, styles.colDate]}>
                    {formatDateES(row.issueDate)}
                  </Text>
                  <Text style={[styles.td, styles.colCustomer]}>
                    {truncate(row.customerName, 28) || '—'}
                  </Text>
                  <Text style={[styles.tdMuted, styles.colNif]}>
                    {row.customerNif || '—'}
                  </Text>
                  <Text style={[styles.tdMuted, styles.colBase]}>
                    {formatEurosES(row.subtotalCents)}
                  </Text>
                  <Text style={[styles.tdMuted, styles.colIvaRate]}>
                    {row.ivaRate}%
                  </Text>
                  <Text style={[styles.tdMuted, styles.colIvaAmount]}>
                    {formatEurosES(row.ivaAmountCents)}
                  </Text>
                  <Text style={[styles.tdBold, styles.colTotal]}>
                    {formatEurosES(row.totalCents)}
                  </Text>
                  <Text style={[styles.tdMuted, styles.colType]}>
                    {row.type === 'invoice' ? 'Factura' : 'Ticket'}
                  </Text>
                </View>
              );
            })}

            {/* Totals */}
            <View style={styles.totalsRow} wrap={false}>
              <Text style={[styles.tdBold, styles.colNumber]}>TOTALES</Text>
              <Text style={[styles.tdMuted, styles.colDate]}> </Text>
              <Text style={[styles.tdMuted, styles.colCustomer]}> </Text>
              <Text style={[styles.tdMuted, styles.colNif]}> </Text>
              <Text style={[styles.tdBold, styles.colBase]}>
                {formatEurosES(totals.subtotal)}
              </Text>
              <Text style={[styles.tdMuted, styles.colIvaRate]}> </Text>
              <Text style={[styles.tdBold, styles.colIvaAmount]}>
                {formatEurosES(totals.iva)}
              </Text>
              <Text style={[styles.tdBold, styles.colTotal]}>
                {formatEurosES(totals.total)}
              </Text>
              <Text style={[styles.tdMuted, styles.colType]}> </Text>
            </View>
          </View>
        )}

        {/* Footer: wordmark + page number (renderable on every page) */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Generado con otracita · otracita.es
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
