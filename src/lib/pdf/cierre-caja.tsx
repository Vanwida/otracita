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
// Cierre de Caja — React-PDF report.
//
// Documento que el barbero descarga al cerrar la caja del día. Incluye:
//   1. Identificación del local + fecha del cierre
//   2. Bloque apertura/cierre (hora, opening, quién abrió/cerró)
//   3. Cuadre por método (efectivo / tarjeta / online) con expected vs counted
//      y descuadre. Tarjeta solo aparece si el barbero contó datáfono.
//   4. Tabla de movimientos del día con tipo, método y signo
//   5. Notas del cierre (si las metió)
//
// Uso interno del barbero — NO es documento fiscal AEAT. Sirve para imprimir,
// archivar o adjuntar al gestor cuando hay descuadres.
// -----------------------------------------------------------------------------

Font.registerHyphenationCallback((word) => [word]);

// ── Brand colors (match globals.css y libro-facturas) ───────────────────
const BRAND = '#C9653C';
const BRAND_SOFTER = '#F4E3D4';
const INK = '#2A1D14';
const INK_2 = '#6B5D4F';
const INK_3 = '#9C8F7E';
const LINE = '#E8DDD0';
const OVERLAY = '#F0EBE3';
const SUCCESS = '#3F7A4D';
const WARNING = '#B8791C';
const DANGER = '#A33B2D';

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
  },
  headerStripe: {
    height: 4,
    backgroundColor: BRAND,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  titleBlock: { flexDirection: 'column' },
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
  subtitle: { fontSize: 10, color: INK_2 },
  emisorBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    maxWidth: '55%',
  },
  emisorName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    textAlign: 'right',
    marginBottom: 1,
  },
  emisorLine: { fontSize: 9, color: INK_2, textAlign: 'right' },
  generatedAt: {
    fontSize: 8,
    color: INK_3,
    marginBottom: 14,
  },

  // ── Sección genérica ─────────────────────────────────────────────────
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },

  // ── Resumen apertura/cierre ──────────────────────────────────────────
  summaryGrid: {
    flexDirection: 'row',
    borderTopWidth: 0.6,
    borderTopColor: LINE,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
    paddingVertical: 8,
    marginBottom: 10,
  },
  summaryCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  summaryLabel: {
    fontSize: 7.5,
    color: INK_3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 11,
    color: INK,
    fontFamily: 'Helvetica-Bold',
  },
  summaryHint: { fontSize: 8, color: INK_3, marginTop: 1 },

  // ── Cuadre por método ────────────────────────────────────────────────
  cuadreTable: {
    borderTopWidth: 0.6,
    borderTopColor: LINE,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
  },
  cuadreHeader: {
    flexDirection: 'row',
    backgroundColor: OVERLAY,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cuadreRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 0.3,
    borderBottomColor: LINE,
  },
  cuadreRowLast: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cuadreColMethod: { width: '28%' },
  cuadreColExpected: { width: '24%', textAlign: 'right' },
  cuadreColCounted: { width: '24%', textAlign: 'right' },
  cuadreColDescuadre: { width: '24%', textAlign: 'right' },

  // ── Movimientos ──────────────────────────────────────────────────────
  movTable: {
    borderTopWidth: 0.6,
    borderTopColor: LINE,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
  },
  movHeader: {
    flexDirection: 'row',
    backgroundColor: OVERLAY,
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  movRow: {
    flexDirection: 'row',
    paddingVertical: 4.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.3,
    borderBottomColor: LINE,
  },
  movRowLast: {
    flexDirection: 'row',
    paddingVertical: 4.5,
    paddingHorizontal: 4,
  },
  movColTime: { width: '12%' },
  movColKind: { width: '28%' },
  movColMethod: { width: '20%' },
  movColNotes: { width: '24%' },
  movColAmount: { width: '16%', textAlign: 'right' },

  // ── Atomic typography ────────────────────────────────────────────────
  th: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  td: { fontSize: 8.5, color: INK },
  tdMuted: { fontSize: 8.5, color: INK_2 },
  tdBold: { fontSize: 8.5, color: INK, fontFamily: 'Helvetica-Bold' },
  tdSuccess: { fontSize: 8.5, color: SUCCESS, fontFamily: 'Helvetica-Bold' },
  tdWarning: { fontSize: 8.5, color: WARNING, fontFamily: 'Helvetica-Bold' },
  tdDanger: { fontSize: 8.5, color: DANGER, fontFamily: 'Helvetica-Bold' },

  // ── Footer ───────────────────────────────────────────────────────────
  notesBlock: {
    backgroundColor: BRAND_SOFTER,
    padding: 8,
    borderRadius: 3,
    marginBottom: 10,
  },
  notesLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  notesText: { fontSize: 9, color: INK_2, lineHeight: 1.4 },
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
  footerText: { fontSize: 8, color: INK_3 },
  empty: {
    padding: 20,
    textAlign: 'center',
    fontSize: 10,
    color: INK_3,
  },
});

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

