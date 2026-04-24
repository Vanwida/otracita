import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRegistroAltaXml,
  buildRegistroAnulacionXml,
  wrapInSoapEnvelope,
} from './xml.ts'
import { computeHashAlta } from './hash.ts'

// -----------------------------------------------------------------------------
// Tests del XML RegFactuSistemaFacturacion.
//
// No usamos validación XSD en el test runner (libxmljs requiere native build).
// En su lugar:
//   1. Verificamos estructura y presencia de elementos obligatorios.
//   2. Verificamos que los valores que van en el hash coinciden EXACTAMENTE
//      con los campos del XML (consistencia huella ↔ XML).
//   3. M4 validará el XML con el endpoint pre-prod AEAT real.
// -----------------------------------------------------------------------------

const SI_TEST = {
  NombreRazon: 'otracita-test',
  NIF: 'B00000000',
  IdSistemaInformatico: '01',
  Version: '1.0.0-test',
  NumeroInstalacion: 'test-001',
  TipoUsoPosibleSoloVerifactu: 'S' as const,
  TipoUsoPosibleMultiOT: 'S' as const,
  IndicadorMultiplesOT: 'S' as const,
}

test('RegistroAlta XML — primer registro con estructura completa', () => {
  const xml = buildRegistroAltaXml({
    cabecera: {
      nifEmisor: '89890001K',
      nombreEmisor: 'Barbería Test SL',
    },
    sistemaInformatico: SI_TEST,
    IDEmisorFactura: '89890001K',
    NumSerieFactura: 'F-2026-0001',
    FechaExpedicionFactura: '24-04-2026',
    NombreRazonEmisor: 'Barbería Test SL',
    TipoFactura: 'F1',
    DescripcionOperacion: 'Corte de pelo',
    desglose: [{
      TipoImpositivo: '21',
      BaseImponibleOimporteNoSujeto: '20.66',
      CuotaRepercutida: '4.34',
    }],
    CuotaTotal: '4.34',
    ImporteTotal: '25.00',
    encadenamiento: { isPrimerRegistro: true },
    FechaHoraHusoGenRegistro: '2026-04-24T18:30:00+02:00',
    Huella: 'ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890',
  })

  // Header XML + root element con namespaces correctos.
  assert.ok(xml.startsWith('<?xml'))
  assert.match(xml, /xmlns:sfLR="[^"]*SuministroLR\.xsd"/)
  assert.match(xml, /xmlns:sf="[^"]*SuministroInformacion\.xsd"/)

  // Cabecera con ObligadoEmision
  assert.match(xml, /<sfLR:Cabecera>/)
  assert.match(xml, /<sf:NIF>89890001K<\/sf:NIF>/)
  assert.match(xml, /<sf:NombreRazon>Barbería Test SL<\/sf:NombreRazon>/)

  // RegistroAlta elementos obligatorios
  assert.match(xml, /<sf:RegistroAlta>/)
  assert.match(xml, /<sf:IDVersion>1\.0<\/sf:IDVersion>/)
  assert.match(xml, /<sf:IDEmisorFactura>89890001K<\/sf:IDEmisorFactura>/)
  assert.match(xml, /<sf:NumSerieFactura>F-2026-0001<\/sf:NumSerieFactura>/)
  assert.match(xml, /<sf:FechaExpedicionFactura>24-04-2026<\/sf:FechaExpedicionFactura>/)
  assert.match(xml, /<sf:TipoFactura>F1<\/sf:TipoFactura>/)
  assert.match(xml, /<sf:DescripcionOperacion>Corte de pelo<\/sf:DescripcionOperacion>/)

  // Desglose IVA
  assert.match(xml, /<sf:TipoImpositivo>21<\/sf:TipoImpositivo>/)
  assert.match(xml, /<sf:BaseImponibleOimporteNoSujeto>20\.66<\/sf:BaseImponibleOimporteNoSujeto>/)
  assert.match(xml, /<sf:CuotaRepercutida>4\.34<\/sf:CuotaRepercutida>/)

  // Totales
  assert.match(xml, /<sf:CuotaTotal>4\.34<\/sf:CuotaTotal>/)
  assert.match(xml, /<sf:ImporteTotal>25\.00<\/sf:ImporteTotal>/)

  // Encadenamiento primer registro
  assert.match(xml, /<sf:PrimerRegistro>S<\/sf:PrimerRegistro>/)

  // SistemaInformatico (nosotros)
  assert.match(xml, /<sf:IdSistemaInformatico>01<\/sf:IdSistemaInformatico>/)
  assert.match(xml, /<sf:TipoUsoPosibleSoloVerifactu>S<\/sf:TipoUsoPosibleSoloVerifactu>/)

  // Timestamp y huella
  assert.match(xml, /<sf:FechaHoraHusoGenRegistro>2026-04-24T18:30:00\+02:00<\/sf:FechaHoraHusoGenRegistro>/)
  assert.match(xml, /<sf:TipoHuella>01<\/sf:TipoHuella>/) // 01 = SHA-256 según L12
  assert.match(xml, /<sf:Huella>ABCDEF1234567890/)
})

