import { Preferences } from '@capacitor/preferences'

// -----------------------------------------------------------------------------
// Session — guarda/lee el token de la app móvil.
//
// En iOS, @capacitor/preferences usa NSUserDefaults (NO Keychain por defecto).
// Para Tap to Pay y datos sensibles, en producción habría que migrar a
// `capacitor-secure-storage-plugin` o similar que use Keychain real. Por
// ahora Preferences es suficiente para MVP — el token es revocable desde
// el server.
// -----------------------------------------------------------------------------

const TOKEN_KEY = 'otracita_session_token'
const BUSINESS_KEY = 'otracita_business'

interface BusinessInfo {
  id: string
  name: string
}

export async function saveSession(token: string, business: BusinessInfo): Promise<void> {
  await Preferences.set({ key: TOKEN_KEY, value: token })
  await Preferences.set({ key: BUSINESS_KEY, value: JSON.stringify(business) })
}

export async function getSessionToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: TOKEN_KEY })
  return value || null
}

export async function getBusinessInfo(): Promise<BusinessInfo | null> {
  const { value } = await Preferences.get({ key: BUSINESS_KEY })
  if (!value) return null
  try {
    return JSON.parse(value) as BusinessInfo
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  await Preferences.remove({ key: TOKEN_KEY })
  await Preferences.remove({ key: BUSINESS_KEY })
}
