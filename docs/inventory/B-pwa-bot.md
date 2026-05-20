# B · PWA pública + WhatsApp bot

## Table of contents
- [PWA pública (b/\[slug\])](#pwa)
- [WhatsApp bot conversacional](#bot)
- [Landing + páginas públicas](#landing)

---

## PWA pública (b/[slug]) {#pwa}

### App shell
#### TopBar (sticky)
- **Logo + nombre del negocio** muestran la identidad de la barbería en la cabecera al hacer scroll. `[unit: —] [e2e: —] [risk: P1]`
- **En tema oscuro** con `brandLogoAltUrl` configurado, usa el logo alternativo en vez del principal. `[unit: —] [e2e: —] [risk: P2]`
- **Botón Compartir** llama a `navigator.share` si la API está disponible (Android/iOS moderno). `[unit: —] [e2e: —] [risk: P2]`
- **Fallback de compartir** copia la URL al portapapeles si `navigator.share` no está disponible. `[unit: —] [e2e: —] [risk: P2]`
- **Cancelar compartir** (usuario descarta el share sheet) cae al bloque `catch` sin romper nada. `[unit: —] [e2e: —] [risk: P2]`

#### BottomTabBar
- **Tab Inicio** hace scroll suave al anchor `#hero` si estamos en la home. `[unit: —] [e2e: —] [risk: P2]`
- **Tab Servicios** hace scroll suave al anchor `#servicios`. `[unit: —] [e2e: —] [risk: P2]`
- **Tab Reservar** hace scroll suave al anchor `#reservar` y aparece con highlight brand. `[unit: —] [e2e: —] [risk: P1]`
- **Tab Perfil** navega a `/b/[slug]/cuenta` vía `<Link>`. `[unit: —] [e2e: —] [risk: P1]`
- **IntersectionObserver** actualiza la tab activa al hacer scroll por #hero, #servicios, #reservar. Solo activo en la home; desactivado en sub-rutas. `[unit: —] [e2e: —] [risk: P2]`
- **Desde sub-ruta** (e.g. /cuenta): click en cualquier tab scroll lanza `window.location.href = /b/[slug]#<id>` para navegar + scrollar. `[unit: —] [e2e: —] [risk: P2]`
- **Safe-area-inset-bottom** aplica padding dinámico para iPhone X+ notch. `[unit: —] [e2e: —] [risk: P2]`
- **Tab Reservar wide pill** — cuando activa, la pastilla interna pasa de 44px a 64px de ancho y usa color `--brand` sólido. `[unit: —] [e2e: —] [risk: P2]`

#### Página raíz `/b/[slug]`
- **Slug inexistente** llama a `notFound()` → 404. `[unit: —] [e2e: —] [risk: P1]`
- **`publicEnabled = false`** en el cliente → `notFound()`. `[unit: —] [e2e: —] [risk: P1]`
- **`generateMetadata`** construye title, description, themeColor, manifest, apple-web-app, openGraph y twitter desde el registro del cliente. `[unit: —] [e2e: —] [risk: P2]`
- **brandColor inválido** (no hexadecimal) → `themeColor` usa fallback `#111111`. `[unit: —] [e2e: —] [risk: P2]`
- **openGraph con portada** usa `summary_large_image`; sin portada ni logo usa `summary`. `[unit: —] [e2e: —] [risk: P2]`
- **Paleta dinámica** `buildPalette(brandTheme, brandColor)` calcula accent, accentSoft, accentStrong, accentInk y tokens canvas/surface/line/ink según luminancia. Inyectados como CSS vars en `<main>`. `[unit: —] [e2e: —] [risk: P1]`
- **Variables de compatibilidad** (`--brand*`, `--color-canvas`…) duplicadas para no romper componentes legacy que aún las referencian. `[unit: —] [e2e: —] [risk: P2]`
- **waLink** construido limpiando el número de caracteres no numéricos → `https://wa.me/<digits>`. Si no hay número, `waLink = null` y el botón WhatsApp no aparece. `[unit: —] [e2e: —] [risk: P2]`
- **paddingBottom en `<main>`** = `calc(64px + env(safe-area-inset-bottom))` para no solapar con BottomTabBar. `[unit: —] [e2e: —] [risk: P2]`

### Hero card
#### Layout
- **Con `brandCoverUrl`** renderiza foto de portada como `background-image` con overlay degradado. `[unit: —] [e2e: —] [risk: P2]`
- **Sin `brandCoverUrl`** renderiza gradiente solid de `--accent` con patrón de puntos. `[unit: —] [e2e: —] [risk: P2]`
- **Logo del negocio** (`heroLogoUrl`) aparece en esquina superior derecha dentro de la card, con sombra brand. `[unit: —] [e2e: —] [risk: P2]`
- **Sin logo** la esquina permanece vacía sin romper el layout. `[unit: —] [e2e: —] [risk: P2]`
- **Nombre del negocio** en `<h1>`, tipografía display, color siempre blanco sobre la card. `[unit: —] [e2e: —] [risk: P1]`
- **`publicDescription`** aparece solo si el barbero la tiene configurada; sin ella, no hay texto vacío. `[unit: —] [e2e: —] [risk: P2]`
- **`line-clamp-2`** trunca descripciones largas en la hero card. `[unit: —] [e2e: —] [risk: P2]`

#### Meta row (horario + dirección)
- **Dot verde + "Abierto · HH:MM–HH:MM"** cuando `hoursForDate` devuelve rango para hoy (Madrid TZ). `[unit: —] [e2e: —] [risk: P1]`
- **Dot gris + "Cerrado hoy"** cuando `hoursForDate` devuelve null. `[unit: —] [e2e: —] [risk: P1]`
- **Dirección** como `<a>` a Google Maps (`maps/search?api=1&query=<enc>`), abre `_blank`. Solo aparece si `client.address` está configurado. `[unit: —] [e2e: —] [risk: P2]`
- **Dirección larga** truncada con `truncate` para no romper la fila. `[unit: —] [e2e: —] [risk: P2]`

#### CTA hero
- **"Reservar cita"** (`href="#reservar"`) hace scroll al formulario de reserva. Estilo rounded-full con `--accent` + sombra brand. `[unit: —] [e2e: —] [risk: P1]`
- **`active:scale-[0.98]`** feedback táctil en el botón. `[unit: —] [e2e: —] [risk: P2]`

### Redes sociales (SocialLinks)
- **WhatsApp** enlaza a `wa.me/<digits>`, abre `_blank`. `[unit: —] [e2e: —] [risk: P2]`
- **Teléfono separado** (distinto del WhatsApp) muestra el botón de llamada `tel:`. Solo visible si `phone !== whatsappNumber`. `[unit: —] [e2e: —] [risk: P2]`
- **Instagram** enlaza a `instagram.com/<handle>`, elimina `@` inicial si existe. `[unit: —] [e2e: —] [risk: P2]`
- **TikTok** enlaza a `tiktok.com/@<handle>`. `[unit: —] [e2e: —] [risk: P2]`
- **Facebook** enlaza a la URL configurada directamente. `[unit: —] [e2e: —] [risk: P2]`
- **Web** enlaza a la URL configurada. `[unit: —] [e2e: —] [risk: P2]`
- **Sin ningún enlace** el componente devuelve `null` — no hay fila vacía. `[unit: —] [e2e: —] [risk: P2]`
- **Teléfono de llamada** NO abre `_blank` (es `tel:`). El resto sí abren `_blank`. `[unit: —] [e2e: —] [risk: P2]`

### Flujo de reserva (PublicBookingFlow)

#### Pre-fill de datos del cliente
- **Al montar**, llama a `/api/app/me` — si la sesión PWA está activa, rellena nombre, teléfono y email en los inputs. `[unit: —] [e2e: —] [risk: P1]`
- **Error de red en `/api/app/me`** → `setPrefilled(true)` sin rellenar nada, el flujo continúa. `[unit: —] [e2e: —] [risk: P1]`
- **Pre-fill parcial** (ej. nombre guardado pero sin email) solo rellena los campos disponibles; no sobrescribe entradas previas del usuario. `[unit: —] [e2e: —] [risk: P1]`

#### Sección Servicios (`#servicios`)
##### Lista featured
- **Hasta 3 servicios `featured: true`** se muestran en la lista principal. `[unit: —] [e2e: —] [risk: P1]`
- **Sin servicios marcados como featured** → fallback: los primeros 3 por orden de entrada. `[unit: —] [e2e: —] [risk: P1]`
- **Click en servicio** lo selecciona: borde brand-strong, fondo brand-soft, icono con brand, radio con check. `[unit: —] [e2e: —] [risk: P1]`
- **Descripción expandida** aparece debajo de los metadatos al seleccionar el servicio (si tiene descripción). `[unit: —] [e2e: —] [risk: P2]`
- **Descripción colapsada** muestra `line-clamp-2` cuando el servicio NO está seleccionado. `[unit: —] [e2e: —] [risk: P2]`
- **Star icon** aparece junto al nombre si `service.featured === true`. `[unit: —] [e2e: —] [risk: P2]`
- **Precio** siempre visible a la derecha con `formatEuros` (`.toFixed(2).replace('.', ',')`, formato español). `[unit: —] [e2e: —] [risk: P0]`
- **Duración** en minutos bajo el nombre del servicio. `[unit: —] [e2e: —] [risk: P1]`
- **`aria-pressed`** en cada ServiceRow para accesibilidad teclado/lector. `[unit: —] [e2e: —] [risk: P2]`
- **Sin servicios configurados** → el componente muestra un párrafo de estado vacío y no renderiza nada más. `[unit: —] [e2e: —] [risk: P1]`

##### Botón "Ver todos"
- **Solo aparece** cuando `services.length > featuredServices.length`. `[unit: —] [e2e: —] [risk: P1]`
- **Click** abre el `ServicesSheet` bottom sheet. `[unit: —] [e2e: —] [risk: P1]`

##### ServicesSheet (bottom sheet completo)
- **Backdrop overlay** toca para cerrar la sheet. `[unit: —] [e2e: —] [risk: P1]`
- **Botón X** cierra la sheet. `[unit: —] [e2e: —] [risk: P1]`
- **Handle visual** barra gris en la parte superior de la sheet. `[unit: —] [e2e: —] [risk: P2]`
- **`body.style.overflow = 'hidden'`** bloquea scroll del body mientras la sheet está abierta; restaurado en cleanup del effect. `[unit: —] [e2e: —] [risk: P1]`
- **Lista completa de servicios** con icono, nombre, duración, precio y descripción (sin truncar). `[unit: —] [e2e: —] [risk: P1]`
- **Servicio actualmente seleccionado** aparece con borde brand-strong y fondo brand-soft. `[unit: —] [e2e: —] [risk: P1]`
- **Click en servicio en la sheet** lo selecciona y cierra la sheet (`setShowAllServices(false)`). `[unit: —] [e2e: —] [risk: P1]`
- **`paddingBottom: env(safe-area-inset-bottom)`** para iPhone X+ al fondo de la sheet. `[unit: —] [e2e: —] [risk: P2]`
- **`role="dialog" aria-modal="true"`** para accesibilidad. `[unit: —] [e2e: —] [risk: P2]`
- **`max-h-[85vh]`** — la sheet nunca tapa toda la pantalla. `[unit: —] [e2e: —] [risk: P2]`

#### Sección Reservar (`#reservar`)
##### Selector de barbero
- **Solo aparece** si `barbers.length > 1`. `[unit: —] [e2e: —] [risk: P1]`
- **Card "Cualquiera"** siempre disponible (primera posición, icono ✦). `[unit: —] [e2e: —] [risk: P1]`
- **Card de cada barbero** muestra foto si disponible; si no, inicial del nombre. `[unit: —] [e2e: —] [risk: P1]`
- **Barbero no disponible** (sin slots para el servicio+fecha actuales) aparece con `opacity-30 cursor-not-allowed`. `[unit: —] [e2e: —] [risk: P1]`
- **Click en barbero no disponible** no actualiza el estado (guard `barberAvailable(b.id)`). `[unit: —] [e2e: —] [risk: P1]`
- **Selección visual** borde brand-strong + check badge superpuesto en la foto. `[unit: —] [e2e: —] [risk: P1]`
- **Al cambiar de fecha y el barbero seleccionado queda sin slots** → `setBarberId(null)` automático (reset a "Cualquiera"). `[unit: —] [e2e: —] [risk: P1]`
- **Grid 3 cols en móvil, 4 en sm** para la cuadrícula de barberos. `[unit: —] [e2e: —] [risk: P2]`
- **`aria-pressed`** en cada BarberCard. `[unit: —] [e2e: —] [risk: P2]`

##### Selector de día
- **14 días a partir de hoy** (en Madrid TZ) se generan al montar. `[unit: —] [e2e: —] [risk: P1]`
- **"Hoy" label** en la primera pastilla en vez del nombre del día. `[unit: —] [e2e: —] [risk: P1]`
- **Label de día**: weekday corto + número + mes corto, formato español. `[unit: —] [e2e: —] [risk: P1]`
- **Scroll horizontal** con `overflow-x-auto` + scrollbar oculta. `[unit: —] [e2e: —] [risk: P2]`
- **Pastilla seleccionada** borde brand-strong, fondo brand, color brand-ink. `[unit: —] [e2e: —] [risk: P1]`
- **Pastilla no seleccionada** borde theme-line, fondo theme-surface. `[unit: —] [e2e: —] [risk: P2]`
- **`aria-pressed`** en cada pastilla de día. `[unit: —] [e2e: —] [risk: P2]`
- **Cambiar de día** limpia el slot seleccionado (`setSlot(null)`) y recarga el grid. `[unit: —] [e2e: —] [risk: P1]`

##### Selector de hora (grid de huecos)
- **Al cambiar `service.name` o `date`** → fetch a `/api/public/availability/grid?slug=…&service=…&date=…`. `[unit: —] [e2e: —] [risk: P1]`
- **Estado cargando** muestra `Loader2` girando + "Cargando huecos…". `[unit: —] [e2e: —] [risk: P1]`
- **Error de red o API** muestra mensaje de error bajo el selector de hora y limpia el grid. `[unit: —] [e2e: —] [risk: P1]`
- **Sin huecos disponibles** → empty state con "No hay huecos este día" + hint de prueba. Si hay barbero seleccionado, el copy incluye "con este barbero". `[unit: —] [e2e: —] [risk: P1]`
- **Huecos con barbero seleccionado** → filtra por `grid.byBarber[barberId]`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin preferencia de barbero** → usa `grid.union` (todos los huecos). `[unit: —] [e2e: —] [risk: P1]`
- **Franja Mañana** muestra slots con `start < "14:00"`. `[unit: —] [e2e: —] [risk: P1]`
- **Franja Tarde** muestra slots con `start >= "14:00"`. `[unit: —] [e2e: —] [risk: P1]`
- **Contador de huecos** en el label de cada franja (`3 huecos`, `1 hueco` singular). `[unit: —] [e2e: —] [risk: P2]`
- **Grid 3 cols en móvil, 4 en sm** para los botones de hora. `[unit: —] [e2e: —] [risk: P2]`
- **Slot seleccionado** borde brand-strong, fondo brand, color brand-ink, sombra brand. `[unit: —] [e2e: —] [risk: P1]`
- **Slot no seleccionado** borde theme-line, fondo theme-surface. `[unit: —] [e2e: —] [risk: P2]`
- **`tabular-nums`** en los botones de hora para alineación uniforme. `[unit: —] [e2e: —] [risk: P2]`
- **`aria-pressed`** en cada slot. `[unit: —] [e2e: —] [risk: P2]`

##### Formulario de datos del cliente
- **Solo aparece cuando hay un slot seleccionado** (`slot !== null`). `[unit: —] [e2e: —] [risk: P1]`
- **Campo "Tu nombre *"** `type="text"`, `autoComplete="name"`, obligatorio. `[unit: —] [e2e: —] [risk: P1]`
- **Campo "WhatsApp *"** `type="tel"`, `autoComplete="tel"`, `placeholder="+34 600 123 456"`, obligatorio. `[unit: —] [e2e: —] [risk: P1]`
- **Campo "Email (opcional)"** `type="email"`, `autoComplete="email"`, opcional (`required=false`). `[unit: —] [e2e: —] [risk: P2]`
- **Email en `sm:col-span-2`** ocupa ancho completo en pantallas grandes. `[unit: —] [e2e: —] [risk: P2]`
- **Pre-fill desde sesión activa** rellena los tres campos si el usuario ya está logueado en la PWA. `[unit: —] [e2e: —] [risk: P1]`

##### Resumen + CTA docked
- **Solo aparece cuando hay servicio seleccionado** (`service !== null`). `[unit: —] [e2e: —] [risk: P1]`
- **Nombre del servicio** truncado (`truncate`). `[unit: —] [e2e: —] [risk: P1]`
- **Hora seleccionada** aparece junto al nombre del servicio si hay slot seleccionado (`· HH:MM`). `[unit: —] [e2e: —] [risk: P1]`
- **Total** muestra el precio del servicio formateado con comas (€). `[unit: —] [e2e: —] [risk: P0]`
- **CTA "Confirmar reserva a las HH:MM"** cuando hay slot seleccionado. `[unit: —] [e2e: —] [risk: P1]`
- **CTA "Elige una hora primero"** cuando no hay slot (estado deshabilitado). `[unit: —] [e2e: —] [risk: P1]`
- **CTA "Reservando…"** durante `submitting || cardLoading`. `[unit: —] [e2e: —] [risk: P1]`
- **`canSubmit`** requiere `slot !== null && name.trim() !== '' && phone.trim() !== '' && !submitting && !cardLoading`. `[unit: —] [e2e: —] [risk: P1]`
- **CTA deshabilitado** con `opacity-40 cursor-not-allowed` y fondo theme-overlay. `[unit: —] [e2e: —] [risk: P1]`
- **Enlace a política de privacidad** en el pie del resumen (`/privacidad`, `_blank`). `[unit: —] [e2e: —] [risk: P2]`
- **"Sin pago por adelantado"** copy de tranquilidad junto al enlace de privacidad. `[unit: —] [e2e: —] [risk: P2]`

##### Mensaje de error genérico
- **Aparece bajo el formulario** cuando `error !== null`. Fondo rojo suave, texto `#DC2626`. `[unit: —] [e2e: —] [risk: P1]`
- **Limpiado automáticamente** al iniciar un nuevo submit. `[unit: —] [e2e: —] [risk: P1]`

#### Flujo de submit (sin tarjeta requerida)
- **Click en CTA** llama a `/api/public/bookings/setup-intent` (POST) con slug + datos del cliente. `[unit: —] [e2e: —] [risk: P0]`
- **`data.required === false`** → llama directamente a `completeBooking()`. `[unit: —] [e2e: —] [risk: P0]`
- **Error de red en setup-intent** muestra el error en el formulario. `[unit: —] [e2e: —] [risk: P0]`
- **Error de API en setup-intent** muestra `data.error`. `[unit: —] [e2e: —] [risk: P0]`
- **`completeBooking()`** llama a `/api/public/bookings/create` con todos los datos de la reserva + atribución. `[unit: —] [e2e: —] [risk: P0]`
- **Atribución last-touch** capturada con `captureLastTouch()` en el momento del submit. `[unit: —] [e2e: —] [risk: P1]`
- **First-touch** leído de localStorage vía `readStoredAttribution()`; si no existe, se usa el last-touch como both. `[unit: —] [e2e: —] [risk: P1]`
- **Éxito** → evento GTM `booking_confirmed` (si hay `dataLayer`) + `setConfirmation(...)`. `[unit: —] [e2e: —] [risk: P1]`
- **`errorCode === 'card_required'`** en `/bookings/create` → se limpia `card` para que el modal se cierre y el usuario vuelva a pasar por setup-intent. `[unit: —] [e2e: —] [risk: P0]`
- **Error de red en `/bookings/create`** muestra el error. `[unit: —] [e2e: —] [risk: P0]`

#### Flujo de submit con tarjeta requerida (no-show fee)
- **`data.required === true`** → `setCard({ publishableKey, clientSecret, setupIntentId, feeCents })`. `[unit: —] [e2e: —] [risk: P0]`
- **NoShowCardModal se monta** con los datos del SetupIntent. `[unit: —] [e2e: —] [risk: P0]`
- **`loadStripe(publishableKey)`** memo por publishableKey para no recargar el SDK. `[unit: —] [e2e: —] [risk: P0]`
- **Stripe `Elements`** con `clientSecret` y `appearance: { theme: 'flat' }`. `[unit: —] [e2e: —] [risk: P0]`
- **`PaymentElement`** renderiza el formulario de tarjeta. Solo se puede interactuar tras `onReady()`. `[unit: —] [e2e: —] [risk: P0]`
- **Checkbox de consentimiento** con el importe real de la tarifa (`feeCents / 100`). Obligatorio antes de poder confirmar. `[unit: —] [e2e: —] [risk: P0]`
- **Intento de confirmar sin marcar checkbox** → error "Marca la casilla para aceptar la tarifa…". `[unit: —] [e2e: —] [risk: P0]`
- **`elements.submit()`** primero (valida el formulario de Stripe); si falla, muestra error de Stripe. `[unit: —] [e2e: —] [risk: P0]`
- **`stripe.confirmSetup({ redirect: 'if_required' })`** — SCA si aplica. `[unit: —] [e2e: —] [risk: P0]`
- **Error de confirmación** (tarjeta rechazada, SCA fallida) muestra `confirmErr.message`. `[unit: —] [e2e: —] [risk: P0]`
- **`setupIntent.status !== 'succeeded'`** → error "La tarjeta no pudo confirmarse". `[unit: —] [e2e: —] [risk: P0]`
- **Éxito** → `setDone(true)`, llama `onSaved(setupIntent.id)` → padre llama `completeBooking(setupIntentId)`. `[unit: —] [e2e: —] [risk: P0]`
- **`done = true`** previene doble-submit accidental. `[unit: —] [e2e: —] [risk: P0]`
- **Error scrollea** al `#noshow-card-error` automáticamente. `[unit: —] [e2e: —] [risk: P1]`
- **Botón cerrar (X)** en el modal llama `onClose()` → `setCard(null)` → el modal desaparece sin crear la reserva. `[unit: —] [e2e: —] [risk: P0]`
- **Pie del modal** "Tarjeta protegida por Stripe. otracita no almacena el número." `[unit: —] [e2e: —] [risk: P2]`
- **`role="dialog" aria-modal="true" aria-label="Guardar tarjeta"`** accesibilidad. `[unit: —] [e2e: —] [risk: P2]`
- **Layout bottom-sheet en móvil, centrado en desktop** (`items-end sm:items-center`). `[unit: —] [e2e: —] [risk: P2]`

#### Success state (confirmación)
- **Pantalla de confirmación** reemplaza el flujo completo al hacer `setConfirmation({...})`. `[unit: —] [e2e: —] [risk: P1]`
- **Mensaje "¡Cita reservada!"** con check en circle brand-colored. `[unit: —] [e2e: —] [risk: P1]`
- **Detalle**: fecha, hora y barbero (si asignado) en bold. `[unit: —] [e2e: —] [risk: P1]`
- **"Recibirás recordatorio por WhatsApp el día antes."** copy informativo. `[unit: —] [e2e: —] [risk: P2]`
- **"Hacer otra reserva"** llama a `reset()` → vuelve al estado inicial del flujo. `[unit: —] [e2e: —] [risk: P1]`
- **`reset()`** restaura: servicio al primero, fecha a hoy, barbero a null, slot a null, campos de texto a vacío, error a null. `[unit: —] [e2e: —] [risk: P1]`

### Sección cuenta (`/b/[slug]/cuenta`)

#### Shell de la página cuenta
- **Hereda el theming** de la barbería (mismas CSS vars que la home). `[unit: —] [e2e: —] [risk: P1]`
- **`notFound()`** si el slug no existe o `publicEnabled = false`. `[unit: —] [e2e: —] [risk: P1]`
- **BottomTabBar** con `activeTab="perfil"` fijo. `[unit: —] [e2e: —] [risk: P1]`

#### CustomerAccount — estado inicial (loading)
- **Fetch `/api/app/me`** al montar. Mientras espera, muestra spinner `Loader2`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de red en `/api/app/me`** → vista `login-phone`. `[unit: —] [e2e: —] [risk: P1]`

#### CustomerAccount — Login paso 1 (teléfono + nombre)
- **`LoginHero`** muestra icono User + "Bienvenido" + descripción contextual con el nombre del negocio. `[unit: —] [e2e: —] [risk: P2]`
- **Input WhatsApp** `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`. `[unit: —] [e2e: —] [risk: P1]`
- **Input Nombre** `type="text"`, `autoComplete="given-name"`, etiqueta "(opcional la primera vez)". `[unit: —] [e2e: —] [risk: P2]`
- **Botón "Recibir código por WhatsApp"** deshabilitado mientras `loading || !phone.trim()`. `[unit: —] [e2e: —] [risk: P1]`
- **Error "Escribe tu teléfono."** si se pulsa el botón sin teléfono. `[unit: —] [e2e: —] [risk: P1]`
- **Llamada a `/api/app/otp/request`** (POST) con `{ slug, phone }`. `[unit: —] [e2e: —] [risk: P1]`
- **Éxito** → `setOtpHint(d.hint)` + `setView('login-code')`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de API** muestra `d.error || 'No se pudo enviar el código'`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de red** muestra 'Error de red'. `[unit: —] [e2e: —] [risk: P1]`
- **Texto informativo** sobre ventajas de la cuenta (reservas más rápidas, historial). `[unit: —] [e2e: —] [risk: P2]`

#### CustomerAccount — Login paso 2 (código OTP)
- **Botón "Cambiar número"** navega de vuelta a `login-phone`, limpia `code` y `error`. `[unit: —] [e2e: —] [risk: P1]`
- **Título + descripción** "Introduce el código" + `otpHint || "Código enviado por WhatsApp al {phone}. Llega en unos segundos."` `[unit: —] [e2e: —] [risk: P1]`
- **Input OTP** `type="text"`, `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength=6`, filtra no-dígitos en `onChange`. `[unit: —] [e2e: —] [risk: P1]`
- **Estilo monospace** con `tracking-[0.5em] text-3xl`. `[unit: —] [e2e: —] [risk: P2]`
- **Botón "Entrar"** deshabilitado si `loading || code.length !== 6`. `[unit: —] [e2e: —] [risk: P1]`
- **Validación local** `!/^\d{6}$/.test(code)` → error "El código es de 6 dígitos." antes de llamar a la API. `[unit: —] [e2e: —] [risk: P1]`
- **Llamada a `/api/app/otp/verify`** (POST) con `{ slug, phone, code, name? }`. `[unit: —] [e2e: —] [risk: P1]`
- **Éxito** → `refreshMe()` + `setCode('')` → transición a vista `home`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de API** muestra `d.error || 'No se pudo verificar'`. `[unit: —] [e2e: —] [risk: P1]`
- **Botón "Reenviar código"** llama a `requestCode()` de nuevo. Deshabilitado mientras `loading`. `[unit: —] [e2e: —] [risk: P1]`

#### CustomerAccount — Home loggeado
- **Tarjeta de usuario** con inicial del nombre + nombre + teléfono, sobre gradiente `--accent`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin nombre** muestra icono `User` en el avatar. `[unit: —] [e2e: —] [risk: P2]`
- **LoyaltyCard** (ver sección propia). `[unit: —] [e2e: —] [risk: P1]`
- **PushNotificationsRow** (ver sección propia). `[unit: —] [e2e: —] [risk: P1]`
- **RowLink "Mis reservas"** → `setView('bookings')`. `[unit: —] [e2e: —] [risk: P1]`
- **RowStatic "Perfil"** muestra email o teléfono (solo-lectura). `[unit: —] [e2e: —] [risk: P2]`
- **Botón "Cerrar sesión"** llama a `/api/app/logout` (POST), resetea estado, transición a `login-phone`. `[unit: —] [e2e: —] [risk: P1]`

#### PushNotificationsRow
- **Si push no soportado** devuelve null (invisible). `[unit: —] [e2e: —] [risk: P1]`
- **iOS en Safari sin instalar** (no standalone) → banner informativo "instala primero la app desde Compartir → Añadir a pantalla de inicio". `[unit: —] [e2e: —] [risk: P1]`
- **iOS en Chrome/Firefox** (no-Safari, no-standalone) → idem, ya que sin Safari no hay `beforeinstallprompt` ni push. `[unit: —] [e2e: —] [risk: P1]`
- **Permission denied** → banner "Notificaciones bloqueadas" con instrucciones para Ajustes. `[unit: —] [e2e: —] [risk: P1]`
- **Estado `default`** → botón "Activar notificaciones". Click llama `subscribeToPush(slug)`. `[unit: —] [e2e: —] [risk: P1]`
- **Estado `granted`** → botón "Notificaciones activadas". Click llama `unsubscribeFromPush()`. `[unit: —] [e2e: —] [risk: P1]`
- **`busy`** durante la operación → spinner `Loader2`. `[unit: —] [e2e: —] [risk: P1]`

#### LoyaltyCard
- **Barbería sin loyalty activo** (`enabled === false`) → devuelve null. `[unit: —] [e2e: —] [risk: P1]`
- **Error de red en `/api/app/loyalty`** → devuelve null (oculto). `[unit: —] [e2e: —] [risk: P1]`
- **Loading** → spinner + "Cargando tu tarjeta…". `[unit: —] [e2e: —] [risk: P2]`
- **Cliente nuevo** (`newCustomer: true`) → copy "Empezarás a sumar en tu próxima visita". `[unit: —] [e2e: —] [risk: P1]`
- **Sin `progress`** → "Reserva tu primera cita para empezar tu tarjeta." `[unit: —] [e2e: —] [risk: P1]`
- **Modo stamps (`StampsView`)** muestra `earned / needed`, barra de progreso. `[unit: —] [e2e: —] [risk: P1]`
  - **`canRedeem: true`** → label "¡Listo para canjear!" en color accent + banner "Muéstrale esta pantalla al barbero". `[unit: —] [e2e: —] [risk: P0]`
  - **`canRedeem: false`** → "te faltan N" en ink-3. `[unit: —] [e2e: —] [risk: P1]`
  - **Barra de progreso** `Math.round(p.progress * 100)%` de ancho. `[unit: —] [e2e: —] [risk: P1]`
  - **`RewardLabel`** para tipo `service`: nombre + "gratis". `[unit: —] [e2e: —] [risk: P0]`
  - **`RewardLabel`** para tipo `discount_amount`: importe en €. `[unit: —] [e2e: —] [risk: P0]`
  - **`RewardLabel`** para tipo `discount_pct`: porcentaje; si `pct === 100` muestra "servicio gratis". `[unit: —] [e2e: —] [risk: P0]`
- **Modo points (`PointsView`)** muestra balance en puntos, barra de progreso, próximo tier. `[unit: —] [e2e: —] [risk: P1]`
  - **Recompensas canjeables** lista los tiers con `canRedeem: true` + banner "Muéstrale esta pantalla al barbero". `[unit: —] [e2e: —] [risk: P0]`
  - **Sin tiers canjeables + nextTier** → "Siguiente recompensa: X por N pts". `[unit: —] [e2e: —] [risk: P1]`
  - **`nextTier.pointsCost - balance`** puntos que faltan. `[unit: —] [e2e: —] [risk: P1]`

#### CustomerAccount — Vista Mis Reservas
- **Botón "Volver"** → `setView('home')`. `[unit: —] [e2e: —] [risk: P1]`
- **Fetch `/api/app/bookings?slug=…`** al entrar a la vista (automático por effect). `[unit: —] [e2e: —] [risk: P1]`
- **Loading** → spinner `Loader2` centrado. `[unit: —] [e2e: —] [risk: P1]`
- **Sección "Próximas"** lista `upcoming`. `[unit: —] [e2e: —] [risk: P1]`
  - **Empty state** "No tienes reservas próximas." con borde dashed. `[unit: —] [e2e: —] [risk: P1]`
  - **Cada reserva** muestra servicio, fecha + hora + barbero (si hay). `[unit: —] [e2e: —] [risk: P1]`
  - **Badge "Cancelada"** si `status === 'cancelled'` (rojo). `[unit: —] [e2e: —] [risk: P1]`
  - **Badge "Hecha"** si `status === 'completed'` (ink-3). `[unit: —] [e2e: —] [risk: P1]`
  - **Badge "No-show"** si `status === 'no_show'` (ink-3). `[unit: —] [e2e: —] [risk: P1]`
  - **Botón "Cancelar reserva"** visible solo para `status === 'confirmed' || 'completed'` en la sección Próximas (`canCancel: true`). `[unit: —] [e2e: —] [risk: P1]`
  - **`confirm()`** nativo antes de cancelar. `[unit: —] [e2e: —] [risk: P1]`
  - **Llamada a `/api/app/bookings/[id]/cancel`** (POST). Si ok, refresca la lista. `[unit: —] [e2e: —] [risk: P1]`
- **Sección "Historial"** lista `past`. `[unit: —] [e2e: —] [risk: P1]`
  - **Empty state** "Aún no has venido con nosotros." `[unit: —] [e2e: —] [risk: P2]`
  - **Sin botón cancelar** (`canCancel: false`). `[unit: —] [e2e: —] [risk: P1]`

### Valoración de visita (`/b/[slug]/cuenta/rate/[bookingId]`)

#### Auth guard
- **Sin sesión activa** → redirect a `/b/[slug]/cuenta?next=<returnUrl>`. `[unit: —] [e2e: —] [risk: P1]`
- **Slug o barbería no encontrada** → `notFound()`. `[unit: —] [e2e: —] [risk: P1]`
- **Booking no pertenece a esta barbería** → `notFound()`. `[unit: —] [e2e: —] [risk: P1]`
- **Teléfono del booking distinto al del usuario logueado** → `notFound()` (anti-cross-rating). `[unit: —] [e2e: —] [risk: P1]`

#### RateForm — lectura previa
- **Valoración ya existente** (`existing !== null`) → `submitted = true`, muestra el card read-only con la valoración previa y el copy "Ya habías valorado esta visita." `[unit: —] [e2e: —] [risk: P1]`

#### RateForm — selección de estrellas
- **5 botones grandes (h-12)** para valorar táctilmente. `[unit: —] [e2e: —] [risk: P1]`
- **Hover/touch** → `hoverRating` ilumina las estrellas hasta la posición. `[unit: —] [e2e: —] [risk: P2]`
- **Click** → fija `rating`. `[unit: —] [e2e: —] [risk: P1]`
- **Label de rating** aparece bajo las estrellas: "Genial 🎉", "Muy bueno", "Bien", "Regular", "Mal". `[unit: —] [e2e: —] [risk: P2]`
- **`aria-label` por estrella** ("1 estrella", "2 estrellas"…). `[unit: —] [e2e: —] [risk: P2]`

#### RateForm — comentario
- **Solo aparece** si `rating !== null`. `[unit: —] [e2e: —] [risk: P1]`
- **Placeholder** según nota: ≥4 "Cuéntale al barbero qué te gustó…"; <4 "¿Cómo podrían mejorar?" `[unit: —] [e2e: —] [risk: P2]`
- **`maxLength=500`** + contador de chars. `[unit: —] [e2e: —] [risk: P2]`
- **Opcional** — no bloquea el envío. `[unit: —] [e2e: —] [risk: P1]`

#### RateForm — submit
- **Botón "Enviar valoración"** deshabilitado si `rating === null || submitting`. `[unit: —] [e2e: —] [risk: P1]`
- **Llamada a `/api/app/ratings/submit`** (POST) con `{ bookingId, rating, comment? }`. `[unit: —] [e2e: —] [risk: P1]`
- **Éxito** → `setSubmitted(true)` → transición al estado confirmado. `[unit: —] [e2e: —] [risk: P1]`
- **Error de API** muestra `d.error || 'No se pudo guardar'` en rojo. `[unit: —] [e2e: —] [risk: P1]`
- **"Ahora no"** navega a `/b/[slug]/cuenta` sin valorar. `[unit: —] [e2e: —] [risk: P2]`

#### RateForm — estado confirmado (post-submit)
- **Card de confirmación** con check + nota/5 + agradecimiento. `[unit: —] [e2e: —] [risk: P1]`
- **Propina ya pagada** (`existingTip`) → bloque informativo con importe + "Gracias por reconocer el trabajo del barbero." `[unit: —] [e2e: —] [risk: P1]`
- **`showTipBlock`** = `submitted && finalRating >= 4 && tipConfig !== null && existingTip === null`. `[unit: —] [e2e: —] [risk: P0]`
  - **Hasta 3 botones de importe** (`tipConfig.suggestedCents`, ≤3). `[unit: —] [e2e: —] [risk: P0]`
  - **Click en importe** llama a `/api/app/tips/create` (POST) con `{ bookingId, amountCents }`. `[unit: —] [e2e: —] [risk: P0]`
  - **Éxito** → `window.location.href = d.url` (Stripe Checkout). `[unit: —] [e2e: —] [risk: P0]`
  - **Error de API** muestra `tipError`. `[unit: —] [e2e: —] [risk: P0]`
  - **`tipBusy`** deshabilita los botones + loader. `[unit: —] [e2e: —] [risk: P0]`
  - **"No, gracias"** navega a `/b/[slug]/cuenta`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin `showTipBlock`** → solo botón "Volver a mi cuenta". `[unit: —] [e2e: —] [risk: P1]`
- **Navegación de regreso** `<Link href="/b/[slug]/cuenta">Mi cuenta</Link>` en el header. `[unit: —] [e2e: —] [risk: P1]`

### PWA install bootstrap (PwaBootstrap)

#### Registro del service worker
- **Siempre** intenta `navigator.serviceWorker.register('/sw.js')`. Fallo silencioso (dev/private mode). `[unit: —] [e2e: —] [risk: P1]`

#### Detección de estado
- **`isStandalone`** → `(display-mode: standalone)` media query + `navigator.standalone` (iOS). `[unit: —] [e2e: —] [risk: P1]`
- **`dismissed`** → lee `localStorage.getItem('otracita-pwa-install-dismissed')`; válido por 30 días. `[unit: —] [e2e: —] [risk: P2]`
- **Si `dismissed || isStandalone`** → no renderiza nada. `[unit: —] [e2e: —] [risk: P1]`

#### Banner Android/Chrome (`beforeinstallprompt`)
- **`beforeinstallprompt` capturado** → banner con nombre del negocio + botón "Instalar" colored con brand. `[unit: —] [e2e: —] [risk: P2]`
- **Click "Instalar"** → `installEvent.prompt()` → espera `userChoice` → limpia evento. `[unit: —] [e2e: —] [risk: P2]`
- **X cerrar** → `dismiss()` → guarda timestamp en localStorage + oculta por 30 días. `[unit: —] [e2e: —] [risk: P2]`

#### Hint iOS Safari
- **Aparece tras 8 segundos** en página, solo si iOS + no standalone + no dismissed. `[unit: —] [e2e: —] [risk: P2]`
- **iOS Safari** → instrucciones "Pulsa ⎋ Compartir → Añadir a pantalla de inicio". `[unit: —] [e2e: —] [risk: P2]`
- **iOS Chrome/Firefox** → "Para instalar, abre esta página en Safari". `[unit: —] [e2e: —] [risk: P2]`

### Analytics bootstrap (AnalyticsBootstrap)

#### Atribución
- **`captureFromCurrentLocation()`** al montar — captura UTM/referrer en localStorage. No requiere consentimiento. `[unit: —] [e2e: —] [risk: P1]`

#### Cookie consent banner (CMP)
- **Primera visita** (sin `otracita_consent_v1` en localStorage) → banner visible. `[unit: —] [e2e: —] [risk: P2]`
- **Consent Mode v2 defaults** enviados a `dataLayer` ANTES de cargar GTM: analytics y marketing `denied` por defecto si no hay choice previa. `[unit: —] [e2e: —] [risk: P2]`
- **"Aceptar todo"** → `{ analytics: true, marketing: true }` + consent update + oculta banner. `[unit: —] [e2e: —] [risk: P2]`
- **"Solo necesarias"** → `{ analytics: false, marketing: false }`. `[unit: —] [e2e: —] [risk: P2]`
- **"Personalizar"** → expande checkboxes de analytics y marketing. `[unit: —] [e2e: —] [risk: P2]`
  - **Checkbox "Necesarias"** siempre marcado y deshabilitado. `[unit: —] [e2e: —] [risk: P2]`
  - **Checkbox "Análisis"** togglable; default `true`. `[unit: —] [e2e: —] [risk: P2]`
  - **Checkbox "Marketing"** togglable; default `true`. `[unit: —] [e2e: —] [risk: P2]`
  - **"Guardar elección"** aplica la selección customizada. `[unit: —] [e2e: —] [risk: P2]`
- **Botón flotante "Cookies"** aparece cuando ya eligió; click reabre el banner. `[unit: —] [e2e: —] [risk: P2]`
- **`localStorage` lleno** → consent vive solo en memoria de la sesión (catch). `[unit: —] [e2e: —] [risk: P2]`

#### Google Tag Manager
- **Solo se inyecta** si `gtmContainerId` es válido (`/^GTM-[A-Z0-9]{6,12}$/i`). `[unit: —] [e2e: —] [risk: P1]`
- **`<Script strategy="afterInteractive">`** para no bloquear el render. `[unit: —] [e2e: —] [risk: P1]`
- **noscript fallback** `<iframe>` para entornos sin JS. `[unit: —] [e2e: —] [risk: P2]`
- **`booking_confirmed`** event pushado al `dataLayer` tras cada reserva exitosa (ecommerce enhanced). `[unit: —] [e2e: —] [risk: P1]`

---

## WhatsApp bot conversacional {#bot}

### Infraestructura y configuración (config.ts / sender.ts)
- **`getClientByPhoneNumberId`** resuelve el `BarbershopConfig` completo desde `clients` + `barbers`. Lookup por `whatsappPhoneNumberId`. `[unit: —] [e2e: —] [risk: P0]`
- **Sin cliente** → `handleIncomingMessage` hace return sin responder. `[unit: —] [e2e: —] [risk: P1]`
- **Barbers** cargados en `displayOrder ASC, name ASC` — orden determinístico para el tie-breaking de "cualquier barbero". `[unit: —] [e2e: —] [risk: P1]`
- **`botName` vacío o null** → greeting genérico "el asistente de X". `[unit: —] [e2e: —] [risk: P2]`
- **`whatsappAccessToken`** — fallback a `process.env.WHATSAPP_ACCESS_TOKEN` si no está en el registro del cliente. `[unit: —] [e2e: —] [risk: P0]`
- **`sendWhatsAppMessage`** — Graph API v21.0, mensaje de texto plano. `[unit: —] [e2e: —] [risk: P0]`
- **`sendWhatsAppButtons`** — interactivo tipo `button`, máximo 3 botones. `[unit: —] [e2e: —] [risk: P0]`
- **`sendWhatsAppList`** — interactivo tipo `list`, para >3 opciones (horas, servicios, fechas). `[unit: —] [e2e: —] [risk: P0]`

### Gate de tier
- **Sin feature `whatsappBot`** (Solo sin trial activo) → mensaje ignorado silenciosamente. Analytics de `messagesReceived` se incrementa igualmente. El barbero contesta a mano. `[unit: —] [e2e: —] [risk: P1]`
- **Pro / Estudio (o Solo en trial activo)** → flujo completo. `[unit: —] [e2e: —] [risk: P1]`

### Canonicalización de teléfono
- **`msg.from` canonicalizado a E.164** una sola vez al entrar al handler. Nunca lanza; inputs raros pasan tal cual. `[unit: —] [e2e: —] [risk: P0]`

### Routing de follow-up (rating/tip)
- **`isFollowupReplyId(id)`** → si el reply id empieza por `fu_rate_` o `fu_tip_`, se delega a `handleFollowupReply` ANTES de cualquier otro routing. `[unit: —] [e2e: —] [risk: P1]`
- **Follow-up interceptado** → `trackAnalytics('messagesReplied')` + return. No entra en el state machine de booking. `[unit: —] [e2e: —] [risk: P1]`

### Detección de idioma
- **Primera vez** → `detectLanguage(text)` basado en vocabulario ES/EN (wordlists). `[unit: —] [e2e: —] [risk: P1]`
- **Idioma ya guardado en context** → solo se re-detecta si el mensaje tiene ≥3 palabras Y el score cambia. `[unit: —] [e2e: —] [risk: P1]`
- **Switch explícito a inglés** (`"english"`, `"in english"`, etc.) → confirma con `"Sure! I'll continue in English 🇬🇧"` + menú 3 botones + `return`. `[unit: —] [e2e: —] [risk: P2]`
- **Switch explícito a español** → confirma con `"¡Claro! Continúo en español 🇪🇸"` + menú + `return`. `[unit: —] [e2e: —] [risk: P2]`
- **Idioma guardado en context + nuevo sin guardar** → lazy-save de lang y/o customerName si cambian. `[unit: —] [e2e: —] [risk: P2]`

### Escape global
- **Frases de escape** (`"salir"`, `"exit"`, `"cancel"`, `"reset"`, `"reiniciar"`, `"menú"`, `"inicio"`, `"start"`) desde cualquier paso → reset completo del state + menú 3 botones. `[unit: —] [e2e: —] [risk: P1]`
- **Solo activo cuando `step !== 'idle'`** — no interfiere en conversaciones nuevas. `[unit: —] [e2e: —] [risk: P1]`

### Detección de intent (idle)
- **`classifyIntent(text)`** — GPT-4o-mini, single token: `booking | cancel | change | question | greeting`. `[unit: —] [e2e: —] [risk: P1]`
- **Error de OpenAI** → fallback a `'greeting'`. `[unit: —] [e2e: —] [risk: P1]`
- **`booking`** → `startBookingFlow`. `[unit: —] [e2e: —] [risk: P1]`
- **`cancel`** → `startCancellationFlow`. `[unit: —] [e2e: —] [risk: P1]`
- **`change`** → `startChangeFlow`. `[unit: —] [e2e: —] [risk: P1]`
- **`question`** → `answerQuestion` (GPT-4o-mini, 2 frases, tono configurable). `[unit: —] [e2e: —] [risk: P1]`
- **`greeting`** → `sendGreeting`. `[unit: —] [e2e: —] [risk: P2]`

### Detecciones especiales (antes de classifyIntent)
- **"Mi cita" / "cuando tengo cita" / keywords ES+EN** → lista de próximas reservas sin entrar en el state machine. `[unit: —] [e2e: —] [risk: P1]`
  - **0 reservas** → "No tienes ninguna cita próxima. ¿Quieres reservar una?" `[unit: —] [e2e: —] [risk: P1]`
  - **1 reserva** → mensaje detallado con servicio, fecha y barbero. `[unit: —] [e2e: —] [risk: P1]`
  - **Múltiples** → lista interactiva con todas. `[unit: —] [e2e: —] [risk: P1]`
- **"Me llamo X" / "My name is X" / "call me X"** → actualiza `customers.name` y todos los bookings existentes del teléfono + confirmación. `[unit: —] [e2e: —] [risk: P2]`

### Tonos del bot
- **`botTone: 'cercano'`** (default) — tuteo, emojis con moderación, tono cálido. `[unit: —] [e2e: —] [risk: P2]`
- **`botTone: 'neutro'`** — tuteo, sin emojis, registro profesional. `[unit: —] [e2e: —] [risk: P2]`
- **`botTone: 'formal'`** — "usted", sin emojis, registro pulcro. `[unit: —] [e2e: —] [risk: P2]`
- **Aplicado al prompt de `answerQuestion`** → el tono afecta solo a respuestas de preguntas libres (FAQ), no a los mensajes del state machine. `[unit: —] [e2e: —] [risk: P2]`

### Greeting flow
- **Con servicios configurados** → 3 botones: "Reservar cita", "Cancelar/Cambiar", "Info y precios". `[unit: —] [e2e: —] [risk: P1]`
- **Sin servicios** → texto libre + "Escríbeme lo que necesites". `[unit: —] [e2e: —] [risk: P1]`
- **Nombre del cliente conocido** → "Hola Carlos! 👋" (personalizado). `[unit: —] [e2e: —] [risk: P2]`
- **Sin nombre** → "Hola! 👋". `[unit: —] [e2e: —] [risk: P2]`
- **Button `action_info`** → genera pregunta canónica de servicios/precios y la pasa a `answerQuestion`. `[unit: —] [e2e: —] [risk: P1]`
- **Button `action_done`** → agradecimiento + reset a `idle`. `[unit: —] [e2e: —] [risk: P2]`

### Flujo de reserva (booking)

#### Reputación del cliente
- **`reputation === 'blocked'`** (≥3 no-shows) → mensaje de bloqueo + return. `[unit: —] [e2e: —] [risk: P1]`
- **`reputation === 'warning'`** (2 no-shows o ratio >30%) → advertencia + el flujo continúa. `[unit: —] [e2e: —] [risk: P1]`

#### Captura de nombre (si no conocido)
- **Sin nombre** → paso `asking_name` → "¿Cómo te llamas?". `[unit: —] [e2e: —] [risk: P1]`
- **Nombre < 2 o > 50 chars** → pide de nuevo. `[unit: —] [e2e: —] [risk: P1]`
- **Nombre válido** → guarda en `customers`, pasa a `choosing_service`. `[unit: —] [e2e: —] [risk: P1]`

#### Selección de servicio (`choosing_service`)
- **≤3 servicios** → 3 botones. `[unit: —] [e2e: —] [risk: P1]`
- **>3 servicios** → lista interactiva con todos. `[unit: —] [e2e: —] [risk: P1]`
- **Reply por id** (`service_N`) → selección directa. `[unit: —] [e2e: —] [risk: P1]`
- **Reply por texto** → fuzzy match en `service.name.toLowerCase().includes(lower)`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin match** → error y re-pregunta. `[unit: —] [e2e: —] [risk: P1]`
- **Sin `googleCalendarId` ni DB avail** → mensaje de fallback "Contacta directamente" + 2 botones. `[unit: —] [e2e: —] [risk: P2]`
- **Con barberos configurados** → pasa a `choosing_barber`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin barberos** → pasa directamente a `choosing_date`. `[unit: —] [e2e: —] [risk: P1]`

#### Selección de barbero (`choosing_barber`)
- **≤3 opciones** (barberos + "Sin preferencia") → botones. `[unit: —] [e2e: —] [risk: P1]`
- **>3 opciones** → lista interactiva. `[unit: —] [e2e: —] [risk: P1]`
- **Reply `barber_N`** → selecciona por índice. `[unit: —] [e2e: —] [risk: P1]`
- **Reply `barber_any`** → `anyPreference = true`, label localizado. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto** con "sin preferencia" / "cualquier" / "any" → any preference. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto** con nombre parcial → fuzzy match. `[unit: —] [e2e: —] [risk: P1]`
- **Sin match** → error + re-pregunta. `[unit: —] [e2e: —] [risk: P1]`
- **`selectedBarberId`** en context = null para "sin preferencia"; string UUID para barbero concreto. `[unit: —] [e2e: —] [risk: P0]`
- **La string "Sin preferencia" NUNCA llega a la tabla de bookings** (sólo el id). `[unit: —] [e2e: —] [risk: P0]`
- **Pasa a `choosing_date`** tras selección. `[unit: —] [e2e: —] [risk: P1]`

#### Selección de día (`choosing_date`)
- **`getNext7Days`** construye hasta 7 días de los próximos 14, saltando días "Cerrado" y fechas bloqueadas. `[unit: —] [e2e: —] [risk: P1]`
- **Lista interactiva** con hasta 7 filas ("Hoy, lunes 7", "Mañana, martes 8"…). `[unit: —] [e2e: —] [risk: P1]`
- **Reply id `date_YYYY-MM-DD`** → selección directa. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto `"hoy"` / `"today"`** → `getTodayDate()`. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto `"manana"` / `"tomorrow"`** → `getTomorrowDate()`. `[unit: —] [e2e: —] [risk: P1]`
- **Fecha inválida** → error "Por favor, selecciona una de la lista." `[unit: —] [e2e: —] [risk: P1]`
- **`ctx.isWaitlistFlow === true`** → inserta directamente en waitlist + confirmation + vuelve a `idle`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin `googleCalendarId` ni DB avail** → error interno + reset. `[unit: —] [e2e: —] [risk: P1]`
- **Fetch de slots** — DB (`getAvailableSlotsFromDB`) o GCal (`getAvailableSlots`). `[unit: —] [e2e: —] [risk: P0]`
- **`ctx.selectedBarberId`** pasado al engine de disponibilidad DB. `[unit: —] [e2e: —] [risk: P0]`
- **Error al fetchear slots** → mensaje de error + `return` (sin romper el state). `[unit: —] [e2e: —] [risk: P1]`
- **Sin slots** → oferta de lista de espera: "¿Quieres que te avisemos?" + 2 botones. `[unit: —] [e2e: —] [risk: P1]`
- **Con slots** → lista interactiva de hasta 10 huecos + pasa a `choosing_slot`. `[unit: —] [e2e: —] [risk: P1]`

#### Selección de hora (`choosing_slot`)
- **Reply id `slot_YYYY-MM-DD_HH:MM`** → extrae fecha y hora. `[unit: —] [e2e: —] [risk: P1]`
- **Reply texto `"HH:MM"` o `"HH"`** → regex para extraer hora. `[unit: —] [e2e: —] [risk: P1]`
- **Sin match** → error + re-pregunta. `[unit: —] [e2e: —] [risk: P1]`
- **Resumen de confirmación** con servicio, barbero (si aplica), fecha, hora + "¿Confirmamos?" → 2 botones. `[unit: —] [e2e: —] [risk: P1]`
- **Pasa a `confirming`**. `[unit: —] [e2e: —] [risk: P1]`

#### Confirmación (`confirming`)
- **"Sí" / "yes" / `confirm_yes`** → crea la reserva. `[unit: —] [e2e: —] [risk: P0]`
- **Path DB (`useDbAvailability`)** → `createBookingDb(...)` con todos los parámetros estandarizados. Maneja lead-time, horizon, buffer, auto-invoicing. `[unit: —] [e2e: —] [risk: P0]`
- **Path GCal (legacy)** → `createBooking(googleCalendarId, ...)` + insert directo en `bookings`. Barbero resuelto a fila real o fallback al primero en order. `[unit: —] [e2e: —] [risk: P0]`
- **Éxito** → analytics `bookingsMade` + `incrementCustomerBookings` (solo GCal path) + mensaje confirmado con dirección + 3 botones. `[unit: —] [e2e: —] [risk: P0]`
- **Error de creación GCal** → mensaje de error al usuario. `[unit: —] [e2e: —] [risk: P0]`
- **Error de creación DB** → log + `bookingSuccess = false` → no se envía confirmación. `[unit: —] [e2e: —] [risk: P0]`
- **Slot malformado** (no `date_time`) → fallback de confirmación genérico. `[unit: —] [e2e: —] [risk: P1]`
- **Sin slot en context** → fallback genérico. `[unit: —] [e2e: —] [risk: P1]`
- **"No" / "no" / `confirm_no`** → mensaje "No hay problema" + reset a `idle`. `[unit: —] [e2e: —] [risk: P1]`
- **Reset estado** siempre al final: `step = idle`, `selectedService = null`, `selectedSlot = null`, `context = null`. `[unit: —] [e2e: —] [risk: P1]`

### Flujo de cancelación

#### Inicio (`startCancellationFlow`)
- **Sin reservas futuras** → "No tienes reservas pendientes." + return. `[unit: —] [e2e: —] [risk: P1]`
- **1 reserva** → confirmación directa con 2 botones (Sí / No). Pasa a `cancel_confirming`. `[unit: —] [e2e: —] [risk: P1]`
- **Múltiples** → lista de hasta 10 reservas. Pasa a `cancelling`. `[unit: —] [e2e: —] [risk: P1]`

#### Selección entre múltiples (`cancelling`)
- **Reply id `cancel_booking_<bookingId>`** → lookup del booking. `[unit: —] [e2e: —] [risk: P1]`
- **Booking no encontrado** → error + reset a `idle`. `[unit: —] [e2e: —] [risk: P1]`
- **Sin match de id** → error "Por favor, selecciona una cita de la lista." `[unit: —] [e2e: —] [risk: P1]`
- **Muestra confirmación** con el booking seleccionado. Pasa a `cancel_confirming`. `[unit: —] [e2e: —] [risk: P1]`

#### Confirmación de cancelación (`cancel_confirming`)
- **"Sí" / `cancel_yes`** → procede. `[unit: —] [e2e: —] [risk: P1]`
  - **`googleEventId` presente** → `deleteCalendarEvent(...)`. `[unit: —] [e2e: —] [risk: P1]`
  - **Actualiza `bookings.status = 'cancelled'`** + `cancelledAt`. `[unit: —] [e2e: —] [risk: P1]`
  - **`tryVoidInvoicesInBackground(bookingId)`** para anular factura adjunta. `[unit: —] [e2e: —] [risk: P0]`
  - **Analytics** `bookingsCancelled` + `incrementCustomerCancellations`. `[unit: —] [e2e: —] [risk: P1]`
  - **`updateCustomerReputation`** recalcula: blocked (≥3 no-shows), warning (2 no-shows o ratio >30% con ≥5 bookings), good. `[unit: —] [e2e: —] [risk: P1]`
  - **`notifyWaitlist`** notifica al siguiente en lista de espera para esa fecha. `[unit: —] [e2e: —] [risk: P1]`
  - **Si `ctx.isChanging`** → cancela + inicia nuevo booking flow inmediatamente. `[unit: —] [e2e: —] [risk: P1]`
  - **Si no `isChanging`** → "¿Quieres reservar otra?" + 2 botones. `[unit: —] [e2e: —] [risk: P1]`
- **"No" / `cancel_no`** → "Tu cita se mantiene." + reset. `[unit: —] [e2e: —] [risk: P1]`
- **`cancelBookingId` no en context** → error interno + reset. `[unit: —] [e2e: —] [risk: P1]`
- **Booking ya no existe** → mensaje "No he encontrado esa cita" + reset. `[unit: —] [e2e: —] [risk: P1]`

### Flujo de cambio de cita

#### Inicio (`startChangeFlow`)
- **Sin reservas** → "No tienes reservas pendientes para cambiar." `[unit: —] [e2e: —] [risk: P1]`
- **1 reserva** → muestra detalle + 2 botones "Sí, cambiar" / "No, mantener". Pasa a `changing`. `[unit: —] [e2e: —] [risk: P1]`
- **Múltiples** → lista, reutiliza el mismo paso `cancelling` pero con `isChanging: true`. `[unit: —] [e2e: —] [risk: P1]`

#### Confirmación de cambio (`changing`)
- **"Sí" / `change_yes`** → llama a `handleCancelConfirmation` con `cancel_yes` y `isChanging: true`. Esto cancela la vieja cita y arranca nuevo booking flow. `[unit: —] [e2e: —] [risk: P1]`
- **"No" / `change_no`** → "Tu cita se mantiene." + reset. `[unit: —] [e2e: —] [risk: P1]`

### Flujo de recordatorio (outbound cron)
- **Botón `reminder_confirm` (`✅ Ahí estaré`)** → "✅ Perfecto, te esperamos mañana! 💈" + analytics. `[unit: —] [e2e: —] [risk: P1]`
- **Botón `reminder_cancel` (`❌ Necesito cancelar`)** → cancela la primera reserva confirmada futura del usuario (orden por fecha). `[unit: —] [e2e: —] [risk: P1]`
  - **Google Calendar event eliminado** si `googleEventId` presente. `[unit: —] [e2e: —] [risk: P1]`
  - **`tryVoidInvoicesInBackground`** sobre la cita cancelada. `[unit: —] [e2e: —] [risk: P0]`
  - **Analytics + `incrementCustomerCancellations`**. `[unit: —] [e2e: —] [risk: P1]`
  - **`notifyWaitlist`** para el hueco liberado. `[unit: —] [e2e: —] [risk: P1]`
  - **Respuesta** "Tu cita ha sido cancelada. ¿Quieres reservar otra?" + 2 botones. `[unit: —] [e2e: —] [risk: P1]`

### Flujo de lista de espera (waitlist)

#### Inscripción desde "sin huecos"
- **Botón `waitlist_yes`** → inserta en `waitlist` (date, service, barber, customerPhone) + confirmación + "¿También reservar otro día por si acaso?" `[unit: —] [e2e: —] [risk: P1]`
  - **`waitlist_also_book`** → muestra date picker para reservar día alternativo. `[unit: —] [e2e: —] [risk: P1]`
  - **`action_done`** → "No, está bien" → cierra. `[unit: —] [e2e: —] [risk: P2]`
- **Botón `waitlist_no`** → muestra date picker para probar otro día. `[unit: —] [e2e: —] [risk: P1]`
- **Barber en waitlist** = nombre del barbero seleccionado o null (cualquiera). `[unit: —] [e2e: —] [risk: P1]`

#### Inscripción explícita (startWaitlistFlow)
- **En `ctx.isWaitlistFlow`** al seleccionar fecha → inserta en waitlist directamente. `[unit: —] [e2e: —] [risk: P1]`

#### Notificación de hueco disponible (notifyWaitlist)
- **Solo se ejecuta** si hay alguien en estado `waiting` para esa fecha. `[unit: —] [e2e: —] [risk: P1]`
- **Hay entrada `notified` reciente (<30 min)** → skip (no notificar a otra persona mientras la primera decide). `[unit: —] [e2e: —] [risk: P1]`
- **30 minutos pasados sin respuesta** → la entrada pasa a `expired`, se notifica al siguiente. `[unit: —] [e2e: —] [risk: P1]`
- **Prioridad** al que espera por el barbero específico; luego los de "cualquiera". `[unit: —] [e2e: —] [risk: P1]`
- **Mensaje** "¡se ha liberado un hueco! [servicio] [fecha] [hora] ¿Lo reservamos?" + 2 botones. `[unit: —] [e2e: —] [risk: P1]`
- **`waitlist.notifiedAt`** + `waitlist.time` actualizados antes de enviar. `[unit: —] [e2e: —] [risk: P1]`

#### Aceptar hueco (`waitlist_accept`)
- **Entrada `notified` no encontrada** → "esta oferta ya ha caducado." `[unit: —] [e2e: —] [risk: P1]`
- **Fecha u hora faltantes** → "algo salió mal, reserva directamente." `[unit: —] [e2e: —] [risk: P1]`
- **Cancela booking de backup** si el usuario tenía una reserva futura ≥ offered date. `[unit: —] [e2e: —] [risk: P1]`
  - Elimina evento GCal + status `cancelled` + void invoice. `[unit: —] [e2e: —] [risk: P0]`
- **Crea nuevo booking** para el hueco ofrecido. `[unit: —] [e2e: —] [risk: P0]`
  - Barber name resuelto a ID real; fallback al primero activo si no hay match. `[unit: —] [e2e: —] [risk: P1]`
  - `analytics bookingsMade` + `incrementCustomerBookings`. `[unit: —] [e2e: —] [risk: P1]`
  - `waitlist.status = 'booked'`. `[unit: —] [e2e: —] [risk: P1]`
- **Mensaje confirmado** con detalle del nuevo booking + nota de cancelación si hubo. `[unit: —] [e2e: —] [risk: P1]`
- **Error de Google Calendar** → "alguien reservó antes, te mantengo en la lista." + reset `waiting`. `[unit: —] [e2e: —] [risk: P1]`

#### Rechazar hueco (`waitlist_decline`)
- **Entrada `notified` encontrada** → `status = 'expired'` + `notifyWaitlist` para el siguiente. `[unit: —] [e2e: —] [risk: P1]`
- **Mensaje** "Entendido. Si cambias de opinión, escríbeme." `[unit: —] [e2e: —] [risk: P2]`

### Flujo de follow-up post-servicio (followup.ts)

#### Outbound: `sendRatingFollowup`
- **Anti-fraude**: teléfono del cliente coincide con `client.phone` o `client.whatsappNumber` → skip (test bookings del propio barbero). `[unit: —] [e2e: —] [risk: P1]`
- **Sin `publicSlug`** → fallback directo a WhatsApp. `[unit: —] [e2e: —] [risk: P1]`
- **Dispatcher `dispatchUserNotification`** — si hay push activo → push con deep-link a `/b/[slug]/cuenta/rate/[bookingId]`. Si no → WhatsApp fallback. `[unit: —] [e2e: —] [risk: P1]`
- **Canal `none`** (ni push ni WA) → return `false`, NO marca `followupSentAt` (el cron reintentará). `[unit: —] [e2e: —] [risk: P1]`
- **Canal `push` o `whatsapp`** → marca `bookings.followupSentAt`. `[unit: —] [e2e: —] [risk: P1]`
- **Fallback WhatsApp** — lista interactiva de 5 estrellas (1→5) + `upsertFollowupState`. `[unit: —] [e2e: —] [risk: P1]`

#### `tryRatingFollowupForCompletedBooking` (fire-and-forget)
- **`ratingsEnabled === false`** → no-op. `[unit: —] [e2e: —] [risk: P1]`
- **`followupSentAt` ya presente** → no-op (idempotente). `[unit: —] [e2e: —] [risk: P1]`
- **Status `cancelled` o `no_show`** → no-op. `[unit: —] [e2e: —] [risk: P1]`
- **Error** → log, nunca lanza. `[unit: —] [e2e: —] [risk: P1]`

#### Inbound: `handleFollowupReply`
- **Stale button** (sin estado `followup` en context) → owned silenciosamente (return true) sin side effects. `[unit: —] [e2e: —] [risk: P1]`
- **Sin token o phoneNumberId** → owned silenciosamente. `[unit: —] [e2e: —] [risk: P1]`
- **Canonicalización** del `customerPhone` antes de lookup (idempotente). `[unit: —] [e2e: —] [risk: P0]`

##### Rating step (`fu_rate_N`)
- **Nota inválida** (no entero 1-5) → owned sin respuesta. `[unit: —] [e2e: —] [risk: P1]`
- **`recordRating`** guardado en tabla `ratings` ANTES de ofrecer propina. Idempotente por UNIQUE parcial. `[unit: —] [e2e: —] [risk: P1]`
- **Nota ≤ 3** → "¡Gracias! Se la pasamos al equipo para mejorar." + clear followup state. `[unit: —] [e2e: —] [risk: P1]`
- **Nota ≥ 4 + tips disabled o Connect no listo** → agradecimiento. Si nota = 5 y hay `googleReviewUrl` → invita a dejar reseña. `[unit: —] [e2e: —] [risk: P1]`
- **Nota ≥ 4 + tips enabled + suggested amounts** → botones de propina (hasta 2 importes + "No gracias"). `[unit: —] [e2e: —] [risk: P0]`
- **`suggested` slice de los primeros 2 importes ≥ 100¢** — Meta limita a 3 botones totales. `[unit: —] [e2e: —] [risk: P0]`
- **Upsert de followup state** a `awaiting_tip` con `rating`. `[unit: —] [e2e: —] [risk: P1]`

##### Tip step (`fu_tip_<cents>`)
- **`fu_tip_skip`** → "¡Gracias de todas formas! Nos vemos pronto. 💈" + clear state. `[unit: —] [e2e: —] [risk: P1]`
- **Importe inválido (≤0)** → owned sin respuesta. `[unit: —] [e2e: —] [risk: P1]`
- **`createTipSession`** crea Stripe Checkout session + fila `tips` con status pendiente. `[unit: —] [e2e: —] [risk: P0]`
- **Éxito** → "Paga tu propina de N€ aquí: <url> (El enlace expira en 24h.)" + clear state. `[unit: —] [e2e: —] [risk: P0]`
- **Error en `createTipSession`** → "puedes dar la propina en efectivo" + clear state. `[unit: —] [e2e: —] [risk: P0]`

---

## Landing + páginas públicas {#landing}

### Página raíz `/` (`src/app/page.tsx`)
- **Landing pública de otracita** — visible para visitantes anónimos (barberos potenciales). `[unit: —] [e2e: —] [risk: P2]`

### Páginas legales/informativas públicas
- **`/privacidad`** — política de privacidad. Enlazada desde el footer de reserva PWA. `[unit: —] [e2e: —] [risk: P2]`
- **`/terminos`** — términos y condiciones. `[unit: —] [e2e: —] [risk: P2]`
- **`/aviso-legal`** — aviso legal. `[unit: —] [e2e: —] [risk: P2]`
- **`/legal`** — sección legal, posible índice de las anteriores. `[unit: —] [e2e: —] [risk: P2]`
- **`/login`** — login para dashboard de barberos (Better Auth). Página pública pero redirige al dashboard si hay sesión. `[unit: —] [e2e: —] [risk: P1]`
- **`/pay`** — ruta de pago (Stripe Checkout return / propina completada). `[unit: —] [e2e: —] [risk: P0]`
- **`/gracias`** — página de agradecimiento (post-pago o post-acción). `[unit: —] [e2e: —] [risk: P2]`

### Manifest PWA (`/manifest/[slug]/manifest.webmanifest`)
- **Generado dinámicamente** por slug con nombre, colores y iconos del negocio. `[unit: —] [e2e: —] [risk: P1]`

### VeriFactu declaración responsable (`/legal/verifactu`)
- **Página pública** de declaración responsable AEAT. `[unit: —] [e2e: —] [risk: P0]`

---

## Summary (B)

| Métrica | Valor |
|---|---|
| **Total de leaves (bullets terminales)** | **267** |
| **Con unit test** | **0** |
| **Sin unit test** | **267** |

No existe ningún test file que cubra el scope PWA (`src/app/b/`) ni el WhatsApp bot (`src/lib/whatsapp/`). Los 19 test files del proyecto cubren exclusivamente lógica de negocio del dashboard/backend (loyalty compute, invoicing, verifactu, payroll, billing tier, etc.).

**Áreas de mayor riesgo sin cobertura:**
- P0 sin tests: flujo de submit PWA (setup-intent + create), tarjeta no-show (Stripe Elements confirmSetup), precio en euros vs cents, flujo de confirmación del bot (DB + GCal path), `tryVoidInvoicesInBackground`, rating + tip follow-up WhatsApp, `waitlist_accept` (cancela booking + crea nuevo).
- P1 sin tests: todos los estados y transiciones del state machine del bot, pre-fill de sesión PWA, reputación de clientes, LoyaltyCard rendering modes.
