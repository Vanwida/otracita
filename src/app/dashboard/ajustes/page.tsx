export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { db } from '@/db'
import { clients, barbers as barbersTable, pushSubscriptions } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
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
  AlertCircle,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'

// -----------------------------------------------------------------------------
// /dashboard/ajustes — hub de configuración con tarjetas que muestran el
// estado actual de cada área. El barbero entra aquí desde el menú principal
// y, de un vistazo, ve qué está activo, qué falta y dónde tiene que ir.
//
// Cada tarjeta linka a la página completa donde se configura la sección.
// El preview de estado se calcula en el servidor a partir de queries
// paralelas sobre el cliente actual — coste ~1 round-trip al DB.
//
// Filosofía "monkey-proof": si todo está OK, los previews se ven verdes y
// el barbero no necesita entrar; si algo falta, una alerta amarilla/roja
// le grita "esto, ve a esto". Sin tener que navegar para descubrir.
// -----------------------------------------------------------------------------

export default async function AjustesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Queries paralelas: contador de barberos activos + contador de instalaciones PWA.
  const [barberCountRow, pushCountRow] = await Promise.all([
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
  ])

  const barberCount = Number(barberCountRow?.n ?? 0)
  const pushCount = Number(pushCountRow?.n ?? 0)

  // Datos fiscales completos? Necesarios para activar VeriFactu legalmente
  // (RD 1619/2012 art. 6 — emisor con nombre + NIF + dirección postal completa).
  const fiscalDataComplete = Boolean(
    client.fiscalName &&
      client.fiscalNif &&
      client.fiscalAddress &&
      client.fiscalCity &&
      client.fiscalPostalCode,
  )

  // Resumen humano del horario shop (3 días representativos, nada de jerga).
  const hours = (client.chatbotHours as Record<string, string> | null) ?? null
  const horarioSummary = summariseHours(hours)

  const cards: Array<HubCard> = [
    {
      icon: Store,
      label: 'Tu barbería',
      href: '/dashboard/negocio',
      preview: `${barberCount} ${barberCount === 1 ? 'barbero' : 'barberos'}${horarioSummary ? ` · ${horarioSummary}` : ''}`,
      tone: 'neutral',
    },
    {
      icon: Bot,
      label: 'Asistente WhatsApp',
      href: '/dashboard/bot',
      preview: client.metaWebhookVerifiedAt
        ? 'Conectado y respondiendo'
        : 'Pendiente de conectar con WhatsApp',
      tone: client.metaWebhookVerifiedAt ? 'ok' : 'warn',
    },
    {
      icon: Smartphone,
      label: 'App para clientes',
      href: '/dashboard/app',
      preview:
        pushCount > 0
          ? `${pushCount} ${pushCount === 1 ? 'cliente' : 'clientes'} con la app instalada`
          : 'Comparte el enlace con tus clientes',
      tone: 'neutral',
    },
    {
      icon: Gift,
      label: 'Tarjeta de fidelización',
      href: '/dashboard/fidelidad',
      preview: client.loyaltyEnabled
        ? `Activa · modo ${client.loyaltyMode === 'points' ? 'puntos' : 'sellos'}`
        : 'Desactivada',
      tone: client.loyaltyEnabled ? 'ok' : 'neutral',
    },
    {
      icon: FileText,
      label: 'Facturación',
      href: '/dashboard/facturas',
      preview: client.invoicingEnabled
        ? 'Activa · emite tickets y facturas'
        : fiscalDataComplete
          ? 'Lista para activar — datos fiscales completos'
          : 'Faltan datos fiscales para activar',
      tone: client.invoicingEnabled ? 'ok' : fiscalDataComplete ? 'neutral' : 'warn',
    },
    {
      icon: CreditCard,
      label: 'Tu suscripción',
      href: '/dashboard/mi-plan',
      preview: subscriptionPreview(client.status, client.plan),
      tone: client.status === 'active' ? 'ok' : 'warn',
    },
    {
      icon: HelpCircle,
      label: 'Ayuda',
      href: '/dashboard/ayuda',
      preview: 'Preguntas frecuentes y soporte',
      tone: 'neutral',
    },
  ]

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Ajustes</h1>
        <p className="text-ink-2">Todo lo que configuras una vez y se queda funcionando.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <SettingCard key={card.href} {...card} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

type Tone = 'ok' | 'warn' | 'neutral'

interface HubCard {
  icon: LucideIcon
  label: string
  href: string
  preview: string
  tone: Tone
}

function SettingCard({ icon: Icon, label, href, preview, tone }: HubCard) {
  const toneIcon =
    tone === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
    : tone === 'warn' ? <AlertCircle className="h-3.5 w-3.5 text-warn shrink-0" />
    : null

  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 hover:border-line-strong hover:bg-overlay/40 transition-colors"
    >
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-brand-softer text-brand-strong">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink text-sm">{label}</p>
        <p className="text-xs text-ink-3 mt-0.5 flex items-center gap-1.5">
          {toneIcon}
          <span className="truncate">{preview}</span>
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-ink-3 mt-1 shrink-0 group-hover:text-ink transition-colors" />
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de preview
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resume el horario semanal en una sola línea legible, tipo "L-V 10-20".
 * Detecta días con el mismo rango contiguos para no soltar 7 líneas. Si la
 * config es heterogénea cae en un mensaje genérico.
 */
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
  // Aceptamos también las claves en español como fallback.
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
  if (openDays.length === 0) return 'Sin horario configurado'
  // Si todos los días abiertos comparten el mismo rango, "L-V 10-20".
  const uniqueRanges = new Set(openDays.map((r) => r.range))
  if (uniqueRanges.size === 1) {
    const range = openDays[0].range as string
    const compactRange = range.replace(/:00/g, '').replace('-', '–')
    if (openDays.length === 7) return `Todos los días ${compactRange}`
    if (openDays.length === 1) return `${openDays[0].short} ${compactRange}`
    return `${openDays[0].short}–${openDays[openDays.length - 1].short} ${compactRange}`
  }
  return `Abierto ${openDays.length} días/semana`
}

function subscriptionPreview(status: string, plan: string): string {
  if (status === 'active') return `Plan ${plan} · activa`
  if (status === 'trialing') return `Plan ${plan} · prueba`
  if (status === 'past_due') return `Plan ${plan} · pago pendiente`
  if (status === 'cancelled') return `Plan ${plan} · cancelada`
  if (status === 'pending') return 'Pendiente de activar'
  return `Estado: ${status}`
}
