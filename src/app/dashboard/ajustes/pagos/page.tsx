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
import InvoicingSettings from '../../_components/InvoicingSettings'
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
      <AreaContent scroll="region" maxWidth="5xl">
        <div className="space-y-8">
          <div>
            <CashRegisterToggle initialEnabled={client.cashRegisterEnabled} />
          </div>

          {client.cashRegisterEnabled && (
            <div className="border-t border-line pt-8">
              <SumupConnect
                initialConnected={
                  !!client.sumupAccessToken && !!client.sumupMerchantCode
                }
                initialMerchantCode={client.sumupMerchantCode}
                initialReaderId={client.sumupReaderId}
                initialReaderName={client.sumupReaderName}
              />
            </div>
          )}

          {client.cashRegisterEnabled && client.sumupAccessToken && (
            <div className="border-t border-line pt-8">
              <MobileAppConnect />
            </div>
          )}

          <div className="border-t border-line pt-8">
            <ConnectSettings
              initial={{
                status: client.stripeConnectStatus,
                accountId: client.stripeConnectAccountId,
                activatedAt: client.stripeConnectActivatedAt
                  ? client.stripeConnectActivatedAt.toISOString()
                  : null,
              }}
            />
          </div>

          <div className="border-t border-line pt-8">
            <InvoicingSettings
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
          </div>

          <div className="flex flex-wrap items-start gap-4 border-t border-line pt-8">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 font-semibold text-ink">
                Facturas emitidas
              </h3>
              <p className="text-[0.8125rem] text-ink-2">
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
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-brand transition-colors hover:text-brand-strong"
            >
              Ver facturas
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </AreaContent>
    </AreaShell>
  )
}
