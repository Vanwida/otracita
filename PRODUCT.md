# Product

## Register

product

## Users

Barberos profesionales **operando en España**: independientes y pequeñas cadenas (1–5 sillones). Edad típica 25–50, móvil-first, poca paciencia con software. Atienden 8–14 clientes al día y, entre cliente y cliente, tienen 30–60 segundos para gestionar el negocio: confirmar la siguiente cita, cobrar al que se va, mover un hueco, contestar un WhatsApp.

**Audiencia inclusiva por geografía, no por nacionalidad.** otracita es para cualquier persona que regenta una barbería en España: española, venezolana, peruana, dominicana, cubana, catalana, argentina, marroquí, colombiana. La diferenciación es la **geografía operativa** (VeriFactu, AEAT, Stripe Spain, BOE), no la identidad nacional. El idioma del producto es **castellano** porque lo habla todo el mercado, no como bandera identitaria.

Su trabajo a hacer es **vivir bien de su barbería** sin pelear con herramientas. Los puntos de dolor concretos:

- **Booksy / Treatwell / Fresha** les cobran cuota mensual y, encima, ponen anuncios de la barbería de al lado en el perfil del cliente que ya era suyo.
- **Holded / Quipu** son herramientas de contable, caras y genéricas, no para alguien que cierra caja a las 21:00 con dos walk-ins esperando.
- **VeriFactu** (AEAT, obligatorio desde julio 2027) y casi nadie sabe ni por dónde empezar.
- El cobro presencial requiere TPV físico, comisiones altas, y otro device más en la mesa.

## Product Purpose

otracita es la plataforma SaaS multi-tenant que **sustituye a 5 herramientas** (página de reservas, agenda multi-barbero, bot de WhatsApp, TPV con factura legal, fidelidad) con una sola que entiende el oficio del barbero.

Cubre:

**Atención al cliente**
- **Bot WhatsApp** que reserva, recuerda, recoge propina y pide reseña en Google.
- **Recepcionista de IA por teléfono** que coge llamadas 24/7, agenda citas, gestiona cambios y deriva urgencias en castellano natural (Estudio).

**Operación diaria**
- **Agenda** con multi-barbero ilimitado, bloqueo de huecos, walk-ins, días cerrados.
- **Caja con cuadre** del día (efectivo + datáfono).

**Cobros**
- **SumUp Tap to Pay** en iPhone (app móvil "otracita Cobros"), sin TPV físico.
- **Cobro online por QR** vía Stripe Connect: el cliente paga con tarjeta o Apple Pay desde su móvil.

**Marca del barbero**
- **PWA pública por barbería** en `/b/[slug]`: white-label total, el cliente final NO ve "otracita".
- **Subdominio propio** (`reservas.tubarberia.com`) en Estudio.

**Legal y fiscal**
- **VeriFactu AEAT** integrado de fábrica (QR, hash encadenado, declaración responsable). Obligatorio desde julio 2027.
- **Productos vendidos durante la cita** incluidos en la factura.

**Crecimiento**
- **Fidelidad** por sellos o puntos.
- **Promos contextuales** que avisan a clientes habituales cuando hay huecos.

**Modelo de monetización:** 3 tiers subscription.

- **Solo** — gratis para barbero individual. Agenda + caja + PWA + VeriFactu + cobro online.
- **Pro** — 49 €/mes (39 €/mes anual). Para barbería 2-5 sillones. Todo lo de Solo + bot WhatsApp + multi-barbero + SumUp + fidelidad + promos.
- **Estudio** — 99 €/mes (89 €/mes anual). Para barbería con marca propia. Todo lo de Pro + recepcionista de IA por teléfono + subdominio propio + onboarding 1:1.

Sin % por transacción. SumUp y Stripe procesan los pagos al barbero directamente, otracita no se mete en medio. Sin permanencia en Solo y Pro.

**Éxito = el barbero ahorra 3–5 h semanales de admin, no pierde un cliente por culpa de un marketplace, y al final de mes tiene los libros de IVA listos sin pisar Holded.**

## Brand Personality

**Tres palabras: rebelde · directo · principled.**

### Reacción target

Cuando un barbero abre otracita.es por primera vez, queremos que piense **"esto es de otra liga, Booksy es Nokia"**. No "qué bonito". No "qué premium". Es: *"joder, por fin"*. Salto tecnológico claro, futuro inevitable, atracción magnética.

### Personaje

**El barbero rebelde.** Cabreado con razón pero principled, no chistoso. Habla a otro barbero como un colega después de cerrar caja, no como vendedor de SaaS. **Patagonia-coded, no Liquid Death-coded**: rebeldía con causa, sin tacos, sin profanity. La autoridad viene de saber del oficio, no de gritar.

### Frase tatuable

> **"Hecha por barberos, para barberos."**

Es la verdad emocional, no un slogan publicitario. Cualquier decisión (copy, feature, diseño) se filtra por: *¿la firmaría un barbero hablando con otro?* Si no, se reescribe.

### Voz

- **Castellano informal.** Tutea siempre. Frases cortas: "vale", "venga", "dale", "te toca", "cierra caja".
- **Sin tacos en copy oficial.** Nada de "joder", "cojones", "gilipolleces". Crudo y directo, no soez. Patagonia, no Liquid Death.
- **Cero corporate-speak.** Nada de "leveraging your synergy", "Get started", "Loading…", "Book now".
- **Cuando duela y aporte, nombramos a Booksy / Holded / Verifone por su nombre.** La rebeldía bien dirigida es legítima (Cal.com nombra Calendly, Stripe nombró PayPal). Regla: **headlines reclaman categoría**, **comparativas y FAQ pueden nombrar**.
- **Identidad positiva, nunca antiwhining.** "Somos esto", no "no somos ellos". Aunque el rival aparezca por nombre, el statement principal es claim, no queja.

