// -----------------------------------------------------------------------------
// barber-photo-url — single source of truth for "where do I point an <img>
// to render the photo of a barber".
//
// Background: las photos viven en Vercel Blob
// (`uevxeinfoczotdae.public.blob.vercel-storage.com`). El hostname del blob da
// TCP timeout desde algunas redes (DNS geo distinto, ISPs con resolvers
// regionales raros, redes corporativas que bloquean dominios "exóticos").
// Como las URLs sí son válidas server-side, las servimos a través de un
// proxy en NUESTRO dominio (`/api/img/barber/[id]`), garantizando que el
// browser siempre cargue la foto desde `otracita.es`.
//
// Uso: cualquier render de DB → pasa por aquí. SOLO el preview de
// `BarberPhotoUpload` (la foto recién subida, todavía no persistida con un
// `id`) sigue apuntando a la URL del blob directamente — ahí no tenemos id.
// -----------------------------------------------------------------------------

export function barberPhotoUrl(barberId: string | null | undefined): string | null {
  if (!barberId) return null
  return `/api/img/barber/${barberId}`
}
