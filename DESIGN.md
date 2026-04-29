---
name: otracita
description: Plataforma SaaS para barberías españolas — paleta cream/terracota/espresso, voz castellana, premium por contención.
colors:
  brand: "#C9653C"
  brand-strong: "#A34F2C"
  brand-soft: "#E8C4A8"
  brand-softer: "#F4E3D4"
  brand-ink: "#FFFFFF"
  gold: "#D4A574"
  gold-soft: "#EDD9BF"
  ink: "#2A1D14"
  ink-2: "#6B5D4F"
  ink-3: "#9C8F7E"
  canvas: "#F7F3EE"
  canvas-mobile: "#FAF7F2"
  surface: "#FFFFFF"
  overlay: "#F0EBE3"
  line: "#E8DDD0"
  line-strong: "#C9BBAA"
  success: "#5E8B6B"
  warning: "#C9924D"
  danger: "#B24D3F"
  event-booksy: "#1F9E6F"
  event-native: "#7C4FE1"
  event-noshow: "#C44A3D"
  today-tint: "#FBF3E6"
typography:
  display:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
  tabular:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    fontVariantNumeric: "tabular-nums"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.brand-strong}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  badge:
    backgroundColor: "{colors.brand-softer}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

## 1. Overview: La barbería de barrio modernizada

otracita viste la paleta de una barbería castellana de toda la vida —espresso recién hecho, cuero envejecido, una pared cream con la luz de la tarde— y la traduce a software con la contención de una marca de lujo silencioso (Aimé Leon Dore, Loro Piana). El resultado es una herramienta que se siente artesanal sin ser nostálgica, premium sin gritar, y radicalmente española sin caer en cliché.

**Reglas que vertebran todo el sistema:**

- **Light mode siempre por defecto.** El dark mode es opcional, jamás impuesto. Default-dark es un *tell* de template AI y daña a usuarios mayores con vista cansada.
- **Una decisión primaria por vista.** Cada pantalla tiene UNA cosa que el barbero puede hacer, no cinco compitiendo. El resto sigue.
- **Whitespace es el material principal.** El lujo aquí es lo que NO está. Antes de añadir un elemento, comprobar si quitar otros tres mejora.
- **Tipografía cuenta la historia.** Fraunces (serif) marca los momentos de marca/editorial; sans neutra hace el trabajo de mesa. La transición entre ambos es dónde vive la personalidad.
- **Contraste duro.** Compromiso WCAG AAA donde sea posible. El barbero atiende con dedos sucios, el cliente final puede ser mayor, la pantalla del iPhone está al sol del escaparate. No negociamos legibilidad.

**Tres superficies, una identidad:**

| Surface | Brand identity | Notas |
|---|---|---|
| `otracita.es` (landing) | otracita-branded, modo editorial | Hero serif gigante, paleta brand explícita, voz audaz |
| `dashboard` + app móvil "Cobros" | otracita-branded, modo tool | Mismas tokens pero más densidad y eficiencia |
| `/b/[slug]` (PWA pública) | **white-label de la barbería** | El cliente final NO ve "otracita". La paleta puede sobrescribirse por la barbería; tipografía y layout heredan |

## 2. Colors: Cream, Terracota & Espresso

La paleta nace de un objeto físico: una barbería de pueblo a las 18:00 con luz de tarde. Cream cálido como la pared, terracota como el cuero del sillón Belmont, espresso como el café que el barbero se acaba de pedir. **Tres protagonistas, dos secundarios, cinco neutrales para tipografía, y tres alarmas funcionales.**

**Brand:**

- `brand` `#C9653C` (terracota) — acción primaria, focos, acentos. La única "voz alta" del sistema.
- `brand-strong` `#A34F2C` — hover/pressed de brand.
- `brand-soft` `#E8C4A8` — fondos de hero, hint de marca sin gritar.
- `brand-softer` `#F4E3D4` — tint apenas perceptible, badges, hover de cards.

**Acentos:**

- `gold` `#D4A574` — premium, ratings, propinas, un toque de "esto es especial".
- `gold-soft` `#EDD9BF` — companion del gold.

**Tinta (escala 5 niveles para AAA):**

- `ink` `#2A1D14` (espresso) — texto cuerpo principal. Contraste 14.2:1 sobre canvas.
- `ink-2` `#6B5D4F` — labels, secundarios. Contraste 6.4:1 sobre canvas.
- `ink-3` `#9C8F7E` — placeholder, muted. Solo para texto >18px.
- `line` `#E8DDD0` — bordes estándar.
- `line-strong` `#C9BBAA` — bordes de énfasis o focus.

