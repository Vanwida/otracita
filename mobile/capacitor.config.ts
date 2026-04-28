import type { CapacitorConfig } from '@capacitor/cli'

// -----------------------------------------------------------------------------
// otracita Cobros — config Capacitor.
//
// Bundle ID y display name finales. iOS scheme `es.otracita.cobros`.
// -----------------------------------------------------------------------------

const config: CapacitorConfig = {
  appId: 'es.otracita.cobros',
  appName: 'otracita Cobros',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#FAF7F2',
  },
  server: {
    // En dev, comentar `iosScheme: 'capacitor'` y descomentar `url` para
    // hot reload contra el dev server de Vite. En prod (App Store), el
    // build estático va dentro del binario.
    iosScheme: 'capacitor',
    androidScheme: 'https',
  },
}

export default config
