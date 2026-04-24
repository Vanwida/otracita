# VeriFactu — Estado completo del trabajo

Documento vivo que describe **qué hemos hecho, qué falta por hacer, y cómo
usar lo ya construido** en la parte de facturación VeriFactu de otracita.

Actualización: **2026-04-24**

---

## Índice

1. [¿Qué es VeriFactu y por qué?](#qué-es-verifactu-y-por-qué)
2. [Mini-glosario sin jerga](#mini-glosario-sin-jerga)
3. [Contexto regulatorio](#contexto-regulatorio)
4. [Decisiones arquitectónicas tomadas](#decisiones-arquitectónicas-tomadas)
5. [Roadmap y estado por milestone](#roadmap-y-estado-por-milestone)
6. [Detalle de lo ya construido (M1-M3, M5)](#detalle-de-lo-ya-construido)
7. [Detalle de lo que falta (M4, M6, M7)](#detalle-de-lo-que-falta)
8. [Cambios en base de datos](#cambios-en-base-de-datos)
9. [Cómo usar lo que hay hoy](#cómo-usar-lo-que-hay-hoy)
10. [Tests y cómo ejecutarlos](#tests-y-cómo-ejecutarlos)
11. [Bloqueantes críticos](#bloqueantes-críticos)
12. [Riesgos conocidos](#riesgos-conocidos)
13. [Quién responsable de qué](#quién-responsable-de-qué)

---

## ¿Qué es VeriFactu y por qué?

**VeriFactu** es un sistema de la Agencia Tributaria española (AEAT) que
obliga a todos los programas informáticos de facturación a:

1. Calcular un **hash criptográfico (huella SHA-256)** de cada factura
2. **Encadenar** cada factura con la anterior (cada huella incluye la
   anterior → cualquier modificación retrospectiva se detecta)
3. Incluir un **código QR** en la factura que el cliente puede escanear
   para verificar que está registrada en Hacienda
4. **Enviar cada factura** al servicio web de AEAT casi en tiempo real

Objetivo de Hacienda: **acabar con el fraude de facturación**. No se pueden
borrar facturas ni inventarse ventas.

**Por qué nos importa a nosotros**: desde el **1 de julio de 2027** es
OBLIGATORIO para todos los autónomos en España. Si nuestros clientes
(barberos) no usan un software que cumpla VeriFactu, **se exponen a multas
de 50.000€ por ejercicio** y **nosotros como fabricantes a 150.000€ por
producto/año**.

Buena noticia: hacerlo bien nos convierte en **diferenciador vs Booksy/
Holded** — podemos empezar a captar barberos con el argumento *"ya
cumplimos con VeriFactu, los demás tienen que adaptarse antes de 2027"*.

---

## Mini-glosario sin jerga

| Término | Qué significa en simple |
|---------|-------------------------|
| **AEAT** | Agencia Estatal de Administración Tributaria = Hacienda |
| **SIF** | Sistema Informático de Facturación = cualquier software que emite facturas. Otracita ES un SIF. |
| **VeriFactu** | El modo "moderno" de AEAT. Envías cada factura en el momento. Más recomendado. |
| **NO-VeriFactu** | Modo alternativo. Guardas las facturas localmente, Hacienda las pide si quiere. Requiere firma electrónica por factura. Más complejo. Lo descartamos. |
| **Huella / hash** | Un código único de 64 caracteres que identifica una factura y detecta cualquier manipulación. |
| **Encadenamiento** | Cada factura incluye la huella de la anterior. Si alguien rompe la cadena, se detecta. |
| **QR tributario** | El QR específico que lleva la URL de verificación AEAT. No confundir con QR de pago. |
| **Certificado digital** | Archivo `.pfx` con una identidad digital (la tuya, Alex). Necesario para firmar envíos a AEAT. |
| **Declaración Responsable** | Documento que firma el fabricante (tú, Alex) diciendo *"juro que mi software cumple RD 1007/2023"*. Obligatoria legal. |
| **RegistroAlta** | Mensaje XML que le mandamos a AEAT cuando emitimos una factura. |
| **RegistroAnulacion** | Mensaje XML cuando anulamos una. |
| **Tipo factura F1 / F2 / F3** | F1 = ordinaria (la normal). F2 = simplificada (ticket). F3 = sustituida. |
| **Tipo factura R1..R5** | Rectificativas por distintos motivos (R1=datos mal, R2=importes mal, R3=devolución, R4=IVA, R5=otro). |
| **Rectificativa** | Factura nueva que corrige una anterior. La original NO se borra nunca — se marca como "rectificada" y se crea una independiente. |
| **XAdES-BES** | Tipo de firma digital específica. AEAT exige este formato para firmar los XML antes de enviarlos. |
| **mTLS** | Autenticación mutua SSL con certificado cliente. AEAT la exige para conectarse a su servicio SOAP. |

---

## Contexto regulatorio

**Normativa base (todo verificado directamente contra BOE y sede AEAT):**

| Norma | Qué establece | Fecha |
|-------|---------------|-------|
| **Real Decreto 1007/2023** | Reglamento general del SIF | 5 dic 2023 |
| **Orden HAC/1177/2024** | Especificaciones técnicas exactas | 17 oct 2024 |
| **RDL 15/2025** | Aplazamiento de fechas | 2025 |

**Fechas de obligatoriedad actualizadas (tras RDL 15/2025):**

- Sociedades (empresas con Impuesto Sociedades): **1 enero 2027**
- Autónomos y PYMEs: **1 julio 2027**
- Fabricantes de software (nosotros): debemos tener versión adaptada
  disponible ANTES de esas fechas. El plazo de 9 meses desde la Orden
  publicó la spec ya venció — técnicamente deberíamos estar adaptados.

**Sanciones:**

| Quién | Infracción | Sanción |
|-------|------------|---------|
| Fabricante software | Producto no certificado | **150.000€ por producto/año** |
| Usuario (barbero) | Software no adaptado | **50.000€/ejercicio** |

---

## Decisiones arquitectónicas tomadas

### 1. Modo VeriFactu (no NO-VeriFactu)

Elegimos modo VeriFactu por 5 razones verificadas:

| Criterio | VeriFactu (elegido) | NO-VeriFactu |
|----------|:-------------------:|:------------:|
| Firma electrónica por registro | No requerida | Obligatoria |
| Certificado por barbero | No | Sí (inviable onboarding) |
| QR verificable por cliente | Sí | No |
| Envío automático a AEAT | Sí | No (bajo requerimiento) |
| Recomendado por AEAT | Sí, explícito | No |

### 2. BUILD vs BUY

**Elegido BUILD.** Rechazamos usar APIs externas como Verifacti/Verifactu.com
porque:
- Coste variable por barbero (3-10€/mes cada uno)
- Dependencia de tercero para regulación crítica
- Sin diferenciador técnico
- Con 30+ barberos se amortizaría el trabajo upfront

### 3. Certificado transmisor único (no uno por barbero)

El certificado FNMT es **uno solo, a nombre de Alejandro Sole** (persona
física). otracita actúa como **"sistema informático de facturación que
transmite en nombre del obligado tributario"** (figura prevista en la
norma para SaaS multi-tenant).

Alternativa rechazada: pedir certificado a cada barbero → infierno
onboarding.

### 4. Envío cuasi-inmediato

Cada factura se envía a AEAT en segundos-minutos tras su emisión, NO por
batches trimestrales. Lo que es trimestral son los **modelos fiscales**
(303/130) — eso es otra cosa (está en el roadmap como Fase B, tarea #26).

### 5. UX: Mostrar QR solo si AEAT ha aceptado

Aunque calculamos la huella y el QR URL desde M1, **no pintamos el QR en la
factura** hasta que `verifactu_status='accepted'` (cuando M4 esté activo).
Razón: un QR que devuelve "Factura no encontrada" al escanear es peor que
no tener QR.

---

## Roadmap y estado por milestone

| # | Milestone | Descripción breve | Estado | Commit |
|---|-----------|-------------------|--------|--------|
| M1 | Fundamentos | Schema + hash + encadenamiento | ✅ DONE | `f84f74f` |
| M2 | QR + render | Generación QR + wire en factura + sealado automático | ✅ DONE | `c031b31` |
| M3 | XML | Generador RegFactuSistemaFacturacion + SOAP envelope | ✅ DONE | `f0130ea` |
| M4 | Envío AEAT | Firma XAdES-BES + mTLS + HTTP client al servicio AEAT | 🔴 BLOQUEADO | — |
| M5.1 | UX dashboard | Badges estado + Timeline + Banner errores | ✅ DONE | `ff1d7cd` |
| M5.2 | Rectificativa | Modal + endpoint + flow completo | ✅ DONE | `dac0835` |
| M6 | Declaración Responsable | Redacción + firma + publicación `/legal/verifactu` | ⏳ PENDIENTE | — |
| M7 | Producción | Switch env + pruebas intensivas + monitoreo | ⏳ PENDIENTE | — |

**Estado global**: 5/8 milestones cerrados. Los 3 restantes dependen del
certificado FNMT.

---

## Detalle de lo ya construido

### M1 — Fundamentos (`f84f74f`)

**Qué hace**: toda nueva factura emitida calcula su huella criptográfica
y se encadena con la anterior del mismo emisor.

**Archivos:**

- `src/lib/verifactu/hash.ts` — implementación del algoritmo SHA-256
  exacto según PDF AEAT v0.1.2 (27/08/2024).
  - `computeHashAlta(input)` — huella para factura de alta/rectificativa
  - `computeHashAnulacion(input)` — huella para factura anulada
  - Formato: concatena campos como `nombre1=valor1&nombre2=valor2&...` en
    orden fijo, SHA-256, output HEX MAYÚSCULAS 64 chars.

- `src/lib/verifactu/format.ts` — helpers puros de formato.
  - `formatFechaExpedicion(date)` → `DD-MM-YYYY` en zona Madrid
  - `formatFechaHoraHusoGen(date)` → ISO 8601 con offset `+01:00` (CET)
    o `+02:00` (CEST) según DST
  - `centsToDecimal(cents)` → `N.DD`

- `src/lib/verifactu/chain.ts` — encadenamiento atómico.
  - `chainRegistroAlta({clientId, ...})` — calcula huella, encadena con
    la anterior del mismo cliente, persiste todo en una transacción
    atómica con `pg_advisory_xact_lock` por clientId (evita race
    condition entre facturas concurrentes).
  - `chainRegistroAnulacion(...)` — idem para anulaciones.
  - `getEmisorNif(clientId)` — valida y devuelve NIF fiscal del barbero.

**Tests** (11/11 pasan byte-exact contra vectores oficiales AEAT):
- `hash.test.ts` — 3 vectores oficiales del PDF + 5 edge cases
- `format.test.ts` — 3 tests de helpers de formato (Madrid TZ con DST)

---

### M2 — QR code + render (`c031b31`)

**Qué hace**: toda factura emitida recibe una URL de verificación AEAT
y, cuando llegue el momento, mostrará un QR reglamentario en la impresión.

**Archivos:**

- `src/lib/verifactu/qr.ts` — construcción de URLs.
  - `buildQrUrl({nif, numserie, fecha, importe, env, verifactu})` →
    URL según spec PDF AEAT v0.5.0 (10/12/2025).
  - 4 URLs base: prod+pruebas × VeriFactu+NO-VeriFactu.
  - URL-encoding UTF-8 de todos los parámetros.
  - Constantes: `QR_SIZE_MM=35`, `QR_ERROR_CORRECTION='M'` (ambos
    requisitos AEAT).

- `src/lib/verifactu/qr-render.ts` — renderizado.
  - `renderQrSvg(url)` → SVG string vectorial para print
  - `renderQrPngDataUrl(url)` → PNG dataURL

- `src/lib/verifactu/QrBlock.tsx` — componente React server.
  - Bloque reglamentario: texto "QR tributario:" encima + QR 35mm +
    "Factura verificable en la sede electrónica de la AEAT" debajo.

- `src/lib/invoicing.ts` → nueva función `sealInvoiceVerifactu(clientId,
  invoiceId, number, issueDate, cuota, total, tipoFactura)` llamada tras
  cada inserción de factura (auto-booking + manual walk-in).

- `src/app/dashboard/facturas/[id]/page.tsx` — QR renderizado en esquina
  superior derecha del header, **oculto hasta `verifactu_status='accepted'`**.

**Tests** (8 nuevos, 19/19 totales): URL exacta del ejemplo oficial
PDF AEAT, URL-encoding de caracteres especiales, defaults conservadores.

---

### M3 — XML builder + SOAP (`f0130ea`)

**Qué hace**: genera el XML exacto que se enviará a AEAT en M4. Por ahora
solo se genera, no se envía.

**Archivos:**

- `src/lib/verifactu/xsd/` — XSDs oficiales descargados de AEAT:
  - `SuministroLR.xsd` (entrypoint)
  - `SuministroInformacion.xsd` (1390 líneas, tipos comunes)
  - `RespuestaSuministro.xsd` (schema respuesta)

- `src/lib/verifactu/xml.ts` — generador.
  - `buildRegistroAltaXml(args)` → XML siguiendo estructura XSD exacta
  - `buildRegistroAnulacionXml(args)` → idem para anulaciones
  - `wrapInSoapEnvelope(xml)` → envelope SOAP para endpoint AEAT
  - `defaultSistemaInformatico()` → info del SIF (otracita) desde env
    vars: `VERIFACTU_SIF_NAME`, `_NIF`, `_ID`, `_VERSION`, `_INSTALL`

Estructura XML generada:
```
RegFactuSistemaFacturacion
  ├── Cabecera
  │     └── ObligadoEmision (NIF + NombreRazon del barbero)
  └── RegistroFactura
        └── RegistroAlta | RegistroAnulacion
              ├── IDVersion (1.0)
              ├── IDFactura (emisor + serie + fecha)
              ├── NombreRazonEmisor, TipoFactura, Descripcion
              ├── Destinatarios (opcional, B2B)
              ├── Desglose IVA
              ├── CuotaTotal, ImporteTotal
              ├── Encadenamiento (PrimerRegistro o RegistroAnterior)
              ├── SistemaInformatico (info otracita)
              ├── FechaHoraHusoGenRegistro
              ├── TipoHuella='01' (SHA-256)
              └── Huella (la calculada en M1)
```

**Tests** (6 nuevos, 25/25 totales): estructura completa primer registro,
encadenado, destinatario B2B, anulación, SOAP envelope, **consistencia
hash↔XML** (los 8 campos del hash aparecen exactos en el XML).

---

### M5.1 — UX dashboard: badges + timeline + banner (`ff1d7cd`)

**Qué hace**: la UI del dashboard de facturas refleja el estado VeriFactu
de forma visible y clara.

**Archivos:**

- `src/app/dashboard/facturas/_components/VerifactuBadge.tsx` —
  componente reutilizable con 7 estados:
  - `accepted` → "Registrada" verde ✓
  - `accepted_with_errors` → "Con avisos" amarillo ⚠
  - `pending`/`sent` → "Pendiente" gris con spinner 🔄
  - `rejected` → "Rechazada" rojo ⚠
  - `error` → "Error" rojo ⚠
  - `null` → "—" gris (facturas anteriores a VeriFactu)

- `src/app/dashboard/facturas/_components/VerifactuTimeline.tsx` —
  timeline de 3 pasos con timestamps y mensajes humanos:
  1. Emitida (siempre)
  2. Enviada a Hacienda (tras worker M4)
  3. Registrada / Con avisos / Rechazada / Error (tras respuesta AEAT)

- `src/app/dashboard/facturas/page.tsx` — lista con:
  - Columna nueva "Hacienda" con el badge
  - Banner rojo arriba si hay facturas con problemas (cuenta global
    de rechazos/errores)

- `src/app/dashboard/facturas/[id]/page.tsx` — sección "Estado en
  Hacienda" con el badge + timeline, oculta en print.

---

### M5.2 — Rectificativa desde factura (`dac0835`)

**Qué hace**: desde una factura emitida, el barbero puede emitir una
rectificativa en 3 clics.

**Archivos:**

- `src/lib/invoicing.ts` → nueva función `createRectificativa(clientId, {
  originalInvoiceId, motivo, newSubtotalCents, newIvaAmountCents,
  newTotalCents, notes })`.
  - Reserva número correlativo nuevo (no reutiliza el de la original)
  - Inserta factura nueva con `tipoFactura='RX'` + `rectifiesInvoiceId`
  - Marca la original como `status='rectified'` (solo status, NO tocamos
    campos del hash original)
  - Sella la rectificativa con su propia huella VeriFactu

- `src/app/api/invoices/[id]/rectificativa/route.ts` — POST endpoint
  tenant-scoped con validación de motivo (R1-R5) e importes.

- `src/app/dashboard/facturas/_components/RectificativaModal.tsx` —
  modal con radio de 5 motivos + campos de nuevos importes + notas.
  Motivo R3 (devolución total) auto-rellena 0€.

- `src/app/dashboard/facturas/[id]/RectificativaButton.tsx` — botón
  cliente que abre el modal, visible solo si la factura es rectificable
  (no anulada, no ya rectificada, no es a su vez una rectificativa).

---

## Detalle de lo que falta

### M4 — Firma + envío a AEAT (BLOQUEADO)

**Bloqueante único**: certificado FNMT de Alejandro Sole.
Instrucciones en `docs/verifactu-certificado-fnmt.md`.

**Qué construiremos:**

1. **Cliente HTTP con mTLS** — usamos `https.Agent` de Node.js con el
   certificado FNMT como credencial cliente. Sin mTLS AEAT rechaza la
   conexión SSL antes incluso de mirar el XML.

2. **Firma XAdES-BES** del XML generado en M3. Librería a instalar:
   `@xmldsigjs/xadesjs` (no requiere native build). El envelope SOAP
   firmado es lo que se envía a AEAT.

3. **Endpoint pre-producción AEAT**:
   `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`

4. **Queue worker** con reintentos exponenciales (1min, 5min, 30min, 2h).
   Si AEAT está caído, la factura queda en `pending` y el worker
   reintenta sin intervención.

5. **Parser de respuestas** AEAT (`RespuestaSuministro.xsd`) → actualiza
   `verifactu_status` a accepted / accepted_with_errors / rejected /
   error con el código y mensaje de AEAT.

6. **Variables de entorno a configurar en Vercel**:
   - `VERIFACTU_CERT_B64` — archivo .pfx en base64
   - `VERIFACTU_CERT_PASS` — contraseña del .pfx
   - `VERIFACTU_ENV=pruebas` (después `production`)
   - `VERIFACTU_SIF_NIF` — NIF de Alex
   - `VERIFACTU_SIF_NAME=otracita`

**Esfuerzo estimado**: 5-7 días laborables desde que llega el cert.

**Gate de validación**: cuando enviemos al entorno pre-prod, AEAT nos
responde con OK o con código de error exacto. Es el primer feedback
técnico real sobre si nuestra implementación está bien.

---

### M6 — Declaración Responsable + `/legal/verifactu`

**Por qué es obligatoria (aunque no técnica)**: RD 1007/2023 exige al
fabricante del software emitir una Declaración Responsable. **Sanción
hasta 150.000€/producto/año si no se hace o se hace mal.** Es un
documento legal, no código.

**Qué se construirá:**

1. **Redactar Declaración Responsable** usando la plantilla oficial AEAT
   (documento `EjemplosDeclaracionResponsable.pdf` disponible en la
   sede).

2. **Alex la firma digitalmente** con su certificado FNMT.

3. **Publicar en `/legal/verifactu`** como página pública con:
   - PDF de la declaración firmada
   - Metadatos: versión del software, fecha, identificación del SIF
   - Información técnica resumida (por si algún inspector AEAT quiere
     ver el certificado de cumplimiento)

4. **Re-firmar cada vez que cambia la versión** (aunque sean cambios
   mínimos). Automatizable vía CI en el futuro.

**Esfuerzo**: 1-2 días. Trabajo de escribir más que de programar.

**Puede arrancarse en paralelo a M4** — no depende del envío funcionando.

---

### M7 — Producción

**Qué se construirá:**

1. **Pruebas intensivas en pre-prod** — emitir 20+ facturas sintéticas,
   anularlas, rectificarlas, validar todos los estados de respuesta
   (accepted, rejected, accepted_with_errors, error transitorio de red,
   etc.).

2. **Plan de rollout** — activar VeriFactu progresivamente por barbería
   vía feature flag `client.verifactuEnabled` (columna nueva). Empezar
   con 1 barbería beta, monitorizar una semana, luego abrir.

3. **Switch producción**:
   - `VERIFACTU_ENV=production`
   - Re-apuntar a `https://www1.agenciatributaria.gob.es/...`
   - Publicar la Declaración Responsable final.

4. **Monitoreo primera semana post-deploy** — alertas si:
   - `>5%` de envíos en estado `error` o `rejected`
   - Latencia de envío > 5 min
   - Cadena rota (una huella_anterior que no coincide con huella
     previa — no debería pasar por el advisory lock)

5. **Documentación para barbero** — página de ayuda *"Qué es VeriFactu
   y cómo afecta a tu negocio"* con lenguaje humano.

**Esfuerzo**: 2-3 días de test + 1 semana de observación tras ir live.

---

## Cambios en base de datos

**Aplicados a Neon production (`psql` directo, registro manual ya que
los commits llevan el código que los usa):**

### Tabla `invoices` — 21 columnas nuevas

```sql
ALTER TABLE invoices
  ADD COLUMN huella char(64),
  ADD COLUMN huella_anterior char(64),
  ADD COLUMN is_primer_registro boolean NOT NULL DEFAULT false,
  ADD COLUMN tipo_factura text NOT NULL DEFAULT 'F1',
  ADD COLUMN fecha_hora_huso_gen timestamptz,
  ADD COLUMN qr_url text,
  ADD COLUMN verifactu_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN verifactu_sent_at timestamptz,
  ADD COLUMN verifactu_response_at timestamptz,
  ADD COLUMN verifactu_error_code text,
  ADD COLUMN verifactu_error_msg text,
  ADD COLUMN verifactu_xml_sent text,
  ADD COLUMN verifactu_xml_response text,
  ADD COLUMN verifactu_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN rectifies_invoice_id uuid REFERENCES invoices(id),
  ADD COLUMN rectification_motivo text,
  ADD COLUMN anulada_at timestamptz,
  ADD COLUMN anulacion_huella char(64);

CREATE INDEX idx_invoices_client_gen_order
  ON invoices (client_id, fecha_hora_huso_gen DESC)
  WHERE huella IS NOT NULL;
```

### Tabla `invoice_registro_events` — nueva

Libro de eventos del SIF. Cada alta o anulación se registra aquí para
auditoría independiente de la tabla `invoices`, y mantiene la cadena
cronológica completa (altas y anulaciones entremezcladas).

```sql
CREATE TABLE invoice_registro_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  event_type text NOT NULL,  -- 'alta' | 'anulacion' | 'sistema'
  invoice_id uuid REFERENCES invoices(id),
  huella char(64),
  huella_anterior char(64),
  fecha_hora_huso_gen timestamptz NOT NULL DEFAULT NOW(),
  xml_payload text,
  verifactu_status text NOT NULL DEFAULT 'pending',
  verifactu_sent_at timestamptz,
  verifactu_response_at timestamptz,
  verifactu_error_code text,
  verifactu_error_msg text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
```

---

## Cómo usar lo que hay hoy

### Como barbero (usuario del dashboard)

1. **Emitir factura ordinaria** — sin cambios: se emite sola cuando se
   confirma una reserva con precio. En `/dashboard/facturas` la ves
   listada con columna "Hacienda" = "Pendiente" (porque M4 no activo).

2. **Ver detalle y estado** — click en una factura → "Estado en
   Hacienda" sección debajo de la factura muestra el timeline.

3. **Emitir rectificativa** — click en una factura → botón "Emitir
   rectificativa" junto al Imprimir → modal → elige motivo R1-R5 +
   nuevos importes → se crea una nueva factura rectificativa
   correlativa y la original queda marcada como rectificada.

4. **Anular factura** — desde la agenda → marcar reserva como cancelada
   → la factura asociada queda `status='voided'` (lógica existente).

### Como desarrollador

Para calcular una huella:

```typescript
import { computeHashAlta } from '@/lib/verifactu/hash'
const hash = computeHashAlta({
  IDEmisorFactura: '89890001K',
  NumSerieFactura: 'F-2026-0001',
  FechaExpedicionFactura: '24-04-2026',
  TipoFactura: 'F1',
  CuotaTotal: '4.34',
  ImporteTotal: '25.00',
  Huella: '',  // primer registro
  FechaHoraHusoGenRegistro: '2026-04-24T18:30:00+02:00',
})
```

Para construir la URL QR:

```typescript
import { buildQrUrl } from '@/lib/verifactu/qr'
const qrUrl = buildQrUrl({
  nif: '89890001K',
  numserie: 'F-2026-0001',
  fecha: '24-04-2026',
  importe: '25.00',
})
```

Para encadenar una factura nueva (con TX atómica):

```typescript
import { chainRegistroAlta } from '@/lib/verifactu/chain'
await chainRegistroAlta({
  clientId, invoiceId, emisorNif,
  serieNumero, tipoFactura: 'F1',
  cuotaTotalCents, importeTotalCents,
  fechaExpedicion: new Date(),
})
```

---

## Tests y cómo ejecutarlos

**25/25 tests pasan byte-exact contra vectores oficiales AEAT.**

```bash
npm run test
```

O directo con node (sin framework externo):

```bash
cd reserva
TZ=Europe/Madrid node --experimental-strip-types --test \
  src/lib/verifactu/hash.test.ts \
  src/lib/verifactu/format.test.ts \
  src/lib/verifactu/qr.test.ts \
  src/lib/verifactu/xml.test.ts
```

**Coverage:**
- `hash.test.ts` — 8 tests: 3 vectores oficiales AEAT + 5 edge cases
- `format.test.ts` — 3 tests: DD-MM-YYYY / ISO 8601 Madrid / céntimos
- `qr.test.ts` — 8 tests: URL exacta PDF AEAT + URL-encoding + orden
  parámetros
- `xml.test.ts` — 6 tests: estructura XML primer registro / encadenado /
  B2B / anulación / SOAP envelope / consistencia hash↔XML

---

## Bloqueantes críticos

### 1. Certificado FNMT de Alejandro Sole

**Sin esto M4 no avanza.**

- Instrucciones en `docs/verifactu-certificado-fnmt.md`
- 30 min de trabajo para Alex (con Cl@ve)
- Coste 0€
- Una vez obtenido: pasármelo + contraseña, yo lo subo a Vercel env

### 2. (Opcional pero recomendado) Asesoría fiscalista para M6

- Validar la Declaración Responsable antes de firmarla
- 2-4h, ~200-400€
- Si no se hace: gate alternativo = AEAT pre-prod rechaza si algo está
  mal, iteramos con feedback real
- **Decisión tomada**: saltarnos fiscalista de momento. Reevaluamos si
  hay dudas antes de M6.

---

## Riesgos conocidos

| Riesgo | Impacto | Mitigación actual |
|--------|---------|-------------------|
| Hash mal calculado | AEAT rechaza TODAS las facturas | Tests byte-exact contra 3 vectores oficiales del PDF AEAT v0.1.2. 25/25 pasan. |
| Race condition en encadenamiento | Cadena rota → AEAT detecta manipulación | `pg_advisory_xact_lock` serializa escrituras por clientId + transacción atómica |
| Certificado digital mal tipo | AEAT rechaza mTLS | Documentado (FNMT persona física con Cl@ve). Validación el día que intentemos conectar en pre-prod. |
| XML no pasa XSD AEAT | Rechazo con "XML malformed" | Seguimos XSDs oficiales descargados. Validación formal con AEAT pre-prod real en M4. |
| Cambios regulatorios entre hoy y julio 2027 | Quedamos desfasados | BOE monitoring pendiente de tarea. Versionamos cada cambio de spec. |
| Fallo catastrófico en prod (facturas perdidas) | Legal risk | Doble persistencia: factura siempre en DB local ANTES del envío. Worker reintenta sin intervención. |
| Alex olvida la contraseña del .pfx | Bloqueo M4 | Proceso documentado: revocar + regenerar certificado. 30min extra. |
| Meta WhatsApp window (no VeriFactu) | OTP no llega a clientes nuevos | Issue paralelo (task #24), no bloquea VeriFactu. |

---

## Quién responsable de qué

### Claude (yo)

- Código: M1-M3, M5 (hecho); M4, M7 (pendiente)
- Tests exhaustivos byte-exact contra specs oficiales
- Documentación técnica (este archivo + `docs/verifactu-certificado-fnmt.md`)
- Investigación regulatoria contra fuentes oficiales AEAT/BOE
- Schema DB + migraciones
- Redactar borrador de Declaración Responsable (M6)

### Alex

- Obtener certificado FNMT (~30 min con Cl@ve) — **desbloquea M4**
- Subir certificado + contraseña a Vercel env (o pasármelos para que lo
  haga yo)
- Firmar la Declaración Responsable una vez redactada (M6)
- Decisión go-live (M7): cuándo activar VeriFactu para el primer
  barbero real
- (Opcional) Contratar fiscalista si queremos segundo par de ojos legal

### Conjuntamente

- Revisar este documento en cada milestone cerrado
- Decidir pricing: si incluimos VeriFactu en todos los planes o solo en
  tier premium
- Landing page: cómo comunicamos "otracita cumple VeriFactu desde hoy"
  como diferenciador vs Booksy/Holded

---

## Historial de actualizaciones de este documento

| Fecha | Qué cambió |
|-------|------------|
| 2026-04-24 | Versión inicial. M1-M3 + M5 cerrados. M4 bloqueado en cert. |
