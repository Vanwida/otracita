import { db } from '@/db'
import { invoices, invoiceRegistroEvents, clients } from '@/db/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import {
  computeHashAlta,
  computeHashAnulacion,
  type RegistroAltaInput,
  type RegistroAnulacionInput,
  type TipoFactura,
} from './hash.ts'
import { formatFechaExpedicion, formatFechaHoraHusoGen, centsToDecimal } from './format.ts'

// Re-export para compatibilidad con callers que importaban de chain.ts.
export { formatFechaExpedicion, formatFechaHoraHusoGen, centsToDecimal }

// -----------------------------------------------------------------------------
// VeriFactu — encadenamiento de registros y escritura ATÓMICA.
//
// Por spec AEAT: cada registro de facturación (alta/anulación) incluye en el
// hash la huella del INMEDIATAMENTE ANTERIOR del mismo SIF. Aquí el SIF es
// multi-tenant — cada barbería (clientId) tiene su propia cadena.
//
// El punto de fallo típico: dos facturas emitidas concurrentemente podrían
// leer la MISMA huella anterior y encadenar ambas → cadena rota (dos facturas
// con el mismo huella_anterior pero huellas distintas).
//
// Solución: SELECT FOR UPDATE sobre la fila "última" dentro de una TX.
// La segunda concurrente espera hasta que la primera commitee, entonces lee
// la nueva última y encadena correctamente.
//
// Nota: Neon serverless pg soporta transacciones explícitas vía `db.transaction`.
// El `FOR UPDATE` se aplica sobre una fila "centinela" por clientId; como no
// tenemos tabla de centinelas, usamos advisory locks de Postgres (mismo
// efecto, sin fila extra).
// -----------------------------------------------------------------------------

export interface ChainAltaArgs {
  clientId: string
  invoiceId: string
  emisorNif: string
  serieNumero: string
  tipoFactura: TipoFactura
  cuotaTotalCents: number
  importeTotalCents: number
  /** Fecha de expedición como Date (se formatea a DD-MM-YYYY Madrid). */
  fechaExpedicion: Date
  /** Now() por defecto — separable para tests deterministas. */
  now?: Date
}

export interface ChainResult {
  huella: string
  huellaAnterior: string // '' si primer registro
  isPrimerRegistro: boolean
  fechaHoraHusoGen: Date
  fechaHoraHusoGenISO: string
  fechaExpedicionFormatted: string
}

/**
 * Registra un RegistroAlta en la cadena VeriFactu del cliente.
 *
 * Hace todo dentro de una transacción con advisory lock — dos llamadas
 * concurrentes con el mismo clientId se serializan. Devuelve la huella
 * calculada y actualiza la row de invoices con los campos de hash.
 */
export async function chainRegistroAlta(args: ChainAltaArgs): Promise<ChainResult> {
  const now = args.now ?? new Date()
  const fechaExpedicionFormatted = formatFechaExpedicion(args.fechaExpedicion)
  const fechaHoraHusoGenISO = formatFechaHoraHusoGen(now)
  const cuotaTotal = centsToDecimal(args.cuotaTotalCents)
  const importeTotal = centsToDecimal(args.importeTotalCents)

  return await db.transaction(async (tx) => {
    // Advisory lock por clientId — hashamos el UUID a int64 para pg_advisory_xact_lock.
    // Esto serializa escrituras de encadenamiento POR emisor sin afectar a otros.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${args.clientId}, 0))`)

    // Buscar el último registro (alta o anulación) del mismo cliente para tomar
    // su huella como huella_anterior.
    const lastHash = await findLastHashForClient(tx, args.clientId)

    const hashInput: RegistroAltaInput = {
      IDEmisorFactura: args.emisorNif,
      NumSerieFactura: args.serieNumero,
      FechaExpedicionFactura: fechaExpedicionFormatted,
      TipoFactura: args.tipoFactura,
      CuotaTotal: cuotaTotal,
      ImporteTotal: importeTotal,
      Huella: lastHash ?? '',
      FechaHoraHusoGenRegistro: fechaHoraHusoGenISO,
    }
    const huella = computeHashAlta(hashInput)

    await tx
      .update(invoices)
      .set({
        huella,
        huellaAnterior: lastHash,
        isPrimerRegistro: lastHash === null,
        tipoFactura: args.tipoFactura,
        fechaHoraHusoGen: now,
        verifactuStatus: 'pending',
      })
      .where(eq(invoices.id, args.invoiceId))

    // Evento en el libro (auditoría independiente).
    await tx.insert(invoiceRegistroEvents).values({
      clientId: args.clientId,
      eventType: 'alta',
      invoiceId: args.invoiceId,
      huella,
      huellaAnterior: lastHash,
      fechaHoraHusoGen: now,
      verifactuStatus: 'pending',
      data: { tipoFactura: args.tipoFactura, serieNumero: args.serieNumero },
    })

    return {
      huella,
      huellaAnterior: lastHash ?? '',
      isPrimerRegistro: lastHash === null,
      fechaHoraHusoGen: now,
      fechaHoraHusoGenISO,
      fechaExpedicionFormatted,
    }
  })
}

