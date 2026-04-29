import { registerPlugin } from '@capacitor/core'

// -----------------------------------------------------------------------------
// SumUp Tap to Pay bridge — interfaz al plugin nativo iOS
// (`mobile/ios/App/App/SumupTapToPayPlugin.swift`).
//
// Flujo típico:
//   1) Usuario hace login en otracita Cobros (PIN → backend devuelve
//      access token OAuth de SumUp del barbero) y la app llama
//      `loginWithToken`.
//   2) Antes del primer cobro, la app llama `isAvailable()`. Si
//      `activated === false` llama `activate()` para vincular la cuenta
//      SumUp con el Apple ID.
//   3) En cada cobro: `checkout({ amount, title, foreignTransactionId })`.
//
// El SumUpSDK nativo se inicializa en AppDelegate.swift con el Affiliate
// Key de la app `otracita-web`. El JS NO pasa API keys — solo el access
// token OAuth del barbero (que el backend obtiene vía /api/app/mobile/sumup/credentials).
// -----------------------------------------------------------------------------

export interface SumupTapToPayPlugin {
  /** Inicia sesión SumUp con un access token OAuth obtenido por el backend. */
  loginWithToken(options: { accessToken: string }): Promise<{ success: boolean }>

  /** Cierra sesión SumUp local en el dispositivo. */
  logout(): Promise<{ success: boolean }>

  /** ¿Hay una sesión SumUp activa en el SDK nativo? */
  isLoggedIn(): Promise<{ loggedIn: boolean }>

  /**
   * Comprueba si Tap to Pay está disponible para esta cuenta + dispositivo.
   * `activated` indica si el Apple ID está enlazado con la cuenta SumUp.
   */
  isAvailable(): Promise<{ available: boolean; activated: boolean }>

  /** Activa Tap to Pay vinculando Apple ID con la cuenta SumUp loggeada. */
  activate(): Promise<{ activated: boolean }>

  /** Procesa un cobro contactless con Tap to Pay on iPhone. */
  checkout(options: {
    amount: number          // EUROS (no cents)
    currency?: 'EUR'
    title: string           // título mostrado en la UI nativa de Apple
    foreignTransactionId?: string  // nuestro UUID para correlacionar con backend
  }): Promise<{
    success: boolean
    transactionCode?: string
    additionalInfo?: string
  }>
}

// `registerPlugin` devuelve un proxy que hace bridge a Swift. En web (dev)
// los métodos lanzan "not implemented" si se llaman fuera de iOS nativo.
export const SumupTapToPay = registerPlugin<SumupTapToPayPlugin>('SumupTapToPay')

/** Helper para detectar si estamos en iOS nativo (vs web dev). */
export function isNativeIos(): boolean {
  return typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
}