**Superficies:**

- `canvas` `#F7F3EE` (web) / `canvas-mobile` `#FAF7F2` (app) — fondo de página. Bone white con calidez.
- `surface` `#FFFFFF` — cards, panels, inputs. Único blanco puro del sistema.
- `overlay` `#F0EBE3` — section tints, table headers, sidebar.

**Estados funcionales** (saturación deliberadamente baja, NO los semáforos chillones):

- `success` `#5E8B6B` — sage, no smaragdo. Confirmaciones, citas confirmadas.
- `warning` `#C9924D` — amber cálido. Avisos.
- `danger` `#B24D3F` — rojo apagado, no Coca-Cola. Cancelaciones, no-shows.

**Eventos de calendario** (codifican fuente de la cita, no estado):

- `event-booksy` `#1F9E6F` (oklch `0.62 0.16 162`) — emerald, citas importadas de Booksy.
- `event-native` `#7C4FE1` (oklch `0.55 0.22 292`) — violet, reservas WhatsApp/manuales.
- `event-noshow` `#C44A3D` — rojo, no-shows.

> Las refs `oklch()` son la fuente canónica en CSS para la pantalla wide-gamut; los hex equivalentes en frontmatter son para Stitch lint y compatibilidad sRGB.

## 3. Typography: Fraunces para la marca, sans para el oficio

**Dos familias, jerarquía clara:**

- **Display + Headline → Fraunces** (Google Fonts, weight 600). Serif moderno con personalidad inglesa-italiana. Lo usamos en `h1` de la landing, hero del dashboard, momentos de marca, cifras grandes, badges editoriales. Letter-spacing negativo (`-0.02em`) en sizes grandes para densidad serif clásica.
- **Title + Body + Label + Tabular → Inter** (sistema actual). Sans neutra eficiente. Hace el trabajo de tabla, formularios, listados. **Candidata a deprecar:** PRODUCT.md prohíbe Inter como decisión nueva por ser default Vercel/AI-template. Cuando migremos, candidatas serias: **GT America, Söhne, IBM Plex Sans**, o `system-ui` directo. No Inter en superficies nuevas.

**Escala (mobile-first, fluida en hero):**

| Token | Tamaño | Peso | Uso |
|---|---|---|---|
| `display` | `clamp(2rem, 5vw, 3.5rem)` | 600 | h1 hero, landing, dashboard inicio |
| `headline` | 24px | 600 | h2, page titles |
| `title` | 18px | 600 | section heads, card titles |
| `body` | 16px | 400 | texto cuerpo |
| `label` | 11px | 700 | uppercase tracking-widest, etiquetas |
| `tabular` | 16px | 600 | precios, importes, hora `tabular-nums` |

**Tono en el copy:**

- Castellano informal. Tutea siempre. Frases cortas. *"Te toca"*, *"Cierra caja"*, *"Venga"*, *"Dale"*. Cero corporate-speak.
- Microcopia explícita >> microcopia simpática. *"Sin citas"* gana a *"¡Ups, no hay nada por aquí!"*.
- Errores: dicen el problema sin maquillarlo. *"SumUp no está conectado. Conéctalo en Ajustes."* >> *"Algo ha ido mal."*

## 4. Elevation: Plana con apuntes cálidos

Sistema casi flat. La elevación se construye con tono y borde antes que con sombras — coherente con el principio de contención.

- **Default cards:** `surface` sobre `canvas`, borde `line`. Sin sombra base.
- **Hover de card:** sombra cálida `shadow-[0_8px_30px_rgba(201,101,60,0.08)]` + borde `brand`. La sombra usa el RGBA del brand al 8%, no negro.
- **Modal / popover:** sombra mediana `shadow-xl` (Tailwind default), borde `line`, fondo `surface`.
- **Sticky header:** background `canvas` con `backdrop-filter: blur(8px)` y borde inferior `line`. Sin sombra.
- **Focus ring:** `outline 2px solid brand` con `outline-offset 2px`. Visible siempre, jamás `outline:none`.

> No usamos glassmorphism. No usamos gradient backgrounds. No usamos neumorphism.

## 5. Components

**Button — Primary**

```css
background: var(--color-brand);
color: var(--color-brand-ink);
border-radius: 12px;
padding: 12px 20px;
font-weight: 500;
min-height: 48px;     /* tap target AAA */
transition: background 200ms;
```

