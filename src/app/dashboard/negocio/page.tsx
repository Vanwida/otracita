export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
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

  /**
   * Server action — saves the core business fields. Tenant is resolved from
   * the session (never from the form payload) so this is safe even though the
   * form lives in a client component.
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
    const { clients } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')

    const records = await db.select().from(clients).where(eq(clients.email, email))
    if (records.length === 0) return // can't create from this path — setup wizard handles first creation

    await db
      .update(clients)
      .set({
        businessName: businessName || records[0].businessName,
        whatsappNumber: whatsappNumber || null,
        phone: whatsappNumber || records[0].phone,
        address: address || null,
        chatbotServices: chatbotServices ?? records[0].chatbotServices,
        booksyServices: booksyServicesBarbers ?? records[0].booksyServices,
        chatbotHours: chatbotHours ?? records[0].chatbotHours,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, records[0].id))

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard/negocio')
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Mi negocio</h1>
        <p className="text-ink-2">Los datos, servicios, equipo y horario con los que opera tu bot.</p>
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
        }}
        save={saveBusiness}
      />
    </div>
  )
}