test('RegistroAlta XML — segundo registro encadena con anterior', () => {
  const xml = buildRegistroAltaXml({
    cabecera: { nifEmisor: '89890001K', nombreEmisor: 'Test' },
    sistemaInformatico: SI_TEST,
    IDEmisorFactura: '89890001K',
    NumSerieFactura: 'F-2026-0002',
    FechaExpedicionFactura: '24-04-2026',
    NombreRazonEmisor: 'Test',
    TipoFactura: 'F1',
    DescripcionOperacion: 'x',
    desglose: [{ TipoImpositivo: '21', BaseImponibleOimporteNoSujeto: '10.00', CuotaRepercutida: '2.10' }],
    CuotaTotal: '2.10',
    ImporteTotal: '12.10',
    encadenamiento: {
      isPrimerRegistro: false,
      registroAnterior: {
        IDEmisorFactura: '89890001K',
        NumSerieFactura: 'F-2026-0001',
        FechaExpedicionFactura: '24-04-2026',
        Huella: 'AAAA'.repeat(16),
      },
    },
    FechaHoraHusoGenRegistro: '2026-04-24T18:35:00+02:00',
    Huella: 'BBBB'.repeat(16),
  })

  assert.match(xml, /<sf:RegistroAnterior>/)
  assert.match(xml, /<sf:IDEmisorFactura>89890001K<\/sf:IDEmisorFactura>/)
  assert.match(xml, /<sf:NumSerieFactura>F-2026-0001<\/sf:NumSerieFactura>/)
  assert.match(xml, new RegExp(`<sf:Huella>${'A'.repeat(64)}<\/sf:Huella>`))
  // No debe llevar PrimerRegistro en este caso
  assert.ok(!xml.includes('<sf:PrimerRegistro>'))
})

test('RegistroAlta XML — destinatario B2B con NIF', () => {
  const xml = buildRegistroAltaXml({
    cabecera: { nifEmisor: '89890001K', nombreEmisor: 'Test' },
    sistemaInformatico: SI_TEST,
    IDEmisorFactura: '89890001K',
    NumSerieFactura: 'F-2026-0003',
    FechaExpedicionFactura: '24-04-2026',
    NombreRazonEmisor: 'Test',
    TipoFactura: 'F1',
    DescripcionOperacion: 'Corte',
    desglose: [{ TipoImpositivo: '21', BaseImponibleOimporteNoSujeto: '20.00', CuotaRepercutida: '4.20' }],
    CuotaTotal: '4.20',
    ImporteTotal: '24.20',
    destinatario: { NombreRazon: 'Cliente SL', NIF: 'B12345678' },
    encadenamiento: { isPrimerRegistro: true },
    FechaHoraHusoGenRegistro: '2026-04-24T19:00:00+02:00',
    Huella: 'CCCC'.repeat(16),
  })

  assert.match(xml, /<sf:Destinatarios>/)
  assert.match(xml, /<sf:NombreRazon>Cliente SL<\/sf:NombreRazon>/)
  assert.match(xml, /<sf:NIF>B12345678<\/sf:NIF>/)
})

test('RegistroAnulacion XML — estructura correcta', () => {
  const xml = buildRegistroAnulacionXml({
    cabecera: { nifEmisor: '89890001K', nombreEmisor: 'Test' },
    sistemaInformatico: SI_TEST,
    IDEmisorFacturaAnulada: '89890001K',
    NumSerieFacturaAnulada: 'F-2026-0001',
    FechaExpedicionFacturaAnulada: '24-04-2026',
    encadenamiento: {
      isPrimerRegistro: false,
      registroAnterior: {
        IDEmisorFactura: '89890001K',
        NumSerieFactura: 'F-2026-0002',
        FechaExpedicionFactura: '24-04-2026',
        Huella: 'DDDD'.repeat(16),
      },
    },
    FechaHoraHusoGenRegistro: '2026-04-24T20:00:00+02:00',
    Huella: 'EEEE'.repeat(16),
  })

  assert.match(xml, /<sf:RegistroAnulacion>/)
  assert.match(xml, /<sf:IDEmisorFacturaAnulada>89890001K<\/sf:IDEmisorFacturaAnulada>/)
  assert.match(xml, /<sf:NumSerieFacturaAnulada>F-2026-0001<\/sf:NumSerieFacturaAnulada>/)
  assert.match(xml, /<sf:FechaExpedicionFacturaAnulada>24-04-2026<\/sf:FechaExpedicionFacturaAnulada>/)
  assert.match(xml, /<sf:RegistroAnterior>/)
  assert.match(xml, /<sf:TipoHuella>01<\/sf:TipoHuella>/)

  // No lleva TipoFactura, Desglose, CuotaTotal, ImporteTotal (solo está en Alta)
  assert.ok(!xml.includes('<sf:TipoFactura>'))
  assert.ok(!xml.includes('<sf:Desglose>'))
  assert.ok(!xml.includes('<sf:CuotaTotal>'))
})

