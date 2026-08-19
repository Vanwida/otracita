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
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard'
import { loadAllShopOverrides } from '@/lib/shop-day-overrides'

// -----------------------------------------------------------------------------
// /dashboard/ajustes — pestaña NEGOCIO (índice del área Ajustes).
//
// Contrato de IA: Ajustes = Negocio · Pagos · Reservas online · Recepcionista
// IA · Suscripción · App · Ayuda. Negocio es el índice. Contenido movido 1:1
// desde el antiguo /dashboard/negocio (NegocioForm + server action
// saveBusiness intacta; revalidatePath actualizado a /dashboard/ajustes).
// /dashboard/negocio → redirect aquí. LÓGICA DE SERVIDOR INTACTA.
// -----------------------------------------------------------------------------

import {
  isServiceColorToken,
  isCustomHex,
  type ServiceColorToken,
} from '@/lib/service-colors'
import {
  normalizeServicePrice,
  servicePriceError,
} from '@/lib/service-price'

interface ServiceItem {
  name: string
  duration: string | number
  price: string | number
  description?: string
  featured?: boolean
  /** Precio 0 € intencional (U-12). Sin el flag, el precio es obligatorio. */
  courtesy?: boolean
  /** Token canónico de la paleta o hex `#RRGGBB` custom. */
  colorToken?: ServiceColorToken | string
}

export default async function AjustesNegocioPage() {
  const lockOverlay = await renderAdminLockGuard('ajustes')
  if (lockOverlay) return lockOverlay

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const services = (client.chatbotServices as ServiceItem[] | null) || []
  const hours = (client.chatbotHours as HoursMap | null) || null
  const blockedDates = (client.blockedDates as string[]) || []
  const dayOverrides = await loadAllShopOverrides(client.id)

  /**
   * Server action — guarda los campos básicos del negocio (info, servicios,
   * horario, slotStep). Los datos fiscales y la config de Stripe Connect
   * viven ahora en /dashboard/caja con sus propios endpoints
   * (/api/invoicing/config y /api/stripe/connect/*) — no se gestionan
   * desde aquí.
   *
   * Devuelve `{ error }` cuando el guardado se rechaza (p.ej. un servicio a
   * 0 € sin marcar cortesía) — NegocioSettings lo convierte en toast. Un
   * `throw` no serviría: Next redacta el mensaje de los server actions en
   * producción y el barbero vería un error genérico.
   */
  async function saveBusiness(formData: FormData): Promise<{ error?: string } | void> {
    'use server'

    const { auth: serverAuth } = await import('@/lib/auth/server')
    const { headers: getHeaders } = await import('next/headers')
    const session = await serverAuth.api.getSession({ headers: await getHeaders() })
    if (!session?.user?.email) return { error: 'Sesión caducada. Vuelve a entrar.' }

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

    // Sanea colorToken contra la whitelist y aplica la regla de precio.
    // Nunca confiamos en el JSON entrante: `chatbotServices` es jsonb sin
    // schema en Postgres, así que si alguien manda `colorToken: "rm -rf"` lo
    // silenciamos antes de guardar. Aceptamos token canónico (red/blue/...)
    // O hex `#RRGGBB` (custom picker). Cualquier otro valor → se elimina el
    // campo y el consumidor cae al DEFAULT.
    //
    // Precio (U-12): > 0 salvo `courtesy`. El form ya lo bloquea en cliente;
    // aquí es la última puerta — si algo llega a 0 sin marcar cortesía, NO
    // guardamos nada y devolvemos el error para que la save bar lo enseñe.
    if (Array.isArray(chatbotServices)) {
      const cleaned: unknown[] = []
      for (const raw of chatbotServices) {
        if (typeof raw !== 'object' || raw === null) {
          cleaned.push(raw)
          continue
        }
        const svc = { ...(raw as Record<string, unknown>) }

        // Estricto a propósito: el flag tiene que venir explícito. La
        // inferencia «0 € legacy ⇒ cortesía» vive en el cliente
        // (ServicesManager.withDefaults), que ya manda el booleano.
        const courtesy = svc.courtesy === true
        const priceError = servicePriceError(svc.price, courtesy)
        if (priceError) {
          // Nombramos el servicio: el barbero puede tener 20 en la lista y el
          // que falla puede ser uno viejo que ni ha tocado en esta sesión.
          const label = typeof svc.name === 'string' && svc.name.trim()
            ? `«${svc.name.trim()}»: `
            : ''
          return { error: `${label}${priceError}` }
        }
        // `normalizeServicePrice` ya redondea a 2 decimales de verdad: 12,50
        // no puede convertirse en 13 (L-05). Devuelve number, nunca string —
        // `resolveServiceConfig` exige `typeof price === 'number'` y un
        // "12.5" string se traduciría en una cita sin precio, en silencio.
        svc.price = normalizeServicePrice(svc.price, courtesy)
        svc.courtesy = courtesy
        if ('duration' in svc) {
          const d = Number(svc.duration)
          svc.duration = Number.isFinite(d) ? Math.round(d) : 30
        }

        if ('colorToken' in svc) {
          const ct = svc.colorToken
          if (isCustomHex(ct)) {
            // Normaliza a minúsculas — formato canónico que persistimos.
            svc.colorToken = (ct as string).toLowerCase()
          } else if (!isServiceColorToken(ct)) {
            delete svc.colorToken
          }
        }
        cleaned.push(svc)
      }
      chatbotServices = cleaned
    }

    const { db } = await import('@/db')
    const { clients } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')

    const records = await db.select().from(clients).where(eq(clients.email, email))
    if (records.length === 0) return { error: 'Cuenta no encontrada.' } // setup wizard handles first creation
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
    // La PWA pública /[slug] renderiza estos mismos campos (horario, servicios,
    // info del negocio). Sin revalidate, Next puede servir una versión cacheada
    // hasta la siguiente visita "fría" del cliente — por eso el horario "no se
    // actualiza nunca" desde el punto de vista del cliente final. Aquí marcamos
    // el slug pattern como stale para que el primer hit re-renderice fresh.
    if (current.publicSlug) {
      revalidatePath(`/${current.publicSlug}`)
    }
    revalidatePath('/[slug]', 'page')
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
            dayOverrides,
          }}
          save={saveBusiness}
        />
      </AreaContent>
    </AreaShell>
  )
}
