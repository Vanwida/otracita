import { create } from 'xmlbuilder2'
import type { TipoFactura } from './hash.ts'

// -----------------------------------------------------------------------------
// VeriFactu — generación del XML "RegFactuSistemaFacturacion" que se envía
// al servicio web SOAP de AEAT.
//
// Fuente autoritativa: XSDs oficiales AEAT (descargados en src/lib/verifactu/xsd/)
//   · SuministroLR.xsd — operaciones (alta / anulación)
//   · SuministroInformacion.xsd — tipos comunes
//   · RespuestaSuministro.xsd — schema respuesta
//
// Namespaces:
//   sfLR = https://www2.agenciatributaria.gob.es/.../SuministroLR.xsd
//   sf   = https://www2.agenciatributaria.gob.es/.../SuministroInformacion.xsd
//
// Estructura raíz: <sfLR:RegFactuSistemaFacturacion>
//   <sfLR:Cabecera>
//     <sf:ObligadoEmision> NIF + NombreRazon </sf:ObligadoEmision>
//   </sfLR:Cabecera>
//   <sfLR:RegistroFactura>  -- hasta 1.000 registros por batch
//     <sf:RegistroAlta> | <sf:RegistroAnulacion>
//   </sfLR:RegistroFactura>
// -----------------------------------------------------------------------------

const NS_SFLR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd'
const NS_SF = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd'

/** Versión del schema XSD que estamos implementando. */
const ID_VERSION = '1.0'

/** TipoHuella L12 AEAT: '01' = SHA-256 (único permitido actualmente). */
const TIPO_HUELLA_SHA256 = '01'

// -----------------------------------------------------------------------------
// Identidad del SIF (nosotros — otracita)
//
// AEAT exige identificar el sistema informático de facturación que emite los
// registros. Esto va en cada <SistemaInformatico>.
//
// Leemos los datos de env vars para que sea configurable por entorno.
// -----------------------------------------------------------------------------

export interface SistemaInformaticoInfo {
  /** Nombre comercial del SIF, ej "otracita". */
  NombreRazon: string
  /** NIF del fabricante (Vanwida). */
  NIF: string
  /** ID único del SIF (cadena corta, normalmente 2 chars). */
  IdSistemaInformatico: string
  /** Versión del software. */
  Version: string
  /** Número de instalación (cada deployment de producción es una instalación). */
  NumeroInstalacion: string
  /** Sólo VeriFactu (S) o puede operar también NO-VeriFactu (N). */
  TipoUsoPosibleSoloVerifactu: 'S' | 'N'
  /** Puede procesar múltiples OT (Obligados Tributarios) — para SaaS: S. */
  TipoUsoPosibleMultiOT: 'S' | 'N'
  /** Indica si el SIF está procesando efectivamente múltiples OT ahora. */
  IndicadorMultiplesOT: 'S' | 'N'
}

export function defaultSistemaInformatico(): SistemaInformaticoInfo {
  return {
    NombreRazon: process.env.VERIFACTU_SIF_NAME ?? 'otracita',
    NIF: process.env.VERIFACTU_SIF_NIF ?? '00000000T',
    IdSistemaInformatico: process.env.VERIFACTU_SIF_ID ?? '01',
    Version: process.env.VERIFACTU_SIF_VERSION ?? '1.0.0',
    NumeroInstalacion: process.env.VERIFACTU_SIF_INSTALL ?? '001',
    TipoUsoPosibleSoloVerifactu: 'S',
    TipoUsoPosibleMultiOT: 'S',
    IndicadorMultiplesOT: 'S',
  }
}

// -----------------------------------------------------------------------------
// Inputs para construir el XML
// -----------------------------------------------------------------------------

export interface CabeceraInput {
  /** NIF del obligado tributario (barbería emisora). */
  nifEmisor: string
  /** Nombre/razón social del emisor (fiscalName del barbero). */
  nombreEmisor: string
}

export interface EncadenamientoInput {
  /** true si es el primer registro del SIF para este emisor. */
  isPrimerRegistro: boolean
  /** Solo requerido si NO es primer registro: datos de la factura anterior. */
  registroAnterior?: {
    IDEmisorFactura: string
    NumSerieFactura: string
    FechaExpedicionFactura: string // DD-MM-YYYY
    Huella: string
  }
}

