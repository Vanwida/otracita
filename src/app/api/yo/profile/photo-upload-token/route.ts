import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireBarberRole } from '@/lib/auth/require-barber-role';

// -----------------------------------------------------------------------------
// POST /api/yo/profile/photo-upload-token — emite un token efímero
// para que el barbero suba su foto de perfil directo a Vercel Blob.
//
// Scope-limited: requireBarberRole. La path firmada queda bajo
// `barbers/{barberId}/avatar.{ext}` para que un barbero no pueda
// escribir en la carpeta de otro.
// -----------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function POST(req: Request) {
  const access = await requireBarberRole(req);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const access2 = await requireBarberRole(req);
        if (!access2.ok) throw new Error('Unauthorized');
        const ext = (/\.([a-z0-9]{2,5})$/i.exec(pathname)?.[1] ?? 'jpg').toLowerCase();
        const safePath = `barbers/${access2.barber.id}/avatar-${Date.now()}.${ext}`;
        return {
          allowedContentTypes: ALLOWED_MIME,
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ barberId: access2.barber.id, safePath }),
          addRandomSuffix: false,
          pathname: safePath,
        };
      },
      onUploadCompleted: async () => {
        // No-op: el PATCH a /api/yo/profile guarda la URL final.
      },
    });
    return Response.json(jsonResponse);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? 'Upload failed' },
      { status: 400 },
    );
  }
}
