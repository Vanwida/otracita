export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { Bot, MessageCircle, Link2, Calendar } from 'lucide-react'

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
    const chatbotGreeting = (formData.get('chatbotGreeting') as string | null) ?? ''
    const booksyProfileUrl = (formData.get('booksyProfileUrl') as string | null) ?? ''
    const googleCalendarId = (formData.get('googleCalendarId') as string | null) ?? ''

    const { db } = await import('@/db')
    const { clients } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')

    const records = await db.select().from(clients).where(eq(clients.email, email))
    if (records.length === 0) return

    await db
      .update(clients)
      .set({
        chatbotGreeting: chatbotGreeting || null,
        booksyProfileUrl: booksyProfileUrl || null,
        googleCalendarId: googleCalendarId || null,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, records[0].id))

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard/bot')
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">El bot</h1>
        <p className="text-ink-2">Ajusta cómo se comporta tu asistente y las integraciones que usa.</p>
      </div>

      <form action={saveBotSettings} className="bg-surface border border-line rounded-xl p-4 md:p-8 space-y-8">
        {/* ─── Presentación ─── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-brand" />
            <h2 className="text-lg font-semibold text-ink">Mensaje de bienvenida</h2>
          </div>
          <p className="text-sm text-ink-2">Lo primero que responde el bot cuando un cliente nuevo escribe al WhatsApp de tu negocio.</p>
          <textarea
            name="chatbotGreeting"
            rows={4}
            defaultValue={client.chatbotGreeting || ''}
            placeholder="¡Hola! Bienvenido a [tu negocio]. Soy tu asistente virtual. ¿Cómo puedo ayudarte hoy?"
            className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors resize-none"
          />
          <p className="text-xs text-ink-3">
            Déjalo en blanco para usar el mensaje por defecto. Tip: menciona tu negocio y ofrece 2-3 opciones claras (reservar, precios, horario).
          </p>
        </section>

        {/* ─── Integraciones ─── */}
        <section className="space-y-4 border-t border-line pt-8">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-brand" />
            <h2 className="text-lg font-semibold text-ink">Integraciones</h2>
          </div>
          <p className="text-sm text-ink-2">Conecta el bot con tus calendarios para que lea disponibilidad y escriba reservas.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="booksyProfileUrl" className="text-sm font-medium text-ink-2 flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-ink-3" /> URL de perfil Booksy
              </label>
              <input
                id="booksyProfileUrl"
                name="booksyProfileUrl"
                type="text"
                defaultValue={client.booksyProfileUrl || ''}
                placeholder="https://booksy.com/es-es/..."
                className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
              />
              <p className="text-xs text-ink-3">Si usas Booksy, el bot sincroniza tus reservas automáticamente.</p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="googleCalendarId" className="text-sm font-medium text-ink-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-ink-3" /> Google Calendar ID
              </label>
              <input
                id="googleCalendarId"
                name="googleCalendarId"
                type="text"
                defaultValue={client.googleCalendarId || ''}
                placeholder="tu-correo@group.calendar.google.com"
                className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
              />
              <p className="text-xs text-ink-3">El bot leerá huecos disponibles y creará eventos en este calendario.</p>
            </div>
          </div>
        </section>

        {/* ─── Idioma (placeholder) ─── */}
        <section className="space-y-3 border-t border-line pt-8">
          <h2 className="text-lg font-semibold text-ink">Idioma del bot</h2>
          <div className="bg-overlay border border-line rounded-lg p-4 text-sm text-ink-2">
            Ahora mismo el bot responde en español (España). Pronto podrás elegir idioma por cliente y que detecte automáticamente.
          </div>
        </section>

        <div className="pt-4 flex items-center justify-end border-t border-line">
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
