export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { hasFeature } from '@/lib/billing/tier'
import AreaContent from '../_components/AreaContent'
import BarbersManager from '../_components/BarbersManager'

// -----------------------------------------------------------------------------
// /dashboard/equipo — pestaña EMPLEADOS (ruta índice del área Equipo).
//
// Patrón Booksy "Empleados" (10.16.45): la lista del equipo y nada más.
// Antes esta página apilaba Barberos + Bonos + Progreso + Nóminas en un
// scroll largo (anti-patrón). Ahora cada bloque vive en su pestaña:
//   · Bonos/Progreso → /dashboard/equipo/bonos
//   · Nóminas        → /dashboard/equipo/nominas
//
// LÓGICA DE SERVIDOR INTACTA: mismo resolve de tenant por sesión, mismo
// `hasFeature(client, 'controlFinanciero')` para el flag de payroll que
// BarbersManager necesita. No se pierde nada — solo se reparte.
// -----------------------------------------------------------------------------

export default async function EquipoEmpleadosPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const payrollEnabled = hasFeature(client, 'controlFinanciero')

  return (
    <AreaContent scroll="region" maxWidth="7xl">
      <BarbersManager payrollEnabled={payrollEnabled} />
    </AreaContent>
  )
}
