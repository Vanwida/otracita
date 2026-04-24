# Meta WhatsApp — Plantillas (Templates)

Guía para entender y gestionar las plantillas de mensajes de WhatsApp que
usa otracita. Escrita para que Alex (hoy) o cualquier persona que
colabore mañana pueda:

- Entender **por qué** necesitamos plantillas
- Saber **qué** plantillas tiene aprobadas otracita y qué faltan
- Crear **nuevas** plantillas sin romper nada
- Diagnosticar y arreglar **rechazos** de Meta

Actualización: **2026-04-24**

---

## Índice

1. [La regla de 24h de Meta](#la-regla-de-24h-de-meta)
2. [Qué son las plantillas y cómo saltan la regla](#qué-son-las-plantillas-y-cómo-saltan-la-regla)
3. [Arquitectura de otracita: qué WABA envía qué](#arquitectura-de-otracita-qué-waba-envía-qué)
4. [Estado actual de plantillas](#estado-actual-de-plantillas)
5. [Paso a paso: crear la plantilla OTP](#paso-a-paso-crear-la-plantilla-otp)
6. [Qué hacer si Meta rechaza una plantilla](#qué-hacer-si-meta-rechaza-una-plantilla)
7. [Plantillas futuras pendientes](#plantillas-futuras-pendientes)
8. [Notas técnicas (permisos, API)](#notas-técnicas)
9. [Integración en código](#integración-en-código)
10. [Glosario](#glosario)

---

## La regla de 24h de Meta

WhatsApp Business es un canal con **reglas estrictas** para proteger a los
usuarios del spam. La regla fundamental:

> **Solo puedes enviar mensajes de texto libre a un usuario si ese usuario
> te ha escrito primero en las últimas 24 horas.**

Ejemplo concreto de dolor real que sufrimos:

- Ana nunca ha escrito a Private Studio
- Nuestra web le pide OTP → intenta enviárselo → **Meta bloquea el envío
  silenciosamente** → Ana nunca recibe el código → no se puede loguear → se
  frustra → se va

Este problema lo vivimos con la mujer de Alex el 2026-04-23. Es el
bloqueante #1 para **captación de clientes nuevos**.

### Los 3 tipos de mensaje según Meta

| Tipo | Cuándo se puede enviar | Coste |
|------|----------------------|-------|
| **Texto libre** | Solo dentro de la ventana de 24h tras última respuesta del usuario | Gratis |
| **Plantilla pre-aprobada** | Siempre (incluso fuera de la ventana) | Variable según categoría |
| **Autenticación** (tipo especial de plantilla) | Siempre | **Gratis** |

Por eso las plantillas son la solución: **rompen la limitación de 24h**.

---

## Qué son las plantillas y cómo saltan la regla

Una plantilla de WhatsApp es un mensaje **con estructura fija y variables
rellenables**, que Meta **revisa una sola vez** y luego puedes enviar
ilimitadas veces sin restricciones de ventana 24h.

Ejemplo estructura de plantilla:

```
Tu código de acceso a {{1}}: {{2}}. No lo compartas.
```

Cuando se envía, otracita rellena las variables (ej: `{{1}} = Private
Studio`, `{{2}} = 438291`) y Meta entrega el mensaje al instante.

### Las 3 categorías de plantilla

| Categoría | Uso | Ejemplo | Coste (España 2026) |
|-----------|-----|---------|---------------------|
| **Authentication** | OTPs, códigos de login, 2FA | "Tu código: {{1}}" | **Gratis** |
| **Utility** | Confirmaciones, recordatorios, cambios transaccionales | "Tu cita del {{1}} a las {{2}} está confirmada" | ~0,005€/mensaje |
| **Marketing** | Promociones, descuentos, anuncios | "20% de descuento esta semana" | ~0,0625€/mensaje |

**Authentication** es la que nos interesa primero porque cubre el OTP y es
gratis.

Los templates se someten **por WABA (WhatsApp Business Account)**, no
globalmente. Cada cuenta tiene sus propios templates aprobados. otracita
tiene su WABA propio; cada barbería puede tener el suyo.

---

## Arquitectura de otracita: qué WABA envía qué

Decisión tomada 2026-04-23: arquitectura **mixta**.

### Desde WABA de otracita (central)

Mensajes **transaccionales universales** que no tienen identidad de
barbería específica, o en los que preferimos rapidez de aprobación:

- **`otp_access_code`** — código OTP para login en la PWA de cualquier
  barbería.
  - Variables: `{{1}}` = nombre de la barbería, `{{2}}` = código numérico
  - Cliente ve: "Tu código para Private Studio: 438291..."

Ventaja: **un solo template activa login para TODAS las barberías**, sin
esperar a que cada una apruebe el suyo.
Desventaja: cliente ve "de parte de otracita" en vez del número de su
barbería. Aceptable para OTP (el cliente entiende que es el software).

### Desde WABA de cada barbería

Mensajes **con identidad de la barbería**, donde queremos que el cliente
vea el mismo número de WhatsApp con el que chatea el bot:

- `booking_confirmed` — confirmación de cita
- `booking_reminder_24h` — recordatorio día antes
- `booking_cancelled_by_shop` — barbero cancela cita
- `rating_request` — post-servicio, pedir valoración

Cada barbería aprueba sus 4 plantillas durante onboarding. Son 1-2 horas
cada una × 4 = ~1 día por barbería, pero sólo una vez.

---

## Estado actual de plantillas

### otracita WABA (central)

| Template | Categoría | Estado | Última actualización |
|----------|-----------|--------|-----------------------|
| `otp_access_code` | Authentication | ❌ Pendiente de crear | — |

### Private Studio WABA (barbería piloto)

| Template | Categoría | Estado |
|----------|-----------|--------|
| `booking_confirmed` | Utility | ❌ Pendiente |
| `booking_reminder_24h` | Utility | ❌ Pendiente |
| `booking_cancelled_by_shop` | Utility | ❌ Pendiente |
| `rating_request` | Utility | ❌ Pendiente |

---

## Paso a paso: crear la plantilla OTP

Esto es lo que tienes que hacer **ahora** para desbloquear los logins de
clientes nuevos.

### 1. Acceder a Meta Business Manager

https://business.facebook.com/wa/manage/message-templates/

Asegúrate de tener seleccionado el WABA correcto (otracita):
- Nombre: otracita
- Business Account ID: **851833034589826**

### 2. Crear plantilla

- Click en **"Crear plantilla"** (botón verde arriba a la derecha)

### 3. Rellenar paso 1: Categoría e idioma

- **Categoría**: Autenticación
- **Nombre**: `otp_access_code` (importante: minúsculas, guiones bajos)
- **Idioma**: Español

Click "Continuar".

### 4. Rellenar paso 2: Contenido

Meta presenta un editor específico para Authentication.

- **Tipo**: "Código de un solo uso" (OTP)
- **Tipo de entrega**: **"Copy code"** (el cliente copia el código manualmente — más compatible que "One-tap" que requiere configuración extra)
- **Botón**: Meta lo rellena solo con texto "Copiar código"
- **Plantilla del cuerpo**: Meta pre-rellena el texto obligatorio. NO lo
  puedes modificar excepto añadir opciones:
  - ✅ Marcar "Incluir recomendación de seguridad"
  - ✅ Marcar "Añadir tiempo de caducidad" → poner **10 minutos**

El texto resultante será algo como:

> Tu código de verificación de **otracita** es {{1}}. No compartas
> este código con nadie.
> Este código caduca en 10 minutos.

Variable `{{1}}` = el código numérico.

**Nota sobre formato**: Meta ha cambiado recientemente las plantillas de
OTP. Ya no aceptan cuerpo libre — son plantillas rígidas con parámetros
pre-definidos. Esto es BUENO (menos rechazos) pero limita personalización
(no podemos poner nombre de barbería en el cuerpo). El nombre de la
barbería aparecerá en el mensaje contextual del WhatsApp por el nombre del
remitente (otracita).

### 5. Revisar y enviar

- Ejemplo de cómo se verá el mensaje en la vista previa
- Click **"Enviar para aprobación"**

### 6. Esperar aprobación

- Authentication templates: **1-2 horas** típicamente
- Te llega email cuando se aprueba o rechaza
- Estado visible en la misma página de plantillas

### 7. Una vez aprobada: avisar al dev

Cuando Meta apruebe, avisa que ya está lista. El nombre exacto aprobado
(`otp_access_code`) + idioma (`es`) es lo que necesita el código para
enviarla.

---

## Qué hacer si Meta rechaza una plantilla

Causas típicas de rechazo de Authentication:

| Rechazo | Motivo | Solución |
|---------|--------|----------|
| "Contains promotional content" | Cuerpo menciona productos/ofertas | Quitar cualquier frase que no sea "tu código es X" |
| "Does not match category" | Template Authentication usada para otra cosa | Cambiar a categoría Utility o Marketing |
| "Contains URLs/phone numbers" | Meta prohibe links en Authentication | Quitar todos los links/teléfonos del cuerpo |
| "Does not follow format" | Estructura distinta a la permitida | Re-crear desde cero siguiendo exactamente el editor de Meta |

Si rechazan, Meta da un motivo específico en el dashboard. Copiar el
motivo y trabajar sobre eso — **no hay recurso**, solo re-submit con
cambios.

Tiempo entre re-submissions: puede haber rate limiting si haces muchas
(5+ rechazos en poco tiempo → Meta pausa el WABA para revisión manual).

---

## Plantillas futuras pendientes

Plan para cuando tengamos el primer barbero real de pago.

### `booking_confirmed` (Utility)

Propósito: confirmar una cita recién reservada al cliente, incluso si no
ha escrito nunca al WhatsApp del barbero.

Copy propuesto:
```
Hola {{1}},

Tu cita en {{2}} está confirmada:

📅 {{3}}
🕐 {{4}}
💇 {{5}}

Si necesitas cambiar algo, respóndenos a este WhatsApp.
```

Variables: `{{1}}` = nombre cliente · `{{2}}` = nombre barbería · `{{3}}`
= fecha · `{{4}}` = hora · `{{5}}` = servicio.

### `booking_reminder_24h` (Utility)

Propósito: recordatorio automático 24h antes de la cita.

Copy propuesto:
```
Recordatorio: mañana tienes cita en {{1}}.

🕐 {{2}}
💇 {{3}}

¡Te esperamos!
```

### `booking_cancelled_by_shop` (Utility)

Propósito: cuando el barbero cancela desde el dashboard, avisar al cliente
(hoy esto falla si el cliente no escribió en últimas 24h).

Copy propuesto:
```
Hola {{1}},

Sentimos informarte que hemos tenido que cancelar tu cita en {{2}}:

📅 {{3}} a las {{4}}

Puedes reservar otra hora aquí: {{5}}

Disculpa las molestias.
```

Variable `{{5}}` = link a `/b/[slug]` para volver a reservar.

### `rating_request` (Utility)

Propósito: post-servicio, pedir opinión. Hoy lo hacemos con interactive
list pero solo funciona dentro de la ventana 24h.

Copy propuesto:
```
Hola {{1}}, esperamos que te haya gustado tu visita a {{2}}.

¿Quieres dejarnos tu valoración? Ayudas muchísimo.

{{3}}
```

Variable `{{3}}` = link al follow-up en la PWA.

---

## Notas técnicas

### Permisos necesarios en el token

El token `WHATSAPP_ACCESS_TOKEN` que tenemos hoy solo permite **enviar**
mensajes (scope `whatsapp_business_messaging`). Para que yo (el dev)
pueda crear plantillas **vía API** en vez de por UI, necesita también el
scope `whatsapp_business_management`.

Cómo añadirlo (si en el futuro queremos automatizar creación):

1. Meta Business Manager → Business Settings
2. System Users → seleccionar el system user de otracita
3. **Add Assets** → seleccionar la cuenta WhatsApp → marcar
   `whatsapp_business_management`
4. Generar nuevo token con el permiso añadido
5. Actualizar env var `WHATSAPP_ACCESS_TOKEN` en Vercel

Por defecto **no hace falta** — crear templates por UI es 5 minutos una
vez, no vale la pena el setup de permisos.

### Endpoints Meta Graph API

- **Crear plantilla** (necesita `whatsapp_business_management`):
  ```
  POST https://graph.facebook.com/v21.0/{WABA_ID}/message_templates
  ```
- **Listar plantillas**:
  ```
  GET https://graph.facebook.com/v21.0/{WABA_ID}/message_templates
  ```
- **Enviar plantilla** (lo que hacemos nosotros, necesita
  `whatsapp_business_messaging`):
  ```
  POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
  ```
  con body:
  ```json
  {
    "messaging_product": "whatsapp",
    "to": "34XXXXXXXXX",
    "type": "template",
    "template": {
      "name": "otp_access_code",
      "language": { "code": "es" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "type": "text", "text": "438291" }
          ]
        },
        {
          "type": "button",
          "sub_type": "url",
          "index": "0",
          "parameters": [
            { "type": "text", "text": "438291" }
          ]
        }
      ]
    }
  }
  ```

---

## Integración en código

### Helper a implementar

Archivo: `src/lib/whatsapp/sender.ts` (ampliar, ya existe
`sendWhatsAppMessage()`)

```typescript
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
  token: string,
): Promise<{ messages?: Array<{ id: string }>; error?: unknown }>
```

### Flujo OTP actualizado

Archivo: `src/app/api/app/otp/request/route.ts`

Hoy usa `sendWhatsAppMessage(phoneNumberId, phone, text, token)` que envía
texto libre y falla fuera de ventana 24h.

Nuevo flujo:
```typescript
const result = await sendWhatsAppTemplate(
  OTRACITA_PHONE_NUMBER_ID,      // WABA central de otracita
  phone,
  'otp_access_code',
  'es',
  [code],                         // {{1}} del template (código de 6 dígitos)
  OTRACITA_ACCESS_TOKEN,
)
```

Env vars nuevas en Vercel:
- `OTRACITA_PHONE_NUMBER_ID` — el phone number ID de otracita (NO el de
  la barbería)
- `OTRACITA_ACCESS_TOKEN` — access token con permiso messaging

### Flujo bookings (cuando estén las templates de barbería)

`src/lib/whatsapp/engine.ts` (confirmación tras reserva), `src/app/api/
cron/reminders/route.ts` (recordatorio día antes), `src/app/api/bookings/
[id]/route.ts` (cancelación por barbero).

Cada uno detectará si está dentro de ventana 24h:
- **Dentro**: `sendWhatsAppMessage()` texto libre (como hoy)
- **Fuera**: `sendWhatsAppTemplate()` con el template correspondiente

Esa lógica la centralizamos en un helper `notifyCustomer(kind, ...)` que
elige la ruta correcta automáticamente (task #25).

---

## Glosario

| Término | Qué es |
|---------|--------|
| **Meta** | Empresa dueña de WhatsApp, Facebook, Instagram |
| **WABA** | WhatsApp Business Account — cuenta empresarial. otracita tiene una; cada barbería puede tener la suya |
| **Phone Number ID** | Identificador de un número WhatsApp Business (cada WABA tiene uno o más) |
| **Access Token** | Credencial que autoriza a enviar mensajes via API. Tiene scopes (messaging vs management) |
| **Template** | Plantilla de mensaje pre-aprobada por Meta |
| **Ventana de 24h** | Periodo en el que puedes enviar texto libre a un usuario que te ha escrito |
| **Authentication/Utility/Marketing** | Tres categorías de plantillas con reglas y precios distintos |
| **Variable** | Campo `{{N}}` dentro del template que se rellena al enviar |
| **OTP** | One-Time Password — código de un solo uso para login |

---

## Historial de cambios de este documento

| Fecha | Qué cambió |
|-------|------------|
| 2026-04-24 | Versión inicial. `otp_access_code` pendiente de crear. Otros 4 templates documentados pero no iniciados. |