export interface DesgloseIvaLinea {
  /** '01' = servicios, '02' = arrendamientos, etc. L13 AEAT.
   *  Por defecto '01' (prestación de servicios). */
  Impuesto?: '01' | '02' | '03' | '04' | '05'
  /** '01' = sujeta no exenta. L14 AEAT. */
  ClaveRegimen?: string
  /** Default 'S1' = operación sujeta y no exenta. L15 AEAT. */
  CalificacionOperacion?: string
  /** Tipo de IVA aplicado, ej "21", "10", "4", "0". */
  TipoImpositivo: string
  /** Base imponible en formato "N.DD". */
  BaseImponibleOimporteNoSujeto: string
  /** Cuota IVA en formato "N.DD". */
  CuotaRepercutida: string
}

export interface BuildRegistroAltaArgs {
  cabecera: CabeceraInput
  sistemaInformatico?: SistemaInformaticoInfo

  /** Identidad de la factura. */
  IDEmisorFactura: string
  NumSerieFactura: string
  FechaExpedicionFactura: string // DD-MM-YYYY

  /** Datos de la operación. */
  NombreRazonEmisor: string
  TipoFactura: TipoFactura
  DescripcionOperacion: string
  /** Líneas de desglose IVA. Típico para servicio barbería: una sola a 21%. */
  desglose: DesgloseIvaLinea[]
  CuotaTotal: string // "N.DD"
  ImporteTotal: string // "N.DD"

  /** Destinatario (cliente) — opcional, solo en facturas (no tickets). */
  destinatario?: {
    NombreRazon: string
    NIF?: string
  }

  encadenamiento: EncadenamientoInput

  /** ISO 8601 con timezone, mismo que se usó en el hash. */
  FechaHoraHusoGenRegistro: string

  /** Hash calculado previamente por computeHashAlta(). */
  Huella: string
}

export interface BuildRegistroAnulacionArgs {
  cabecera: CabeceraInput
  sistemaInformatico?: SistemaInformaticoInfo

  IDEmisorFacturaAnulada: string
  NumSerieFacturaAnulada: string
  FechaExpedicionFacturaAnulada: string // DD-MM-YYYY

  encadenamiento: EncadenamientoInput

  FechaHoraHusoGenRegistro: string
  Huella: string
}

// -----------------------------------------------------------------------------
// Builder
// -----------------------------------------------------------------------------

function buildCabecera(c: CabeceraInput) {
  return {
    'sfLR:Cabecera': {
      'sf:ObligadoEmision': {
        'sf:NombreRazon': c.nombreEmisor,
        'sf:NIF': c.nifEmisor,
      },
    },
  }
}

function buildSistemaInformatico(si: SistemaInformaticoInfo) {
  return {
    'sf:SistemaInformatico': {
      'sf:NombreRazon': si.NombreRazon,
      'sf:NIF': si.NIF,
      'sf:NombreSistemaInformatico': si.NombreRazon,
      'sf:IdSistemaInformatico': si.IdSistemaInformatico,
      'sf:Version': si.Version,
      'sf:NumeroInstalacion': si.NumeroInstalacion,
      'sf:TipoUsoPosibleSoloVerifactu': si.TipoUsoPosibleSoloVerifactu,
      'sf:TipoUsoPosibleMultiOT': si.TipoUsoPosibleMultiOT,
      'sf:IndicadorMultiplesOT': si.IndicadorMultiplesOT,
    },
  }
}

function buildEncadenamiento(e: EncadenamientoInput) {
  if (e.isPrimerRegistro) {
    return {
      'sf:Encadenamiento': {
        'sf:PrimerRegistro': 'S',
      },
    }
  }
  if (!e.registroAnterior) {
    throw new Error('registroAnterior es obligatorio cuando isPrimerRegistro=false')
  }
  return {
    'sf:Encadenamiento': {
      'sf:RegistroAnterior': {
        'sf:IDEmisorFactura': e.registroAnterior.IDEmisorFactura,
        'sf:NumSerieFactura': e.registroAnterior.NumSerieFactura,
        'sf:FechaExpedicionFactura': e.registroAnterior.FechaExpedicionFactura,
        'sf:Huella': e.registroAnterior.Huella,
      },
    },
  }
}

function buildDesglose(lineas: DesgloseIvaLinea[]) {
  return {
    'sf:Desglose': {
      'sf:DetalleDesglose': lineas.map((l) => ({
        'sf:Impuesto': l.Impuesto ?? '01',
        'sf:ClaveRegimen': l.ClaveRegimen ?? '01',
        'sf:CalificacionOperacion': l.CalificacionOperacion ?? 'S1',
        'sf:TipoImpositivo': l.TipoImpositivo,
        'sf:BaseImponibleOimporteNoSujeto': l.BaseImponibleOimporteNoSujeto,
        'sf:CuotaRepercutida': l.CuotaRepercutida,
      })),
    },
  }
}

