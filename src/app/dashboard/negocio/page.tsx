export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import NegocioForm from '@/app/dashboard/_components/NegocioForm'
import type { HoursMap } from '@/app/dashboard/_components/HoursEditor'
import HubBreadcrumb from '@/app/dashboard/_components/HubBreadcrumb'
import { hasFeature } from '@/lib/billing/tier'

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

  /**
   * Server action — guarda los campos básicos del negocio (info, servicios,
   * horario, slotStep). Los datos fiscales y la config de Stripe Connect
   * viven ahora en /dashboard/caja con sus propios endpoints
   * (/api/invoicing/config y /api/stripe/connect/*) — no se gestionan
   * desde aquí.
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
    const slotStepRaw = (formData.get('slotStepMinutes') as string | null) ?? ''

    let chatbotServices: unknown = null
    let chatbotHours: unknown = null
    try { if (servicesRaw) chatbotServices = JSON.parse(servicesRaw) } catch { /* ignore */ }
    try { if (hoursRaw) chatbotHours = JSON.parse(hoursRaw) } catch { /* ignore */ }

    const { db } = await import('@/db')
    const { clients } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')

    const records = await db.select().from(clients).where(eq(clients.email, email))
    if (records.length === 0) return // setup wizard handles first creation
    const current = records[0]

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
        // `barbers` table. Field is legacy holdover; new writes never touch it.
        chatbotHours: chatbotHours ?? current.chatbotHours,
        slotStepMinutes: slotStepSafe,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, current.id))

    // Team is managed by BarbersManager via /api/barbers — no sync needed here.

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard/negocio')
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <HubBreadcrumb current="Tu barbería" />
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Tu barbería</h1>
        <p className="text-ink-2">Datos, servicios, equipo y horario con los que opera tu asistente.</p>
      </div>

      <NegocioForm
        clientId={client.id}
        bonusesEnabled={hasFeature(client, 'teamBonuses')}
        payrollEnabled={hasFeature(client, 'controlFinanciero')}
        initial={{
          businessName: client.businessName || '',
          whatsappNumber: client.whatsappNumber || '',
          phone: client.phone || '',
          address: client.address || '',
          services,
          hours,
          slotStepMinutes: client.slotStepMinutes,
          blockedDates,
        }}
        save={saveBusiness}
      />
    </div>
  )
}
