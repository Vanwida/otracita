import type { ReactNode } from 'react'
import { formatCents as formatCentsBase } from '@/lib/format'
import { formatMonthLabel, categoryLabel } from './helpers'
import type { FinanzasSummary, Expense, FixedCost, Withdrawal } from './types'

// -----------------------------------------------------------------------------
// PrintReport — informe imprimible del Modelo 130/303 (P&L mensual del
// barbero, formato gestor). Hidden on screen, shown when printing
// (`hidden print:block`).
//
// Diseño:
//   · `PRINT` agrupa TODOS los estilos del informe — fontFamily, table cells,
//     borders. Una sola definición; cambiar el ritmo del PDF se hace aquí.
//   · `PrintSection` y `PrintRow` son sub-componentes locales (sólo se usan
//     en este informe).
//   · Tokens `var(--color-ink-*)` y `var(--color-line*)` se resuelven
//     correctamente en print en Chrome/Safari/Firefox modernos.
//
// Las cifras en print usan `formatCents` STRICT (siempre 2 decimales) — es
// ámbito fiscal donde "25 €" es ambiguo. NO usar la variante `{compact}` aquí.
// -----------------------------------------------------------------------------

// Strict (2 decimales) para el ámbito fiscal — el panel de pantalla usa compact.
const formatCents = (cents: number) => formatCentsBase(cents)

const PRINT = {
  pageBody: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '10pt',
    color: 'var(--color-ink)',
    lineHeight: 1.6,
    padding: '1.5cm 2cm',
  } as const,
  headerBorder: {
    borderBottom: '2px solid var(--color-ink)',
    paddingBottom: '12px',
    marginBottom: '20px',
  } as const,
  eyebrow: {
    fontSize: '8pt',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.15em',
    color: 'var(--color-ink-2)',
    margin: '0 0 4px',
  } as const,
  metaSubtle: {
    fontSize: '8pt',
    color: 'var(--color-ink-3)',
    margin: '4px 0 0',
  } as const,
  sectionH2: {
    fontSize: '9pt',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: 'var(--color-ink-2)',
    margin: '0 0 8px',
    fontWeight: 600 as const,
  } as const,
  table: { width: '100%', borderCollapse: 'collapse' as const } as const,
  tableSmall: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '9pt',
  } as const,
  theadRow: { borderBottom: '1px solid var(--color-line-strong)' } as const,
  th: {
    fontWeight: 600 as const,
    color: 'var(--color-ink-2)',
  } as const,
  tbodyRow: { borderBottom: '1px solid var(--color-line)' } as const,
  totalRow: { borderTop: '2px solid var(--color-ink)' } as const,
  tdMuted: { color: 'var(--color-ink-2)' } as const,
  tdNum: {
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
    fontWeight: 500 as const,
  } as const,
  tdNumBold: {
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
    fontWeight: 700 as const,
  } as const,
  footer: {
    borderTop: '1px solid var(--color-line-strong)',
    paddingTop: '10px',
    marginTop: '16px',
    fontSize: '8pt',
    color: 'var(--color-ink-3)',
    display: 'flex',
    justifyContent: 'space-between',
  } as const,
} as const

/** Wrap de sección imprimible: H2 con el estilo canónico + slot de cuerpo. */
function PrintSection({
  title,
  avoidBreak,
  children,
}: {
  title: string
  avoidBreak?: boolean
  children: ReactNode
}) {
  return (
    <section
      style={{
        marginBottom: '24px',
        ...(avoidBreak && { pageBreakInside: 'avoid' as const }),
      }}
    >
      <h2 style={PRINT.sectionH2}>{title}</h2>
      {children}
    </section>
  )
}

/**
 * Fila del P&L con label + valor a la derecha. Variantes:
 *   · `bold`      → fontWeight 700 (totales, subtotales).
 *   · `indent`    → margen izquierdo + texto secundario (sub-líneas del P&L).
 *   · `highlight` → fondo tinte (profit verde, loss rojo, warning ámbar).
 *
 * Tints desde `@theme` (`--color-success-surface` etc.) — sin hex inline.
 */
