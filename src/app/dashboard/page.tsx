import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard — redirige a Agenda (contrato de IA: el workspace real del
// barbero es la agenda; no hay "Inicio" en el nav). `setup` sigue siendo un
// flujo aparte y el layout ya manda ahí a clientes sin onboarding completo.
//
// La antigua portada "qué toca ahora" (state machine + AttentionPanel +
// PendingClosureList) se retira del nav por decisión de IA. La lógica de
// estado (src/lib/dashboard/home-state.ts) y sus componentes se conservan
// intactos para reutilizarlos dentro de Agenda más adelante si se decide.
// -----------------------------------------------------------------------------

export default function DashboardIndexRedirect() {
  redirect('/dashboard/agenda')
}
