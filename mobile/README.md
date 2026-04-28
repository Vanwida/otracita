# otracita Cobros

App móvil iOS para cobrar con SumUp Tap to Pay desde el iPhone del barbero.

## Stack

- Capacitor 6 + Vite + React 18 + Tailwind 3 + TypeScript
- React Router (HashRouter para rutas locales)
- @capacitor/preferences para guardar token de sesión

## Setup inicial (Alex, una sola vez)

```bash
cd mobile
npm install

# Instalar pods (Capacitor descarga el SDK iOS la primera vez)
npx cap add ios

# Abrir en Xcode
npm run ios:open
```

## Desarrollo

### Web (sin iOS nativo, mock para iterar UI)

```bash
npm run dev
```

Se abre en `http://localhost:5174`. El SDK Tap to Pay se simula con éxito tras 3s.

### iOS nativo (con Xcode + iPhone físico)

```bash
npm run cap:sync       # build + sync al proyecto iOS
npm run ios:open       # abre Xcode
```

En Xcode:
1. Selecciona el iPhone físico (Tap to Pay no funciona en simulador)
2. Configura signing con tu Apple Developer team
3. Run

## Variables de entorno

Crea `mobile/.env` (no commiteado):

```
VITE_API_BASE_URL=https://otracita.es
```

En dev contra backend local: `VITE_API_BASE_URL=http://localhost:3000`.

## Plugin SumUp Tap to Pay (TODO)

El bridge JS está en `src/lib/sumup-bridge.ts`. La implementación nativa
Swift NO está creada todavía — pendiente de:

1. Pedir acceso al SumUp iOS SDK con Tap to Pay (registrar app + email a
   integration@sumup.com con bundle id `es.otracita.cobros`)
2. Una vez generado `ios/App/`, añadir SPM dependency a `SumUpSDK`
3. Crear `ios/App/App/Plugins/SumupTapToPayPlugin.swift` con métodos
   `isAvailable`, `activate`, `checkout`
4. Endpoint backend `/api/app/mobile/sumup/checkout-credentials` que
   devuelve `accessToken` + `affiliateKey` por sesión móvil (ahora la app
   pasa esos datos al plugin)

## Estructura

```
mobile/
├─ src/
│  ├─ App.tsx              ← router + bootstrap auth
│  ├─ lib/
│  │  ├─ config.ts         ← URL backend
│  │  ├─ session.ts        ← Capacitor Preferences (token)
│  │  ├─ api.ts            ← fetch wrapper con bearer
│  │  └─ sumup-bridge.ts   ← interface al plugin nativo
│  ├─ pages/
│  │  ├─ Login.tsx         ← input PIN 6 dígitos
│  │  ├─ Home.tsx          ← bookings de hoy + walk-in
│  │  ├─ Checkout.tsx      ← Tap to Pay full-screen
│  │  └─ Settings.tsx      ← logout + info cuenta
│  └─ components/
│     └─ Button.tsx
├─ public/                 ← assets estáticos (icon, etc.)
├─ index.html
├─ capacitor.config.ts
├─ vite.config.ts
├─ tailwind.config.ts
└─ package.json
```

## Build para App Store

```bash
npm run cap:sync                # rebuild dist/ y sync ios/
# en Xcode: Product → Archive → Distribute App
```

App Store review tarda 1-3 días normalmente.
