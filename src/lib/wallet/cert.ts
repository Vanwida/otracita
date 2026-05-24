import { spawnSync } from 'node:child_process'
import { Buffer } from 'node:buffer'

// -----------------------------------------------------------------------------
// wallet/cert — carga y descompone los certificados de Apple Wallet desde env.
//
// Apple firma cada .pkpass con un certificado emitido para tu Pass Type ID
// + la cadena WWDR (Apple Worldwide Developer Relations). passkit-generator
// necesita el certificado y la clave privada SEPARADOS en PEM. Apple los
// entrega empaquetados en un .p12 (PKCS#12) protegido por passphrase.
//
// Estrategia V1: el barbero (o nosotros) genera el .p12 una vez en
// developer.apple.com, lo codifica en base64, y lo pega en
// APPLE_WALLET_SIGNER_CERT_P12_BASE64 + APPLE_WALLET_SIGNER_CERT_PASSPHRASE.
// Aquí lo descomponemos en signerCert/signerKey via openssl (binario
// disponible en Vercel Lambda y en macOS dev).
//
// Si los env vars faltan, devolvemos `null` (NO lanzamos). El endpoint
// /api/wallet/[slug] traduce ese null en 503, sin tirar el resto del API.
// Hasta que Alex provisione el cert real, todo lo demás del producto sigue
// funcionando — el botón "Añadir a Wallet" simplemente da 503 con un
// mensaje claro.
//
// Cacheado a nivel de módulo: la descompresión openssl corre 1 vez por
// proceso (lambda warm), no por request.
// -----------------------------------------------------------------------------

export interface WalletCerts {
  teamId: string
  passTypeId: string
  wwdr: Buffer
  signerCert: Buffer
  signerKey: Buffer
  signerKeyPassphrase: string
}

let cached: WalletCerts | null | undefined

/**
 * Devuelve los certificados parseados o `null` si la configuración no está
 * completa. Nunca lanza por env faltante — el caller decide cómo degradar
 * (típicamente: 503 con mensaje legible).
 */
export function getWalletCerts(): WalletCerts | null {
  if (cached !== undefined) return cached

  const teamId = process.env.APPLE_WALLET_TEAM_ID?.trim()
  const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim()
  const p12Base64 = process.env.APPLE_WALLET_SIGNER_CERT_P12_BASE64?.trim()
  const passphrase = process.env.APPLE_WALLET_SIGNER_CERT_PASSPHRASE ?? ''
  const wwdrPem = process.env.APPLE_WALLET_WWDR_CERT_PEM?.trim()

  if (!teamId || !passTypeId || !p12Base64 || !wwdrPem) {
    cached = null
    return null
  }

  let p12Buffer: Buffer
  try {
    p12Buffer = Buffer.from(p12Base64, 'base64')
  } catch {
    cached = null
    return null
  }

  // openssl pkcs12 -in <p12> -nocerts -nodes -passin pass:<pass>  → key (PEM)
  // openssl pkcs12 -in <p12> -clcerts -nokeys -passin pass:<pass> → cert (PEM)
  //
  // -nodes deja la clave SIN re-encriptar en PEM (passkit-generator vuelve a
  // pedirla cifrada o sin cifrar; pasamos la passphrase original como
  // `signerKeyPassphrase` por si reusamos el flujo cifrado en V1.5).
  const keyPem = runOpenssl(p12Buffer, [
    'pkcs12',
    '-in',
    '/dev/stdin',
    '-nocerts',
    '-nodes',
    '-passin',
    `pass:${passphrase}`,
    // Modern OpenSSL requires -legacy for older PKCS#12 (Apple's exporter
    // still uses RC2-40 by default). Without this, you get "unsupported"
    // errors with OpenSSL 3.
    '-legacy',
  ])
  const certPem = runOpenssl(p12Buffer, [
    'pkcs12',
    '-in',
    '/dev/stdin',
    '-clcerts',
    '-nokeys',
    '-passin',
    `pass:${passphrase}`,
    '-legacy',
  ])

  if (!keyPem || !certPem) {
    cached = null
    return null
  }

  cached = {
    teamId,
    passTypeId,
    wwdr: Buffer.from(wwdrPem, 'utf8'),
    signerCert: certPem,
    signerKey: keyPem,
    // passkit-generator descarta la passphrase si la clave ya viene sin
    // cifrar (`-nodes` arriba). La pasamos igual por simetría con la API
    // y por si en V1.5 dejamos de usar `-nodes`.
    signerKeyPassphrase: passphrase,
  }
  return cached
}

/**
 * Ejecuta `openssl` con `p12Buffer` por stdin y devuelve el stdout
 * como Buffer, o `null` si falla. Sin streaming: los .p12 son pequeños
 * (~3-5 KB), no merece la pena complicar la implementación.
 */
function runOpenssl(p12Buffer: Buffer, args: string[]): Buffer | null {
  const result = spawnSync('openssl', args, {
    input: p12Buffer,
    timeout: 10_000,
  })
  if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
    return null
  }
  // openssl pkcs12 -nocerts/-clcerts emite a veces "Bag Attributes" entre
  // bloques. passkit-generator ignora lo que no sea BEGIN/END, así que el
  // PEM crudo sirve tal cual.
  return result.stdout
}
