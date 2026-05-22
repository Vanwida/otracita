export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import AreaShell from '../../_components/AreaShell'
import AreaContent from '../../_components/AreaContent'
import CashRegisterToggle from '../../_components/CashRegisterToggle'
import SumupConnect from '../../_components/SumupConnect'
import MobileAppConnect from '../../_components/MobileAppConnect'
import ConnectSettings from '../../_components/ConnectSettings'
import AjustesLayout from '../_components/AjustesLayout'
import InvoicingCard from '../_components/InvoicingCard'
import { pluralizeEs } from '@/lib/i18n/plural-es'

// -----------------------------------------------------------------------------
// /dashboard/ajustes/pagos — pestaña PAGOS del área Ajustes.
//
// CONFIGURACIÓN canónica de cobros (se define una vez, framing de Ajustes):
// caja efectivo, datáfono SumUp, app móvil de cobro, Stripe Connect y datos
// fiscales/facturación. Es el ÚNICO sitio donde se editan estos campos
// (DRY — regla dura: un campo, un editor). Ventas → Cobros es solo la vista
// operativa (qué ha entrado este periodo) y enlaza aquí para configurar.
//
// LÓGICA DE SERVIDOR INTACTA: client resuelto por sesión; contador de
// facturas con la MISMA query mensual que tenía caja/page; los componentes
// de ajuste usan exactamente los mismos endpoints. Solo cambia dónde viven.
// -----------------------------------------------------------------------------

export default async function AjustesPagosPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Contador de facturas de este mes — misma query mensual (issue_date en
  // [mes, siguiente mes)) y mismo flag hasEmittedInvoices que usaba el
  // antiguo caja/page para el lock de InvoicingSettings.
  const now = new Date()
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const nextMonthStartIso = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10)
  const [invoiceCountRow] = await db
    .select({
      thisMonth: sql<number>`count(*) FILTER (WHERE issue_date >= ${monthStartIso} AND issue_date < ${nextMonthStartIso})`,
      total: sql<number>`count(*)`,
    })
    .from(invoices)
    .where(eq(invoices.clientId, client.id))
  const invoiceCountThisMonth = Number(invoiceCountRow?.thisMonth ?? 0)
  const hasEmittedInvoices = Number(invoiceCountRow?.total ?? 0) > 0

  return (
    <AreaShell area="ajustes">
      <AreaContent scroll="region" maxWidth="6xl">
        <AjustesLayout intro="Cómo cobras: caja, datáfono, app móvil, Stripe Connect y datos fiscales para emitir factura. Se configura una vez aquí y se queda así.">
          <CashRegisterToggle initialEnabled={client.cashRegisterEnabled} />

          {client.cashRegisterEnabled && (
            <SumupConnect
              initialConnected={
                !!client.sumupAccessToken && !!client.sumupMerchantCode
              }
              initialMerchantCode={client.sumupMerchantCode}
              initialReaderId={client.sumupReaderId}
              initialReaderName={client.sumupReaderName}
            />
          )}

          {client.cashRegisterEnabled && client.sumupAccessToken && (
            <MobileAppConnect />
          )}

          <ConnectSettings
            initial={{
              status: client.stripeConnectStatus,
              accountId: client.stripeConnectAccountId,
              activatedAt: client.stripeConnectActivatedAt
                ? client.stripeConnectActivatedAt.toISOString()
                : null,
            }}
          />

          <InvoicingCard
            initial={{
              invoicingEnabled: client.invoicingEnabled,
              fiscalName: client.fiscalName || '',
              fiscalNif: client.fiscalNif || '',
              fiscalAddress: client.fiscalAddress || '',
              fiscalCity: client.fiscalCity || '',
              fiscalPostalCode: client.fiscalPostalCode || '',
              ivaRate: client.ivaRate,
              invoiceNumberPrefix: client.invoiceNumberPrefix,
              invoiceNumberNext: client.invoiceNumberNext,
              hasEmittedInvoices,
            }}
          />

          <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-line bg-surface px-[var(--space-card)] py-4 md:px-6">
            <div className="min-w-0 flex-1">
              <h3
                className="font-semibold text-ink"
                style={{ fontSize: 'var(--text-section-title)' }}
              >
                Facturas emitidas
              </h3>
              <p
                className="mt-1 text-ink-2"
                style={{ fontSize: 'var(--text-meta)' }}
              >
                {client.invoicingEnabled ? (
                  <>
                    {pluralizeEs(
                      invoiceCountThisMonth,
                      'factura',
                      'facturas',
                    )}{' '}
                    este mes. Próximo número:{' '}
                    <span className="font-mono">
                      {client.invoiceNumberPrefix}
                      {client.invoiceNumberNext}
                    </span>
                    .
                  </>
                ) : (
                  'Facturación desactivada. Actívala desde Datos fiscales.'
                )}
              </p>
            </div>
            <Link
              href="/dashboard/ventas/facturas"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-brand transition-colors hover:text-brand-strong"
              style={{ fontSize: 'var(--text-meta)' }}
            >
              Ver facturas
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </AjustesLayout>
      </AreaContent>
    </AreaShell>
  )
}