export interface CierreCajaEmisor {
  fiscalName: string;
  fiscalNif: string | null;
  fiscalAddress: string | null;
  fiscalPostalCode: string | null;
  fiscalCity: string | null;
}

export interface CierreCajaMovementRow {
  /** HH:MM */
  time: string;
  /** Etiqueta legible del tipo (Servicio, Gasto, etc.) */
  kindLabel: string;
  /** Etiqueta legible del método (Efectivo, Tarjeta, Online) */
  methodLabel: string;
  /** Notas opcionales del apunte. */
  notes: string | null;
  /** Importe en cents, ya con signo (positivo = ingreso, negativo = egreso). */
  signedAmountCents: number;
}

export interface CierreCajaProps {
  /** Identificación fiscal del local. */
  emisor: CierreCajaEmisor;
  /** Fecha del cierre, formateada (e.g. "27 de abril de 2026"). */
  closingDateLabel: string;
  /** "27/04/2026" para el bloque "Generado el". */
  generatedAtLabel: string;

  /** "08:30 (Alex)" — hora + email opcional del que abrió. */
  openedAtLabel: string;
  openedByLabel: string;
  closedAtLabel: string;
  closedByLabel: string;

  openingCents: number;

  /** Cuadre — null cuando no se contó (datáfono opcional). */
  cashExpectedCents: number;
  cashCountedCents: number | null;
  cashDescuadreCents: number | null;

  cardExpectedCents: number;
  cardCountedCents: number | null;
  cardDescuadreCents: number | null;

  /** Online no se cuadra contra nada físico — solo informativo. */
  onlineExpectedCents: number;

  movements: CierreCajaMovementRow[];

  notes: string | null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatEurosES(cents: number): string {
  const euros = cents / 100;
  const sign = euros < 0 ? '-' : '';
  return (
    sign +
    new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(euros))
  );
}

function descuadreStyle(descuadre: number | null) {
  if (descuadre === null) return styles.tdMuted;
  if (descuadre === 0) return styles.tdSuccess;
  if (Math.abs(descuadre) < 100) return styles.tdWarning; // < 1€ leve
  return styles.tdDanger;
}

function descuadreLabel(descuadre: number | null): string {
  if (descuadre === null) return '—';
  if (descuadre === 0) return '0,00 €  ✓';
  const sign = descuadre > 0 ? '+' : '−';
  return `${sign}${formatEurosES(Math.abs(descuadre))} €`;
}

// -----------------------------------------------------------------------------
// Document
// -----------------------------------------------------------------------------

