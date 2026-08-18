import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { parseBooksyWorkbook } from '@/lib/customers/booksy-xlsx'
import { IMPORT_ROW_LIMIT, type ImportRow } from '@/lib/customers/import'

// -----------------------------------------------------------------------------
// POST /api/customers/import/parse   (multipart/form-data)
//
// Convierte el .xlsx de Booksy en las filas que pinta el preview de
// /dashboard/clientes/importar. El CSV se sigue parseando en el navegador
// con papaparse; el Excel NO puede:
//
//   · Booksy manda el fichero CIFRADO con contraseña (llega en un correo
//     aparte). Descifrarlo es ECMA-376 — cripto, no parsing.
//   · Hacerlo en cliente significaría meter exceljs + una librería de
//     cripto en el bundle del dashboard. Aquí ya están, en el servidor.
//
// Esta ruta NO escribe nada. Sólo lee el fichero y devuelve filas. El import
// de verdad sigue siendo POST /api/customers/import, que es quien
// deduplica contra la DB y persiste. Así el barbero ve el preview y puede
// quitar filas antes de que nada toque su cartera.
//
// Multi-tenancy: requireClientAccess. No se toca la DB, pero un endpoint que
// descifra ficheros ajenos no puede quedar abierto.
//
// Sobre subir ficheros arbitrarios a exceljs: un xlsx es un zip, y un zip
// puede descomprimir a mucho más de lo que ocupa. Aquí lo asumimos — el
// endpoint está detrás de sesión (no es público), el peor caso es que la
// función se quede sin memoria y muera, y no hay datos de otro tenant en el
// proceso. Si algún día esto se abre a usuarios no autenticados, hay que
// mirar el ratio de descompresión antes de parsear.
// -----------------------------------------------------------------------------

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 8 MB. Un export de Booksy de 5000 clientes ronda los 300 KB; el margen es
 * para exports con formato y hojas de sobra. Por encima, casi seguro que no
 * es una lista de clientes.
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/**
 * Copy por código de error. Vive aquí para que servidor y UI no se
 * contradigan: la UI pinta `error` tal cual y sólo mira `code` para decidir
 * si enseña el campo de contraseña.
 */
const MESSAGES: Record<string, string> = {
  password_required: 'Este Excel viene con contraseña. Escríbela para abrirlo.',
  password_wrong:
    'Esa contraseña no abre el archivo. Booksy la manda en un correo aparte del fichero — búscala ahí.',
  legacy_xls:
    'Es un .xls de los antiguos. Ábrelo en Excel y guárdalo como .xlsx, o como CSV.',
  unreadable: 'No hemos podido leer el archivo. Tiene que ser un .xlsx o un .csv.',
  no_header:
    'No encontramos la tabla de clientes dentro del archivo. ¿Seguro que es el export de Booksy?',
  no_phone_column:
    'Este archivo no trae teléfonos: es el informe «Lista de clientes», no tu base de clientes. En Booksy entra en Clientes y exporta desde ahí, no desde Informes. Sin teléfono no podemos reconocer a nadie.',
  no_rows:
    'Ninguna fila trae un teléfono aprovechable. Revisa que la columna de teléfono esté rellena.',
  too_many_rows: `Más de ${IMPORT_ROW_LIMIT} clientes en un archivo. Pártelo en dos y súbelos por separado.`,
}

interface ParseResponse {
  rows: ImportRow[]
  /** Lo mínimo que el preview necesita explicar sobre el archivo leído. */
  meta: {
    sheetName: string
    droppedNoPhone: number
    droppedDuplicate: number
  }
}

function fail(code: string, status = 400): Response {
  return Response.json(
    { error: MESSAGES[code] ?? 'No hemos podido leer el archivo.', code },
    { status },
  )
}

export async function POST(req: Request): Promise<Response> {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Envío inválido.', code: 'bad_request' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'Falta el archivo.', code: 'bad_request' }, { status: 400 })
  }
  if (file.size === 0) {
    return fail('unreadable')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      {
        error: `El archivo pesa más de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Eso no es una lista de clientes.`,
        code: 'too_large',
      },
      { status: 413 },
    )
  }

  const rawPassword = form.get('password')
  // Las contraseñas de Booksy no llevan espacios alrededor, pero pegarlas
  // desde el correo sí los arrastra. No hacemos trim del interior.
  const password = typeof rawPassword === 'string' && rawPassword.trim().length > 0
    ? rawPassword.trim()
    : null

  const buffer = Buffer.from(await file.arrayBuffer())
  const parsed = await parseBooksyWorkbook(buffer, password)

  if (!parsed.ok) {
    return fail(parsed.code)
  }

  const body: ParseResponse = {
    rows: parsed.rows,
    meta: {
      sheetName: parsed.sheetName,
      droppedNoPhone: parsed.stats.droppedNoPhone,
      droppedDuplicate: parsed.stats.droppedDuplicate,
    },
  }
  return Response.json(body)
}
