import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// -----------------------------------------------------------------------------
// Hash de PIN del equipo — scrypt nativo (Node), sin dependencia externa.
//
// Por qué scrypt y no bcrypt:
//   · El proyecto NO usa bcrypt en runtime (las contraseñas de Better Auth
//     viven en su backend); añadir una dep nativa con builds binarios cuesta
//     ciclos de CI y multiplica superficie de ataque por una sola feature.
//   · scrypt es FIPS-friendly, viene en Node ≥ 10 y tiene parámetros de coste
//     comparables. PIN de 4-6 dígitos: brute-force en cliente no es un
//     vector real (rate-limit a 5 intentos/hora por IP en el login), así
//     que el factor "lentitud" del hash es importante para el escenario
//     de DB-dump, no para online.
//
// Formato de storage (todo en una sola string):
//
//     scrypt$<N>$<r>$<p>$<saltHex>$<keyHex>
//
// Embedding los parámetros permite rehashear si subimos coste en el
// futuro sin migración (verify lee los params del propio hash).
// -----------------------------------------------------------------------------

const SCHEME = 'scrypt'
const N = 16384       // CPU/memory cost (2^14). Balanceado para edge runtimes.
const r = 8           // block size
const p = 1           // parallelization
const KEY_LEN = 32    // 256-bit derived key
const SALT_LEN = 16   // 128-bit salt

const PIN_REGEX = /^\d{4,6}$/

/** Valida formato de PIN: solo dígitos, 4-6 chars. NO valida fortaleza. */
export function isValidPinFormat(pin: string): boolean {
  return PIN_REGEX.test(pin)
}

/**
 * Genera un PIN aleatorio numérico de la longitud dada (default 6).
 * Usa randomBytes y módulo 10 — distribución uniforme para 4-6 dígitos.
 */
export function generatePin(length = 6): string {
  if (length < 4 || length > 6) {
    throw new Error('PIN length must be 4-6 digits')
  }
  // Cada dígito = un byte aleatorio % 10. Sesgo despreciable a esta escala
  // (256 % 10 = 6 → sesgo de 6/256 ≈ 2.3% en el byte; irrelevante para PIN
  // compartido del equipo, no para crypto keys).
  const bytes = randomBytes(length)
  let pin = ''
  for (let i = 0; i < length; i++) {
    pin += (bytes[i]! % 10).toString()
  }
  return pin
}

/**
 * Hashea un PIN con scrypt + salt aleatorio. Devuelve la string canónica
 * `scrypt$N$r$p$saltHex$keyHex` lista para guardar en DB.
 */
export function hashPin(pin: string): string {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be 4-6 digits')
  }
  const salt = randomBytes(SALT_LEN)
  const key = scryptSync(pin, salt, KEY_LEN, { N, r, p })
  return `${SCHEME}$${N}$${r}$${p}$${salt.toString('hex')}$${key.toString('hex')}`
}

/**
 * Verifica un PIN contra un hash en formato canónico. Comparación
 * timing-safe sobre la key derivada para evitar leaks de info por timing.
 * Devuelve false ante cualquier hash malformado (no lanza).
 */
export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !pin) return false
  if (!isValidPinFormat(pin)) return false

  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== SCHEME) return false

  const nParam = Number.parseInt(parts[1]!, 10)
  const rParam = Number.parseInt(parts[2]!, 10)
  const pParam = Number.parseInt(parts[3]!, 10)
  if (!Number.isFinite(nParam) || !Number.isFinite(rParam) || !Number.isFinite(pParam)) {
    return false
  }

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4]!, 'hex')
    expected = Buffer.from(parts[5]!, 'hex')
  } catch {
    return false
  }
  if (expected.length === 0) return false

  let derived: Buffer
  try {
    derived = scryptSync(pin, salt, expected.length, {
      N: nParam,
      r: rParam,
      p: pParam,
    })
  } catch {
    return false
  }
  if (derived.length !== expected.length) return false

  return timingSafeEqual(derived, expected)
}
