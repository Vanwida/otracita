import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/customers/import/template
//
// Devuelve un CSV plantilla con cabeceras + 2 filas de ejemplo para que el
// barbero entienda el formato sin leer documentación.
//
// Formato:
//   · UTF-8 con BOM → Excel ES abre correctamente acentos y €.
//   · Separador `,` (compatible con cualquier hoja de cálculo).
//   · Cabeceras: nombre, telefono, email, notas. Phone es el único
//     obligatorio; el parser normaliza con o sin prefijo, con o sin
//     espacios/guiones (libphonenumber-js, default ES).
//
// Columnas mapeadas al schema `customers`:
//   nombre   → customers.name
//   telefono → customers.phone (normalizado a E.164 en el endpoint POST)
//   email    → customers.email
//   notas    → customers.barberNotes  (notas privadas del barbero)
//
// Multi-tenancy: requiere sesión autenticada (consistente con el resto
// de rutas del dashboard) aunque el contenido es estático — evitamos que
// el endpoint sea un canal anónimo de descarga del esquema.
// -----------------------------------------------------------------------------

const BOM = '﻿'
const SEPARATOR = ','
const LINE_SEPARATOR = '\r\n'

const HEADERS = ['nombre', 'telefono', 'email', 'notas']
const EXAMPLES: Array<[string, string, string, string]> = [
  ['Juan Pérez', '+34 600 123 456', 'juan@ejemplo.com', 'Cliente fiel'],
  ['Marta García', '600 987 654', '', 'Viene los sábados'],
]

function csvEscape(value: string): string {
  if (value.includes(SEPARATOR) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  const lines: string[] = []
  lines.push(HEADERS.join(SEPARATOR))
  for (const row of EXAMPLES) {
    lines.push(row.map(csvEscape).join(SEPARATOR))
  }
  const csv = BOM + lines.join(LINE_SEPARATOR) + LINE_SEPARATOR

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-clientes.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
