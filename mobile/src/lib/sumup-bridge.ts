import { registerPlugin } from '@capacitor/core'

// -----------------------------------------------------------------------------
// SumUp Tap to Pay bridge — interfaz al plugin nativo iOS.
//
// El plugin NATIVO (Swift) NO está implementado aún en este commit. Se
// añadirá en `mobile/ios/App/App/SumupTapToPayPlugin.swift` cuando Alex
// genere el proyecto iOS con `npx cap add ios`.
//
// El plugin debe implementar 3 métodos:
//   · `isAvailable()` → check de Tap to Pay disponible (iPhone XS+, iOS 16.4+,
//                       cuenta SumUp activada para Tap to Pay)
//   · `activate()`    → activación inicial (Apple ID + cuenta SumUp link)
//   · `checkout(...)` → procesar un cobro
//
// Internamente usa el SumUp iOS SDK (CocoaPods o SPM):
//   pod 'SumUpSDK' (o Swift Package Manager)
// -----------------------------------------------------------------------------

export interface SumupTapToPayPlugin {
  /** Comprueba disponibilidad del Tap to Pay para esta cuenta + dispositivo. */
  isAvailable(): Promise<{ available: boolean; reason?: string }>

  /** Trigger de la activación de Apple Tap to Pay (link Apple ID con SumUp). */
  activate(options: { accessToken: string }): Promise<{ activated: boolean }>

  /** Procesa un cobro contactless. */
  checkout(options: {
    accessToken: string
    affiliateKey: string
    amount: number          // EUROS (no cents)
    currency: 'EUR'
    title: string           // título mostrado en la UI nativa de Apple
    foreignTransactionId?: string  // nuestro UUID para correlacionar
  }): Promise<{
    success: boolean
    transactionCode?: string
    sumupTransactionId?: string
    additionalInfo?: string
  }>
}

// `registerPlugin` devuelve un proxy que hace bridge a Swift. En web (dev)
// devuelve un mock — los métodos lanzan "not implemented" si los llamas
// fuera de iOS nativo.
export const SumupTapToPay = registerPlugin<SumupTapToPayPlugin>('SumupTapToPay')

/**
 * Helper para detectar si estamos en iOS nativo (vs web dev).
 * Útil para decidir qué UI mostrar.
 */
export function isNativeIos(): boolean {
  // En Capacitor 6, window.Capacitor.isNativePlatform() devuelve true cuando
  // corre dentro del binario nativo.
  return typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
}
