# Activar Meta WhatsApp para un barbero nuevo

Paso a paso para activar el bot de WhatsApp de un barbero recién dado de
alta en otracita. Este trámite lo hacemos nosotros manualmente — el
barbero solo nos tiene que dar acceso a su número de WhatsApp Business.

Tiempo total: **30-90 minutos**, dependiendo de si Meta aprueba al vuelo o
pide documentación adicional.

---

## Índice

1. [Cuándo hacer esto](#cuándo-hacer-esto)
2. [Qué necesitamos del barbero](#qué-necesitamos-del-barbero)
3. [Paso 1 — Añadir el número a nuestro WABA o al suyo](#paso-1)
4. [Paso 2 — Verificación del número](#paso-2)
5. [Paso 3 — Configurar webhook](#paso-3)
6. [Paso 4 — Generar access_token](#paso-4)
7. [Paso 5 — Guardar credenciales en DB](#paso-5)
8. [Paso 6 — Probar con mensaje real](#paso-6)
9. [Errores típicos + soluciones](#errores-típicos)
10. [Si hay que cambiar el número después](#cambio-de-número)

---

## Cuándo hacer esto

El barbero ha pagado en Stripe y ha completado el wizard `/dashboard/setup`.
En el dashboard home aparece el banner amarillo "Tu bot de WhatsApp se
está activando" — significa que `clients.whatsappPhoneNumberId`,
`whatsappAccessToken` o `metaWebhookVerifiedAt` están vacíos.

## Qué necesitamos del barbero

Pedir por WhatsApp o correo:

1. **Número de teléfono** que usará para el bot (debe ser un número con
   capacidad de recibir SMS/llamada para verificación)
2. **¿Ya está en Meta Business?** Si no, tendrá que crearle una cuenta
   Meta Business personal primero
3. **Un email para ser añadido como admin** de nuestro Business Manager o
   para recibir la invitación de socio

⚠️ **El número no puede estar en WhatsApp normal** en el móvil. Si lo
está, el barbero tiene que hacer primero:
- Abrir WhatsApp en el móvil → Ajustes → Cuenta → Eliminar mi cuenta
- Esperar a que se elimine (5 min)
- Recién entonces podemos añadirlo a Meta Business

---

## Paso 1 — Añadir el número

Dos vías. Elige según el caso:

### Opción A — Barbero ya tiene su propio Meta Business Account

**Caso**: barbero tecnológicamente hábil o que ya usó WhatsApp Business
API por otro canal. Ideal para preservar su identidad de marca.

1. Pedirle que nos añada como **Partner** en su Business Manager:
   - Meta Business Manager → **Configuración del negocio** → **Socios**
   - Añadir otracita Business Manager como socio
   - Darnos permiso sobre **Cuentas de WhatsApp**
2. Nosotros desde el BM de otracita: Business Settings → WhatsApp
   Accounts → veremos su WABA disponible → seleccionar el número

### Opción B — Añadir su número a NUESTRO Business Manager (más común)

**Caso**: primer barbero, barbero no técnico, migración rápida.

1. otracita Business Manager → **WhatsApp Manager** → **Añadir número
   de teléfono**
2. Nombre mostrado en WhatsApp: el nombre comercial del barbero
   (`Private Studio`, `Barbería Central`, etc.). Este nombre aparecerá
   a los clientes. Meta lo revisa; nombres genéricos tipo "barbería" a
   veces se rechazan
3. Categoría: `Personal Services` → `Hair Salon`
4. Descripción: breve, 1-2 frases sobre el negocio
5. Siguiente

---

## Paso 2 — Verificación del número

Meta envía un código por SMS o llamada al número. El barbero tiene que:

1. Estar con su móvil/fijo a mano
2. Pasarnos el código de 6 dígitos que reciba
3. Introducir el código en Meta Business

Si el número **ya estaba en WhatsApp normal**, Meta lo bloqueará. Error
típico: *"This number is already registered"*. Solución: el barbero
borra la cuenta desde su WhatsApp app (ver instrucciones al principio) y
esperamos 5 min para reintentar.

Tras verificación exitosa, Meta nos da:
- **Phone Number ID** (tipo `1076099558919066`) — lo que iremos a
  guardar en `clients.whatsappPhoneNumberId`

## Paso 3 — Configurar webhook

El webhook es la URL donde Meta nos envía los mensajes que recibe el bot.

1. Business Manager → WhatsApp Accounts → seleccionar el WABA del
   barbero → **Webhooks**
2. Callback URL: `https://otracita.es/api/webhook/whatsapp`
3. Verify Token: el valor de `WHATSAPP_VERIFY_TOKEN` en Vercel env
4. Suscribirse a los campos:
   - `messages` (obligatorio — mensajes entrantes)
   - `message_template_status_update` (opcional — estado de nuestras
     plantillas)
5. Click Verify → Meta nos manda un GET a nuestro endpoint, nosotros
   devolvemos el challenge, si todo OK se activa

Si falla: revisar que el endpoint devuelve 200 y que `WHATSAPP_VERIFY_TOKEN`
en Vercel coincide con el que introdujimos en Meta.

---

## Paso 4 — Generar access_token

El token autoriza a nuestro backend a enviar mensajes a través del WABA.

1. Meta Business Manager → **System Users** → seleccionar el system user
   de otracita (o crear uno si no existe)
2. **Add Assets** → seleccionar el WABA del barbero (o el nuestro que
   contiene su número) → marcar:
   - `whatsapp_business_messaging` (obligatorio para enviar)
   - `whatsapp_business_management` (necesario si el barbero aprobará
     sus propias plantillas; opcional si usamos OTP centralizado)
3. **Generate Token** → tipo **Never expire** o con duración larga (60
   días renovables)
4. Copiar el token (solo se muestra una vez — apúntalo en 1Password)

---

## Paso 5 — Guardar credenciales en DB

Hoy esto es una query manual hasta que tengamos admin UI.

```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"')

psql "$DATABASE_URL" <<EOF
UPDATE clients
SET
  whatsapp_phone_number_id = '1076099558919066',
  whatsapp_access_token = 'EAA...',
  meta_webhook_verified_at = NOW(),
  meta_token_expires_at = NOW() + INTERVAL '60 days',
  updated_at = NOW()
WHERE email = 'carlos@gmail.com';
EOF
```

Campos:
- `whatsapp_phone_number_id`: el Phone Number ID de Paso 2
- `whatsapp_access_token`: el token generado en Paso 4
- `meta_webhook_verified_at`: momento de verificación (para logs +
  ocultar el banner de "activándose")
- `meta_token_expires_at`: fecha de expiración del token (para alertar
  cuando haya que renovar — nos avisamos 30 días antes)

Después del UPDATE, al refrescar `/dashboard` del barbero, el banner
amarillo desaparece. El bot ya puede recibir y responder mensajes.

---

## Paso 6 — Probar con mensaje real

**Antes de decirle al barbero que está activo**, siempre hacer una
prueba desde nuestro propio número:

1. Mandar `hola` por WhatsApp al número del barbero
2. El bot debería responder con el mensaje de bienvenida configurado
   en `/dashboard/bot`
3. Probar el flow básico: *"quiero reservar"* → el bot ofrece servicios
4. Cancelar la prueba (menú → Cancelar reserva)

Si no responde:
- Revisar Vercel logs para errores en `/api/webhook/whatsapp`
- Revisar Meta Business Manager → Webhooks → "Last Error"
- Verificar que el token es válido con curl:
  ```bash
  curl -X POST "https://graph.facebook.com/v21.0/$PHONE_ID/messages" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"messaging_product":"whatsapp","to":"34YYYY","type":"text","text":{"body":"test"}}'
  ```

Cuando la prueba pase, avisar al barbero por WhatsApp: *"Tu bot está
activo — los próximos clientes que te escriban van a ser atendidos
automáticamente"*.

---

## Errores típicos

### "This number is already registered"

El número está activo en WhatsApp normal (app móvil). Barbero borra
cuenta desde la app, esperamos 5-10 min, reintentar.

### Webhook verification failed

Mismatch entre `WHATSAPP_VERIFY_TOKEN` en Meta UI y en Vercel env.
Revisar ambos, usar `printf` (no `echo`) al setear en Vercel para
evitar `\n` al final.

### Mensajes salen pero no llegan

Si el test manual funciona pero cliente real no recibe respuesta: es
probablemente la **regla de 24h de Meta** (cliente nuevo que no ha
escrito nunca al barbero). Ver `docs/meta-whatsapp-templates.md`.

### Token expira

Los tokens "Never expire" de system user no son realmente eternos en
algunas configuraciones de Meta. Si nos aparece error 190/10 al enviar,
regenerar token desde Paso 4 y actualizar DB.

---

## Cambio de número

Si un barbero cambia de número (poco común), hay que:

1. Eliminar el número antiguo del Business Manager
2. Repetir Pasos 1-5 con el nuevo
3. Actualizar `clients` en DB con los nuevos valores
4. Avisar al barbero que informe a sus clientes del cambio (sus
   contactos WhatsApp siguen apuntando al número viejo)

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-04-24 | Versión inicial. |
