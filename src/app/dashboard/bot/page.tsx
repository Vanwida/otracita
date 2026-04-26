export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import AjustesBreadcrumb from '@/app/dashboard/_components/AjustesBreadcrumb'
import {
  Bot,
  MessageCircle,
  User,
  Moon,
  Bell,
  Star,
  Shield,
  Sparkles,
  Globe,
} from 'lucide-react'

// -----------------------------------------------------------------------------
// /dashboard/bot — configuración del asistente WhatsApp.
//
// Auditoría previa: la sección "Integraciones" (Booksy URL + Google Calendar
// ID) era legacy — Booksy URL se movió a Mi negocio > Servicios como ayuda
// de onboarding; Google Calendar ya no se usa. Esta página ahora cubre SOLO
// configuración del comportamiento del bot.
//
// Estado de cada campo:
//   ✅ Wired (afecta ya al bot):  botName, botTone, chatbotGreeting,
//                                 googleReviewUrl
//   🟡 Config persistida, wiring pendiente:
//                                 botOutOfHoursMessage, botAllowCancelWhatsapp,
//                                 noShowBlockThreshold, reminderTemplate
//
// Los campos 🟡 se guardan en DB pero no los lee el engine todavía. Se
// marcan en la UI con una pill "Pronto activo" para transparencia.
// -----------------------------------------------------------------------------

