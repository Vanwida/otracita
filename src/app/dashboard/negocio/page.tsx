export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, invoices } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import NegocioForm from '@/app/dashboard/_components/NegocioForm'
import type { HoursMap } from '@/app/dashboard/_components/HoursEditor'

interface ServiceItem {
  name: string
  duration: string | number
  price: string | number
}

interface BarberItem {
  name: string
}

export default async function NegocioPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const services = (client.chatbotServices as ServiceItem[] | null) || []
  const barbers = ((client.booksyServices as BarberItem[] | null) || []).map((b) => b.name).filter(Boolean)
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
    const barbersRaw = (formData.get('barbers') as string | null) ?? ''
    const hoursRaw = (formData.get('hours') as string | null) ?? ''

    // Invoicing fields — only present if the "Facturación" tab was touched.
    const invoicingEnabled = formData.get('invoicingEnabled') === 'on'
    const fiscalName = (formData.get('fiscalName') as string | null) ?? ''
    const fiscalNif = (formData.get('fiscalNif') as string | null) ?? ''
    const fiscalAddress = (formData.get('fiscalAddress') as string | null) ?? ''
    const fiscalCity = (formData.get('fiscalCity') as string | null) ?? ''
    const fiscalPostalCode = (formData.get('fiscalPostalCode') as string | null) ?? ''
    const ivaRateRaw = (formData.get('ivaRate') as string | null) ?? ''
    const invoiceNumberPrefix = (formData.get('invoiceNumberPrefix') as string | null) ?? ''
    const invoiceNumberNextRaw = (formData.get('invoiceNumberNext') as string | null) ?? ''

    let chatbotServices: unknown = null
    let booksyServicesBarbers: unknown = null
    let chatbotHours: unknown = null
    try { if (servicesRaw) chatbotServices = JSON.parse(servicesRaw) } catch { /* ignore */ }
    try {
      if (barbersRaw) {
        const names = JSON.parse(barbersRaw) as string[]
        booksyServicesBarbers = names.filter((n) => n && n.trim()).map((name) => ({ name }))
      }
    } catch { /* ignore */ }
    try { if (hoursRaw) chatbotHours = JSON.parse(hoursRaw) } catch { /* ignore */ }

    const { db } = await import('@/db')
    const { clients, invoices: invoicesTable } = await import('@/db/schema')
    const { eq, sql } = await import('drizzle-orm')

    const records = await db.select().from(clients).where(eq(clients.email, email))
    if (records.length === 0) return // setup wizard handles first creation
    const current = records[0]

    // Validate invoicing enable: only flip to true if required fields are set.
    const canEnableInvoicing = fiscalName.trim().length > 0 && fiscalNif.trim().length > 0
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

    await db
      .update(clients)
      .set({
        businessName: businessName || current.businessName,
        whatsappNumber: whatsappNumber || null,
        phone: whatsappNumber || current.phone,
        address: address || null,
        chatbotServices: chatbotServices ?? current.chatbotServices,
        booksyServices: booksyServicesBarbers ?? current.booksyServices,
        chatbotHours: chatbotHours ?? current.chatbotHours,
        // Invoicing
        invoicingEnabled: invoicingToPersist,
        fiscalName: fiscalName || null,
        fiscalNif: fiscalNif || null,
        fiscalAddress: fiscalAddress || null,
        fiscalCity: fiscalCity || null,
        fiscalPostalCode: fiscalPostalCode || null,
        ivaRate: ivaRateSafe,
        invoiceNumberPrefix: invoiceNumberPrefix,
        invoiceNumberNext,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, current.id))

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard/negocio')
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Mi negocio</h1>
        <p className="text-ink-2">Los datos, servicios, equipo, horario y facturación con los que opera tu bot.</p>
      </div>

      <NegocioForm
        clientId={client.id}
        initial={{
          businessName: client.businessName || '',
          whatsappNumber: client.whatsappNumber || '',
          phone: client.phone || '',
          address: client.address || '',
          services,
          barbers,
          hours,
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
        }}
        save={saveBusiness}
      />
    </div>
  )
}
