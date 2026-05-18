import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/bot — RUTA LEGACY. El asistente de WhatsApp es ahora la
// pestaña Marketing → WhatsApp. Redirect 1:1 para no romper deep-links ni
// los enlaces internos existentes (patrón SaaS estándar). El contenido
// (incl. la server action saveBotSettings) vive en
// /dashboard/marketing/whatsapp.
// -----------------------------------------------------------------------------

export default function BotLegacyRedirect() {
  redirect('/dashboard/marketing/whatsapp')
}
