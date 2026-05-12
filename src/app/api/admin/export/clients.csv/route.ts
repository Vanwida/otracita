import { db } from '@/db';
import { clients } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { getAdminUser } from '@/lib/auth/require-admin';
import { toCsv, csvFilename } from '@/lib/admin/csv';

export const dynamic = 'force-dynamic';

/**
 * Export CSV de clientes (barberías). Solo columnas operativas — nunca
 * exportamos tokens ni access tokens ni secretos. Si en algún momento se
 * añadiera, hay que asegurarse de filtrar aquí (esta función NO toca
 * `whatsappAccessToken`, `sumupAccessToken`, etc.).
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));

  // Mapear solo lo seguro a exportar
  const safe = rows.map((c) => ({
    businessName: c.businessName,
    ownerName: c.ownerName,
    email: c.email,
    phone: c.phone,
    whatsappNumber: c.whatsappNumber,
    city: c.city,
    address: c.address,
    status: c.status,
    tier: c.tier,
    billingInterval: c.billingInterval,
    trialEndsAt: c.trialEndsAt,
    stripeConnectStatus: c.stripeConnectStatus,
    publicSlug: c.publicSlug,
    fiscalNif: c.fiscalNif,
    invoicingEnabled: c.invoicingEnabled,
    createdAt: c.createdAt,
    onboardedAt: c.onboardedAt,
  }));

  const csv = toCsv(safe, [
    { key: 'businessName', header: 'Negocio' },
    { key: 'ownerName', header: 'Dueno' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Telefono' },
    { key: 'whatsappNumber', header: 'WhatsApp' },
    { key: 'city', header: 'Ciudad' },
    { key: 'address', header: 'Direccion' },
    { key: 'status', header: 'Estado' },
    { key: 'tier', header: 'Tier' },
    { key: 'billingInterval', header: 'Intervalo' },
    { key: 'trialEndsAt', header: 'Fin trial' },
    { key: 'stripeConnectStatus', header: 'Stripe Connect' },
    { key: 'publicSlug', header: 'Slug publico' },
    { key: 'fiscalNif', header: 'NIF fiscal' },
    { key: 'invoicingEnabled', header: 'Facturacion activa' },
    { key: 'createdAt', header: 'Creado' },
    { key: 'onboardedAt', header: 'Onboarded' },
  ]);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('clientes')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
