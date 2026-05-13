export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, barbers as barbersTable, pushSubscriptions, invoices } from '@/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Store,
  Bot,
  Smartphone,
  CreditCard,
  HelpCircle,
  Users,
  Scissors,
  Clock,
  MapPin,
  Phone,
  Globe,
  MessageCircle,
  Mail,
  Bell,
  FileText,
  ShieldCheck,
} from 'lucide-react'
import { PLANS, type PlanId } from '@/lib/stripe'
import { HubCard, HubCardLine, HubChipRow, HubChip, type HubTone } from '../_components/HubCard'

// -----------------------------------------------------------------------------
// /dashboard/ajustes — hub de configuración del negocio.
//
// Sólo cosas de "set and forget": cómo se llama tu barbería, cómo está el bot,
// cómo se ve la app pública, qué plan tienes, dónde pedir ayuda.
//
// Las features de crecimiento (reseñas, fidelidad, marketing) viven en
// /dashboard/crecer — son un tab aparte porque tienen una cadencia
// distinta (semanal vs mensual/setup).
// -----------------------------------------------------------------------------

interface ServiceItem {
  name?: string
  duration?: number | string
  price?: number | string
}

const SITE_ORIGIN = 'https://otracita.es'

export default async function AjustesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Queries paralelas — un único round-trip para los counters que necesitan
  // las cards del hub (barberos activos · push installs · facturas del mes).
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = now.getMonth() === 11
    ? `${now.getFullYear() + 1}-01-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`

  const [barberCountRow, pushCountRow, invoiceCountRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(barbersTable)
      .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
      .then((rows) => rows[0]),
    db
      .select({ n: sql<number>`count(*)` })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.clientId, client.id), eq(pushSubscriptions.enabled, true)))
      .then((rows) => rows[0]),
    db
      .select({ n: sql<number>`count(*)` })
      .from(invoices)
      .where(and(
        eq(invoices.clientId, client.id),
        gte(invoices.issueDate, monthStart),
        lt(invoices.issueDate, nextMonth),
      ))
      .then((rows) => rows[0]),
  ])

  const barberCount = Number(barberCountRow?.n ?? 0)
  const pushCount = Number(pushCountRow?.n ?? 0)
  const invoiceCount = Number(invoiceCountRow?.n ?? 0)

  // Servicios configurados (jsonb) → contar nombres no vacíos.
  const services = (client.chatbotServices as ServiceItem[] | null) ?? []
  const serviceCount = Array.isArray(services)
    ? services.filter((s) => typeof s?.name === 'string' && s.name.trim().length > 0).length
    : 0

  const hours = (client.chatbotHours as Record<string, string> | null) ?? null
  const horarioSummary = summariseHours(hours)

  const publicUrl = client.publicSlug ? `${SITE_ORIGIN}/b/${client.publicSlug}` : null

  const planMeta = PLANS[client.plan as PlanId] ?? null
  const planPriceEur = planMeta ? planMeta.price / 100 : null

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Ajustes</h1>
        <p className="text-ink-2">Configuración del negocio. Lo defines una vez y se queda así.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Tu barbería — card "ancla" del negocio */}
        <HubCard href="/dashboard/negocio" icon={Store} title="Tu barbería" status={{ tone: 'ok', label: 'Configurado' }}>
          <HubCardLine bold>{client.businessName || '—'}</HubCardLine>
          {client.address && (
            <HubCardLine icon={MapPin}>{client.address}</HubCardLine>
          )}
          <HubChipRow>
            <HubChip icon={Users}>{barberCount} {barberCount === 1 ? 'barbero' : 'barberos'}</HubChip>
            <HubChip icon={Scissors}>{serviceCount} {serviceCount === 1 ? 'servicio' : 'servicios'}</HubChip>
            {horarioSummary && <HubChip icon={Clock}>{horarioSummary}</HubChip>}
          </HubChipRow>
        </HubCard>

        {/* Asistente WhatsApp — "Conectado" si tiene phone_number_id de Meta
            (el access token tiene fallback al global, así que el phone es el
            único requisito real para que el bot pueda enviar mensajes).
            metaWebhookVerifiedAt es admin-tracking interno, no señal útil
            para el barbero. */}
        <HubCard
          href="/dashboard/bot"
          icon={Bot}
          title="Asistente WhatsApp"
          status={
            client.whatsappPhoneNumberId
              ? { tone: 'ok', label: 'Conectado' }
              : { tone: 'warn', label: 'Sin conectar' }
          }
        >
          {client.whatsappNumber || client.phone ? (
            <HubCardLine icon={Phone} bold>{client.whatsappNumber || client.phone}</HubCardLine>
          ) : (
            <HubCardLine icon={Phone}>Sin número configurado</HubCardLine>
          )}
          <HubChipRow>
            <HubChip>Tono: {toneLabel(client.botTone)}</HubChip>
            {client.botAllowCancelWhatsapp && <HubChip>Cancela por chat</HubChip>}
            {client.googleReviewUrl && <HubChip>Pide reseñas</HubChip>}
          </HubChipRow>
        </HubCard>

        {/* App para clientes */}
        <HubCard
          href="/dashboard/app"
          icon={Smartphone}
          title="App para clientes"
          status={
            publicUrl && client.publicEnabled
              ? { tone: 'ok', label: 'Pública' }
              : { tone: 'warn', label: 'Sin publicar' }
          }
        >
          {publicUrl ? (
            <HubCardLine icon={Globe} bold mono>
              {publicUrl.replace(/^https?:\/\//, '')}
            </HubCardLine>
          ) : (
            <HubCardLine icon={Globe}>URL pendiente de configurar</HubCardLine>
          )}
          <HubChipRow>
            <HubChip icon={Smartphone}>{pushCount} {pushCount === 1 ? 'instalación' : 'instalaciones'}</HubChip>
            {client.brandColor && (
              <HubChip>
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full mr-1.5 align-middle"
                  style={{ background: client.brandColor }}
                />
                Color
              </HubChip>
            )}
            {client.promosEnabled && <HubChip icon={Bell}>Promos ON</HubChip>}
          </HubChipRow>
        </HubCard>

        {/* Facturación — VeriFactu + tickets emitidos */}
        <HubCard
          href="/dashboard/facturas"
          icon={FileText}
          title="Facturación"
          status={
            client.invoicingEnabled
              ? { tone: 'ok', label: 'Activa' }
              : { tone: 'neutral', label: 'Desactivada' }
          }
        >
          {client.invoicingEnabled ? (
            <HubCardLine bold>
              {invoiceCount > 0
                ? `${invoiceCount} ${invoiceCount === 1 ? 'factura' : 'facturas'} este mes`
                : 'Sin facturas este mes'}
            </HubCardLine>
          ) : (
            <HubCardLine>Emite tickets y facturas con cumplimiento VeriFactu.</HubCardLine>
          )}
          {client.invoicingEnabled && (
            <HubChipRow>
              <HubChip icon={ShieldCheck}>VeriFactu</HubChip>
              <HubChip>Libro de facturas</HubChip>
            </HubChipRow>
          )}
        </HubCard>

        {/* Tu suscripción */}
        <HubCard
          href="/dashboard/mi-plan"
          icon={CreditCard}
          title="Tu suscripción"
          status={subscriptionStatus(client.status)}
        >
          <HubCardLine bold>
            {planMeta?.name ?? client.plan}
            {planPriceEur != null && (
              <span className="text-ink-3 font-normal"> · {planPriceEur.toFixed(2)} €/mes</span>
            )}
          </HubCardLine>
          <HubChipRow>
            {client.stripeConnectStatus === 'active' && <HubChip tone="ok">Cobros online</HubChip>}
            {client.stripeConnectStatus !== 'active' && client.stripeConnectStatus !== 'none' && (
              <HubChip tone="warn">Cobros: {client.stripeConnectStatus}</HubChip>
            )}
            {client.tipsEnabled && <HubChip>Propinas ON</HubChip>}
          </HubChipRow>
        </HubCard>

        {/* Ayuda */}
        <HubCard href="/dashboard/ayuda" icon={HelpCircle} title="Ayuda">
          <HubCardLine>Soporte directo y preguntas frecuentes.</HubCardLine>
          <HubChipRow>
            <HubChip icon={MessageCircle}>WhatsApp +34 644 288 663</HubChip>
            <HubChip icon={Mail}>soporte@otracita.es</HubChip>
          </HubChipRow>
        </HubCard>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de preview
// ─────────────────────────────────────────────────────────────────────────────

function summariseHours(hours: Record<string, string> | null): string {
  if (!hours) return ''
  const order: Array<{ key: string; short: string }> = [
    { key: 'monday', short: 'L' },
    { key: 'tuesday', short: 'M' },
    { key: 'wednesday', short: 'X' },
    { key: 'thursday', short: 'J' },
    { key: 'friday', short: 'V' },
    { key: 'saturday', short: 'S' },
    { key: 'sunday', short: 'D' },
  ]
  const spanishMap: Record<string, string> = {
    monday: 'lunes', tuesday: 'martes', wednesday: 'miercoles', thursday: 'jueves',
    friday: 'viernes', saturday: 'sabado', sunday: 'domingo',
  }
  const ranges = order.map(({ key, short }) => {
    const value = hours[key] ?? hours[spanishMap[key]] ?? null
    if (!value) return { short, range: null as string | null }
    const cleaned = String(value).trim().toLowerCase()
    if (!cleaned || cleaned === 'closed' || cleaned === 'cerrado') {
      return { short, range: null }
    }
    return { short, range: cleaned.replace(/\s+/g, '') }
  })

  const openDays = ranges.filter((r) => r.range !== null)
  if (openDays.length === 0) return 'Sin horario'
  const uniqueRanges = new Set(openDays.map((r) => r.range))
  if (uniqueRanges.size === 1) {
    const range = openDays[0].range as string
    const compactRange = range.replace(/:00/g, '').replace('-', '–')
    if (openDays.length === 7) return `Todos ${compactRange}`
    if (openDays.length === 1) return `${openDays[0].short} ${compactRange}`
    return `${openDays[0].short}–${openDays[openDays.length - 1].short} ${compactRange}`
  }
  return `${openDays.length} días/sem`
}

function toneLabel(tone: string | null): string {
  if (tone === 'formal') return 'formal'
  if (tone === 'neutro') return 'neutro'
  return 'cercano'
}

function subscriptionStatus(status: string): { tone: HubTone; label: string } {
  if (status === 'active') return { tone: 'ok', label: 'Activa' }
  if (status === 'trialing') return { tone: 'ok', label: 'Prueba' }
  if (status === 'past_due') return { tone: 'warn', label: 'Pago pendiente' }
  if (status === 'cancelled') return { tone: 'danger', label: 'Cancelada' }
  if (status === 'pending') return { tone: 'warn', label: 'Pendiente' }
  return { tone: 'neutral', label: status }
}
