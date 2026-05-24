// -----------------------------------------------------------------------------
// wallet/parse-coords — extrae LAT,LNG de los formatos que el barbero suele
// pegar al copiar el local desde Google Maps.
//
// Formatos soportados:
//   · https://www.google.com/maps/place/Nombre/@41.3851,2.1734,17z/...
//   · https://www.google.com/maps?q=41.3851,2.1734
//   · https://maps.google.com/?ll=41.3851,2.1734
//   · https://maps.app.goo.gl/abc  (short link — NO se resuelve; el barbero
//     tiene que abrir el link y pegar el largo. Documentado en UI.)
//   · 41.3851,2.1734  (plain)
//   · "41.3851, 2.1734"  (con espacios)
//
// Devuelve null si no consigue extraer dos números razonables.
// Lat ∈ [-90,90], Lng ∈ [-180,180].
// -----------------------------------------------------------------------------

export interface Coords {
  latitude: number
  longitude: number
}

export function parseCoords(input: string): Coords | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // 1. @lat,lng (formato principal de Google Maps web/app)
  const atMatch = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(trimmed)
  if (atMatch) {
    const lat = parseFloat(atMatch[1])
    const lng = parseFloat(atMatch[2])
    if (isValid(lat, lng)) return { latitude: lat, longitude: lng }
  }

  // 2. q=lat,lng o ll=lat,lng (querystrings)
  const qMatch = /[?&](?:q|ll|center|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/.exec(
    trimmed,
  )
  if (qMatch) {
    const lat = parseFloat(qMatch[1])
    const lng = parseFloat(qMatch[2])
    if (isValid(lat, lng)) return { latitude: lat, longitude: lng }
  }

  // 3. Plain "lat,lng" (con o sin espacio)
  const plain = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(trimmed)
  if (plain) {
    const lat = parseFloat(plain[1])
    const lng = parseFloat(plain[2])
    if (isValid(lat, lng)) return { latitude: lat, longitude: lng }
  }

  return null
}

function isValid(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90) return false
  if (lng < -180 || lng > 180) return false
  // (0,0) lo descartamos — es un "no resuelto" implícito (Atlantic Ocean).
  if (lat === 0 && lng === 0) return false
  return true
}
