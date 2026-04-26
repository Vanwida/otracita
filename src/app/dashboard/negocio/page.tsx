export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import NegocioForm from '@/app/dashboard/_components/NegocioForm'
import type { HoursMap } from '@/app/dashboard/_components/HoursEditor'
import AjustesBreadcrumb from '@/app/dashboard/_components/AjustesBreadcrumb'

interface ServiceItem {
  name: string
  duration: string | number
  price: string | number
}

export default async function NegocioPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const services = (client.chatbotServices as ServiceItem[] | null) || []
  const hours = (client.chatbotHours as HoursMap | null) || null
  const blockedDates = (client.blockedDates as string[]) || []

  // Has this client already emitted invoices? Locks the "next number" input
  // so the sequence can never be rewound (legal requirement for correlative
  // numbering in Spain).
  const [countRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .where(eq(invoices.clientId, client.id))
  const hasEmittedInvoices = Number(countRow?.n ?? 0) > 0

  /**
   * Server action — saves the core business fields plus fiscal/invoicing
   * config. Tenant is resolved from the session, never from the form payload.
   */
  async function saveBusiness(formData: FormData) {
    'use server'

    const { auth: serverAuth } = await import('@/lib/auth/server')
    const { headers: getHeaders } = await import('next/headers')
    const session = await serverAuth.api.getSession({ headers: await getHeaders() })
    if (!session?.user?.email) return

    const email = session.user.email

    const businessName = (formData.get('businessName') as string | null) ?? ''
    const whatsappNumber = (formData.get('whatsappNumber') as string | null) ?? ''
    const address = (formData.get('address') as string | null) ?? ''
    const servicesRaw = (formData.get('services') as string | null) ?? ''
    const hoursRaw = (formData.get('hours') as string | null) ?? ''

    // Invoicing fields — only present if the "Facturación" tab was touched.
    const invoicingEnabled = formData.get('invoicingEnabled') === 'on'
    const fiscalName = (formData.get('fiscalName') as string | null) ?? ''
    const fiscalNif = (formData.get('fiscalNif') as string | null) ?? ''
    const fiscalAddress = (formData.get('fiscalAddress') as string | null) ?? ''
    const fiscalCity = (formData.get('fiscalCity') as string | null) ?? ''
    const fiscalPostalCode = (formData.get('fiscalPostalCode') as string | null) ?? ''
    const ivaRateRaw = (formData.get('ivaRate') as string | null) ?? ''
    const slotStepRaw = (formData.get('slotStepMinutes') as string | null) ?? ''
    const invoiceNumberPrefix = (formData.get('invoiceNumberPrefix') as string | null) ?? ''
    const invoiceNumberNextRaw = (formData.get('invoiceNumberNext') as string | null) ?? ''

    let chatbotServices: unknown = null
    let chatbotHours: unknown = null
    try { if (servicesRaw) chatbotServices = JSON.parse(servicesRaw) } catch { /* ignore */ }
    try { if (hoursRaw) chatbotHours = JSON.parse(hoursRaw) } catch { /* ignore */ }

    const { db } = await import('@/db')
    const { clients, invoices: invoicesTable } = await import('@/db/schema')
    const { eq, sql } = await import('drizzle-orm')

    const records = await db.select().from(clients).where(eq(clients.email, email))
    if (records.length === 0) return // setup wizard handles first creation
    const current = records[0]

    // Validate invoicing enable: Real Decreto 1619/2012 art. 6 requires the
    // emisor block (name + NIF + full postal address) before we're allowed to
    // issue any fiscal doc. Without all five fields we force the toggle to
    // false — the UI will re-render with invoicing off and the user will see
    // the warning asking them to complete their address.
    const canEnableInvoicing =
      fiscalName.trim().length > 0 &&
      fiscalNif.trim().length > 0 &&
      fiscalAddress.trim().length > 0 &&
      fiscalPostalCode.trim().length > 0 &&
      fiscalCity.trim().length > 0
    const invoicingToPersist = invoicingEnabled && canEnableInvoicing

    // Next-number lock: if already emitted invoices, never accept a rewound
    // value — use the current counter. If no invoices yet, accept the user's
    // input (clamped to >= 1).
    const [countRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(invoicesTable)
      .where(eq(invoicesTable.clientId, current.id))
    const alreadyEmitted = Number(countRow?.n ?? 0) > 0
    let invoiceNumberNext = current.invoiceNumberNext
    if (!alreadyEmitted) {
      const parsed = parseInt(invoiceNumberNextRaw, 10)
      if (!isNaN(parsed) && parsed >= 1) invoiceNumberNext = parsed
    }

    const ivaRate = parseInt(ivaRateRaw, 10)
    const ivaRateSafe = [0, 4, 10, 21].includes(ivaRate) ? ivaRate : current.ivaRate

    const slotStep = parseInt(slotStepRaw, 10)
    const slotStepSafe = [15, 30, 45].includes(slotStep) ? slotStep : current.slotStepMinutes

    await db
      .update(clients)
      .set({
        businessName: businessName || current.businessName,
        whatsappNumber: whatsappNumber || null,
        phone: whatsappNumber || current.phone,
        address: address || null,
        chatbotServices: chatbotServices ?? current.chatbotServices,
        // booksyServices kept as it was — its content was replaced by the
        // `barbers` table. This field is a legacy holdover and new writes
        // never touch it (the team tab lives in BarbersManager).
        chatbotHours: chatbotHours ?? current.chatbotHours,
        // Invoicing
        invoicingEnabled: invoicingToPersist,
        fiscalName: fiscalName || null,
        fiscalNif: fiscalNif || null,
        fiscalAddress: fiscalAddress || null,
        fiscalCity: fiscalCity || null,
        fiscalPostalCode: fiscalPostalCode || null,
        ivaRate: ivaRateSafe,
        slotStepMinutes: slotStepSafe,
        invoiceNumberPrefix: invoiceNumberPrefix,
        invoiceNumberNext,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, current.id))

    // Team is now managed by BarbersManager via /api/barbers — no legacy
    // sync needed here.

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard/negocio')
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <AjustesBreadcrumb current="Tu barbería" />
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Tu barbería</h1>
        <p className="text-ink-2">Datos, servicios, equipo, horario y facturación con los que opera tu asistente.</p>
      </div>

      <NegocioForm
        clientId={client.id}
        initial={{
          businessName: client.businessName || '',
          whatsappNumber: client.whatsappNumber || '',
          phone: client.phone || '',
          address: client.address || '',
          services,
          hours,
          slotStepMinutes: client.slotStepMinutes,
          blockedDates,
          invoicing: {
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
          },
          connect: {
            status: client.stripeConnectStatus,
            accountId: client.stripeConnectAccountId,
            activatedAt: client.stripeConnectActivatedAt
              ? client.stripeConnectActivatedAt.toISOString()
              : null,
          },
          tips: {
            tipsEnabled: client.tipsEnabled,
            tipsSuggestedCents: client.tipsSuggestedCents || [200, 300, 500],
            connectActive: client.stripeConnectStatus === 'active',
          },
        }}
        save={saveBusiness}
      />
    </div>
  )
}
