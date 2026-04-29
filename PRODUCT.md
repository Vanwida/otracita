# Product

## Register

product

## Users

Barberos profesionales en España: independientes y pequeñas cadenas (1–5 barberos). Edad típica 25–50, castellano nativo, móvil-first, poca paciencia con software. Atienden 8–14 clientes al día y, entre cliente y cliente, tienen 30–60 segundos para gestionar el negocio: confirmar la siguiente cita, cobrar al que se va, mover un hueco, contestar un WhatsApp.

Su trabajo a hacer es **vivir bien de su barbería** sin pelear con herramientas. Los puntos de dolor concretos:

- Marketplaces (Booksy, Treatwell, Fresha) les **roban el cliente** y les meten publicidad agresiva.
- Herramientas legales españolas (Holded, Quipu) son **caras, genéricas y orientadas a contables**, no a un barbero que cierra caja a las 21:00.
- VeriFactu (AEAT 2026) es **obligatorio** y la mayoría no sabe ni por dónde empezar.
- El cobro presencial requiere TPV físico, comisiones altas, y otro device más en la mesa.

## Product Purpose

otracita es la plataforma SaaS multi-tenant que **sustituye a 5 herramientas** (agenda, bot de reservas, TPV, facturación legal, fidelidad) con una sola que entiende el oficio del barbero español.

Cubre:

- **Agenda** con bloqueo de huecos, walk-ins, días cerrados, equipo.
- **Bot WhatsApp** que reserva, recuerda, recoge propina y reseña.
- **PWA pública por barbería** en `/b/[slug]` — white-label total, el cliente final NO ve "otracita".
- **Cobros presenciales** sin TPV físico vía SumUp Tap to Pay en iPhone (app móvil "otracita Cobros").
- **VeriFactu AEAT** integrado de fábrica (QR, hash encadenado, declaración responsable).
- **Fidelidad y promos contextuales** sin parecer marketing barato.

**Modelo de monetización:** payment processing fees, no subscription. Cuando el barbero gana más, otracita gana más. Esto es deliberado — alinea incentivos.

**Éxito = el barbero ahorra 3–5h semanales de admin, no pierde un cliente por culpa de un marketplace, y al final de mes tiene los libros de IVA listos sin pisar Holded.**

## Brand Personality

**Tres palabras: audaz · directo · español.**

- **Voz**: castellano informal y honesto. Tuteamos. Frases cortas. "Vale", "venga", "dale", "te toca". Cero corporate-speak. Cero "leveraging your synergy". Cero traducción literal del inglés SaaS.
- **Tono**: confianza tranquila. *Esto funciona, no te marees con configs.* No vendemos features, mostramos resultados. Cuando hay un problema, lo decimos sin maquillarlo.
- **Emoción objetivo**: el barbero abre otracita y siente que es **su herramienta, hecha en España, hecha para él**. No un SaaS gringo traducido. No otra app de Silicon Valley con un tour-guide de onboarding.

**Pro-references (cuando dudes, mira aquí):**

- **Aimé Leon Dore + Loro Piana** — paleta cream / sand / terracota (la nuestra), serif editorial para acentos, premium por contención, silencio. Lujo sin gritar.
- **Mahou / La Casera / Estrella Galicia** — españolidad explícita, tipografía robusta, copy informal en castellano, ilustración honesta, "de toda la vida modernizado".

La fusión: **artesanía castellana con paleta de lujo restringido.** Ni cervecería de polígono ni boutique parisiense. otracita es la barbería de barrio que cuida cada detalle pero no pierde el acento.

## Anti-references

Lo que **NO** queremos parecer. Si un diseño se acerca a alguno de estos, está mal:

- **Booksy** — marketplace plástico, pop-ups por todos lados, paleta verde-naranja saturada, callouts agresivos. Trata al barbero como producto, no como cliente.
- **Treatwell / Fresha** — UI estilo Booking.com con ratings prominentes y filtros. Roban al cliente del barbero.
- **Square Appointments** — SaaS US polished pero genérico (Inter, gris-azul, dashboards Stripe-light). Funcional pero olvidable.
- **Generic AI app template** — purple/fuchsia gradients, glassmorphism, sparkles ✨, sidebar+grid tipo Vercel template, "Generate" buttons con shimmer. Lo que sale por defecto cuando dejas a un LLM diseñar.
- **Cualquier cosa que parezca traducida del inglés** — "Get started", "Book now", "Loading…", emojis 🚀✨🔥 inflando vacío. Si suena a Notion-template-en-español, está mal.

## Design Principles

1. **Silencio mejor que ruido.** El barbero está atendiendo a una persona. Su pantalla no debe competir con el cliente. Una decisión explícita por vista, espacios generosos, microcopia mínima.

2. **Castellano nativo de verdad.** El copy lo escribe alguien que habla español, no alguien que traduce inglés. *"Te toca"* > *"It's your turn"*. *"Cierra caja"* > *"Close session"*. Si una frase suena a *Notion en español*, se reescribe.

3. **White-label es sagrado.** En `/b/[slug]` el cliente final **nunca** ve la palabra "otracita". El producto del barbero es su barbería. Lo nuestro es invisible al cliente y visible al merchant.

4. **Tipografía hace la diferencia.** Fraunces (serif) para hero/marca/momentos editoriales. Sans del sistema para tool/tabla/dashboard. **Nunca Inter** — es la fuente que le pone Vercel a sus templates.

5. **Premium por contención, no por gritar.** Paleta restringida (cream `#FAF7F2`, terracota `#C9653C`, espresso `#2A1D14`), espacio generoso, una sola acción primaria por pantalla. El lujo es quitar, no añadir.

## Accessibility & Inclusion

**Compromiso: WCAG AAA donde sea posible.** No es marketing — es respeto al barbero (que usa el iPhone con dedos sucios y rápidos) y a su cliente (que puede ser mayor o tener vista regular).

Reglas duras:

- **Contraste 7:1** en texto cuerpo (AAA). 4.5:1 mínimo absoluto en UI grande.
- **Tap targets ≥ 48px** (no 44, esos 4px extra importan a las 19:30 con prisa).
- **Foco visible siempre.** Outline 2px, no `outline: none` jamás.
- **Reduced motion respetado.** Toda animación detrás de `@media (prefers-reduced-motion)`.
- **Color no es la única señal.** Estado por color + ícono + texto. Daltónicos, mala luz, capturas en blanco y negro — todo legible.
- **Alt text obligatorio** en imágenes con contenido (no decorativas).
- **Idioma**: español castellano (`es-ES`) por defecto. Acentos y eñes correctos. *"Próxima"* no *"Proxima"*.
- **Light mode por defecto, siempre.** Modo oscuro opcional, jamás impuesto. (El default-dark es señal AI-template y daña a usuarios mayores con vista cansada.)
- **Plataforma mínima**: iPhone XS / iOS 16.4+ (app nativa Tap to Pay), navegadores modernos last-2 (web).
