import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { PKPass } from 'passkit-generator'
import type { ClientRow } from '@/lib/auth/require-client-access'
import { SITE_ORIGIN, publicPagePath, siteUrl } from '@/lib/site'
import { getInk } from '@/app/[slug]/brand-utils'
import { getWalletCerts } from './cert'

// -----------------------------------------------------------------------------
// wallet/pass — builder canónico del .pkpass de una barbería.
//
// Tipo de pass: "generic" (la barbería NO es un boarding pass ni un evento
// concreto; es un loyalty-style card que vive en Wallet con el QR del cliente
// para escanear en el local). Apple no tiene un tipo "shop" — generic +
// auxiliaryFields/backFields es el canon para este uso.
//
// Estructura visual:
//   · Background: brandColor del cliente (fallback ink espresso)
//   · Foreground/label: blanco o negro según luminancia del background
//   · Header: businessName
//   · Primary: slug como CTA visible ("otracita.es/{slug}")
//   · Secondary: dirección
//   · Auxiliary: teléfono
//   · Back: horarios, link PWA, otracita pie de firma
//   · Barcode: QR con la URL pública de la PWA (= deep link a reservar)
//   · Locations: [{lat,lng}] si están seteadas, con relevantText geofence
//
// V1: no implementamos Apple Push de updates (V1.5). Por eso seteamos
// webServiceURL + authenticationToken como stubs — los endpoints viven en
// /api/wallet/v1/* y devuelven 304/204/200 sin persistir nada. Cuando V1.5
// llegue, los mismos passes ya emitidos podrán recibir updates sin que el
// cliente tenga que reinstalarlos.
// -----------------------------------------------------------------------------

const PASS_ASSETS_DIR = path.join(process.cwd(), 'public', 'wallet-assets')

// Cache de los assets PNG (icon/logo). Se leen 1 vez por proceso (lambda
// warm). Pequeños (~1 KB cada uno), no merece la pena complicar el cache
// con TTL — se invalida con el redeploy.
let cachedAssets: { [filename: string]: Buffer } | null = null

const REQUIRED_ASSETS = [
  'icon.png',
  'icon@2x.png',
  'icon@3x.png',
  'logo.png',
  'logo@2x.png',
] as const

async function loadAssets(): Promise<{ [filename: string]: Buffer }> {
  if (cachedAssets) return cachedAssets
  const entries = await Promise.all(
    REQUIRED_ASSETS.map(async (name) => {
      const buf = await fs.readFile(path.join(PASS_ASSETS_DIR, name))
      return [name, buf] as const
    }),
  )
  cachedAssets = Object.fromEntries(entries)
  return cachedAssets
}

// ── Color helpers ──────────────────────────────────────────────────────────
//
// Apple Wallet espera colores en formato "rgb(r, g, b)" — passkit-generator
// acepta tanto hex como rgb, pero rgb es lo que iOS quiere ver en el pass.json
// final para que renderice sin avisos.

const DEFAULT_BRAND_HEX = '#2A1D14' // = BRAND_INK_HEX. Duplicado por evitar
                                     // un import circular con brand-hex.ts (este
                                     // módulo es lib-leaf, sin deps cruzadas).