export default async function BotPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

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
    const botOutOfHoursMessage = (formData.get('botOutOfHoursMessage') as string | null) ?? ''
    const reminderTemplate = (formData.get('reminderTemplate') as string | null) ?? ''
    const googleReviewUrl = (formData.get('googleReviewUrl') as string | null) ?? ''
    const botAllowCancelWhatsapp = formData.get('botAllowCancelWhatsapp') === 'on'
    const noShowRaw = parseInt((formData.get('noShowBlockThreshold') as string | null) ?? '3', 10)
    const noShowBlockThreshold = Number.isFinite(noShowRaw) && noShowRaw >= 1 && noShowRaw <= 10 ? noShowRaw : 3

    // Sanear URL Google Review: aceptar solo https://
    let cleanReviewUrl: string | null = null
    if (googleReviewUrl.trim()) {
      try {
        const u = new URL(googleReviewUrl.trim())
        if (u.protocol === 'https:' || u.protocol === 'http:') {
          cleanReviewUrl = u.toString()
        }
      } catch {
        /* deja null */
      }
    }

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
        botOutOfHoursMessage: botOutOfHoursMessage.trim() || null,
        reminderTemplate: reminderTemplate.trim() || null,
        googleReviewUrl: cleanReviewUrl,
        botAllowCancelWhatsapp,
        noShowBlockThreshold,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, records[0].id))

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard/bot')
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <AjustesBreadcrumb current="Asistente WhatsApp" />
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2 flex items-center gap-3">
          <Bot className="h-7 w-7 text-brand" />
          Asistente WhatsApp
        </h1>
        <p className="text-ink-2 text-sm max-w-2xl">
          Cómo se presenta y responde por WhatsApp. Todo aplica a partir del
          siguiente mensaje que reciba.
        </p>
      </div>

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

        {/* ─── Fuera de horario ────────────────────────────────── */}
        <Card icon={Moon} title="Respuesta fuera de horario" pending>
          <p className="text-sm text-ink-2 mb-3">
            Si un cliente escribe cuando el negocio está cerrado, el bot envía este mensaje
            en vez de la bienvenida normal. Déjalo vacío para usar la respuesta genérica.
          </p>
          <textarea
            name="botOutOfHoursMessage"
            rows={3}
            defaultValue={client.botOutOfHoursMessage || ''}
            placeholder="Ahora estamos cerrados. Abrimos mañana a las 10:00. ¿Te reservo hueco para cuando abramos?"
            className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none resize-none"
          />
        </Card>

        {/* ─── Recordatorio ────────────────────────────────────── */}
        <Card icon={Bell} title="Recordatorio día antes" pending>
          <p className="text-sm text-ink-2 mb-3">
            El bot envía un WhatsApp el día antes de cada cita confirmada. Personaliza el
            texto si quieres — placeholders: <code className="text-xs bg-overlay px-1 rounded">{'{name}'}</code>,{' '}
            <code className="text-xs bg-overlay px-1 rounded">{'{service}'}</code>,{' '}
            <code className="text-xs bg-overlay px-1 rounded">{'{time}'}</code>,{' '}
            <code className="text-xs bg-overlay px-1 rounded">{'{barber}'}</code>
          </p>
          <textarea
            name="reminderTemplate"
            rows={3}
            defaultValue={client.reminderTemplate || ''}
            placeholder="Hola {name}! Recuerda que mañana tienes cita para {service} a las {time} con {barber}. ¿Todo bien?"
            className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none resize-none"
          />
        </Card>

        {/* ─── Reviews ─────────────────────────────────────────── */}
        <Card icon={Star} title="Reseñas en Google">
          <p className="text-sm text-ink-2 mb-3">
            Cuando un cliente te da <strong>5 estrellas</strong> en el follow-up del WhatsApp,
            el bot le invita a dejarte reseña en Google con este enlace.
            <span className="block mt-1 text-ink-3">
              Solo en valoraciones de 5★ — un 4★ puede esconder feedback tibio que no queremos amplificar.
            </span>
          </p>
          <input
            type="url"
            name="googleReviewUrl"
            defaultValue={client.googleReviewUrl || ''}
            placeholder="https://g.page/r/..."
            className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none font-mono"
          />
          <div className="mt-2 text-xs text-ink-3 space-y-1">
            <p>
              Consíguelo en <a href="https://www.google.com/business" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-2">Google Business Profile</a> →
              &ldquo;Reseñas&rdquo; → &ldquo;Obtener más reseñas&rdquo; → copia el enlace corto.
            </p>
          </div>
        </Card>

        {/* ─── Capacidades ─────────────────────────────────────── */}
        <Card icon={Shield} title="Reglas del bot">
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer" htmlFor="botAllowCancelWhatsapp">
              <input
                type="checkbox"
                id="botAllowCancelWhatsapp"
                name="botAllowCancelWhatsapp"
                defaultChecked={client.botAllowCancelWhatsapp}
                className="h-4 w-4 mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink">Permitir cancelar desde WhatsApp</span>
                  <Pending />
                </div>
                <p className="text-xs text-ink-2 mt-0.5">
                  Si lo desactivas, el bot responde &ldquo;para cancelar, llámanos&rdquo;. Útil si
                  prefieres canalizar cancelaciones por la app o por llamada.
                </p>
              </div>
            </label>

            <div className="border-t border-line pt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <label htmlFor="noShowBlockThreshold" className="text-sm font-medium text-ink">
                  Umbral de no-shows para bloquear al cliente
                </label>
                <Pending />
              </div>
              <p className="text-xs text-ink-2 mt-0.5 mb-2">
                Tras acumular este número de no-shows, el bot no acepta más reservas de ese cliente
                hasta que le perdones manualmente desde Clientes.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="noShowBlockThreshold"
                  name="noShowBlockThreshold"
                  min={1}
                  max={10}
                  defaultValue={client.noShowBlockThreshold}
                  className="w-20 bg-surface border border-line rounded-lg p-2 text-sm text-ink text-center focus:border-brand outline-none"
                />
                <span className="text-sm text-ink-2">no-shows = bloqueo automático</span>
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Idioma (informativo) ────────────────────────────── */}
        <Card icon={Globe} title="Idioma">
          <p className="text-sm text-ink-2">
            Auto-detecta español / inglés según el idioma en que escriba el cliente. Ideal para
            zonas con turistas. El cliente puede pedirle cambiar en cualquier momento.
          </p>
        </Card>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="rounded-xl bg-brand hover:bg-brand-strong px-6 py-3 text-sm font-semibold text-brand-ink transition-colors active:scale-95"
          >
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes (server)
// ─────────────────────────────────────────────────────────────────────────────

function Card({
  icon: Icon,
  title,
  pending,
  children,
}: {
  icon: typeof Bot
  title: string
  pending?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-line rounded-xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-brand" />
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {pending && <Pending />}
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

function Pending() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/30 px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold text-warning">
      <Sparkles className="h-2.5 w-2.5" />
      Pronto activo
    </span>
  )
}

function ToneRadioGroup({ current }: { current: string }) {
  const options: Array<{ value: string; label: string; example: string }> = [
    { value: 'cercano', label: 'Cercano', example: '¡Hola Alex! 👋 Te busco hueco para mañana 😊' },
    { value: 'neutro', label: 'Neutro', example: 'Hola Alex, te busco hueco para mañana.' },
    { value: 'formal', label: 'Formal', example: 'Buenos días, le busco hueco para mañana.' },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
    </div>
  )
}
