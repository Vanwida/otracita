export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import NegocioSettings from './_components/NegocioSettings'
import type { HoursMap } from '@/app/dashboard/_components/HoursEditor'
import AreaShell from '@/app/dashboard/_components/AreaShell'
import AreaContent from '@/app/dashboard/_components/AreaContent'

// -----------------------------------------------------------------------------
// /dashboard/ajustes — pestaña NEGOCIO (índice del área Ajustes).
//
// Contrato de IA: Ajustes = Negocio · Pagos · Reservas online · Recepcionista
// IA · Suscripción · App · Ayuda. Negocio es el índice. Contenido movido 1:1
// desde el antiguo /dashboard/negocio (NegocioForm + server action
// saveBusiness intacta; revalidatePath actualizado a /dashboard/ajustes).
// /dashboard/negocio → redirect aquí. LÓGICA DE SERVIDOR INTACTA.
// -----------------------------------------------------------------------------

import { isServiceColorToken, type ServiceColorToken } from '@/lib/service-colors'

interface ServiceItem {
  name: string
  duration: string | number
  price: string | number
  description?: string
  featured?: boolean
  colorToken?: ServiceColorToken
}

export default async function AjustesNegocioPage() {
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

    // Sanea colorToken contra la whitelist. Nunca confiamos en el JSON
    // entrante: `chatbotServices` es jsonb sin schema en Postgres, así que
    // si alguien manda `colorToken: "rm -rf"` lo silenciamos antes de
    // guardar. Los consumidores ven el campo limpio o ausente.
    if (Array.isArray(chatbotServices)) {
      chatbotServices = chatbotServices.map((raw) => {
        if (typeof raw !== 'object' || raw === null) return raw
        const svc = raw as Record<string, unknown>
        if ('colorToken' in svc && !isServiceColorToken(svc.colorToken)) {
          // Elimina el campo en vez de forzar default — así el consumidor
          // aplica su propio fallback (DEFAULT_SERVICE_COLOR vive en
          // src/lib/service-colors.ts).
          const sanitized = { ...svc }
          delete sanitized.colorToken
          return sanitized
        }
        return svc
      })
    }

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
    revalidatePath('/dashboard/ajustes')
  }

  return (
    // Las tabs horizontales (Negocio · Pagos · Reservas · Recepcionista)
    // las monta AreaShell — siempre visibles en cabecera. AreaContent en
    // modo "region" deja el scroll interno (mobile stack) sin tocar las
    // tabs. La pestaña Negocio usa grid 2-col + SlideOver para edición:
    // en desktop cabe en viewport, en mobile el stack es compacto y la
    // edición no añade scroll porque vive en panel lateral.
    <AreaShell area="ajustes">
      <AreaContent scroll="region" maxWidth="6xl">
        <NegocioSettings
          clientId={client.id}
          publicSlug={client.publicSlug}
          publicEnabled={client.publicEnabled}
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
      </AreaContent>
    </AreaShell>
  )
}
