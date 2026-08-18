import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireManagerPermission,
  managerPermissionErrorResponse,
} from '@/lib/manager-permissions/guard';
import { roundEuros } from '@/lib/format';

// -----------------------------------------------------------------------------
// /api/yo/services (#72) — catálogo de servicios del local, gated por
// `edit_services`. Vive en `clients.chatbotServices` (jsonb array de
// `{name, duration, price}`).
//
// GET   → devuelve el array completo.
// PATCH → recibe `{ services: ServiceRow[] }` y reemplaza el array entero
//         (operación idempotente al estilo del wizard /setup). Para evitar
//         que el manager rompa el catálogo, exigimos `name` no vacío y
//         números positivos en `duration` y `price`.
// -----------------------------------------------------------------------------

interface ServiceRow {
  name: string;
  duration: number;
  price: number;
}

function isValidService(v: unknown): v is ServiceRow {
  if (!v || typeof v !== 'object') return false;
  const o = v as { name?: unknown; duration?: unknown; price?: unknown };
  if (typeof o.name !== 'string' || !o.name.trim()) return false;
  if (typeof o.duration !== 'number' || !Number.isFinite(o.duration) || o.duration < 5 || o.duration > 600) return false;
  if (typeof o.price !== 'number' || !Number.isFinite(o.price) || o.price < 0 || o.price > 1_000_000) return false;
  return true;
}

export async function GET(req: Request) {
  const access = await requireManagerPermission(req, 'edit_services');
  if (!access.ok) return managerPermissionErrorResponse(access);
  const { client: clientStub } = access;

  const [client] = await db
    .select({ chatbotServices: clients.chatbotServices })
    .from(clients)
    .where(eq(clients.id, clientStub.id));

  const raw = client?.chatbotServices;
  const services: ServiceRow[] = Array.isArray(raw)
    ? (raw as unknown[]).filter(isValidService)
    : [];

  return Response.json({ services });
}

export async function PATCH(req: Request) {
  const access = await requireManagerPermission(req, 'edit_services');
  if (!access.ok) return managerPermissionErrorResponse(access);
  const { client: clientStub } = access;

  let body: { services?: unknown };
  try {
    body = (await req.json()) as { services?: unknown };
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!Array.isArray(body.services)) {
    return Response.json(
      { error: 'services debe ser un array.' },
      { status: 400 },
    );
  }
  if (body.services.length > 60) {
    return Response.json(
      { error: 'Máximo 60 servicios.' },
      { status: 400 },
    );
  }
  const clean: ServiceRow[] = [];
  for (const s of body.services) {
    if (!isValidService(s)) {
      return Response.json(
        {
          error:
            'Servicio inválido. Cada servicio necesita nombre, duración (5-600 min) y precio (≥ 0).',
        },
        { status: 400 },
      );
    }
    clean.push({
      name: s.name.trim().slice(0, 80),
      duration: Math.round(s.duration),
      price: roundEuros(s.price) ?? 0,
    });
  }

  await db
    .update(clients)
    .set({ chatbotServices: clean })
    .where(eq(clients.id, clientStub.id));

  // El catálogo de servicios se renderiza en la PWA pública /[slug] (lista de
  // servicios + precios + duración). Sin revalidate, un manager editándolo
  // desde el dashboard "Yo" deja al cliente final viendo el catálogo viejo
  // hasta el siguiente fetch frío. Mismo patrón que /api/blocked-dates y
  // /api/public-page/config (commit a1b8377). Necesitamos el slug del cliente
  // — `clientStub` lo trae cuando viene de requireManagerPermission.
  const { revalidatePath } = await import('next/cache');
  if (clientStub.publicSlug) {
    revalidatePath(`/${clientStub.publicSlug}`);
  }
  revalidatePath('/[slug]', 'page');

  return Response.json({ services: clean });
}