function hexToRgbString(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hexToRgbString(DEFAULT_BRAND_HEX)
  const n = parseInt(m[1], 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

function pickBrandHex(client: ClientRow): string {
  if (client.brandColor && /^#[0-9a-f]{6}$/i.test(client.brandColor)) {
    return client.brandColor
  }
  return DEFAULT_BRAND_HEX
}

/**
 * Devuelve un color de label legible sobre el background. Mismo criterio
 * que `getInk` pero suavizado: el label en Wallet va sobre la franja superior
 * del background, así que damos un alpha-blend (rgb sólido sirve, iOS no
 * pinta alphas en labels — usamos el ink mismo o un gris cercano).
 */
function pickLabelColor(backgroundHex: string): string {
  return getInk(backgroundHex) === '#000000'
    ? 'rgb(60, 60, 60)' // texto label cerca-negro
    : 'rgb(230, 230, 230)' // texto label cerca-blanco
}

// ── Hours formatting (back field) ──────────────────────────────────────────

type HoursMap = Record<string, string>

const DAY_LABELS: { key: string; label: string }[] = [
  { key: 'lunes', label: 'Lun' },
  { key: 'martes', label: 'Mar' },
  { key: 'miercoles', label: 'Mié' },
  { key: 'jueves', label: 'Jue' },
  { key: 'viernes', label: 'Vie' },
  { key: 'sabado', label: 'Sáb' },
  { key: 'domingo', label: 'Dom' },
]

function formatHours(hours: unknown): string {
  if (!hours || typeof hours !== 'object') return 'Consulta horarios en la PWA.'
  const map = hours as HoursMap
  const lines: string[] = []
  for (const { key, label } of DAY_LABELS) {
    const v = (map[key] ?? '').toString().trim()
    if (!v || v === 'Cerrado') {
      lines.push(`${label}: Cerrado`)
    } else {
      lines.push(`${label}: ${v}`)
    }
  }
  return lines.join('\n')
}

// ── Auth token ─────────────────────────────────────────────────────────────

/**
 * Genera un authenticationToken aleatorio. Apple exige >=16 chars; usamos
 * 32 hex (128 bits) por margen. NO se persiste en V1 — los endpoints de
 * device-registration son stubs que no validan estrictamente. Cuando V1.5
 * llegue, la tabla `wallet_passes` lo guardará y los stubs lo verificarán.
 */
function generateAuthToken(): string {
  return crypto.randomBytes(16).toString('hex')
}

// ── Builder ────────────────────────────────────────────────────────────────

export interface BuildPassResult {
  buffer: Buffer
  /** Token generado para este pass. No se persiste en V1. */
  authenticationToken: string
}

/**
 * Construye el .pkpass para un cliente concreto. Lanza si los certs no
 * están configurados; el caller debe traducirlo en 503 (ver
 * /api/wallet/[slug]).
 */
export async function buildPassForClient(client: ClientRow): Promise<BuildPassResult> {
  const certs = getWalletCerts()
  if (!certs) {
    throw new WalletConfigError(
      'Apple Wallet pass signing está sin configurar (faltan APPLE_WALLET_* env vars).',
    )
  }
  if (!client.publicSlug) {
    throw new Error('Client no tiene publicSlug; no se puede emitir pass.')
  }

  const assets = await loadAssets()
  const pwaUrl = siteUrl(publicPagePath(client.publicSlug))

  const brandHex = pickBrandHex(client)
  const backgroundColor = hexToRgbString(brandHex)
  const foregroundHex = getInk(brandHex)
  const foregroundColor = hexToRgbString(foregroundHex)
  const labelColor = pickLabelColor(brandHex)

  const authenticationToken = generateAuthToken()
  const webServiceURL = `${SITE_ORIGIN}/api/wallet/v1`

  const passProps: ConstructorParameters<typeof PKPass>[2] = {
    formatVersion: 1,
    passTypeIdentifier: certs.passTypeId,
    teamIdentifier: certs.teamId,
    organizationName: client.businessName || 'otracita',
    serialNumber: `${client.id}-v1`,
    description: `Tarjeta de ${client.businessName || 'tu barbería'}`,
    logoText: client.businessName || 'otracita',
    backgroundColor,
    foregroundColor,
    labelColor,
    webServiceURL,
    authenticationToken,
    // Sharing está bien (cliente puede pasar el pass a un amigo — es
    // marketing, no datos personales). Si en algún momento ponemos info
    // PII (saldo loyalty, citas), invertir a true.
    sharingProhibited: false,
  }

  const pass = new PKPass(
    {
      'icon.png': assets['icon.png'],
      'icon@2x.png': assets['icon@2x.png'],
      'icon@3x.png': assets['icon@3x.png'],
      'logo.png': assets['logo.png'],
      'logo@2x.png': assets['logo@2x.png'],
    },
    {
      wwdr: certs.wwdr,
      signerCert: certs.signerCert,
      signerKey: certs.signerKey,
      signerKeyPassphrase: certs.signerKeyPassphrase,
    },
    passProps,
  )

  // Tipo: generic. SETEAR el type _crea_ los buckets de fields vacíos
  // (primaryFields, etc.) — luego los empujamos.
  pass.type = 'generic'

  // ── Header: un detalle pequeño (la "@" del slug, estilo Apple Card).
  pass.headerFields.push({
    key: 'shop',
    label: 'BARBERÍA',
    value: client.businessName || 'otracita',
  })

  // ── Primary: el slug como CTA. Es lo más grande del pass — funciona
  //    como recordatorio visual de cómo abrir la PWA ("escribe otracita.es/X
  //    en cualquier navegador").
  pass.primaryFields.push({
    key: 'slug',
    label: 'RESERVA EN',
    value: `otracita.es/${client.publicSlug}`,
  })

  // ── Secondary: dirección (si la hay)
  if (client.address) {
    pass.secondaryFields.push({
      key: 'address',
      label: 'DIRECCIÓN',
      value: client.address,
    })
  }

  // ── Auxiliary: teléfono
  const phone = client.whatsappNumber || client.phone
  if (phone) {
    pass.auxiliaryFields.push({
      key: 'phone',
      label: 'TELÉFONO',
      value: phone,
    })
  }

  // ── Back fields: lo "largo" — horario, dirección completa, link PWA,
  //    teléfono clickable. iOS detecta números/links automáticamente.
  pass.backFields.push({
    key: 'pwa',
    label: 'Reserva online',
    value: pwaUrl,
    dataDetectorTypes: ['PKDataDetectorTypeLink'],
  })
  if (phone) {
    pass.backFields.push({
      key: 'phone-back',
      label: 'Teléfono',
      value: phone,
      dataDetectorTypes: ['PKDataDetectorTypePhoneNumber'],
    })
  }
  if (client.address) {
    pass.backFields.push({
      key: 'address-back',
      label: 'Dirección',
      value: client.address,
      dataDetectorTypes: ['PKDataDetectorTypeAddress'],
    })
  }
  pass.backFields.push({
    key: 'hours-back',
    label: 'Horario',
    value: formatHours(client.chatbotHours),
  })
  pass.backFields.push({
    key: 'powered',
    label: 'Powered by',
    value: 'otracita.es',
  })

  // ── Barcode QR con el deep link a la PWA. PKBarcodeFormatQR es el único
  //    formato que iOS muestra grande y fácil de escanear; PDF417 sería un
  //    tracker de longitud variable que sobra para esto.
  pass.setBarcodes({
    format: 'PKBarcodeFormatQR',
    message: pwaUrl,
    messageEncoding: 'iso-8859-1',
    altText: client.publicSlug ?? undefined,
  })

  // ── Geofence: SOLO si lat/lng están seteadas. iOS muestra el pass en
  //    lockscreen cuando el iPhone está cerca de estas coords.
  if (typeof client.latitude === 'number' && typeof client.longitude === 'number') {
    pass.setLocations({
      latitude: client.latitude,
      longitude: client.longitude,
      relevantText: `Reserva tu próximo corte en ${client.businessName || 'la barbería'}`,
    })
  }

  const buffer = pass.getAsBuffer()
  return { buffer, authenticationToken }
}

/** Error específico de configuración faltante. El API lo mapea a 503. */
export class WalletConfigError extends Error {
  readonly code = 'WALLET_NOT_CONFIGURED'
}