function PrintRow({
  label,
  value,
  bold,
  indent,
  highlight,
}: {
  label: string
  value: string
  bold?: boolean
  indent?: boolean
  highlight?: 'profit' | 'loss' | 'warning'
}) {
  const bg =
    highlight === 'profit'
      ? 'var(--color-success-surface)'
      : highlight === 'loss'
        ? 'var(--color-danger-surface)'
        : highlight === 'warning'
          ? 'var(--color-warning-surface)'
          : 'transparent'
  const fw = bold ? 700 : 400
  return (
    <tr style={{ borderBottom: '1px solid var(--color-line)', background: bg }}>
      <td
        style={{
          padding: '5px 8px 5px 0',
          fontWeight: fw,
          paddingLeft: indent ? '16px' : '0',
          color: indent ? 'var(--color-ink-2)' : 'var(--color-ink)',
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: '5px 0 5px 8px',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: fw,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </td>
    </tr>
  )
}

interface Props {
  month: string
  summary: FinanzasSummary
  expensesList: Expense[]
  fixedCostsList: FixedCost[]
  withdrawalsList: Withdrawal[]
  serviciosCount: number
  ticketMedioCents: number
  reservaHaciendaCents: number
}

export default function PrintReport({
  month,
  summary,
  expensesList,
  fixedCostsList,
  withdrawalsList,
  serviciosCount,
  ticketMedioCents,
  reservaHaciendaCents,
}: Props) {
  return (
    <div className="hidden print:block" style={PRINT.pageBody}>
      {/* Header */}
      <div style={PRINT.headerBorder}>
        <p style={PRINT.eyebrow}>otracita</p>
        <h1 style={{ fontSize: '20pt', fontWeight: 700, margin: '0 0 4px' }}>Control Financiero</h1>
        <p style={{ fontSize: '11pt', color: 'var(--color-ink-2)', margin: 0, textTransform: 'capitalize' }}>
          {formatMonthLabel(month)}
        </p>
        <p style={PRINT.metaSubtle}>
          Generado el{' '}
          {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Resumen P&L */}
      <PrintSection title="Resumen del mes">
        <table style={PRINT.table}>
          <tbody>
            <PrintRow label="Ingresos brutos (con IVA)" value={formatCents(summary.ingresosCents)} />
            <PrintRow label="Gastos variables" value={`-${formatCents(summary.gastosVariablesCents)}`} indent />
            <PrintRow label="Costes fijos activos" value={`-${formatCents(summary.costosFijosCents)}`} indent />
            {summary.nominasCents > 0 && (
              <PrintRow label="Nóminas del equipo" value={`-${formatCents(summary.nominasCents)}`} indent />
            )}
            <PrintRow label="Total gastos" value={formatCents(summary.totalGastosCents)} />
            <PrintRow label="Beneficio bruto (sin IVA)" value={formatCents(summary.beneficioBrutoCents)} bold />
            <PrintRow label="Retiros personales" value={`-${formatCents(summary.retirosCents)}`} />
            <PrintRow
              label="Beneficio real"
              value={formatCents(summary.beneficioRealCents)}
              bold
              highlight={summary.beneficioRealCents < 0 ? 'loss' : 'profit'}
            />
          </tbody>
        </table>
      </PrintSection>

      {/* Contexto */}
      <PrintSection title="Contexto de ingresos">
        <table style={PRINT.table}>
          <tbody>
            <PrintRow label="Servicios completados" value={serviciosCount.toLocaleString('es-ES')} />
            <PrintRow label="Ticket medio" value={ticketMedioCents > 0 ? formatCents(ticketMedioCents) : '—'} />
          </tbody>
        </table>
      </PrintSection>

      {/* Fiscal */}
      <PrintSection title="Estimación fiscal">
        <table style={PRINT.table}>
          <tbody>
            <PrintRow label="IVA repercutido (21% s/ base)" value={formatCents(summary.ivaRepercutidoCents)} />
            <PrintRow label="IVA soportado (deducible)" value={`-${formatCents(summary.ivaSoportadoCents)}`} />
            <PrintRow label="IVA a declarar (Modelo 303)" value={formatCents(summary.ivaAPagarCents)} bold />
            <PrintRow label="IRPF estimado 20% (Modelo 130)" value={formatCents(summary.irpfEstimadoCents)} bold />
            <PrintRow label="Total reserva Hacienda" value={formatCents(reservaHaciendaCents)} bold highlight="warning" />
          </tbody>
        </table>
        <p style={{ ...PRINT.metaSubtle, marginTop: '6px' }}>
          Estimación orientativa. Consulta con tu gestor antes de presentar los modelos.
        </p>
      </PrintSection>

      {/* Gastos variables */}
      {expensesList.length > 0 && (
        <PrintSection title={`Gastos variables (${expensesList.length})`} avoidBreak>
          <table style={PRINT.tableSmall}>
            <thead>
              <tr style={PRINT.theadRow}>
                <th style={{ ...PRINT.th, textAlign: 'left', padding: '4px 8px 4px 0' }}>Fecha</th>
                <th style={{ ...PRINT.th, textAlign: 'left', padding: '4px 8px' }}>Categoría</th>
                <th style={{ ...PRINT.th, textAlign: 'left', padding: '4px 8px' }}>Nota</th>
                <th style={{ ...PRINT.th, textAlign: 'right', padding: '4px 0 4px 8px' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {expensesList.map((e) => (
                <tr key={e.id} style={PRINT.tbodyRow}>
                  <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td style={{ padding: '4px 8px' }}>{categoryLabel(e.category)}</td>
                  <td style={{ padding: '4px 8px', ...PRINT.tdMuted }}>{e.notes ?? ''}</td>
                  <td style={{ ...PRINT.tdNum, padding: '4px 0 4px 8px' }}>{formatCents(e.amountCents)}</td>
                </tr>
              ))}
              <tr style={PRINT.totalRow}>
                <td colSpan={3} style={{ padding: '5px 8px 5px 0', fontWeight: 700 }}>
                  Total gastos variables
                </td>
                <td style={{ ...PRINT.tdNumBold, padding: '5px 0 5px 8px' }}>
                  {formatCents(summary.gastosVariablesCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </PrintSection>
      )}

      {/* Costes fijos */}
      {fixedCostsList.filter((f) => f.active).length > 0 && (
        <PrintSection
          title={`Costes fijos activos (${fixedCostsList.filter((f) => f.active).length})`}
          avoidBreak
        >
          <table style={PRINT.tableSmall}>
            <thead>
              <tr style={PRINT.theadRow}>
                <th style={{ ...PRINT.th, textAlign: 'left', padding: '4px 8px 4px 0' }}>Nombre</th>
                <th style={{ ...PRINT.th, textAlign: 'left', padding: '4px 8px' }}>Categoría</th>
                <th style={{ ...PRINT.th, textAlign: 'right', padding: '4px 0 4px 8px' }}>Importe/mes</th>
              </tr>
            </thead>
            <tbody>
              {fixedCostsList
                .filter((f) => f.active)
                .map((fc) => (
                  <tr key={fc.id} style={PRINT.tbodyRow}>
                    <td style={{ padding: '4px 8px 4px 0' }}>{fc.name}</td>
                    <td style={{ padding: '4px 8px', ...PRINT.tdMuted }}>{categoryLabel(fc.category)}</td>
                    <td style={{ ...PRINT.tdNum, padding: '4px 0 4px 8px' }}>{formatCents(fc.amountCents)}</td>
                  </tr>
                ))}
              <tr style={PRINT.totalRow}>
                <td colSpan={2} style={{ padding: '5px 8px 5px 0', fontWeight: 700 }}>
                  Total costes fijos
                </td>
                <td style={{ ...PRINT.tdNumBold, padding: '5px 0 5px 8px' }}>
                  {formatCents(summary.costosFijosCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </PrintSection>
      )}

      {/* Retiros */}
      {withdrawalsList.length > 0 && (
        <PrintSection title={`Retiros personales (${withdrawalsList.length})`} avoidBreak>
          <table style={PRINT.tableSmall}>
            <thead>
              <tr style={PRINT.theadRow}>
                <th style={{ ...PRINT.th, textAlign: 'left', padding: '4px 8px 4px 0' }}>Fecha</th>
                <th style={{ ...PRINT.th, textAlign: 'left', padding: '4px 8px' }}>Nota</th>
                <th style={{ ...PRINT.th, textAlign: 'right', padding: '4px 0 4px 8px' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {withdrawalsList.map((w) => (
                <tr key={w.id} style={PRINT.tbodyRow}>
                  <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>{w.date}</td>
                  <td style={{ padding: '4px 8px', ...PRINT.tdMuted }}>{w.notes ?? ''}</td>
                  <td style={{ ...PRINT.tdNum, padding: '4px 0 4px 8px' }}>{formatCents(w.amountCents)}</td>
                </tr>
              ))}
              <tr style={PRINT.totalRow}>
                <td colSpan={2} style={{ padding: '5px 8px 5px 0', fontWeight: 700 }}>
                  Total retirado
                </td>
                <td style={{ ...PRINT.tdNumBold, padding: '5px 0 5px 8px' }}>
                  {formatCents(summary.retirosCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </PrintSection>
      )}

      {/* Footer */}
      <div style={PRINT.footer}>
        <span>otracita · Informe financiero mensual</span>
        <span>{formatMonthLabel(month)}</span>
      </div>
    </div>
  )
}