test('SOAP envelope — wrapea el XML sin duplicar declaración', () => {
  const innerXml = buildRegistroAltaXml({
    cabecera: { nifEmisor: '89890001K', nombreEmisor: 'Test' },
    sistemaInformatico: SI_TEST,
    IDEmisorFactura: '89890001K',
    NumSerieFactura: 'F-2026-0001',
    FechaExpedicionFactura: '24-04-2026',
    NombreRazonEmisor: 'Test',
    TipoFactura: 'F1',
    DescripcionOperacion: 'x',
    desglose: [{ TipoImpositivo: '21', BaseImponibleOimporteNoSujeto: '10.00', CuotaRepercutida: '2.10' }],
    CuotaTotal: '2.10',
    ImporteTotal: '12.10',
    encadenamiento: { isPrimerRegistro: true },
    FechaHoraHusoGenRegistro: '2026-04-24T18:30:00+02:00',
    Huella: 'AAAA'.repeat(16),
  })

  const soap = wrapInSoapEnvelope(innerXml)

  assert.ok(soap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.match(soap, /<soapenv:Envelope/)
  assert.match(soap, /xmlns:soapenv="http:\/\/schemas\.xmlsoap\.org\/soap\/envelope\/"/)
  assert.match(soap, /<soapenv:Body>/)
  assert.match(soap, /<sfLR:RegFactuSistemaFacturacion/)
  assert.match(soap, /<\/soapenv:Envelope>$/)

  // La declaración XML del inner no aparece dentro del envelope (solo la exterior)
  const firstXmlDecl = soap.indexOf('<?xml')
  const secondXmlDecl = soap.indexOf('<?xml', firstXmlDecl + 1)
  assert.equal(secondXmlDecl, -1, 'No debe haber dos declaraciones <?xml ?>')
})

test('Consistencia hash ↔ XML — mismos valores en ambos', () => {
  // Test crítico: los campos del XML deben coincidir exactamente con los
  // que entran en el hash. Si cambia algo aquí sin cambiar allá, AEAT rechaza.
  const fecha = '24-04-2026'
  const fechaHora = '2026-04-24T18:30:00+02:00'
  const huellaAnterior = 'F'.repeat(64)

  const hash = computeHashAlta({
    IDEmisorFactura: '89890001K',
    NumSerieFactura: 'F-2026-0001',
    FechaExpedicionFactura: fecha,
    TipoFactura: 'F1',
    CuotaTotal: '4.34',
    ImporteTotal: '25.00',
    Huella: huellaAnterior,
    FechaHoraHusoGenRegistro: fechaHora,
  })

  const xml = buildRegistroAltaXml({
    cabecera: { nifEmisor: '89890001K', nombreEmisor: 'Test' },
    sistemaInformatico: SI_TEST,
    IDEmisorFactura: '89890001K',
    NumSerieFactura: 'F-2026-0001',
    FechaExpedicionFactura: fecha,
    NombreRazonEmisor: 'Test',
    TipoFactura: 'F1',
    DescripcionOperacion: 'Corte',
    desglose: [{ TipoImpositivo: '21', BaseImponibleOimporteNoSujeto: '20.66', CuotaRepercutida: '4.34' }],
    CuotaTotal: '4.34',
    ImporteTotal: '25.00',
    encadenamiento: {
      isPrimerRegistro: false,
      registroAnterior: {
        IDEmisorFactura: '89890001K',
        NumSerieFactura: 'PREV-0001',
        FechaExpedicionFactura: '23-04-2026',
        Huella: huellaAnterior,
      },
    },
    FechaHoraHusoGenRegistro: fechaHora,
    Huella: hash,
  })

  // Los 8 campos del hash deben aparecer en el XML con el mismo valor.
  assert.match(xml, new RegExp(`<sf:IDEmisorFactura>89890001K</sf:IDEmisorFactura>`))
  assert.match(xml, new RegExp(`<sf:NumSerieFactura>F-2026-0001</sf:NumSerieFactura>`))
  assert.match(xml, new RegExp(`<sf:FechaExpedicionFactura>${fecha}</sf:FechaExpedicionFactura>`))
  assert.match(xml, /<sf:TipoFactura>F1<\/sf:TipoFactura>/)
  assert.match(xml, /<sf:CuotaTotal>4\.34<\/sf:CuotaTotal>/)
  assert.match(xml, /<sf:ImporteTotal>25\.00<\/sf:ImporteTotal>/)
  // La huella anterior va dentro de RegistroAnterior
  assert.match(xml, new RegExp(`<sf:RegistroAnterior>[\\s\\S]*?<sf:Huella>${huellaAnterior}`))
  assert.match(xml, new RegExp(`<sf:FechaHoraHusoGenRegistro>${fechaHora.replace('+', '\\+')}</sf:FechaHoraHusoGenRegistro>`))
  // La huella del registro actual va al final
  assert.match(xml, new RegExp(`<sf:Huella>${hash}</sf:Huella>`))
})
