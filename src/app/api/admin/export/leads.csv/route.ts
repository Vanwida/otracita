import { db } from '@/db';
import { leads } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { getAdminUser } from '@/lib/auth/require-admin';
import { toCsv, csvFilename } from '@/lib/admin/csv';

export const dynamic = 'force-dynamic';

/**
 * Export CSV de todos los leads. Para volcar a Excel/gestor/CRM externo.
 * UTF-8 con BOM, fechas en ISO. Sin paginación: si la tabla crece a >5k
 * filas tocaría stream — hoy no es problema.
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rows = await db.select().from(leads).orderBy(desc(leads.createdAt));

  const csv = toCsv(rows, [
    { key: 'name', header: 'Nombre' },
    { key: 'businessName', header: 'Negocio' },
    { key: 'phone', header: 'Telefono' },
    { key: 'email', header: 'Email' },
    { key: 'source', header: 'Fuente' },
    { key: 'status', header: 'Estado' },
    { key: 'message', header: 'Mensaje' },
    { key: 'notes', header: 'Notas' },
    { key: 'nextActionAt', header: 'Proxima accion' },
    { key: 'convertedToClientId', header: 'Convertido a cliente ID' },
    { key: 'createdAt', header: 'Creado' },
    { key: 'updatedAt', header: 'Actualizado' },
  ]);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('leads')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
