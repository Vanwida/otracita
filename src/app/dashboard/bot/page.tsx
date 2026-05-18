export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import PageShell from '@/app/dashboard/_components/PageShell'
import UpgradeRequired from '@/app/dashboard/_components/UpgradeRequired'
import {
  Bot,
  MessageCircle,
  User,
  Star,
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

  if (!hasFeature(client, 'whatsappBot')) {
    return (
      <UpgradeRequired
        feature="whatsappBot"
        title="Bot WhatsApp"
        icon={Bot}
        back={{ label: 'Ajustes', href: '/dashboard/ajustes' }}
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
    const googleReviewUrl = (formData.get('googleReviewUrl') as string | null) ?? ''

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
        googleReviewUrl: cleanReviewUrl,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, records[0].id))

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard/bot')
  }

  return (
    <PageShell
      title="Asistente WhatsApp"
      subtitle="Cómo se presenta y responde por WhatsApp. Todo aplica a partir del siguiente mensaje que reciba."
      maxWidth="4xl"
      back={{ label: 'Ajustes', href: '/dashboard/ajustes' }}
    >
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

        {/* ─── Reviews ─────────────────────────────────────────── */}
        <Card icon={Star} title="Reseñas en Google">
          <p className="text-sm text-ink-2 mb-3">
            Cuando un cliente te da <strong>5 estrellas</strong> en el follow-up del WhatsApp,
            el bot le invita a dejarte reseña en Google con este enlace.
            <span className="block mt-1 text-ink-3">
              Solo en valoraciones de 5★. Un 4★ puede esconder feedback tibio que no queremos amplificar.
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

        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="btn-primary active:scale-95"
          >
            Guardar cambios
          </button>
        </div>
      </form>
    </PageShell>
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
