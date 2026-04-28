// -----------------------------------------------------------------------------
// Config — URL del backend de otracita.
//
// En dev (npm run dev): apunta a localhost o al Vercel preview.
// En prod (build para App Store): apunta al dominio de producción.
//
// Vite expone variables de entorno con prefijo VITE_*.
// -----------------------------------------------------------------------------

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://otracita.es'

export const APP_NAME = 'otracita Cobros'
