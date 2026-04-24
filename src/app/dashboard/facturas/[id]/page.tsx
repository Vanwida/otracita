export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { ChevronLeft, AlertOctagon, Receipt } from 'lucide-react'
import PrintButton from './PrintButton'
import QrBlock from '@/lib/verifactu/QrBlock'
import { buildQrUrl, type VerifactuEnv } from '@/lib/verifactu/qr'
import { formatFechaExpedicion, centsToDecimal } from '@/lib/verifactu/format'
import VerifactuTimeline from '../_components/VerifactuTimeline'
import type { VerifactuStatus } from '../_components/VerifactuBadge'

// -----------------------------------------------------------------------------
// Detalle de factura — vista print-ready. El barbero imprime o "Guardar como
// PDF" desde el diálogo de impresión del navegador. Media query @print en
// globals.css oculta navegación y acciones.
// -----------------------------------------------------------------------------

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function formatDate(iso: string): string {
  // iso is YYYY-MM-DD
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.clientId, client.id)))

  if (!invoice) notFound()

  const isInvoice = invoice.type === 'invoice'
  const isVoided = invoice.status === 'voided'
  const title = isInvoice ? 'Factura' : 'Ticket'

  // ── QR VeriFactu ────────────────────────────────────────────────────────
  // Solo pintamos el QR cuando AEAT ya ha aceptado el envío del registro
  // (verifactu_status='accepted' o 'accepted_with_errors'). Razón: un QR
  // pintado sin estar registrado en AEAT responde "Factura no encontrada"
  // al escanear, lo cual es peor que no tener QR. Hasta M4 (envío a AEAT),
  // ninguna factura estará 'accepted' → no se muestra QR para nadie.
  //
  // Legal: hasta 1 julio 2027 no es obligatorio usar SIF con QR. Estamos
  // cubiertos operando bajo RD 1619/2012 estándar sin QR. El hash se sigue
  // calculando en background para que cuando activemos M4 la cadena esté
  // lista retroactivamente.
  //
  // Flag manual `showQr=1` en query string para el caso de testing propio
  // (Alex quiere ver el QR en su barbería de pruebas sin enviar a AEAT).
  const showQrOverride = false // futura query param, por ahora siempre off
  const qrIsRegistered =
    invoice.verifactuStatus === 'accepted' ||
    invoice.verifactuStatus === 'accepted_with_errors'
  const verifactuEnv: VerifactuEnv =
    (process.env.VERIFACTU_ENV as VerifactuEnv) ?? 'pruebas'
  let qrUrl: string | null = null
  if ((qrIsRegistered || showQrOverride) && client.fiscalNif) {
    qrUrl = invoice.qrUrl
    if (!qrUrl) {
      qrUrl = buildQrUrl({
        nif: client.fiscalNif.trim().toUpperCase(),
        numserie: invoice.number,
        fecha: formatFechaExpedicion(new Date(`${invoice.issueDate}T00:00:00`)),
        importe: centsToDecimal(invoice.totalCents),
        env: verifactuEnv,
        verifactu: true,
      })
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Actions bar — hidden on print */}
      <div className="print:hidden border-b border-line bg-surface">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
          <Link
            href="/dashboard/facturas"
            className="inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* Document */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12 print:p-0 print:max-w-none">
        {/* Voided banner — legal warning shown on screen AND on print so there
            is zero chance of a voided doc being handed to a customer as valid. */}
        {isVoided && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border-2 border-danger bg-danger/10 p-5 md:p-6 flex items-start gap-4"
          >
            <AlertOctagon className="h-8 w-8 text-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-display text-xl md:text-2xl font-bold text-danger uppercase tracking-wide">
                Factura anulada
              </p>
              <p className="text-sm md:text-base text-ink mt-2">
                Emitida pero la reserva fue cancelada. Si el cliente ya pagó,
                debes emitir una <strong>factura rectificativa manualmente</strong>.
              </p>
            </div>
          </div>
        )}
        <article className="bg-surface border border-line rounded-2xl p-8 md:p-12 print:border-0 print:rounded-none print:shadow-none print:p-8">
          {/* Header: emisor + nº factura + QR VeriFactu en esquina sup-dcha */}
          <div className="flex items-start justify-between gap-6 flex-wrap pb-6 border-b border-line">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-widest text-brand">{title}</p>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mt-1">{invoice.number}</h1>
              <p className="text-ink-2 text-sm mt-1">Emitida el {formatDate(invoice.issueDate)}</p>
              <div className="mt-4">
                <p className="font-display font-semibold text-ink text-lg">{client.fiscalName || client.businessName}</p>
                {client.fiscalNif && <p className="text-ink-2 text-sm mt-0.5">NIF: {client.fiscalNif}</p>}
                {client.fiscalAddress && <p className="text-ink-2 text-sm mt-0.5">{client.fiscalAddress}</p>}
                {(client.fiscalPostalCode || client.fiscalCity) && (
                  <p className="text-ink-2 text-sm">
                    {[client.fiscalPostalCode, client.fiscalCity].filter(Boolean).join(' ')}
                  </p>
                )}
              </div>
            </div>
            {/* QR VeriFactu — AEAT exige primera página, arriba, bien visible.
                Oculto si no hay NIF (la factura no es emitible según RD
                1619/2012 art. 6 — el wizard de facturación ya lo bloquea). */}
            {qrUrl && (
              <div className="shrink-0">
                <QrBlock qrUrl={qrUrl} verifactu />
              </div>
            )}
          </div>

          {/* Customer block */}
          <div className="mt-6 pb-6 border-b border-line">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">Cliente</p>
            <p className="text-ink mt-2 font-medium">{invoice.customerName || 'Cliente'}</p>
            {invoice.customerNif && <p className="text-ink-2 text-sm">NIF: {invoice.customerNif}</p>}
            {invoice.customerAddress && <p className="text-ink-2 text-sm">{invoice.customerAddress}</p>}
            {invoice.customerPhone && <p className="text-ink-2 text-sm">{invoice.customerPhone}</p>}
          </div>

          {/* Line items — single line from the booking */}
          <div className="mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 uppercase text-xs tracking-wider border-b border-line">
                  <th className="py-2 font-semibold">Concepto</th>
                  <th className="py-2 font-semibold text-right">Base</th>
                  <th className="py-2 font-semibold text-right">IVA ({invoice.ivaRate}%)</th>
                  <th className="py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-4">
                    <p className="text-ink font-medium">{invoice.serviceName}</p>
                    {invoice.barberName && <p className="text-ink-2 text-xs mt-1">Profesional: {invoice.barberName}</p>}
                  </td>
                  <td className="py-4 text-right text-ink-2 font-mono">{formatEuros(invoice.subtotalCents)} €</td>
                  <td className="py-4 text-right text-ink-2 font-mono">{formatEuros(invoice.ivaAmountCents)} €</td>
                  <td className="py-4 text-right text-ink font-semibold font-mono">{formatEuros(invoice.totalCents)} €</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 pt-6 border-t border-line flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between text-ink-2">
                <span>Base imponible</span>
                <span className="font-mono">{formatEuros(invoice.subtotalCents)} €</span>
              </div>
              <div className="flex justify-between text-ink-2">
                <span>IVA {invoice.ivaRate}%</span>
                <span className="font-mono">{formatEuros(invoice.ivaAmountCents)} €</span>
              </div>
              <div className="flex justify-between font-display text-xl font-semibold text-ink pt-3 border-t border-line">
                <span>Total</span>
                <span className="font-mono">{formatEuros(invoice.totalCents)} €</span>
              </div>
            </div>
          </div>

          {/* Legal note */}
          {!isInvoice && (
            <p className="mt-10 text-xs text-ink-3 italic max-w-2xl">
              Ticket simplificado conforme al artículo 7.1 del Real Decreto 1619/2012 por el que se aprueba el Reglamento
              por el que se regulan las obligaciones de facturación.
            </p>
          )}

          {/* Powered-by footer — subtle branding */}
          <p className="mt-8 pt-6 border-t border-line text-xs text-ink-3">
            Emitida con otracita · otracita.es
          </p>
        </article>

        {/* Timeline VeriFactu — estado del registro ante Hacienda. Solo en
            pantalla, no en print (el barbero lo ve; el cliente que imprima
            la factura no). */}
        <section className="mt-6 print:hidden bg-surface border border-line rounded-2xl p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-4 w-4 text-brand" />
            <h2 className="text-base font-semibold text-ink">Estado en Hacienda</h2>
          </div>
          <VerifactuTimeline
            status={invoice.verifactuStatus as VerifactuStatus}
            sentAt={invoice.verifactuSentAt}
            responseAt={invoice.verifactuResponseAt}
            errorCode={invoice.verifactuErrorCode}
            errorMsg={invoice.verifactuErrorMsg}
            createdAt={invoice.createdAt}
          />
        </section>
      </div>
    </div>
  )
}