Hover → `--color-brand-strong`. Active → 95% scale (sutil, behind reduced-motion). Disabled → `brand` al 40% opacity. Solo UNA primary por vista — si hay dos, una está mal.

**Button — Secondary (ghost)**

```css
background: transparent;
color: var(--color-ink);
border: 1px solid var(--color-line);
border-radius: 12px;
padding: 12px 20px;
```

Hover → border `brand`, color `brand`. Para acciones de igual peso que primary pero secundarias en jerarquía.

**Card**

```css
background: var(--color-surface);
border: 1px solid var(--color-line);
border-radius: 16px;
padding: 20px;
```

Hover (si interactiva) → sombra cálida + border `brand`. Cards con stat dentro: cifra `tabular` 32px, label `label` arriba en uppercase tracking.

**Input**

```css
background: var(--color-surface);
border: 1px solid var(--color-line);
border-radius: 12px;
padding: 12px 16px;
font: var(--font-body) 16px;   /* 16px para evitar zoom iOS */
```

Focus → border `brand`, ring `brand` al 20%. Error → border `danger`, label de error debajo `text-sm text-danger`. Placeholder con `ink-3`.

**Badge / Pill**

```css
background: var(--color-brand-softer);
color: var(--color-ink);
border-radius: 9999px;
padding: 4px 10px;
font: var(--font-body) 12px;
font-weight: 600;
```

Variantes: `success-soft`, `warning-soft`, `danger-soft`, `gold-soft` — siempre fondo `*-softer`/`*-soft` con texto `ink`, nunca color saturado en fondo grande.

**Booking card (dashboard agenda)**

Layout: hora `ink-3 font-normal` + nombre `ink font-semibold` + precio `tabular ink font-bold`. Source codificado por color de barra lateral 4px (booksy/native/noshow). Borde `line` default; cuando está pendiente de cierre, `warning/30` borde + `warning/10` background para subrayar atención sin gritar.

**Sidebar**

Background `sidebar` (`#F0EBE3`), texto `sidebar-text` (`ink-2`), hover `sidebar-hover`, item activo background `surface` con texto `ink` y borde izquierdo `brand` 3px. Máximo 4 items top-level (target del producto).

## 6. Do's and Don'ts

**Do**

- ✅ Una sola acción primaria por pantalla. Si hay dos, simplificar.
- ✅ Whitespace generoso. Mínimo `xl` (40px) entre secciones distintas.
- ✅ `Fraunces` para momentos de marca, hero, números editoriales grandes.
- ✅ Castellano informal, tutea, frases cortas.
- ✅ `tabular-nums` siempre en importes, horas, contadores.
- ✅ Tap targets ≥ 48px en mobile, foco visible 2px outline.
- ✅ Reduced-motion respetado: animaciones detrás de `@media (prefers-reduced-motion: no-preference)`.
- ✅ Para PWA pública `/b/[slug]`: invitar a la barbería a sobrescribir la paleta. otracita es invisible al cliente final.

**Don't**

- ❌ **Inter en superficies nuevas.** Es el default Vercel/AI-template. Body actual lo usa por inercia, candidato a migración.
- ❌ Modo dark por defecto. Light mode siempre. Dark es opcional.
- ❌ Gradientes purple/fuchsia. Glassmorphism. Sparkles ✨. *"Generate"* buttons con shimmer. Cualquier cosa que parezca template Vercel/AI app.
- ❌ Pop-ups intersticiales agresivos tipo Booksy.
- ❌ UI con cards densas + ratings prominentes + filtros tipo Booking.com (Treatwell/Fresha).
- ❌ Texto de menos de 16px en inputs (causa zoom iOS).
- ❌ Color como ÚNICA señal de estado. Siempre color + ícono + texto.
- ❌ Emojis 🚀✨🔥 inflando vacío. Si una frase no aguanta sin emoji, reescribir.
- ❌ "Get started", "Book now", "Loading…" — todo traducido al castellano nativo.
- ❌ Sombras negras puras. Las sombras del sistema son cálidas (`rgba(201,101,60,*)`) o nulas.
- ❌ `outline: none`. Jamás. Ni siquiera "porque queda mejor".

---

> **Nota de procedencia:** este DESIGN.md se generó por scan del código actual (`src/app/globals.css`, `src/app/layout.tsx`) y refleja el estado real del sistema en `2026-04-29`. Cuando migre Inter o se añadan nuevos tokens, regenerar con `/impeccable document`.