export interface ChainAnulacionArgs {
  clientId: string
  invoiceId: string // factura que se anula
  emisorNif: string
  serieNumero: string
  fechaExpedicion: Date
  now?: Date
}

export async function chainRegistroAnulacion(
  args: ChainAnulacionArgs,
): Promise<ChainResult> {
  const now = args.now ?? new Date()
  const fechaExpedicionFormatted = formatFechaExpedicion(args.fechaExpedicion)
  const fechaHoraHusoGenISO = formatFechaHoraHusoGen(now)

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${args.clientId}, 0))`)

    const lastHash = await findLastHashForClient(tx, args.clientId)

    const hashInput: RegistroAnulacionInput = {
      IDEmisorFacturaAnulada: args.emisorNif,
      NumSerieFacturaAnulada: args.serieNumero,
      FechaExpedicionFacturaAnulada: fechaExpedicionFormatted,
      Huella: lastHash ?? '',
      FechaHoraHusoGenRegistro: fechaHoraHusoGenISO,
    }
    const huella = computeHashAnulacion(hashInput)

    // Marca la factura original como anulada + guarda el hash del registro de anulación.
    await tx
      .update(invoices)
      .set({
        anuladaAt: now,
        anulacionHuella: huella,
      })
      .where(eq(invoices.id, args.invoiceId))

    await tx.insert(invoiceRegistroEvents).values({
      clientId: args.clientId,
      eventType: 'anulacion',
      invoiceId: args.invoiceId,
      huella,
      huellaAnterior: lastHash,
      fechaHoraHusoGen: now,
      verifactuStatus: 'pending',
      data: { serieNumero: args.serieNumero },
    })

    return {
      huella,
      huellaAnterior: lastHash ?? '',
      isPrimerRegistro: lastHash === null,
      fechaHoraHusoGen: now,
      fechaHoraHusoGenISO,
      fechaExpedicionFormatted,
    }
  })
}

/**
 * Devuelve la huella del último registro (alta o anulación) del cliente,
 * o null si es el primero del SIF para este emisor.
 *
 * La búsqueda se hace sobre `invoice_registro_events` porque contiene TANTO
 * altas como anulaciones encadenadas cronológicamente. En `invoices` solo
 * está la última alta; la anulación se persiste en events.
 */
// `tx` tipado laxo a propósito: drizzle tipa la transacción como un subtipo
// distinto al `db` base. No nos aporta type-safety encima de lo que ya da la
// query builder, así que evitamos el chirrido con `any` aquí.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findLastHashForClient(
  tx: any,
  clientId: string,
): Promise<string | null> {
  const [last] = await tx
    .select({ huella: invoiceRegistroEvents.huella })
    .from(invoiceRegistroEvents)
    .where(
      and(
        eq(invoiceRegistroEvents.clientId, clientId),
        isNotNull(invoiceRegistroEvents.huella),
      ),
    )
    .orderBy(desc(invoiceRegistroEvents.fechaHoraHusoGen))
    .limit(1)

  return last?.huella ?? null
}

/**
 * Recupera el NIF del emisor para un clientId. Lo necesitamos para construir
 * el hash (IDEmisorFactura = NIF del obligado tributario). Se lee de
 * clients.fiscalNif que el barbero configuró en /dashboard/negocio.
 *
 * Error temprano si falta — no podemos emitir un registro VeriFactu sin NIF.
 */
export async function getEmisorNif(clientId: string): Promise<string> {
  const [c] = await db
    .select({ nif: clients.fiscalNif })
    .from(clients)
    .where(eq(clients.id, clientId))
  if (!c?.nif) {
    throw new Error(
      `Falta el NIF fiscal para el cliente ${clientId}. ` +
      `Configura los datos fiscales en Mi negocio → Facturación antes de emitir.`,
    )
  }
  return c.nif.trim().toUpperCase()
}
