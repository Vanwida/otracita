# Pendientes admin de Alex

Lista de cosas que **solo Alex puede hacer** (no se pueden automatizar
por código). Pensada para atacarlas del tirón en una sesión de ~2h
cuando tengas ganas de papeleo.

Ordenadas por **impacto / desbloqueo**. Marca con ✅ las que vayas
cerrando.

---

## 🔴 Bloqueantes duros (el producto no puede ir a producción sin esto)

### 1. Certificado digital FNMT

- **Qué desbloquea:** VeriFactu M4 — envío real de facturas a AEAT.
  Hoy toda la infraestructura está lista en el código pero nada se
  envía a Hacienda porque no hay cert para firmar las peticiones.
- **Cómo:**
  1. Entrar a <https://www.sede.fnmt.gob.es/certificados/persona-fisica/obtener-certificado-software>
  2. Elegir "Obtención con Cl@ve" (tienes Cl@ve PIN activa)
  3. Seguir pasos → descargar archivo `.pfx`
  4. Elegir una contraseña robusta y apuntarla en 1Password
- **Tiempo:** ~30 min
- **Coste:** 0 €
- **Qué me pasas:**
  - El archivo `.pfx` (sube a 1Password + compárteme link, o pásamelo
    por canal seguro)
  - La contraseña
- **Luego yo hago:** subir ambos a Vercel como `VERIFACTU_CERT_B64` +
  `VERIFACTU_CERT_PASS`, y abordar M4 (firma XAdES + envío SOAP).
- **Guía completa:** [`verifactu-certificado-fnmt.md`](./verifactu-certificado-fnmt.md)

---

### 2. Rellenar datos personales en la Declaración Responsable

- **Qué desbloquea:** que la DR pública en <https://otracita.es/legal/verifactu>
  sea legalmente firmable. Hoy aparece con 4 `[PENDIENTE: …]` en texto visible.
- **Cómo:** editar `src/app/legal/verifactu/page.tsx`, constante
  `PRODUCTOR`:
  ```ts
  const PRODUCTOR = {
    nombreCompleto: 'Alejandro Sole …',       // nombre legal tal cual DNI
    nif: '00000000X',                          // tu NIF personal
    direccion: [
      'Calle X, nº …, piso …',
      '08XXX — Barcelona (Barcelona)',
      'España',
    ],
    telefono: '+34 644 288 663',               // o el que uses como soporte
    …
  }
  ```
  Luego bump:
  ```ts
  const SIF = { …, version: '1.0.1', fechaVersion: 'DD de mes de 2026' }
  const SUSCRIPCION = { fecha: 'DD de mes de 2026', lugar: 'Barcelona — España' }
  const HISTORY = [
    { version: '1.0.1', fecha: 'DD de mes de 2026',
      cambios: 'Datos de la persona productora completados.' },
    { version: '1.0.0', fecha: '24 de abril de 2026',
      cambios: 'Versión inicial de la Declaración Responsable.' },
  ]
  ```
- **Tiempo:** 5 min
- **Nota:** estos 4 datos son **públicos por diseño** de la DR — tu NIF
  y dirección aparecen visibles en la web. Es lo que exige el RD 1007/2023
  al fabricante. No hay forma de ocultarlos.

---

### 3. Plantilla Meta WhatsApp `otp_access_code`

- **Qué desbloquea:** que los clientes de las barberías puedan loguearse
  en la PWA (`/app`) la **primera vez**. Hoy el OTP sale del WABA central
  de otracita, pero Meta bloquea el envío si no hay plantilla
  Authentication aprobada (regla de 24h).
- **Cómo:**
  1. Meta Business Manager → WhatsApp Manager → Plantillas → **Crear**
  2. Nombre: `otp_access_code` | Categoría: **Authentication** | Idioma: **Español (ES)**
  3. Tipo: "Código de un solo uso" (OTP) | Parámetro: `{{1}}`
  4. Texto: autogenerado por Meta, algo tipo *"Tu código de acceso otracita es {{1}}. Válido por 10 min."*
  5. Enviar a revisión → Meta aprueba en 15 min – 24 h.
- **Tiempo:** 15 min + espera aprobación
- **Una vez aprobada:** avísame, yo engancho el envío en código.
- **Guía completa:** [`meta-whatsapp-templates.md`](./meta-whatsapp-templates.md)
  sección *"Paso a paso: crear la plantilla OTP"*.

---

## 🟡 Cuentas dedicadas otracita (eliminan deuda del "lo hice con mi personal")

### 4. Cuenta Google dedicada

- ✅ **Cuenta creada 2026-04-24**: `otracita.es@gmail.com`. Verificada con la
  SIM Simyo del número bot otracita.
- **Pendiente sobre esta cuenta:**
  1. Activar **2FA** + guardar backup codes en 1Password
  2. Entrar a Google Cloud Console con esta cuenta, crear proyecto `otracita`
     con OAuth 2.0 (consent screen + credentials para SSO web)
  3. Habilitar APIs: **Gmail API**, **Pub/Sub**, **Identity Platform**
  4. Pasarme `client ID` + `client secret` de OAuth → los meto en Vercel
     como `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
- **Tiempo restante:** ~30 min

### 5. Verificar que `hola@otracita.es` funciona

- **Qué desbloquea:** que AEAT / barberos / inspectores puedan contactarte
  como fabricante del SIF. Es el email que aparece en la DR apartado 2.a.
- **Cómo:**
  1. Mandarte un email de prueba desde otra cuenta.
  2. Verificar que llega y que puedes responder desde esa dirección.
  3. Si va al inbox personal: está OK por ahora, solo confirmar.
- **Tiempo:** 5 min.

---

## 🔵 No bloqueante para MVP, sí para escalar

### 6. Alta de autónomo (cuando toque)

- **Qué desbloquea:** poder facturar legalmente a barberías de pago.
- **Cuándo:** antes de cobrar al primer barbero real. Si el primero es
  un beta gratuito, puedes esperar.
- **Cómo:** Modelo 036/037 + alta RETA simultánea (se puede hacer el
  mismo día online en sede AEAT + Seg. Social). Los primeros 2 años la
  cuota reducida es 80 €/mes.
- **Tiempo:** 1 h trámite + 1-2 días espera confirmación.
- **Qué compartes conmigo luego:** la fecha exacta del alta, por si
  afecta a la DR (no afecta — Alex como persona física ya puede firmar
  la DR aunque no esté dado de alta como autónomo).

### 7. Número Twilio para el voice receptionist

- **Qué desbloquea:** activar el bot de voz que llama cuando el barbero
  no coge el teléfono (feature ya desarrollada en `/dashboard/voice-test`,
  solo falta bridge Twilio + número).
- **Cuándo:** cuando haya un barbero que lo pida. No urgente.
- **Paso a paso detallado:** memoria `project_voice_twilio.md`.

---

## Cómo usamos este doc

- Abrir cuando tengas un rato para admin.
- Marcar con ✅ lo que cierres y pasarme lo que me toque procesar (cert,
  datos DR, OAuth credentials, plantilla Meta aprobada).
- Si aparece un nuevo bloqueante tuyo, lo añado aquí antes de pedirtelo.

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-04-24 | Versión inicial — 7 items. |