export function CierreCajaDocument(props: CierreCajaProps): React.ReactElement {
  const {
    emisor,
    closingDateLabel,
    generatedAtLabel,
    openedAtLabel,
    openedByLabel,
    closedAtLabel,
    closedByLabel,
    openingCents,
    cashExpectedCents,
    cashCountedCents,
    cashDescuadreCents,
    cardExpectedCents,
    cardCountedCents,
    cardDescuadreCents,
    onlineExpectedCents,
    movements,
    notes,
  } = props;

  const hasCard = cardCountedCents !== null;

  return (
    <Document
      title={`Cierre de caja — ${closingDateLabel}`}
      author={emisor.fiscalName}
      creator="otracita"
      producer="otracita"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerStripe} fixed />

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>CIERRE DE CAJA</Text>
            <Text style={styles.title}>Resumen del día</Text>
            <Text style={styles.subtitle}>{closingDateLabel}</Text>
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

        <Text style={styles.generatedAt}>Generado el {generatedAtLabel}</Text>

        {/* Apertura/cierre */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Apertura y cierre</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Apertura</Text>
              <Text style={styles.summaryValue}>{openedAtLabel}</Text>
              <Text style={styles.summaryHint}>{openedByLabel}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Cierre</Text>
              <Text style={styles.summaryValue}>{closedAtLabel}</Text>
              <Text style={styles.summaryHint}>{closedByLabel}</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Cambio inicial</Text>
              <Text style={styles.summaryValue}>{formatEurosES(openingCents)} €</Text>
              <Text style={styles.summaryHint}>Saldo en cajón al abrir</Text>
            </View>
          </View>
        </View>

        {/* Cuadre por método */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuadre por método</Text>
          <View style={styles.cuadreTable}>
            <View style={styles.cuadreHeader}>
              <Text style={[styles.th, styles.cuadreColMethod]}>Método</Text>
              <Text style={[styles.th, styles.cuadreColExpected]}>Esperado (€)</Text>
              <Text style={[styles.th, styles.cuadreColCounted]}>Contado (€)</Text>
              <Text style={[styles.th, styles.cuadreColDescuadre]}>Descuadre (€)</Text>
            </View>

            <View style={styles.cuadreRow}>
              <Text style={[styles.tdBold, styles.cuadreColMethod]}>Efectivo</Text>
              <Text style={[styles.tdMuted, styles.cuadreColExpected]}>
                {formatEurosES(cashExpectedCents)}
              </Text>
              <Text style={[styles.td, styles.cuadreColCounted]}>
                {cashCountedCents === null ? '—' : formatEurosES(cashCountedCents)}
              </Text>
              <Text style={[descuadreStyle(cashDescuadreCents), styles.cuadreColDescuadre]}>
                {descuadreLabel(cashDescuadreCents)}
              </Text>
            </View>

            <View style={hasCard ? styles.cuadreRow : styles.cuadreRowLast}>
              <Text style={[styles.tdBold, styles.cuadreColMethod]}>Tarjeta (datáfono)</Text>
              <Text style={[styles.tdMuted, styles.cuadreColExpected]}>
                {formatEurosES(cardExpectedCents)}
              </Text>
              <Text style={[styles.td, styles.cuadreColCounted]}>
                {cardCountedCents === null ? '—' : formatEurosES(cardCountedCents)}
              </Text>
              <Text style={[descuadreStyle(cardDescuadreCents), styles.cuadreColDescuadre]}>
                {descuadreLabel(cardDescuadreCents)}
              </Text>
            </View>

            {hasCard && (
              <View style={styles.cuadreRowLast}>
                <Text style={[styles.tdBold, styles.cuadreColMethod]}>Online</Text>
                <Text style={[styles.tdMuted, styles.cuadreColExpected]}>
                  {formatEurosES(onlineExpectedCents)}
                </Text>
                <Text style={[styles.tdMuted, styles.cuadreColCounted]}>—</Text>
                <Text style={[styles.tdMuted, styles.cuadreColDescuadre]}>n/a</Text>
              </View>
            )}

            {!hasCard && (
              <View style={styles.cuadreRowLast}>
                <Text style={[styles.tdBold, styles.cuadreColMethod]}>Online</Text>
                <Text style={[styles.tdMuted, styles.cuadreColExpected]}>
                  {formatEurosES(onlineExpectedCents)}
                </Text>
                <Text style={[styles.tdMuted, styles.cuadreColCounted]}>—</Text>
                <Text style={[styles.tdMuted, styles.cuadreColDescuadre]}>n/a</Text>
              </View>
            )}
          </View>
        </View>

        {/* Movimientos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Movimientos del día ({movements.length})
          </Text>
          {movements.length === 0 ? (
            <View>
              <Text style={styles.empty}>Sin movimientos.</Text>
            </View>
          ) : (
            <View style={styles.movTable}>
              <View style={styles.movHeader} fixed>
                <Text style={[styles.th, styles.movColTime]}>Hora</Text>
                <Text style={[styles.th, styles.movColKind]}>Tipo</Text>
                <Text style={[styles.th, styles.movColMethod]}>Método</Text>
                <Text style={[styles.th, styles.movColNotes]}>Notas</Text>
                <Text style={[styles.th, styles.movColAmount]}>Importe (€)</Text>
              </View>
              {movements.map((m, i) => {
                const last = i === movements.length - 1;
                const rowStyle = last ? styles.movRowLast : styles.movRow;
                const amountStyle =
                  m.signedAmountCents < 0 ? styles.tdDanger : styles.tdBold;
                const sign = m.signedAmountCents < 0 ? '−' : '+';
                return (
                  <View style={rowStyle} key={i} wrap={false}>
                    <Text style={[styles.tdMuted, styles.movColTime]}>{m.time}</Text>
                    <Text style={[styles.td, styles.movColKind]}>{m.kindLabel}</Text>
                    <Text style={[styles.tdMuted, styles.movColMethod]}>
                      {m.methodLabel}
                    </Text>
                    <Text style={[styles.tdMuted, styles.movColNotes]}>
                      {m.notes ?? ''}
                    </Text>
                    <Text style={[amountStyle, styles.movColAmount]}>
                      {sign}
                      {formatEurosES(Math.abs(m.signedAmountCents))}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Notas */}
        {notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Notas del cierre</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Generado con otracita · uso interno (no fiscal)
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
