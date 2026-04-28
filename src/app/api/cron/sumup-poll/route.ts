import { requireCron } from '@/lib/auth/require-cron'
import { listConnectedClients, pollClient } from '@/lib/sumup/poll'

// -----------------------------------------------------------------------------
// GET /api/cron/sumup-poll
//
// Cron Vercel cada 10 min — itera todos los clients con SumUp conectado y
// trae las transactions nuevas desde su last_polled_at. Cada client se
// procesa de forma aislada: un fallo en uno no rompe el resto.
//
// Idempotencia: cash_movements.sumup_transaction_id UNIQUE evita duplicar
// si el cron se ejecuta dos veces (Vercel a veces lo hace bajo carga).
// -----------------------------------------------------------------------------

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const unauth = requireCron(req)
  if (unauth) return unauth

  const ids = await listConnectedClients()
  const summaries = []

  for (const id of ids) {
    try {
      const s = await pollClient(id)
      summaries.push(s)
    } catch (err) {
      console.error('[cron/sumup-poll] uncaught error for client', id, err)
      summaries.push({ clientId: id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return Response.json({
    success: true,
    clientsProcessed: ids.length,
    summaries,
  })
}
