// -----------------------------------------------------------------------------
// L-13 — candado de hueco (barbero + día).
//
// EL PROBLEMA
// `createBooking` lee la agenda del día (¿choca este hueco?) y DESPUÉS inserta.
// Entre la lectura y la escritura hay varios `await` (descansos, bloqueos,
// resolución de "cualquier barbero"). Dos peticiones simultáneas al último
// hueco leen las dos "libre" y las dos insertan: dos 201 al mismo minuto.
//
// POR QUÉ NO SE ARREGLA CON UNA TRANSACCIÓN NORMAL
// El driver de la app es `neon-http`: cada consulta viaja en su propia petición
// HTTP y no hay sesión, así que no hay BEGIN/COMMIT ni candados de sesión que
// sobrevivan de una consulta a la siguiente.
//
// POR QUÉ NO SE ARREGLA CON UN UNIQUE (barber, date, time)
// Porque el barbero SÍ puede solapar citas a propósito desde el panel
// (`allowOverlap`). Un unique rígido le rompería ese flujo legítimo.
//
// LA SOLUCIÓN
// Abrimos UNA conexión de sesión (driver WebSocket, mismo DATABASE_URL) sólo
// para sostener un `pg_advisory_xact_lock` por (día, barbero) mientras corre la
// sección crítica. Es un candado *de transacción*, no de sesión: se suelta solo
// al COMMIT/ROLLBACK y funciona igual detrás del pooler de Neon.
//
// La lectura y la escritura de la reserva siguen yendo por `neon-http`, y eso
// es correcto: quien tiene el candado sólo lo suelta al hacer COMMIT, y el
// COMMIT ocurre después de que su INSERT ya está confirmado. Así, la siguiente
// petición que entra al candado lee una agenda que YA incluye la reserva de la
// anterior, y rebota con 409.
// -----------------------------------------------------------------------------

/** Par de int4 que identifica un recurso de `pg_advisory_xact_lock`. */
export type SlotLockKey = readonly [number, number]

/** Subconjunto de `pg.PoolClient` que necesitamos (lo cumplen `pg` y Neon). */
export interface SlotLockClient {
  query(text: string, values?: unknown[]): Promise<unknown>
  release(err?: boolean): void
}

export interface SlotLockOptions {
  /** Cómo conseguir una conexión de sesión. Por defecto, el pool de Neon. */
  connect?: () => Promise<SlotLockClient>
  /** Cuánto esperamos por el candado antes de rendirnos. */
  lockTimeoutMs?: number
}

/**
 * Espera máxima por el candado. La sección crítica son un par de SELECT y un
 * INSERT (~100-300 ms), así que 5 s equivale a una cola de más de 15 peticiones
 * al MISMO barbero y día — no pasa en una barbería real. Existe para que un
 * candado atascado devuelva un error en vez de colgar la petición.
 */
export const SLOT_LOCK_TIMEOUT_MS = 5_000

/** SQLSTATE `lock_not_available` — lo que devuelve Postgres al vencer `lock_timeout`. */
const SQLSTATE_LOCK_NOT_AVAILABLE = '55P03'

/** Separa el namespace del valor, para que no se peguen al hashear. */
const KEY_SEPARATOR = ' '

/** Namespace del candado: aísla estas claves de cualquier otro uso futuro de advisory locks. */
const LOCK_NAMESPACE = 'otracita:booking-slot'

/** No hay barbero resuelto todavía — no debería ocurrir, pero nunca hasheamos vacío. */
const NO_BARBER = '(sin-barbero)'

/** Se agotó la espera por el candado: el hueco está siendo reservado ahora mismo. */
export class SlotLockTimeoutError extends Error {
  constructor() {
    super('No se pudo bloquear el hueco: otra reserva lo está ocupando ahora mismo.')
    this.name = 'SlotLockTimeoutError'
  }
}

/** FNV-1a de 32 bits. Determinista y estable entre procesos, y ya cabe en un int4. */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash | 0 // `Math.imul` ya devuelve int32 con signo
}

/**
 * Claves de candado para un día y un conjunto de barberos candidatos.
 *
 * - Con barbero explícito → una clave (sólo se serializa esa agenda).
 * - Con "cualquier disponible" → una por barbero activo, porque hasta que no
 *   entramos en la sección crítica no sabemos a quién nos van a asignar.
 *
 * Vienen ORDENADAS y sin duplicados a propósito: todas las peticiones adquieren
 * los candados en el mismo orden global, que es lo que impide que dos peticiones
 * con conjuntos solapados se bloqueen mutuamente (deadlock).
 */
