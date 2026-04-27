import { db } from '@/db'
import { cashSessions } from '@/db/schema'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/cash/open — abre una nueva sesión de caja para el cliente.
//
// Body: { openingCents: number (>= 0) }
//
// Reglas:
//   · El cliente debe tener `cashRegisterEnabled = true`.
//   · No puede haber otra sesión abierta — el UNIQUE partial idx
//     `cash_sessions_one_open_per_client` ya lo garantiza a nivel DB; aquí
//     devolvemos un 409 amistoso si choca.
//   · `opening_cents` puede ser 0 (algunos locales no dejan cambio).
// -----------------------------------------------------------------------------

interface Body {
  openingCents?: unknown
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client, user } = access

  if (!client.cashRegisterEnabled) {
    return Response.json(
      { error: 'La caja efectivo no está activa para este negocio.' },
      { status: 403 },
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const openingCents =
    typeof body.openingCents === 'number'
      ? body.openingCents
      : Number.parseInt(String(body.openingCents ?? ''), 10)
  if (!Number.isFinite(openingCents) || openingCents < 0 || openingCents > 1_000_000) {
    return Response.json(
      { error: 'Importe de apertura inválido (0 – 10.000 €)' },
      { status: 400 },
    )
  }

  try {
    const [session] = await db
      .insert(cashSessions)
      .values({
        clientId: client.id,
        openingCents,
        openedByEmail: user.email,
      })
      .returning()
    return Response.json({ session }, { status: 201 })
  } catch (err) {
    // UNIQUE partial idx (closed_at IS NULL) → ya hay una sesión abierta.
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('cash_sessions_one_open_per_client')) {
      return Response.json(
        { error: 'Ya hay una sesión de caja abierta. Ciérrala antes de abrir otra.' },
        { status: 409 },
      )
    }
    console.error('[cash/open] insert failed:', err)
    return Response.json({ error: 'No se pudo abrir la caja' }, { status: 500 })
  }
}
