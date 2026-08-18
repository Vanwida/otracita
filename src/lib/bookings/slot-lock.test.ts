import test from 'node:test'
import assert from 'node:assert/strict'
import {
  slotLockKeys,
  withSlotLock,
  SlotLockTimeoutError,
  type SlotLockClient,
} from './slot-lock.ts'

// -----------------------------------------------------------------------------
// L-13 — dos personas no se quedan el mismo hueco.
//
// La parte pura (derivación de claves) corre siempre. La parte de carrera
// necesita un Postgres de verdad: se salta sola si no hay `L13_TEST_PG_URL`,
// así `npm test` sigue verde sin base de datos.
//
// Levantar uno efímero para correrlas:
//   initdb -D /tmp/l13-pg/data -U postgres --auth=trust
//   pg_ctl -D /tmp/l13-pg/data -o "-p 55432 -k /tmp/l13-pg" start
//   createdb -h /tmp/l13-pg -p 55432 -U postgres l13test
//   L13_TEST_PG_URL=postgresql://postgres@localhost:55432/l13test \
//     node --experimental-strip-types --test src/lib/bookings/slot-lock.test.ts
// -----------------------------------------------------------------------------

// --- Parte pura ---------------------------------------------------------------

test('slotLockKeys es determinista para la misma entrada', () => {
  const a = slotLockKeys('2026-08-20', ['b1', 'b2'])
  const b = slotLockKeys('2026-08-20', ['b1', 'b2'])
  assert.deepEqual(a, b)
})

test('slotLockKeys ordena ascendente — sin esto dos peticiones con los mismos barberos en distinto orden se abrazan (deadlock)', () => {
  const forward = slotLockKeys('2026-08-20', ['b1', 'b2', 'b3'])
  const reverse = slotLockKeys('2026-08-20', ['b3', 'b2', 'b1'])
  assert.deepEqual(forward, reverse, 'el orden de entrada no puede cambiar el orden de adquisición')

  for (let i = 1; i < forward.length; i++) {
    const [p1, p2] = forward[i - 1]
    const [c1, c2] = forward[i]
    assert.ok(p1 < c1 || (p1 === c1 && p2 < c2), `claves no ordenadas en ${i}`)
  }
})

test('slotLockKeys deduplica — un barbero repetido no se bloquea dos veces', () => {
  assert.equal(slotLockKeys('2026-08-20', ['b1', 'b1', 'b1']).length, 1)
})

test('slotLockKeys separa por día — el mismo barbero en dos fechas no contiende', () => {
  const [lunes] = slotLockKeys('2026-08-20', ['b1'])
  const [martes] = slotLockKeys('2026-08-21', ['b1'])
  assert.notDeepEqual(lunes, martes)
})

test('slotLockKeys separa por barbero — dos barberos el mismo día no contienden', () => {
  const [uno] = slotLockKeys('2026-08-20', ['b1'])
  const [otro] = slotLockKeys('2026-08-20', ['b2'])
  assert.notDeepEqual(uno, otro)
})

test('slotLockKeys emite int4 válidos — Postgres rechaza cualquier cosa fuera de rango', () => {
  const keys = slotLockKeys('2026-08-20', [
    '6f1a9c30-1111-4aaa-9bbb-000000000001',
    '6f1a9c30-1111-4aaa-9bbb-000000000002',
    'Sin preferencia',
    '',
  ])
  for (const [k1, k2] of keys) {
    for (const k of [k1, k2]) {
      assert.ok(Number.isInteger(k), `${k} no es entero`)
      assert.ok(k >= -2147483648 && k <= 2147483647, `${k} fuera del rango int4`)
    }
  }
})

test('slotLockKeys sin barberos → sin claves (el caller no debe abrir transacción)', () => {
  assert.deepEqual(slotLockKeys('2026-08-20', []), [])
})

test('withSlotLock sin claves no toca la base de datos', async () => {
  let connected = false
  const out = await withSlotLock([], async () => 'ok', {
    connect: async () => {
      connected = true
      throw new Error('no debería conectar')
    },
  })
  assert.equal(out, 'ok')
  assert.equal(connected, false)
})

// --- Parte de carrera (necesita Postgres) -------------------------------------

const PG_URL = process.env.L13_TEST_PG_URL
// Sin base de datos estas se saltan; el resto del fichero sigue corriendo.
const needsPg = { skip: PG_URL ? false : 'necesita L13_TEST_PG_URL' }

// `pg` sólo se carga si hay base de datos, para no arrastrarlo en el test puro.
type PgPool = {
  connect: () => Promise<SlotLockClient>
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  end: () => Promise<void>
}

async function makePool(): Promise<PgPool> {
  const pg = await import('pg')
  const Pool = (pg.default ?? pg).Pool
  return new Pool({ connectionString: PG_URL, max: 12 }) as unknown as PgPool
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Reproduce la forma exacta del bug: LEER (¿hay algo en el hueco?) y
 * después ESCRIBIR, con hueco temporal entre ambas. Igual que createBooking,
 * la lectura y la escritura van por una conexión DISTINTA a la que sostiene
 * el candado — así se comprueba que el candado ordena bien entre conexiones.
 */
async function reserveIfFree(pool: PgPool, slot: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM slot_probe WHERE slot = $1', [
    slot,
  ])
  if ((rows[0].n as number) > 0) return false
  await sleep(60) // la ventana TOCTOU
  await pool.query('INSERT INTO slot_probe (slot) VALUES ($1)', [slot])
  return true
}

