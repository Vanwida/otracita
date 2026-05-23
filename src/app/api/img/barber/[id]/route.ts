import { db } from '@/db'
import { barbers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { resolveBarberPhotoResponse } from './handler'

// -----------------------------------------------------------------------------
// GET /api/img/barber/[id]
//
// Proxy server-to-server de la foto del barbero, servido desde nuestro
// dominio (`otracita.es`). Resuelve `barbers.photoUrl` por id, descarga el
// asset del blob, y lo stream-ea al cliente con cabeceras de caché agresivas.
//
// ¿Por qué proxy y no <img src={blob_url}>? El host del blob
// (`uevxeinfoczotdae.public.blob.vercel-storage.com`) está dando TCP timeout
// desde redes con resolvers regionales / corporativos. Server-side (Vercel)
// lo alcanza siempre. Sirviendo a través de nuestro dominio garantiza que el
// browser cargue desde un hostname que sí responde para él.
//
// Público a propósito — las fotos de barbero se muestran en la PWA pública
// (`/[slug]`) sin auth. Defensa multi-tenant: solo se sirven fotos de
// barberos `active=true` (los soft-deleted devuelven 404 igual que en la UI).
//
// La lógica de respuesta vive en `./handler.ts` (puramente fn de id → Response,
// inyectando el fetch de DB + fetch upstream). Esto permite testearla sin
// arrancar Neon ni el blob real.
// -----------------------------------------------------------------------------

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  return resolveBarberPhotoResponse({
    id,
    fetchPhotoUrl: async (barberId) => {
      const [row] = await db
        .select({ photoUrl: barbers.photoUrl })
        .from(barbers)
        .where(and(eq(barbers.id, barberId), eq(barbers.active, true)))
        .limit(1)
      return row?.photoUrl ?? null
    },
    fetchUpstream: (url, init) => fetch(url, init),
  })
}
