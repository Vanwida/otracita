import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/voice-test — RUTA LEGACY. La Recepcionista IA es ahora la
// pestaña Ajustes → Recepcionista IA. Redirect 1:1 para no romper
// deep-links ni enlaces internos (patrón SaaS estándar). El componente
// VoiceTest sigue en este directorio (lo importa la nueva ruta).
// -----------------------------------------------------------------------------

export default function VoiceTestLegacyRedirect() {
  redirect('/dashboard/ajustes/recepcionista')
}
