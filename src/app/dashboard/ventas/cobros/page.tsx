export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import AreaContent from '../../_components/AreaContent'
import CashRegisterToggle from '../../_components/CashRegisterToggle'
import SumupConnect from '../../_components/SumupConnect'
import MobileAppConnect from '../../_components/MobileAppConnect'
import ConnectSettings from '../../_components/ConnectSettings'
import InvoicingSettings from '../../_components/InvoicingSettings'
import { loadVentasData } from '../_data'
import { pluralizeEs } from '@/lib/i18n/plural-es'

// -----------------------------------------------------------------------------
// /dashboard/ventas/cobros — pestaña COBROS del área Ventas.
//
// Reúne TODO lo de "cómo cobras": caja efectivo, datáfono SumUp, app móvil,
// cobros online (Stripe Connect) y datos fiscales/facturación. Antes era la
// sección demotada "Ajustes de cobro" al final del caja/page.tsx — ahora es
// su propia pestaña, sin scroll de revista.
//
// LÓGICA DE SERVIDOR INTACTA: todos los flags vienen de `loadVentasData`
// (mismo `client` resuelto de la sesión). Los componentes de ajuste
// (CashRegisterToggle, SumupConnect…) usan exactamente los mismos endpoints
// que antes — solo cambia dónde se montan.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function VentasCobrosPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const { client, invoiceCountThisMonth, hasEmittedInvoices } =
    await loadVentasData(rawPeriod)

  return (
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
            <h3 className="mb-1 font-semibold text-ink">Facturas emitidas</h3>
            <p className="text-[0.8125rem] text-ink-2">
              {client.invoicingEnabled ? (
                <>
                  {pluralizeEs(invoiceCountThisMonth, 'factura', 'facturas')}{' '}
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
  )
}
