import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/marketing/tienda — RUTA LEGACY. El catálogo de productos se
// movió a la pestaña Ventas → Productos (contrato de IA: la venta de
// producto es Ventas, no Marketing). Redirect 1:1 — preserva deep-links y
// los enlaces internos existentes (patrón SaaS estándar).
//
// El componente ProductsManager sigue en este directorio (lo importa la
// nueva ruta) — solo se mueve la ruta, no el código.
// -----------------------------------------------------------------------------

export default function TiendaLegacyRedirect() {
  redirect('/dashboard/ventas/productos')
}