export function buildRegistroAltaXml(args: BuildRegistroAltaArgs): string {
  const si = args.sistemaInformatico ?? defaultSistemaInformatico()

  const registroAlta: Record<string, unknown> = {
    'sf:IDVersion': ID_VERSION,
    'sf:IDFactura': {
      'sf:IDEmisorFactura': args.IDEmisorFactura,
      'sf:NumSerieFactura': args.NumSerieFactura,
      'sf:FechaExpedicionFactura': args.FechaExpedicionFactura,
    },
    'sf:NombreRazonEmisor': args.NombreRazonEmisor,
    'sf:TipoFactura': args.TipoFactura,
    'sf:DescripcionOperacion': args.DescripcionOperacion,
  }

  if (args.destinatario) {
    registroAlta['sf:Destinatarios'] = {
      'sf:IDDestinatario': args.destinatario.NIF
        ? {
            'sf:NombreRazon': args.destinatario.NombreRazon,
            'sf:NIF': args.destinatario.NIF,
          }
        : {
            'sf:NombreRazon': args.destinatario.NombreRazon,
          },
    }
  }

  Object.assign(registroAlta, buildDesglose(args.desglose))
  registroAlta['sf:CuotaTotal'] = args.CuotaTotal
  registroAlta['sf:ImporteTotal'] = args.ImporteTotal
  Object.assign(registroAlta, buildEncadenamiento(args.encadenamiento))
  Object.assign(registroAlta, buildSistemaInformatico(si))
  registroAlta['sf:FechaHoraHusoGenRegistro'] = args.FechaHoraHusoGenRegistro
  registroAlta['sf:TipoHuella'] = TIPO_HUELLA_SHA256
  registroAlta['sf:Huella'] = args.Huella

  const doc = {
    'sfLR:RegFactuSistemaFacturacion': {
      '@xmlns:sfLR': NS_SFLR,
      '@xmlns:sf': NS_SF,
      ...buildCabecera(args.cabecera),
      'sfLR:RegistroFactura': {
        'sf:RegistroAlta': registroAlta,
      },
    },
  }

  return create(doc).end({ prettyPrint: false, headless: false })
}

export function buildRegistroAnulacionXml(args: BuildRegistroAnulacionArgs): string {
  const si = args.sistemaInformatico ?? defaultSistemaInformatico()

  const registroAnulacion: Record<string, unknown> = {
    'sf:IDVersion': ID_VERSION,
    'sf:IDFactura': {
      'sf:IDEmisorFacturaAnulada': args.IDEmisorFacturaAnulada,
      'sf:NumSerieFacturaAnulada': args.NumSerieFacturaAnulada,
      'sf:FechaExpedicionFacturaAnulada': args.FechaExpedicionFacturaAnulada,
    },
  }

  Object.assign(registroAnulacion, buildEncadenamiento(args.encadenamiento))
  Object.assign(registroAnulacion, buildSistemaInformatico(si))
  registroAnulacion['sf:FechaHoraHusoGenRegistro'] = args.FechaHoraHusoGenRegistro
  registroAnulacion['sf:TipoHuella'] = TIPO_HUELLA_SHA256
  registroAnulacion['sf:Huella'] = args.Huella

  const doc = {
    'sfLR:RegFactuSistemaFacturacion': {
      '@xmlns:sfLR': NS_SFLR,
      '@xmlns:sf': NS_SF,
      ...buildCabecera(args.cabecera),
      'sfLR:RegistroFactura': {
        'sf:RegistroAnulacion': registroAnulacion,
      },
    },
  }

  return create(doc).end({ prettyPrint: false, headless: false })
}

// -----------------------------------------------------------------------------
// SOAP envelope para enviar al servicio web SistemaFacturacion de AEAT.
// -----------------------------------------------------------------------------

const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/'

/**
 * Envuelve un XML RegFactuSistemaFacturacion dentro de un SOAP Envelope
 * para enviar al endpoint SOAP de AEAT.
 */
export function wrapInSoapEnvelope(registroFacturacionXml: string): string {
  // Quitamos la declaración XML del registro interior (no puede aparecer
  // anidada dentro de un documento con su propia declaración).
  const inner = registroFacturacionXml.replace(/^<\?xml[^?]*\?>\s*/, '')
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${SOAP_NS}"><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`
}
