# Certificado digital FNMT para VeriFactu

Instrucciones para obtener el certificado digital que necesita otracita
para firmar y enviar los registros de facturación al servicio web de
AEAT (milestone M4 del roadmap VeriFactu).

## Contexto

Para enviar facturas a AEAT en modo VeriFactu, el servicio web SOAP
(`prewww1.aeat.es` en pre-prod, `www1.agenciatributaria.gob.es` en
producción) requiere dos cosas que solo puede aportar un certificado
digital reconocido:

1. **mTLS (autenticación mutua TLS)** — la conexión HTTPS usa el
   certificado como credencial de cliente. Sin él, AEAT rechaza la
   conexión antes incluso de mirar el XML.
2. **Firma XAdES-BES** del propio XML `RegFactuSistemaFacturacion`.
   AEAT valida la firma antes de procesar el mensaje.

**Ambos usos los cubre un único certificado** de persona física emitido
por la FNMT-RCM.

## Titular del certificado

El certificado irá a nombre de **Alejandro Sole** (persona física, NIF
personal). No requiere estar dado de alta como autónomo para obtenerlo
ni usarlo ante AEAT.

Cuando Alex se dé de alta como autónomo más adelante, el mismo
certificado sigue siendo válido — el NIF no cambia. Si en el futuro
se constituye una SL (Vanwida SL con CIF propio), se puede pedir un
certificado adicional de "representante persona jurídica", pero por
ahora no es necesario.

## Coste

**0€**. El certificado FNMT de persona física es gratuito con Cl@ve.

Validez: **4 años**. Renovable online antes del vencimiento.

## Requisitos previos

- [ ] DNI vigente
- [ ] Cl@ve PIN activa (Alex la tiene)
- [ ] Ordenador propio (el certificado queda asociado al navegador/
      equipo donde se descarga; no usar uno ajeno)

## Paso a paso

1. **Abrir la sede FNMT**

   https://www.sede.fnmt.gob.es/certificados/persona-fisica/obtener-certificado-software

2. **Elegir "Obtención del Certificado con Cl@ve"**

   Esta es la vía moderna sin desplazamiento presencial. La alternativa
   tradicional requiere ir a una oficina de la AEAT o Seguridad Social
   con un código que te envían al solicitar — evitar salvo que Cl@ve
   falle.

3. **Solicitar certificado**

   Rellenar DNI + email personal.

4. **Autenticarse con Cl@ve**

   La sede redirige a Cl@ve → entrar con Cl@ve PIN. Aceptar el
   consentimiento para que FNMT compruebe la identidad.

5. **Aceptar condiciones**

   Pantalla con los términos de uso del certificado. Leer, aceptar.

6. **Descargar e instalar el certificado**

   Pantalla final con dos opciones:
   - Descargar archivo `.pfx` / `.p12` (portable) — **elegir esta**.
   - Instalar directamente en el navegador — solo útil si lo vas a
     usar desde ese navegador exclusivamente.

7. **Poner contraseña al exportar**

   FNMT pide una contraseña para cifrar el archivo `.pfx`. Apuntarla
   en un gestor de contraseñas (1Password, Bitwarden). Sin esa
   contraseña, el archivo no se puede usar después.

   ⚠️ Si se pierde la contraseña, hay que revocar el certificado y
   empezar el proceso de cero.

8. **Verificar que funciona**

   Como prueba, entrar con ese certificado a la propia sede AEAT
   (https://sede.agenciatributaria.gob.es → "Identificarse con
   certificado"). Debería reconocerlo y mostrar los datos personales.

## Entrega a otracita para M4

Cuando esté listo:

1. **Archivo**: `.pfx` descargado (normalmente se llama algo como
   `FNMT_Alejandro_Sole.pfx`).
2. **Contraseña** del archivo.

Ambos se suben a **Vercel como variables de entorno secretas** (nunca
al repositorio git, nunca en Slack/email).

Variables a configurar:

```
VERIFACTU_CERT_B64   = <contenido del .pfx en base64>
VERIFACTU_CERT_PASS  = <contraseña del .pfx>
VERIFACTU_ENV        = pruebas   # cambiar a "production" solo tras validar
VERIFACTU_SIF_NIF    = <NIF de Alex>
VERIFACTU_SIF_NAME   = otracita
```

Proceso de subida a Vercel:

```bash
# Convertir el .pfx a base64 (Mac/Linux):
base64 -i FNMT_Alejandro_Sole.pfx | pbcopy   # copia al portapapeles

# Subir a Vercel:
vercel env add VERIFACTU_CERT_B64 production
# pegar el base64 cuando lo pida

vercel env add VERIFACTU_CERT_PASS production
# escribir la contraseña
```

## Seguridad post-instalación

- [ ] Mantener **una copia del `.pfx` en el gestor de contraseñas**
      (1Password archivo seguro, Bitwarden attachment, etc).
- [ ] Borrar la copia del Downloads después de subirlo a Vercel.
- [ ] No compartir el `.pfx` ni la contraseña por email ni Slack.
- [ ] Si alguna vez sospechamos compromiso, **revocar inmediatamente**
      en https://www.sede.fnmt.gob.es/certificados/persona-fisica/
      anular-revocar y pedir uno nuevo.

## Alternativas (si FNMT falla)

Solo necesarias si hay problemas con Cl@ve u otros blockers. En orden
de preferencia:

| Emisor | Tipo | Coste aprox | Notas |
|--------|------|-------------|-------|
| FNMT (persona física, Cl@ve) | Software | **0€** | Recomendado |
| FNMT (persona física, oficina) | Software | **0€** | Requiere ir presencial |
| Camerfirma | Persona física/jurídica | 60-90€/año | Soporte más rápido |
| ANCERT (notariado) | Persona física/jurídica | 50-80€/año | Vía notario |

Todos son reconocidos por AEAT para VeriFactu.

## Preguntas frecuentes

**¿Puedo usar un certificado emitido por DNI electrónico?**
Sí pero no es recomendable — el DNIe se bloquea al renovar el DNI cada
5-10 años, y entonces hay que regenerar toda la configuración.

**¿Puedo usar el certificado de mi gestor/asesor?**
No. El certificado del fabricante del SIF debe identificar a Alex como
responsable técnico del software. Un certificado ajeno no serviría
para la Declaración Responsable ante AEAT.

**¿Hay que renovarlo todos los años?**
No, cada 4 años. FNMT avisa por email ~30 días antes del vencimiento
con instrucciones para renovar online sin volver a pasar por Cl@ve.

**¿Puedo usar el mismo certificado para entorno pre-prod y producción
de AEAT?**
Sí. El certificado no distingue entornos — discriminamos con la
variable `VERIFACTU_ENV`.

## Referencias

- FNMT Certificado Persona Física: https://www.sede.fnmt.gob.es/certificados/persona-fisica
- AEAT sede certificados: https://sede.agenciatributaria.gob.es/
- Declaración Responsable VeriFactu (obligación del fabricante):
  https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html
