export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import AreaShell from '@/app/dashboard/_components/AreaShell'
import AreaContent from '@/app/dashboard/_components/AreaContent'
import UpgradeRequired from '@/app/dashboard/_components/UpgradeRequired'
import FormGrid from '@/app/dashboard/_components/FormGrid'
import BotActivationStatus from '@/app/dashboard/_components/BotActivationStatus'
import BotRequestForm from './_components/BotRequestForm'
import {
  Bot,
  MessageCircle,
  User,
} from 'lucide-react'

// -----------------------------------------------------------------------------
// /dashboard/marketing/whatsapp — configuración del asistente WhatsApp.
//
// Capas de estado (controladas por BotActivationStatus arriba):
//   1. IDLE        — sin phoneNumberId, sin botRequest → form de solicitud
//                    self-service. La config de personalidad NO se muestra
//                    todavía (no tiene sentido configurarla antes del alta).
//   2. REQUESTED   — botRequest guardado, esperando que Alex complete alta
//                    en Meta. Banner amarillo "En cola" + botón editar
//                    solicitud. La config de personalidad SÍ se muestra para
//                    que el barbero la deje lista mientras tanto.
//   3. ACTIVE      — phoneNumberId poblado → banner verde "Atendiendo" + la
//                    config de personalidad editable.
//
// Auditoría previa: la sección "Integraciones" (Booksy URL + Google Calendar
// ID) era legacy — Booksy URL se movió a Mi negocio > Servicios como ayuda
// de onboarding; Google Calendar ya no se usa. Esta página ahora cubre SOLO
// activación + comportamiento del bot.
//
// Estado de cada campo de personalidad:
//   Wired (afecta ya al bot):  botName, botTone, chatbotGreeting
//   Config persistida, wiring pendiente:
//                              botOutOfHoursMessage, botAllowCancelWhatsapp,
//                              noShowBlockThreshold, reminderTemplate
// -----------------------------------------------------------------------------

