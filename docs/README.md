# Documentación interna otracita

Índice de documentación técnica / operativa interna del proyecto.

Esta carpeta está pensada para que Alex (hoy) o cualquier persona que
colabore mañana pueda **entender**, **operar** y **mantener** el sistema
sin tener que preguntar.

Si ves que algo no cuadra con la realidad del código, actualiza el
documento. Vive en git para que esté versionado.

---

## Cumplimiento fiscal (VeriFactu / AEAT)

- **[verifactu-estado-completo.md](./verifactu-estado-completo.md)** —
  documento vivo del estado de VeriFactu: qué hemos construido, qué falta,
  cómo funciona, milestone por milestone.

- **[verifactu-certificado-fnmt.md](./verifactu-certificado-fnmt.md)** —
  paso a paso para que Alex obtenga el certificado digital FNMT (gratis
  con Cl@ve, ~30 min). Necesario para desbloquear M4 (envío real a AEAT).

## WhatsApp

- **[meta-whatsapp-templates.md](./meta-whatsapp-templates.md)** — guía
  completa de plantillas de Meta WhatsApp: la regla de 24h, por qué las
  necesitamos, qué plantillas usa otracita, paso a paso para crearlas,
  arquitectura OTP central + booking per-barbería.

- **[meta-whatsapp-activacion-barbero.md](./meta-whatsapp-activacion-barbero.md)** —
  paso a paso para activar el bot WhatsApp de un barbero nuevo tras
  firmarse en otracita: añadir número, verificación, webhook, token,
  guardado en DB, test. Errores típicos y recovery.

## Migraciones de datos

- **migrations.md** — workflow de migraciones Drizzle (si existe en el
  repo). Consultar `drizzle/` para ver migraciones aplicadas.

---

## Cómo escribir un nuevo doc

Principios que seguimos en esta carpeta:

1. **Para no-expertos primero**. Alex no tiene background fiscal. Ningún
   doc debe asumir conocimientos externos. Siempre glosario al final.
2. **Ground truth verificado**. Cualquier dato regulatorio o técnico se
   respalda con link a la fuente oficial (BOE, sede AEAT, docs Meta).
3. **Estado actual + estado futuro**. Qué funciona HOY vs qué falta. Sin
   esta distinción clara el doc envejece.
4. **Pasos concretos accionables**. No "configurar el webhook" sino
   "entrar a https://... y pinchar 'Editar → Webhook → pegar esta URL'".
5. **Historial de cambios** al final — cada modificación relevante con
   fecha para saber cuándo se tocó.

Nombres de fichero: `{área}-{tema}.md` en minúsculas con guiones.
Ejemplos: `verifactu-certificado-fnmt.md`, `meta-whatsapp-templates.md`,
`stripe-connect-onboarding.md`.

## Qué NO escribir aquí

- Documentación de API generada automáticamente → vive junto al código.
- Comentarios de código → van en `// comment` dentro del archivo .ts.
- Info efímera de una sesión de trabajo → va en memoria Claude o git
  commit message, no aquí.
- Secretos (tokens, contraseñas, NIFs) → **NUNCA**. Van en Vercel env
  vars o gestor de contraseñas.

---

## Mantenimiento de esta carpeta

Revisar al menos una vez al mes que la info sigue siendo cierta. Si algo
cambia (regulación, flujo técnico, decisión de arquitectura), actualizar
el doc correspondiente en el mismo PR que introduce el cambio.
