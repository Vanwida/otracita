import { clearTeamSession } from '@/lib/team-auth/session'

// -----------------------------------------------------------------------------
// POST /api/team-access/logout
//
// Borra la cookie del modo equipo. Sin auth previa: el endpoint es seguro
// porque solo elimina la cookie que el navegador presenta — no necesita
// validar nada.
// -----------------------------------------------------------------------------

export async function POST() {
  await clearTeamSession()
  return Response.json({ ok: true })
}