export function slotLockKeys(date: string, barberIds: (string | null | undefined)[]): SlotLockKey[] {
  const unique = new Set<string>()
  for (const raw of barberIds) {
    const barber = raw && raw.trim() ? raw.trim() : NO_BARBER
    unique.add(barber)
  }

  // key1 = el día (igual para todas las claves de esta llamada), key2 = el barbero.
  const dayKey = fnv1a32(`${LOCK_NAMESPACE}${KEY_SEPARATOR}${date}`)
  const keys: SlotLockKey[] = [...unique].map(
    (barber) => [dayKey, fnv1a32(`${LOCK_NAMESPACE}${KEY_SEPARATOR}${barber}`)] as SlotLockKey,
  )

  keys.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  // El Set ya deduplica por barbero; esto cubre además una colisión de hash.
  return keys.filter((k, i) => i === 0 || k[0] !== keys[i - 1][0] || k[1] !== keys[i - 1][1])
}

/**
 * SQL de adquisición: BEGIN + `lock_timeout` + un `pg_advisory_xact_lock` por
 * clave, todo en un mensaje.
 *
 * Los valores van interpolados y no como parámetros porque el protocolo
 * extendido (el que soporta `$1`) sólo admite UNA sentencia por mensaje, y eso
 * costaría un salto de red por candado. Es seguro porque aquí no entra nada del
 * usuario: son enteros que genera `slotLockKeys`. Aun así los verificamos —
 * cualquier cosa que no sea un int4 aborta antes de tocar la base.
 */
function buildAcquireSql(keys: SlotLockKey[], lockTimeoutMs: number): string {
  assertInt(lockTimeoutMs, 0, 2147483647, 'lockTimeoutMs')
  const locks = keys.map(([key1, key2]) => {
    assertInt(key1, -2147483648, 2147483647, 'key1')
    assertInt(key2, -2147483648, 2147483647, 'key2')
    return `SELECT pg_advisory_xact_lock(${key1}, ${key2})`
  })
  // SET LOCAL con un entero desnudo = milisegundos, y sólo para esta transacción.
  return ['BEGIN', `SET LOCAL lock_timeout = ${lockTimeoutMs}`, ...locks].join('; ')
}

function assertInt(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`slot-lock: ${label} debe ser un int4 válido, llegó ${value}`)
  }
}

/** Conexión de sesión por defecto: el pool WebSocket de Neon (mismo DATABASE_URL). */
async function defaultConnect(): Promise<SlotLockClient> {
  const { acquireSessionClient } = await import('@/db/session')
  return acquireSessionClient()
}

function isLockTimeout(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === SQLSTATE_LOCK_NOT_AVAILABLE
  )
}

/**
 * Corre `fn` con los candados de `keys` tomados, y los suelta pase lo que pase.
 *
 * Lanza `SlotLockTimeoutError` si no consigue los candados a tiempo. Cualquier
 * otro fallo (base caída, conexión rota) se propaga tal cual: preferimos que la
 * reserva falle a crearla sin candado y arriesgar un doble hueco.
 */
export async function withSlotLock<T>(
  keys: SlotLockKey[],
  fn: () => Promise<T>,
  options: SlotLockOptions = {},
): Promise<T> {
  // Sin barberos que bloquear no hay carrera que evitar; no abrimos conexión.
  if (keys.length === 0) return fn()

  const connect = options.connect ?? defaultConnect
  const lockTimeoutMs = options.lockTimeoutMs ?? SLOT_LOCK_TIMEOUT_MS

  const acquire = buildAcquireSql(keys, lockTimeoutMs)

  const client = await connect()
  let inTransaction = false
  try {
    // Un solo viaje de ida y vuelta para BEGIN + timeout + todos los candados.
    // Importa: cada consulta suelta es un salto de red a Neon, y esto está en
    // el camino de CADA reserva. En protocolo simple (sin parámetros) Postgres
    // acepta varias sentencias en un único mensaje.
    inTransaction = true
    try {
      await client.query(acquire)
    } catch (err) {
      if (isLockTimeout(err)) throw new SlotLockTimeoutError()
      throw err
    }

    return await fn()
  } finally {
    // ROLLBACK y no COMMIT: la transacción sólo sostiene candados, nunca escribe
    // (la reserva se inserta por `neon-http`, fuera de esta conexión). Cualquiera
    // de los dos suelta los advisory locks; ROLLBACK deja claro que aquí no hay
    // nada que persistir.
    if (inTransaction) {
      try {
        await client.query('ROLLBACK')
      } catch (err) {
        console.error('[slot-lock] ROLLBACK falló:', err)
      }
    }
    client.release()
  }
}