export default async function BotPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  if (!hasFeature(client, 'whatsappBot')) {
    return (
      <UpgradeRequired
        feature="whatsappBot"
        title="Bot WhatsApp"
        icon={Bot}
        back={{ label: 'Crecimiento', href: '/dashboard/marketing' }}
      />
    )
  }

  async function saveBotSettings(formData: FormData) {
    'use server'

    const { auth: serverAuth } = await import('@/lib/auth/server')
    const { headers: getHeaders } = await import('next/headers')
    const session = await serverAuth.api.getSession({ headers: await getHeaders() })
    if (!session?.user?.email) return

    const email = session.user.email
    const botNameRaw = (formData.get('botName') as string | null) ?? ''
    const botName = botNameRaw.trim().slice(0, 40)
    const botToneRaw = (formData.get('botTone') as string | null) ?? 'cercano'
    const botTone = ['cercano', 'neutro', 'formal'].includes(botToneRaw) ? botToneRaw : 'cercano'
    const chatbotGreeting = (formData.get('chatbotGreeting') as string | null) ?? ''

    const { db } = await import('@/db')
    const { clients } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')

    const records = await db.select().from(clients).where(eq(clients.email, email))
    if (records.length === 0) return

    await db
      .update(clients)
      .set({
        botName: botName || null,
        botTone,
        chatbotGreeting: chatbotGreeting || null,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, records[0].id))

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard/marketing/whatsapp')
  }

  // Estado de activación (los 3 modos).
  const botActive = !!client.whatsappPhoneNumberId
  const botRequest = client.whatsappBotRequest ?? null
  const botRequested = !botActive && !!botRequest?.phoneRequested
  const botIdle = !botActive && !botRequest?.phoneRequested

  return (
    <AreaShell area="marketing">
      <AreaContent scroll="region" maxWidth="5xl">
        <BotActivationStatus
          whatsappPhoneNumberId={client.whatsappPhoneNumberId}
          whatsappBotRequest={botRequest}
          publicSlug={client.publicSlug}
          publicEnabled={client.publicEnabled}
        />

        {botIdle && (
          <BotRequestForm />
        )}

        {botRequested && (
          <details className="mb-6 rounded-2xl border border-line bg-surface">
            <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-ink-2 hover:text-ink select-none flex items-center justify-between">
              <span>Editar datos de la solicitud</span>
              <span className="text-xs text-ink-3">Toca para abrir</span>
            </summary>
            <div className="px-5 pb-5">
              <BotRequestForm
                initial={{
                  phoneRequested: botRequest?.phoneRequested ?? null,
                  businessLegalName: botRequest?.businessLegalName ?? null,
                  fbBusinessId: botRequest?.fbBusinessId ?? null,
                }}
              />
            </div>
          </details>
        )}

        {(botActive || botRequested) && (
          <>
            <p className="text-ink-2 mb-4" style={{ fontSize: 'var(--text-meta)' }}>
              Cómo se presenta y responde por WhatsApp. Todo aplica a partir del
              siguiente mensaje que reciba.
            </p>
            <form action={saveBotSettings} className="space-y-6">
              {/* ─── Identidad ───────────────────────────────────────── */}
              <Card icon={User} title="Identidad">
                <Field
                  label="Nombre del bot"
                  hint="Se presenta así: «Hola, soy [nombre], el asistente de [tu negocio]». Déjalo vacío para genérico. Máx. 40 caracteres."
                >
                  <input
                    type="text"
                    name="botName"
                    maxLength={40}
                    defaultValue={client.botName || ''}
                    placeholder="Ej. Mateo, Raúl, Clara…"
                    className="w-full max-w-sm bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none"
                  />
                </Field>

                <Field
                  label="Tono"
                  hint="Define cómo escribe el bot. El LLM adapta cada respuesta al estilo elegido."
                >
                  <ToneRadioGroup current={client.botTone || 'cercano'} />
                </Field>
              </Card>

              {/* ─── Bienvenida ──────────────────────────────────────── */}
              <Card icon={MessageCircle} title="Mensaje de bienvenida">
                <p className="text-sm text-ink-2 mb-3">
                  Lo primero que responde cuando un cliente nuevo escribe al WhatsApp del negocio.
                </p>
                <textarea
                  name="chatbotGreeting"
                  rows={4}
                  defaultValue={client.chatbotGreeting || ''}
                  placeholder="¡Hola! Bienvenido a [tu negocio]. Soy tu asistente virtual. ¿Cómo puedo ayudarte hoy?"
                  className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none resize-none"
                />
                <p className="text-xs text-ink-3 mt-2">
                  Tip: menciona el negocio y ofrece 2-3 opciones claras (reservar, precios, horario).
                </p>
              </Card>

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  className="btn-primary active:scale-95"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </>
        )}
      </AreaContent>
    </AreaShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes (server)
// ─────────────────────────────────────────────────────────────────────────────

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bot
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-line rounded-xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-brand" />
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-5 last:mb-0">
      <label className="block text-sm font-medium text-ink-2 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-3 mt-1.5">{hint}</p>}
    </div>
  )
}


function ToneRadioGroup({ current }: { current: string }) {
  const options: Array<{ value: string; label: string; example: string }> = [
    { value: 'cercano', label: 'Cercano', example: '¡Hola Alex! 👋 Te busco hueco para mañana 😊' },
    { value: 'neutro', label: 'Neutro', example: 'Hola Alex, te busco hueco para mañana.' },
    { value: 'formal', label: 'Formal', example: 'Buenos días, le busco hueco para mañana.' },
  ]
  return (
    <FormGrid cols={3} gap="tight">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="rounded-xl border border-line bg-surface p-3 cursor-pointer hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-brand-softer transition-colors"
        >
          <div className="flex items-center gap-2">
            <input
              type="radio"
              name="botTone"
              value={opt.value}
              defaultChecked={current === opt.value}
              className="h-3.5 w-3.5"
            />
            <span className="text-sm font-semibold text-ink">{opt.label}</span>
          </div>
          <p className="mt-2 text-xs text-ink-2 italic leading-relaxed">&ldquo;{opt.example}&rdquo;</p>
        </label>
      ))}
    </FormGrid>
  )
}
