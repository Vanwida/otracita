export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { db } from '@/db'
import { clients, barbers as barbersTable, pushSubscriptions, invoices } from '@/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  Store,
  Bot,
  Smartphone,
  Gift,
  FileText,
  CreditCard,
  HelpCircle,
  ChevronRight,
  Users,
  Scissors,
  Clock,
  MapPin,
  Phone,
  Globe,
  MessageCircle,
  Mail,
  Bell,
  type LucideIcon,
} from 'lucide-react'
import { PLANS, type PlanId } from '@/lib/stripe'
import type { LoyaltyConfig, LoyaltyReward } from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// /dashboard/ajustes — hub de configuración con tarjetas ricas que muestran
// el estado real de cada área del negocio.
//
// Cada tarjeta tiene la misma estructura:
//   1. Header: icono + título + StatusPill (esquina derecha)
//   2. Cuerpo: 1-2 líneas de info principal (nombre del negocio, número de
//      WhatsApp, URL pública, etc.)
//   3. Chips: 2-4 mini-stats con icono — el barbero ve los datos clave sin
//      tener que entrar a la página.
//
// El barbero objetivo no es técnico: queremos que con un vistazo entienda
// "esto está bien, esto falta, esto puedo mirar".
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

  // Mes actual en zona Madrid para las queries de facturación.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)

  // Queries paralelas — un único round-trip para todos los counters.
  const [barberCountRow, pushCountRow, invoiceStatsRow] = await Promise.all([
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
      .select({
        count: sql<number>`count(*)`,
        totalCents: sql<number>`coalesce(sum(${invoices.totalCents}), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.clientId, client.id),
          gte(invoices.issueDate, monthStart),
          lt(invoices.issueDate, nextMonthStart),
        ),
      )
      .then((rows) => rows[0]),
  ])

  const barberCount = Number(barberCountRow?.n ?? 0)
  const pushCount = Number(pushCountRow?.n ?? 0)
  const invoiceCount = Number(invoiceStatsRow?.count ?? 0)
  const invoiceTotalEur = Number(invoiceStatsRow?.totalCents ?? 0) / 100

  // Servicios configurados (jsonb) → contar nombres no vacíos.
  const services = (client.chatbotServices as ServiceItem[] | null) ?? []
  const serviceCount = Array.isArray(services)
    ? services.filter((s) => typeof s?.name === 'string' && s.name.trim().length > 0).length
    : 0

  // Datos fiscales completos (RD 1619/2012 art. 6).
  const fiscalDataComplete = Boolean(
    client.fiscalName &&
      client.fiscalNif &&
      client.fiscalAddress &&
      client.fiscalCity &&
      client.fiscalPostalCode,
  )

  const hours = (client.chatbotHours as Record<string, string> | null) ?? null
  const horarioSummary = summariseHours(hours)

  const publicUrl = client.publicSlug ? `${SITE_ORIGIN}/b/${client.publicSlug}` : null

  const loyaltyConfig = (client.loyaltyConfig ?? {}) as Partial<LoyaltyConfig>
  const loyaltyHeadline = formatLoyaltyHeadline(client.loyaltyEnabled, client.loyaltyMode, loyaltyConfig)

  const planMeta = PLANS[client.plan as PlanId] ?? null
  const planPriceEur = planMeta ? planMeta.price / 100 : null

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Ajustes</h1>
        <p className="text-ink-2">Todo lo que configuras una vez y se queda funcionando. Un vistazo y sabes qué está activo.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Tu barbería — card "ancla" del negocio */}
        <Card href="/dashboard/negocio" icon={Store} title="Tu barbería" status={{ tone: 'ok', label: 'Configurado' }}>
          <CardLine bold>{client.businessName || '—'}</CardLine>
          {client.address && (
            <CardLine icon={MapPin}>{client.address}</CardLine>
          )}
          <ChipRow>
            <Chip icon={Users}>{barberCount} {barberCount === 1 ? 'barbero' : 'barberos'}</Chip>
            <Chip icon={Scissors}>{serviceCount} {serviceCount === 1 ? 'servicio' : 'servicios'}</Chip>
            {horarioSummary && <Chip icon={Clock}>{horarioSummary}</Chip>}
          </ChipRow>
        </Card>

        {/* Asistente WhatsApp */}
        <Card
          href="/dashboard/bot"
          icon={Bot}
          title="Asistente WhatsApp"
          status={
            client.metaWebhookVerifiedAt
              ? { tone: 'ok', label: 'Conectado' }
              : { tone: 'warn', label: 'Pendiente' }
          }
        >
          {client.whatsappNumber || client.phone ? (
            <CardLine icon={Phone} bold>{client.whatsappNumber || client.phone}</CardLine>
          ) : (
            <CardLine icon={Phone}>Sin número configurado</CardLine>
          )}
          <ChipRow>
            <Chip>Tono: {toneLabel(client.botTone)}</Chip>
            {client.botAllowCancelWhatsapp && <Chip>Cancela por chat</Chip>}
            {client.googleReviewUrl && <Chip>Pide reseñas</Chip>}
          </ChipRow>
        </Card>

        {/* App para clientes */}
        <Card
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
            <CardLine icon={Globe} bold mono>
              {publicUrl.replace(/^https?:\/\//, '')}
            </CardLine>
          ) : (
            <CardLine icon={Globe}>URL pendiente de configurar</CardLine>
          )}
          <ChipRow>
            <Chip icon={Smartphone}>{pushCount} {pushCount === 1 ? 'instalación' : 'instalaciones'}</Chip>
            {client.brandColor && (
              <Chip>
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full mr-1.5 align-middle"
                  style={{ background: client.brandColor }}
                />
                Color
              </Chip>
            )}
            {client.promosEnabled && <Chip icon={Bell}>Promos ON</Chip>}
          </ChipRow>
        </Card>

        {/* Tarjeta de fidelización */}
        <Card
          href="/dashboard/fidelidad"
          icon={Gift}
          title="Tarjeta de fidelización"
          status={
            client.loyaltyEnabled
              ? { tone: 'ok', label: 'Activa' }
              : { tone: 'neutral', label: 'Desactivada' }
          }
        >
          {client.loyaltyEnabled ? (
            <CardLine bold>{loyaltyHeadline}</CardLine>
          ) : (
            <CardLine>Sin programa de fidelidad. Activa para premiar a tus clientes recurrentes.</CardLine>
          )}
          {client.loyaltyEnabled && (
            <ChipRow>
              <Chip>Modo: {client.loyaltyMode === 'points' ? 'puntos' : 'sellos'}</Chip>
              {loyaltyConfig.expirationMonths != null
                ? <Chip>Caduca a {loyaltyConfig.expirationMonths} meses</Chip>
                : <Chip>Sin caducidad</Chip>}
            </ChipRow>
          )}
        </Card>

        {/* Facturación */}
        <Card
          href="/dashboard/facturas"
          icon={FileText}
          title="Facturación"
          status={
            client.invoicingEnabled
              ? { tone: 'ok', label: 'Activa' }
              : fiscalDataComplete
                ? { tone: 'neutral', label: 'Lista' }
                : { tone: 'warn', label: 'Faltan datos' }
          }
        >
          {client.invoicingEnabled ? (
            <CardLine bold>
              {invoiceCount} {invoiceCount === 1 ? 'factura' : 'facturas'} este mes · {invoiceTotalEur.toFixed(2)} €
            </CardLine>
          ) : fiscalDataComplete ? (
            <CardLine>Datos fiscales listos. Activa para empezar a emitir.</CardLine>
          ) : (
            <CardLine>Faltan datos fiscales (NIF, dirección).</CardLine>
          )}
          <ChipRow>
            <Chip>IVA {client.ivaRate}%</Chip>
            {client.invoicingEnabled && (
              <Chip>Prefijo: {client.invoiceNumberPrefix || '—'}</Chip>
            )}
          </ChipRow>
        </Card>

        {/* Tu suscripción */}
        <Card
          href="/dashboard/mi-plan"
          icon={CreditCard}
          title="Tu suscripción"
          status={subscriptionStatus(client.status)}
        >
          <CardLine bold>
            {planMeta?.name ?? client.plan}
            {planPriceEur != null && (
              <span className="text-ink-3 font-normal"> · {planPriceEur.toFixed(2)} €/mes</span>
            )}
          </CardLine>
          <ChipRow>
            {client.stripeConnectStatus === 'active' && <Chip tone="ok">Cobros online</Chip>}
            {client.stripeConnectStatus !== 'active' && client.stripeConnectStatus !== 'none' && (
              <Chip tone="warn">Cobros: {client.stripeConnectStatus}</Chip>
            )}
            {client.tipsEnabled && <Chip>Propinas ON</Chip>}
          </ChipRow>
        </Card>

        {/* Ayuda */}
        <Card href="/dashboard/ayuda" icon={HelpCircle} title="Ayuda">
          <CardLine>Soporte directo y preguntas frecuentes.</CardLine>
          <ChipRow>
            <Chip icon={MessageCircle}>WhatsApp +34 644 288 663</Chip>
            <Chip icon={Mail}>soporte@otracita.es</Chip>
          </ChipRow>
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks — diseño visual de las tarjetas
// ─────────────────────────────────────────────────────────────────────────────

type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

interface CardProps {
  href: string
  icon: LucideIcon
  title: string
  status?: { tone: Tone; label: string }
  children: React.ReactNode
}

function Card({ href, icon: Icon, title, status, children }: CardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 hover:border-line-strong hover:shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-brand-softer text-brand-strong">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <h2 className="font-semibold text-ink text-base leading-tight pt-1.5">{title}</h2>
          {status && <StatusPill tone={status.tone} label={status.label} />}
        </div>
        <ChevronRight className="h-4 w-4 text-ink-3 mt-2 shrink-0 group-hover:text-ink transition-colors" />
      </div>
      <div className="flex flex-col gap-1.5 pl-14">
        {children}
      </div>
    </Link>
  )
}

function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const styles =
    tone === 'ok' ? 'bg-success/10 text-success border-success/30'
    : tone === 'warn' ? 'bg-warning/10 text-warning border-warning/30'
    : tone === 'danger' ? 'bg-danger/10 text-danger border-danger/30'
    : 'bg-overlay text-ink-3 border-line'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${styles}`}>
      {label}
    </span>
  )
}

interface CardLineProps {
  icon?: LucideIcon
  bold?: boolean
  mono?: boolean
  children: React.ReactNode
}

function CardLine({ icon: Icon, bold, mono, children }: CardLineProps) {
  return (
    <p className={`flex items-center gap-1.5 text-sm ${bold ? 'text-ink font-medium' : 'text-ink-2'} ${mono ? 'font-mono text-xs' : ''}`}>
      {Icon && <Icon className="h-3.5 w-3.5 text-ink-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </p>
  )
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5 mt-1">{children}</div>
}

interface ChipProps {
  icon?: LucideIcon
  tone?: Tone
  children: React.ReactNode
}

function Chip({ icon: Icon, tone, children }: ChipProps) {
  const styles =
    tone === 'ok' ? 'bg-success/10 text-success border-success/30'
    : tone === 'warn' ? 'bg-warning/10 text-warning border-warning/30'
    : tone === 'danger' ? 'bg-danger/10 text-danger border-danger/30'
    : 'bg-overlay/60 text-ink-2 border-line'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
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

function subscriptionStatus(status: string): { tone: Tone; label: string } {
  if (status === 'active') return { tone: 'ok', label: 'Activa' }
  if (status === 'trialing') return { tone: 'ok', label: 'Prueba' }
  if (status === 'past_due') return { tone: 'warn', label: 'Pago pendiente' }
  if (status === 'cancelled') return { tone: 'danger', label: 'Cancelada' }
  if (status === 'pending') return { tone: 'warn', label: 'Pendiente' }
  return { tone: 'neutral', label: status }
}

/**
 * Resume el programa de fidelidad en una línea humana, tipo "Cada 10 cortes
 * regalas 1" o "1 € = 1 punto · canjeas a partir de 100 pts".
 */
function formatLoyaltyHeadline(
  enabled: boolean,
  mode: string,
  config: Partial<LoyaltyConfig>,
): string {
  if (!enabled) return 'Desactivada'
  if (mode === 'stamps') {
    const stampsCfg = config as Partial<{ stampsNeeded: number; reward: LoyaltyReward }>
    const n = stampsCfg.stampsNeeded ?? 0
    const reward = formatReward(stampsCfg.reward)
    if (n > 0 && reward) return `Cada ${n} visitas: ${reward}`
    if (n > 0) return `Cada ${n} visitas`
    return 'Por configurar'
  }
  if (mode === 'points') {
    const pointsCfg = config as Partial<{
      euroToPoints: number
      redeemTiers: Array<{ pointsCost: number; reward: LoyaltyReward }>
    }>
    const ratio = pointsCfg.euroToPoints ?? 1
    const firstTier = pointsCfg.redeemTiers?.[0]
    if (firstTier) return `${ratio} pt por € · ${firstTier.pointsCost} pts → ${formatReward(firstTier.reward)}`
    return `${ratio} pt por €`
  }
  return 'Configurado'
}

function formatReward(reward: LoyaltyReward | undefined): string {
  if (!reward) return ''
  if (reward.type === 'service') return reward.serviceName ? `${reward.serviceName} gratis` : 'servicio gratis'
  if (reward.type === 'discount_amount' && typeof reward.cents === 'number') {
    return `${(reward.cents / 100).toFixed(0)} € de descuento`
  }
  if (reward.type === 'discount_pct' && typeof reward.pct === 'number') {
    return reward.pct === 100 ? 'gratis' : `${reward.pct}% off`
  }
  return ''
}