### Pro-references

- **Liquid Death** — irreverencia controlada con autoridad. Cómo decir lo justo con peso. *"Murder your thirst."*
- **Patagonia** — rebel principled. *"Don't buy this jacket."* Cuando la marca tiene una causa real, el copy se alinea sin teatro.
- **Carhartt WIP** — workwear, etiquetas de utilidad, tipografía industrial honesta. Paleta marrón/terracota/cream. Real, no premium.

### Anti-pro-references (cosas que dejamos atrás)

- **Aimé Leon Dore / Loro Piana / luxury "premium contención"** — esa voz era demasiado fina para nuestro target real. Suena a "yo soy más fino que tú", no a "yo soy uno de los tuyos". Reservar la contención visual para la PWA pública white-label, no para superficies otracita-branded.

## Anti-references

Lo que **NO** queremos parecer. Si un diseño se acerca a alguno de estos, está mal:

- **Booksy / Treatwell / Fresha** — marketplace plástico, pop-ups por todos lados, paletas saturadas, callouts agresivos, ratings prominentes. Tratan al barbero como producto, no como cliente.
- **Square Appointments** — SaaS US polished pero genérico (Inter, gris-azul, dashboards Stripe-light). Funcional pero olvidable.
- **Holded / Quipu** — UI de contable, formularios densos, terminología fiscal cruda sin acento humano.
- **Generic AI app template** — purple/fuchsia gradients, glassmorphism, sparkles ✨, sidebar+grid Vercel-template, "Generate" buttons con shimmer.
- **Cualquier cosa que parezca traducida del inglés** — "Get started", "Book now", "Loading…", emojis 🚀✨🔥. Si suena a Notion-template-en-español, está mal.
- **Premium contención mal aplicada** — voz Aimé Leon Dore / Loro Piana en producto para barberos suena clasista. La luxury restraint es de otro target.
- **Antiwhining** — construir identidad sobre "no somos Booksy". Lloriquear la queja del usuario nos convierte en su psicólogo, no en su salida.
- **Españolidad como claim de identidad** — "barbero español" excluye al venezolano, peruano, catalán que regenta una barbería en Madrid. La españolidad de otracita es **operativa** (VeriFactu, AEAT, Stripe Spain), no identitaria.

## Design Principles

1. **Hecha por barberos, para barberos.** Cualquier decisión se filtra por esta pregunta. Si no la firmaría un barbero hablando con otro, se reescribe. Es la frase tatuable y el principio de diseño a la vez.

2. **Rebelde principled, no rebelde irreverente.** Patagonia-coded. La autoridad viene del oficio, no del shock. Sin profanity, sí carácter. Crudo, no soez.

3. **Nokia framing.** Booksy, Holded y compañía son Nokia. otracita es smartphone. El tono asume el futuro como inevitable, no lo argumenta. Confianza por contención de afirmación, no por gritar.

4. **Identidad positiva. Nombramos al rival cuando duela y aporte.** Headlines reclaman categoría ("Hecha por barberos"). FAQ y comparativas pueden nombrar (Cal.com nombra Calendly). Nunca whining.

5. **Castellano vivo, no manual.** "Te toca", "cierra caja", "venga", "dale". Si suena a Notion-en-español, reescribir. Inclusivo de cualquier nacionalidad regentando una barbería en España.

6. **White-label es sagrado.** En `/b/[slug]` el cliente final NUNCA ve "otracita". Es la barbería del barbero, no la nuestra. Ahí sí aplica contención visual y voz neutra: la voz rebelde es solo para superficies otracita-branded (landing, dashboard, app móvil "Cobros").

7. **Workwear sobre luxury.** Tipografía industrial-honesta antes que serif-editorial cuando sea posible. Paleta puede mantener cream/terracota/espresso (también es Carhartt-coded) pero el peso visual va hacia sans bold + etiquetas de utilidad, no hacia italic-fineza. Boska en landing es brand-flag actual y puede evolucionar si el lane workwear gana fuerza.

## Accessibility & Inclusion

**Compromiso: WCAG AAA donde sea posible.** No es marketing, es respeto: al barbero (que usa el iPhone con dedos sucios y rápidos) y a su cliente final (que puede ser mayor o tener vista regular).

Reglas duras:

- **Contraste 7:1** en texto cuerpo (AAA). 4.5:1 mínimo absoluto en UI grande.
- **Tap targets ≥ 48px** (no 44, esos 4px extra importan a las 19:30 con prisa).
- **Foco visible siempre.** Outline 2px, jamás `outline: none`.
- **Reduced motion respetado.** Toda animación detrás de `@media (prefers-reduced-motion)`.
- **Color no es la única señal.** Estado por color + ícono + texto. Daltónicos, mala luz, capturas en blanco y negro: todo legible.
- **Alt text obligatorio** en imágenes con contenido (no decorativas).
- **Idioma**: castellano (`es-ES`) por defecto. Acentos y eñes correctos. *"Próxima"*, no *"Proxima"*.
- **Light mode por defecto, siempre.** Dark mode opcional, jamás impuesto. (Default-dark es señal AI-template y daña a usuarios mayores con vista cansada.)
- **Audiencia inclusiva por geografía.** El producto es para cualquier nacionalidad regentando una barbería en España. El copy nunca asume españolidad como identidad. *"Barbero"*, no *"barbero español"*.
- **Plataforma mínima**: iPhone XS / iOS 16.4+ (app nativa Tap to Pay), navegadores modernos last-2 (web).
