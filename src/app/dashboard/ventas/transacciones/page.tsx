import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// Redirect legacy — Transacciones dejó de ser pestaña de Ventas (U-13: Ventas
// tenía 8 pestañas y 4 hablaban del mismo dinero; el barbero no encontraba
// dónde cobrar). El libro de ventas es un INFORME, no una acción de cobro, y
// vive en /dashboard/informes/transacciones. Este stub mantiene vivos los
// deep-links antiguos (bookmarks, emails, capturas de soporte).
// -----------------------------------------------------------------------------

export default function VentasTransaccionesRedirect() {
  redirect('/dashboard/informes/transacciones')
}