async function countSlot(pool: PgPool, slot: string): Promise<number> {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM slot_probe WHERE slot = $1', [
    slot,
  ])
  return rows[0].n as number
}

test('CONTROL: sin candado, dos peticiones simultáneas se quedan el mismo hueco (el bug)', needsPg, async () => {
  const pool = await makePool()
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS slot_probe (id serial PRIMARY KEY, slot text NOT NULL)')
    const slot = 'control-' + process.hrtime.bigint().toString()

    const [a, b] = await Promise.all([reserveIfFree(pool, slot), reserveIfFree(pool, slot)])

    assert.equal(a, true)
    assert.equal(b, true, 'sin candado ambas creen que el hueco está libre')
    assert.equal(await countSlot(pool, slot), 2, 'doble reserva — este es L-13')
  } finally {
    await pool.end()
  }
})

test('CON CANDADO: dos peticiones simultáneas al mismo hueco → sólo una entra', needsPg, async () => {
  const pool = await makePool()
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS slot_probe (id serial PRIMARY KEY, slot text NOT NULL)')
    const slot = 'locked-' + process.hrtime.bigint().toString()
    const keys = slotLockKeys('2026-08-20', ['barbero-uno'])
    const connect = () => pool.connect()

    const [a, b] = await Promise.all([
      withSlotLock(keys, () => reserveIfFree(pool, slot), { connect }),
      withSlotLock(keys, () => reserveIfFree(pool, slot), { connect }),
    ])

    assert.deepEqual([a, b].sort(), [false, true], 'una entra (201) y la otra rebota (409)')
    assert.equal(await countSlot(pool, slot), 1, 'exactamente una reserva')
  } finally {
    await pool.end()
  }
})

test('CON CANDADO: el orden de los barberos no importa — dos peticiones cruzadas no se abrazan', needsPg, async () => {
  const pool = await makePool()
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS slot_probe (id serial PRIMARY KEY, slot text NOT NULL)')
    const slot = 'cruzado-' + process.hrtime.bigint().toString()
    const connect = () => pool.connect()
    // Petición A pide "cualquiera" con el equipo en un orden; la B en el opuesto.
    const keysA = slotLockKeys('2026-08-20', ['b-aaa', 'b-bbb', 'b-ccc'])
    const keysB = slotLockKeys('2026-08-20', ['b-ccc', 'b-bbb', 'b-aaa'])

    const [a, b] = await Promise.all([
      withSlotLock(keysA, () => reserveIfFree(pool, slot), { connect, lockTimeoutMs: 4000 }),
      withSlotLock(keysB, () => reserveIfFree(pool, slot), { connect, lockTimeoutMs: 4000 }),
    ])

    assert.deepEqual([a, b].sort(), [false, true])
    assert.equal(await countSlot(pool, slot), 1)
  } finally {
    await pool.end()
  }
})

test('CON CANDADO: barberos distintos NO se serializan entre sí', needsPg, async () => {
  const pool = await makePool()
  try {
    const connect = () => pool.connect()
    let concurrentes = 0
    let pico = 0
    const cuerpo = async () => {
      pico = Math.max(pico, ++concurrentes)
      await sleep(120)
      concurrentes--
    }

    await Promise.all([
      withSlotLock(slotLockKeys('2026-08-20', ['barbero-uno']), cuerpo, { connect }),
      withSlotLock(slotLockKeys('2026-08-20', ['barbero-dos']), cuerpo, { connect }),
    ])

    assert.equal(pico, 2, 'el candado es por barbero+día, no por barbería entera')
  } finally {
    await pool.end()
  }
})

test('CON CANDADO: el candado se suelta aunque el cuerpo reviente', needsPg, async () => {
  const pool = await makePool()
  try {
    const connect = () => pool.connect()
    const keys = slotLockKeys('2026-08-20', ['barbero-uno'])

    await assert.rejects(
      withSlotLock(keys, async () => {
        throw new Error('boom')
      }, { connect }),
      /boom/,
    )

    // Si no se hubiera soltado, esto se quedaría colgado hasta el timeout.
    const out = await withSlotLock(keys, async () => 'libre', { connect, lockTimeoutMs: 2000 })
    assert.equal(out, 'libre')
  } finally {
    await pool.end()
  }
})

test('CON CANDADO: esperar demasiado da SlotLockTimeoutError, no un cuelgue', needsPg, async () => {
  const pool = await makePool()
  try {
    const connect = () => pool.connect()
    const keys = slotLockKeys('2026-08-20', ['barbero-lento'])

    let soltar!: () => void
    const retenido = new Promise<void>((r) => (soltar = r))
    const enCurso = withSlotLock(keys, () => retenido, { connect })
    await sleep(150) // asegura que el primero ya tiene el candado

    await assert.rejects(
      withSlotLock(keys, async () => 'nunca', { connect, lockTimeoutMs: 250 }),
      (err: unknown) => err instanceof SlotLockTimeoutError,
    )

    soltar()
    await enCurso
  } finally {
    await pool.end()
  }
})
