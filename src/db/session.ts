import { Pool, type PoolClient } from '@neondatabase/serverless'

// -----------------------------------------------------------------------------
// Conexión de SESIÓN a la misma base que `@/db`.
//
// `@/db` usa el driver `neon-http`: cada consulta es una petición HTTP suelta,
// sin sesión. Va perfecto para el 99% del código (rápido, sin conexiones que
// gestionar), pero no puede abrir una transacción ni sostener un candado entre
// dos consultas.
//
// Este pool va por WebSocket contra el MISMO `DATABASE_URL` y sí mantiene una
// sesión, así que admite BEGIN/COMMIT. Se usa sólo donde hace falta
// serializar de verdad — hoy, el candado de hueco de L-13
// (`@/lib/bookings/slot-lock`). Todo lo demás sigue por `@/db`.
//
// No hace falta polyfill de WebSocket: el runtime de Node de Vercel (24 LTS)
// trae `WebSocket` global, igual que el Node local.
// -----------------------------------------------------------------------------

/**
 * Conexiones simultáneas por instancia. Cada una vive lo que dura una sección
 * crítica (~100-300 ms), así que con pocas se sirve mucho tráfico. Se mantiene
 * bajo a propósito: `DATABASE_URL` apunta al endpoint directo de Neon, que
 * tiene un límite de conexiones bastante más ajustado que el pooler.
 */
const SESSION_POOL_MAX = 4

/** Una conexión ociosa no se guarda mucho: Fluid Compute reutiliza instancias. */
const SESSION_POOL_IDLE_MS = 10_000

/** Si la base no da conexión en este tiempo, fallamos rápido en vez de colgar. */
const SESSION_CONNECT_TIMEOUT_MS = 10_000

let pool: Pool | null = null

function getSessionPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL!,
      max: SESSION_POOL_MAX,
      idleTimeoutMillis: SESSION_POOL_IDLE_MS,
      connectionTimeoutMillis: SESSION_CONNECT_TIMEOUT_MS,
    })
    // Un error en una conexión ociosa no debe tumbar el proceso.
    pool.on('error', (err: unknown) => {
      console.error('[db/session] error en conexión ociosa:', err)
    })
  }
  return pool
}

/**
 * Toma una conexión de sesión del pool. Quien la pide DEBE llamar a
 * `client.release()` (usa `try/finally`) o el pool se queda seco.
 */
export async function acquireSessionClient(): Promise<PoolClient> {
  return getSessionPool().connect()
}
