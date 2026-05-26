export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { Download, Receipt, ChevronRight, Info } from 'lucide-react'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import StatStrip from '../../_components/StatStrip'
import StatsPeriodTabs from '../../_components/StatsPeriodTabs'
import EmptyState from '../../_components/EmptyState'
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'
import { loadFiscalSummary } from '@/lib/fiscal/summary'
import { loadReportContext } from '../_report-data'

// -----------------------------------------------------------------------------
// /dashboard/informes/fiscal — pestaña FISCAL (alias "Contabilidad" para el
// barbero) del área Informes.
//
// Resumen IVA / IRPF que el barbero entrega a su gestoría para presentar el
// Modelo 303 (IVA trimestral) y el 130/390 (IRPF / resumen anual).
//
// Periodo: `StatsPeriodTabs` (día/semana/mes/año/rango/total) compartido con
// las otras pestañas de Informes — el barbero filtra con la misma UI en
// todas. El gestor habitualmente pide trimestres → seleccionar "Rango" con
// 01-ene/31-mar etc., O usar "Año" para el resumen anual (Modelo 390).
//
// Reusamos:
//   · admin-lock guard `informes` (mismo PIN que el resto del jefe).
//   · invoices.ivaRate + subtotal/iva/total en cents — ningún schema nuevo.
//   · Helper puro `loadFiscalSummary` (recibe startIso / endExclusiveIso).
//   · `loadReportContext` para resolver tenant + periodo desde searchParams
//     — single source con Ingresos / Citas / Clientes / Marketing.
//
// REGLAS FISCALES (ver `src/lib/fiscal/summary.ts`):
//   · Solo se incluyen facturas con status='issued' (anuladas / rectificadas
//     se excluyen — la rectificativa ya restó con signo negativo en su día).
//   · IRPF: la retención la decide el cliente B2B, no la barbería. Se muestra
//     la base e importe POTENCIAL (15%) como referencia, no como cuota a
//     ingresar.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    period?: string
    date?: string
    start?: string
    end?: string
  }>
}

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export default async function FiscalPage({ searchParams }: PageProps) {
  // Admin-lock — el módulo administrativo siempre tras el PIN del jefe.
  const lockOverlay = await renderAdminLockGuard('informes')
  if (lockOverlay) return lockOverlay

  const params = await searchParams
  const { client, periodLabel, periodStartIso, periodEndIso } =
    await loadReportContext(params)

  // Empty state si la facturación no está activada — sin facturas no hay
  // resumen fiscal posible. Cambiar de pestaña no añade datos.
  if (!client.invoicingEnabled) {
    return (
      <AreaShell area="informes">
        <AreaContent scroll="fixed" maxWidth="5xl">
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Receipt}
              tone="brand"
              title="Activa la facturación"
              description="El resumen IVA/IRPF se calcula a partir de las facturas que emites con cada venta. Actívalas para tener listo el Modelo 303 cada trimestre."
              action={
                <Link href="/dashboard/ventas/cobros" className="btn-primary">
                  Activar facturación
                  <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
          </div>
        </AreaContent>
      </AreaShell>
    )
  }

  // `loadFiscalSummary` filtra por `issue_date >= startIso AND < endExclusiveIso`.
  // Si periodStartIso es null (lifetime), pasamos `0001-01-01` para no
  // restringir por abajo — `periodEndIso` ya viene normalizado.
  const summary = await loadFiscalSummary(
    client.id,
    periodStartIso ?? '0001-01-01',
    periodEndIso,
  )

  const hasData = summary.ivaTotals.count > 0

  // El export reusa el mismo set de params (period/date/start/end) que la
  // página — single source con StatsPeriodTabs. Construimos la query.
  const exportParams = new URLSearchParams()
  if (params.period) exportParams.set('period', params.period)
  if (params.date) exportParams.set('date', params.date)
  if (params.start) exportParams.set('start', params.start)
  if (params.end) exportParams.set('end', params.end)
  const exportHref =
    `/api/invoices/export-fiscal${exportParams.toString() ? `?${exportParams}` : ''}`

  return (
    <AreaShell
      area="informes"
      action={
        <Suspense>
          {/* defaultPeriod="month" mantiene UI y server sincronizados:
              `loadReportContext` resuelve a 'month' cuando no hay ?period=,
              así que el chip "Mes" debe estar activo por defecto. */}
          <StatsPeriodTabs defaultPeriod="month" />
        </Suspense>
      }
    >
      <AreaContent scroll="region" maxWidth="6xl">
        <p
          className="mb-4 text-ink-2"
          style={{ fontSize: 'var(--text-meta)' }}
        >
          Resumen IVA y IRPF para tu gestoría ·{' '}
          <span className="text-ink">{periodLabel}</span>
        </p>

        <StatStrip
          ariaLabel="Resumen fiscal del periodo"
          stats={[
            {
              label: 'Base imponible',
              value: `${formatEuros(summary.ivaTotals.baseCents)} €`,
              hint: 'Sin IVA',
            },
            {
              label: 'IVA repercutido',
              value: `${formatEuros(summary.ivaTotals.ivaCents)} €`,
              hint: 'A ingresar (Modelo 303)',
            },
            {
              label: 'Total facturado',
              value: `${formatEuros(summary.ivaTotals.totalCents)} €`,
              hint: `${summary.ivaTotals.count} ${summary.ivaTotals.count === 1 ? 'documento' : 'documentos'}`,
            },
          ]}
        />

        {/* Export CSV — usa los mismos searchParams que la página. */}
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-end">
          <Link
            href={exportHref}
            className="btn-primary"
            prefetch={false}
            title="Descargar el resumen fiscal del periodo (CSV para tu gestor)"
          >
            <Download className="h-4 w-4" />
            Descargar CSV
          </Link>
        </div>

        {!hasData ? (
          <div className="mt-6">
            <EmptyState
              icon={Receipt}
              title={`Sin facturas emitidas en ${periodLabel}`}
              description="Cuando emitas el primer ticket o factura del periodo aparecerá aquí el desglose por tipo de IVA. Solo se incluyen documentos con factura emitida (los tickets antiguos sin VeriFactu no cuentan)."
            />
          </div>
        ) : (
          <>
            {/* ── Tabla resumen IVA por tipo. */}
            <section className="panel mt-6">
              <header
                className="border-b border-line px-[var(--space-card)] py-3"
                style={{ background: 'var(--table-head-bg)' }}
              >
                <h2 className="text-[0.8125rem] font-semibold text-ink">
                  Resumen IVA por tipo · {periodLabel}
                </h2>
                <p className="mt-0.5 text-[0.75rem] text-ink-2">
                  Modelo 303 — IVA repercutido a ingresar.
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.8125rem]">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="px-[var(--space-card)] py-2 font-semibold text-ink-2">
                        Tipo IVA
                      </th>
                      <th className="px-[var(--space-card)] py-2 text-right font-semibold text-ink-2">
                        Documentos
                      </th>
                      <th className="px-[var(--space-card)] py-2 text-right font-semibold text-ink-2">
                        Base imponible
                      </th>
                      <th className="px-[var(--space-card)] py-2 text-right font-semibold text-ink-2">
                        Cuota IVA
                      </th>
                      <th className="px-[var(--space-card)] py-2 text-right font-semibold text-ink-2">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.ivaRows.map((r) => (
                      <tr key={r.ratePct} className="border-b border-line">
                        <td className="px-[var(--space-card)] py-2 font-medium text-ink">
                          {r.ratePct === 0 ? 'Exento (0%)' : `${r.ratePct}%`}
                        </td>
                        <td className="px-[var(--space-card)] py-2 text-right font-mono text-ink-2">
                          {r.count}
                        </td>
                        <td className="px-[var(--space-card)] py-2 text-right font-mono text-ink-2">
                          {formatEuros(r.baseCents)} €
                        </td>
                        <td className="px-[var(--space-card)] py-2 text-right font-mono text-ink-2">
                          {formatEuros(r.ivaCents)} €
                        </td>
                        <td className="px-[var(--space-card)] py-2 text-right font-mono font-semibold text-ink">
                          {formatEuros(r.totalCents)} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-overlay">
                      <td className="px-[var(--space-card)] py-2 font-semibold text-ink">
                        Total
                      </td>
                      <td className="px-[var(--space-card)] py-2 text-right font-mono font-semibold text-ink">
                        {summary.ivaTotals.count}
                      </td>
                      <td className="px-[var(--space-card)] py-2 text-right font-mono font-semibold text-ink">
                        {formatEuros(summary.ivaTotals.baseCents)} €
                      </td>
                      <td className="px-[var(--space-card)] py-2 text-right font-mono font-semibold text-ink">
                        {formatEuros(summary.ivaTotals.ivaCents)} €
                      </td>
                      <td className="px-[var(--space-card)] py-2 text-right font-mono font-semibold text-ink">
                        {formatEuros(summary.ivaTotals.totalCents)} €
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* ── Tabla resumen IRPF (informativo). */}
            <section className="panel mt-6">
              <header
                className="border-b border-line px-[var(--space-card)] py-3"
                style={{ background: 'var(--table-head-bg)' }}
              >
                <h2 className="text-[0.8125rem] font-semibold text-ink">
                  Resumen IRPF · {periodLabel}
                </h2>
                <p className="mt-0.5 text-[0.75rem] text-ink-2">
                  Informativo. La retención IRPF la practica quien recibe la
                  factura — no la barbería.
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.8125rem]">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="px-[var(--space-card)] py-2 font-semibold text-ink-2">
                        Concepto
                      </th>
                      <th className="px-[var(--space-card)] py-2 text-right font-semibold text-ink-2">
                        Documentos
                      </th>
                      <th className="px-[var(--space-card)] py-2 text-right font-semibold text-ink-2">
                        Base
                      </th>
                      <th className="px-[var(--space-card)] py-2 text-right font-semibold text-ink-2">
                        Retención potencial
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.irpfRows.map((r) => (
                      <tr key={r.kind} className="border-b border-line">
                        <td className="px-[var(--space-card)] py-2 font-medium text-ink">
                          {r.label}
                        </td>
                        <td className="px-[var(--space-card)] py-2 text-right font-mono text-ink-2">
                          {r.count}
                        </td>
                        <td className="px-[var(--space-card)] py-2 text-right font-mono text-ink-2">
                          {formatEuros(r.baseCents)} €
                        </td>
                        <td className="px-[var(--space-card)] py-2 text-right font-mono text-ink-2">
                          {formatEuros(r.potentialRetencionCents)} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-overlay">
                      <td className="px-[var(--space-card)] py-2 font-semibold text-ink">
                        Total
                      </td>
                      <td className="px-[var(--space-card)] py-2 text-right font-mono font-semibold text-ink">
                        {summary.irpfTotals.count}
                      </td>
                      <td className="px-[var(--space-card)] py-2 text-right font-mono font-semibold text-ink">
                        {formatEuros(summary.irpfTotals.baseCents)} €
                      </td>
                      <td className="px-[var(--space-card)] py-2 text-right font-mono font-semibold text-ink">
                        {formatEuros(summary.irpfTotals.potentialRetencionCents)} €
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </>
        )}

        {/* ── Nota de compliance (siempre visible, también con empty). */}
        <aside className="mt-6 flex items-start gap-3 rounded-control border border-line bg-overlay p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
          <p className="text-[0.75rem] leading-relaxed text-ink-2">
            Solo se incluyen ventas con factura emitida (VeriFactu). Las
            facturas anuladas o rectificadas no cuentan: la rectificativa
            ya descontó su base e IVA en su día. Para presentar el Modelo
            303 / 390, descarga el CSV y entrégalo a tu gestoría.
          </p>
        </aside>
      </AreaContent>
    </AreaShell>
  )
}
