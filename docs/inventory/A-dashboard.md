# A — Dashboard Inventory
_otracita — agotamiento exhaustivo de cada área, pestaña, panel, modal, campo, botón y estado del dashboard (`src/app/dashboard/**`)_
_Formato canónico: cada hoja termina con `[unit: <path o —>] [e2e: —] [risk: P0|P1|P2]`_

---

## Índice

1. [Shell / Layout global](#1-shell--layout-global)
2. [Setup wizard (onboarding)](#2-setup-wizard-onboarding)
3. [Agenda](#3-agenda)
   - 3.1 [Vista Día](#31-vista-día-daygrid)
   - 3.2 [Vista Semana](#32-vista-semana-weekgrid)
   - 3.3 [Vista Mes](#33-vista-mes-monthgrid)
   - 3.4 [Rail lateral (AgendaSideRail)](#34-rail-lateral-agendasiderail)
   - 3.5 [SlotActionMenu](#35-slotactionmenu)
   - 3.6 [BarberActionMenu](#36-barberactionmenu)
   - 3.7 [NewBookingPanel](#37-newbookingpanel)
   - 3.8 [BookingDetailPanel](#38-bookingdetailpanel)
   - 3.9 [PromosFillModal (Llenar huecos)](#39-promosfillmodal-llenar-huecos)
   - 3.10 [Importar citas (ImportFlow)](#310-importar-citas-importflow)
4. [Ventas](#4-ventas)
   - 4.1 [TPV / POS (página índice)](#41-tpv--pos-página-índice)
   - 4.2 [Transacciones](#42-transacciones)
   - 4.3 [Caja](#43-caja)
   - 4.4 [Resumen de ventas](#44-resumen-de-ventas)
   - 4.5 [Cobros online](#45-cobros-online)
   - 4.6 [Facturas (listado Ventas)](#46-facturas-listado-ventas)
   - 4.7 [Propinas](#47-propinas)
   - 4.8 [Productos (Tienda interna)](#48-productos-tienda-interna)
5. [Facturas (ruta canónica)](#5-facturas-ruta-canónica)
   - 5.1 [Listado](#51-listado)
   - 5.2 [Detalle de factura](#52-detalle-de-factura)
   - 5.3 [Factura nueva (manual)](#53-factura-nueva-manual)
6. [Finanzas (P&L)](#6-finanzas-pl)
7. [Clientes](#7-clientes)
   - 7.1 [Lista de clientes](#71-lista-de-clientes)
   - 7.2 [Ficha de cliente (ClientProfile)](#72-ficha-de-cliente-clientprofile)
   - 7.3 [Atribución de fuente](#73-atribución-de-fuente)
8. [Equipo](#8-equipo)
   - 8.1 [Empleados (BarbersManager)](#81-empleados-barbersmanager)
   - 8.2 [Turnos (TurnosManager)](#82-turnos-turnosmanager)
   - 8.3 [Comisiones](#83-comisiones)
   - 8.4 [Bonos](#84-bonos)
   - 8.5 [Competición](#85-competición)
9. [Informes](#9-informes)
   - 9.1 [Panel (OperatorPanel + FinanzasClient)](#91-panel-operatorpanel--finanzasclient)
   - 9.2 [Ingresos](#92-ingresos)
   - 9.3 [Citas](#93-citas)
   - 9.4 [Clientes (informe)](#94-clientes-informe)
   - 9.5 [Marketing (informe)](#95-marketing-informe)
   - 9.6 [Nóminas](#96-nóminas)
10. [Marketing](#10-marketing)
    - 10.1 [Fidelidad](#101-fidelidad)
    - 10.2 [Promos](#102-promos)
    - 10.3 [WhatsApp Bot](#103-whatsapp-bot)
    - 10.4 [Reseñas](#104-reseñas)
    - 10.5 [Tienda (productos pública)](#105-tienda-productos-pública)
11. [Ajustes](#11-ajustes)
    - 11.1 [Negocio](#111-negocio)
    - 11.2 [Pagos](#112-pagos)
    - 11.3 [Reservas online](#113-reservas-online)
    - 11.4 [Recepcionista IA](#114-recepcionista-ia)
    - 11.5 [App pública](#115-app-pública)
    - 11.6 [Ayuda](#116-ayuda)
12. [Mi plan (Suscripción)](#12-mi-plan-suscripción)
13. [Rutas legacy / redirect](#13-rutas-legacy--redirect)

---

## 1. Shell / Layout global

### 1.1 DashboardLayout (`layout.tsx`)

- **Auth check server-side** — `auth.api.getSession` + redirect `/login` si no hay sesión. [unit: —] [e2e: —] [risk: P1]
- **Setup redirect** — si el cliente no tiene `businessName` → redirect `/dashboard/setup`. [unit: —] [e2e: —] [risk: P1]
- **AppRail (desktop, md+)** — rail izquierdo fijo con icono monograma + nav + admin link + setup dot + RailUserMenu. [unit: —] [e2e: —] [risk: P2]
- **MobileSidebar** — sheet/drawer lateral en móvil con DashboardSidebarNav variant="sidebar". [unit: —] [e2e: —] [risk: P2]
- **DashboardChatWidget** — chat de soporte flotante (abajo derecha). [unit: —] [e2e: —] [risk: P2]
- **ConfirmDialogHost** — host global para diálogos de confirmación destructivos. [unit: —] [e2e: —] [risk: P1]
- **UndoToastHost** — host global para toasts de deshacer acciones reversibles. [unit: —] [e2e: —] [risk: P1]
- **Mobile bottom nav** — barra inferior móvil con DashboardSidebarNav variant="bottom" (icono + etiqueta). [unit: —] [e2e: —] [risk: P2]
- **loading.tsx** — skeleton de carga a nivel de layout. [unit: —] [e2e: —] [risk: P2]
- **error.tsx** — boundary de error a nivel de layout. [unit: —] [e2e: —] [risk: P2]

### 1.2 AppRail (`_components/AppRail.tsx`)

- **Monogram link** — logo/iniciales del local, vínculo a `/dashboard`. [unit: —] [e2e: —] [risk: P2]
- **DashboardSidebarNav variant="sidebar"** — 7 ítems de área (Agenda / Ventas / Clientes / Equipo / Informes / Marketing / Ajustes) con icono, tooltip instantáneo (sin delay, fix #8), estado activo via `isNavItemActive`. [unit: —] [e2e: —] [risk: P1]
- **Admin Shield link** — visible solo si `isAdmin(session.user.email)`, enlace a `/admin`. [unit: —] [e2e: —] [risk: P1]
- **Setup indicator dot** — punto naranja sobre el icono de Ajustes cuando `needsSetup`. [unit: —] [e2e: —] [risk: P2]
- **RailUserMenu** — avatar + nombre + menú con "Cerrar sesión" y link a Mi plan. [unit: —] [e2e: —] [risk: P1]

### 1.3 DashboardSidebarNav (`_components/DashboardSidebarNav.tsx`)

- **variant="sidebar"** — icon-only, tooltip instantáneo sobre hover/focus, active highlight con `isNavItemActive`. [unit: —] [e2e: —] [risk: P2]
- **variant="bottom"** — icono + etiqueta corta, active state, sin tooltip. [unit: —] [e2e: —] [risk: P2]
- **NAV_ITEMS** — derivados de `AREAS` en `nav-config.ts`: Agenda · Ventas · Clientes · Equipo · Informes · Marketing · Ajustes. [unit: —] [e2e: —] [risk: P2]

### 1.4 Dashboard home (`page.tsx`)

- **Redirect automático** a `/dashboard/agenda`. [unit: —] [e2e: —] [risk: P2]

---

## 2. Setup wizard (onboarding)

_`src/app/dashboard/setup/page.tsx`_ — 6 pasos lineales + revisión final.

### 2.1 Paso 1 — Tu negocio

- **Campo nombre del negocio** — `businessName`, requerido. [unit: —] [e2e: —] [risk: P1]
- **Campo nombre del dueño** — `ownerName`, requerido. [unit: —] [e2e: —] [risk: P1]
- **Campo teléfono** — `phone`, requerido. [unit: —] [e2e: —] [risk: P1]
- **Campo ciudad** — `city`, default "Barcelona". [unit: —] [e2e: —] [risk: P2]
- **Campo dirección** — `address`. [unit: —] [e2e: —] [risk: P2]
- **Campo URL Booksy** — `booksyUrl`, opcional; botón "Importar de Booksy" que hace scraping → `scraped=true`. [unit: —] [e2e: —] [risk: P1]
- **Estado scraping** — spinner Loader2 mientras extrae datos de Booksy. [unit: —] [e2e: —] [risk: P2]
- **Estado scraped** — tick de confirmación cuando importó. [unit: —] [e2e: —] [risk: P2]

### 2.2 Paso 2 — Equipo y servicios

- **Lista de barberos** — añadir / borrar con nombre + botón "+" para añadir más. [unit: —] [e2e: —] [risk: P1]
- **Lista de servicios** — nombre + duración (min) + precio (€), add/delete por fila. [unit: —] [e2e: —] [risk: P1]

### 2.3 Paso 3 — Horario

- **Toggle por día** (lunes…domingo) — on/off. [unit: —] [e2e: —] [risk: P1]
- **Hora inicio / fin** por día activo. [unit: —] [e2e: —] [risk: P1]

### 2.4 Paso 4 — App pública

- **Campo slug** — generado desde `businessName` via `slugify()`, editable. [unit: —] [e2e: —] [risk: P1]
- **Selector tema** — claro / oscuro. [unit: —] [e2e: —] [risk: P2]
- **Color de marca** — color picker. [unit: —] [e2e: —] [risk: P2]
- **Descripción corta** — texto libre. [unit: —] [e2e: —] [risk: P2]

### 2.5 Paso 5 — Facturación (opcional)

- **Toggle habilitar VeriFactu** — con explicación de qué es. [unit: —] [e2e: —] [risk: P0]
- **Campo NIF fiscal** — requerido si habilita. [unit: —] [e2e: —] [risk: P0]
- **Campo nombre fiscal** — empresa o autónomo. [unit: —] [e2e: —] [risk: P0]
- **Explicación VeriFactu** — texto inline sobre la declaración responsable AEAT. [unit: —] [e2e: —] [risk: P0]

### 2.6 Paso 6 — Revisión + activar

- **Resumen de todos los campos** — lectura de lo introducido en pasos 1–5. [unit: —] [e2e: —] [risk: P1]
- **Botón "Activar"** — POST `/api/setup`, spinner, redirect `/dashboard?welcome=1` con URL pública. [unit: —] [e2e: —] [risk: P1]
- **Error genérico** — mensaje si POST falla. [unit: —] [e2e: —] [risk: P1]

### 2.7 Navegación del wizard

- **Botón "Siguiente"** — avanza al paso siguiente. [unit: —] [e2e: —] [risk: P1]
- **Botón "Anterior"** — retrocede. [unit: —] [e2e: —] [risk: P2]
- **Barra de progreso** — indicador visual de paso actual / 6. [unit: —] [e2e: —] [risk: P2]

---

## 3. Agenda

_`src/app/dashboard/agenda/`_

### Carga de datos (server, `page.tsx`)

- **Servicios del local** — `chatbotServices` jsonb, usado solo como catálogo (lectura). [unit: —] [e2e: —] [risk: P1]
- **Barbers activos** — tabla `barbers` (`active = true`, `displayOrder` asc) — canónico. [unit: —] [e2e: —] [risk: P1]
- **Fechas bloqueadas** — `blockedDates`. [unit: —] [e2e: —] [risk: P1]
- **Horario del local** — `hours` (Record<string,string>). [unit: —] [e2e: —] [risk: P1]

### Toolbar de CalendarView

- **Toggle Día / Semana / Mes** — 3 botones segmentados, persiste la vista activa. [unit: —] [e2e: —] [risk: P1]
- **Botón "Hoy"** — salta a la fecha actual. [unit: —] [e2e: —] [risk: P1]
- **Prev / Next chevron** — navega día / semana / mes según vista activa. [unit: —] [e2e: —] [risk: P1]
- **Título de periodo** — "Lun 19 may" / "Semana del 12–18 may" / "mayo 2026". [unit: —] [e2e: —] [risk: P2]
- **Filtro de barbero** — select que pasa `barberId` a AgendaSideRail y DayGrid (filtra columnas). [unit: —] [e2e: —] [risk: P1]
- **Botón "Llenar huecos"** — visible solo si `promosEnabled`; abre PromosFillModal. [unit: —] [e2e: —] [risk: P1]
- **Enlace "Importar"** — navega a `/dashboard/agenda/importar`. [unit: —] [e2e: —] [risk: P2]
- **Botón "Nueva cita"** — abre NewBookingPanel. [unit: —] [e2e: —] [risk: P1]
- **Banner moveError** — aviso rojo si el drag&drop falló (e.g. solape). [unit: —] [e2e: —] [risk: P1]
- **SWR polling 10s** — refresca eventos sin reload completo. [unit: —] [e2e: —] [risk: P1]

### 3.1 Vista Día (DayGrid)

- **Columna por barbero** — una columna por cada barbero activo (o solo el filtrado); avatar + nombre + colores del día en cabecera; chevron clickable → BarberActionMenu. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Columna "Sin asignar"** — fallback cuando una cita no tiene `barberId`. [unit: —] [e2e: —] [risk: P1]
- **Time gutter sticky** — etiquetas de hora en la izquierda, scroll interno. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P2]
- **Línea de hora actual** — punto + línea horizontal en la posición exacta de "ahora" (actualiza cada minuto). [unit: —] [e2e: —] [risk: P2]
- **Líneas de hora y media hora** — grid del fondo. [unit: —] [e2e: —] [risk: P2]
- **Overlay offhours** — sombreado fuera del horario del local. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Overlay bloqueado** — si la fecha está en `blockedDates`. [unit: —] [e2e: —] [risk: P1]
- **Ventana dinámica** — `computeAgendaWindow` (no 08-22 hardcode): unión de horario real + citas. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Auto-scroll inicial** — posiciona la vista en "ahora" (o inicio ventana si hoy no está en vista). [unit: —] [e2e: —] [risk: P2]
- **Bloque de cita** — 3 líneas: `HH:MM · StatusBadge`, nombre del cliente, servicio; click → BookingDetailPanel. [unit: —] [e2e: —] [risk: P1]
- **paymentBadge glyph** — icono de pago en el bloque (pagado/pendiente). [unit: —] [e2e: —] [risk: P1]
- **Booksy lock icon** — candado en citas importadas de Booksy (solo lectura). [unit: —] [e2e: —] [risk: P2]
- **barberRequested ♥ icon** — corazón si el cliente eligió explícitamente ese barbero. [unit: —] [e2e: —] [risk: P2]
- **Contraste AA del bloque** — `appointmentBlockStyle` calcula color de fondo del barber + contraste WCAG AA; cancelada sube de 3.42 a 6.45:1. [unit: —] [e2e: —] [risk: P2]
- **Drag&drop** — arrastrar un bloque a otro slot / columna; grab offset preservado; PATCH `/api/bookings/[id]/move`; `moveError` si hay solape. [unit: src/lib/unavailability.test.ts] [e2e: —] [risk: P1]
- **Click en slot vacío** → SlotActionMenu. [unit: —] [e2e: —] [risk: P1]

### 3.2 Vista Semana (WeekGrid)

- **7 columnas Lun–Dom** — cabecera día + fecha; resaltado "hoy"; columnas scroll interno. [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Ventana dinámica semanal** — `computeAgendaWindow` sobre los 7 días visibles (fuente única). [unit: src/app/dashboard/agenda/_agenda-window.test.ts] [e2e: —] [risk: P1]
- **Auto-scroll** — a "ahora" si la semana contiene hoy, si no al inicio de la ventana. [unit: —] [e2e: —] [risk: P2]
- **Línea hora actual** — solo el día de hoy. [unit: —] [e2e: —] [risk: P2]
- **Overlay offhours** — sombreado por día (via `hoursForDate`). [unit: —] [e2e: —] [risk: P1]
- **Overlay bloqueado** — fechas en `blockedDates`. [unit: —] [e2e: —] [risk: P1]
- **Bloque de cita** — mismo estilo DayGrid (Booksy Lock, colores). [unit: —] [e2e: —] [risk: P1]
- **Click en bloque** → BookingDetailPanel. [unit: —] [e2e: —] [risk: P1]
- **Click en slot vacío** → `onSlotClick(dateStr, time)` → SlotActionMenu o NewBookingPanel. [unit: —] [e2e: —] [risk: P1]

### 3.3 Vista Mes (MonthGrid)

- **Grid Lun–Dom** — filas de semanas, cabecera `DAY_HEADERS`. [unit: —] [e2e: —] [risk: P1]
- **Días del mes adyacente** — opacidad 30 %. [unit: —] [e2e: —] [risk: P2]
- **Resaltado "hoy"** — círculo/fondo diferenciado. [unit: —] [e2e: —] [risk: P2]
- **Overlay bloqueado** — fondo y patrón en fechas bloqueadas del mes actual. [unit: —] [e2e: —] [risk: P1]
- **Chips de cita** — hasta `MAX_VISIBLE=3` chips por día con `appointmentChipStyle` + statusBadge. [unit: —] [e2e: —] [risk: P1]
- **"+N más"** — chip de desbordamiento cuando hay >3 citas en el día. [unit: —] [e2e: —] [risk: P2]
- **Click en día** → `onSlotClick(dateStr, '10:00')` → SlotActionMenu. [unit: —] [e2e: —] [risk: P1]
- **Click en chip** → BookingDetailPanel. [unit: —] [e2e: —] [risk: P1]

### 3.4 Rail lateral (AgendaSideRail)

- **Toggle colapso/expansión** — botón chevron, estado persistido en `localStorage` (`otracita_agenda_rail_collapsed_v1`). [unit: —] [e2e: —] [risk: P2]
- **Mini-mes** — grid 7×N con inicio Lunes; día activo resaltado; WCAG 2.5.8: botones prev/next 28×28 px (flechas mini-cal). [unit: —] [e2e: —] [risk: P2]
- **Chips salto de semana** — ±1 … ±6 semanas desde la actual. [unit: —] [e2e: —] [risk: P2]
- **Filtro de barbero** — select, pasa `barberId` al padre (CalendarView). [unit: —] [e2e: —] [risk: P1]
- **Leyenda "Destacados"** — swatch "Pago" (verde/rojo) y swatches de estado (confirmada/completada/cancelada/no-show). [unit: —] [e2e: —] [risk: P2]
- **Leyenda del equipo** — color por barbero (`barberColorVar(displayOrder)`). [unit: —] [e2e: —] [risk: P2]

### 3.5 SlotActionMenu

- **Modal centrado** — título "Este hueco" + etiqueta de contexto (`Lun 18 · 10:30 · Reni`). [unit: —] [e2e: —] [risk: P1]
- **Acción "Nueva cita"** — emit `{ type: 'new_booking', date, time, barberId }` → NewBookingPanel prefilled. [unit: —] [e2e: —] [risk: P1]
- **Acción "Descanso / bloquear hueco"** — emit `{ type: 'unavailability' }` → BlockModal. [unit: —] [e2e: —] [risk: P1]
- **Acción "Ausencia (día libre)"** — emit `{ type: 'absence' }` → AbsenceModal. [unit: —] [e2e: —] [risk: P1]
- **Botón "Cancelar"** — cierra el modal. [unit: —] [e2e: —] [risk: P2]

### 3.6 BarberActionMenu

- **Cabecera** — avatar monograma + nombre del barbero + "Acciones del barbero". [unit: —] [e2e: —] [risk: P2]
- **Resumen del día** — citas hechas/total + € facturado + "Próxima: HH:MM · nombre" (calculado sobre eventos ya en memoria, sin fetch). [unit: —] [e2e: —] [risk: P1]
- **Estado sin citas** — texto "Sin citas este día." [unit: —] [e2e: —] [risk: P2]
- **Acción "Editar horario"** — link a `/dashboard/equipo/turnos`. [unit: —] [e2e: —] [risk: P1]
- **Acción "Ausencia (día libre)"** — abre AbsenceModal del barbero (misma modal que Turnos). [unit: —] [e2e: —] [risk: P1]
- **Acción "Descanso / bloquear hueco"** — abre BlockModal. [unit: —] [e2e: —] [risk: P1]
- **onChanged callback** — tras guardar ausencia/bloqueo → revalida la agenda. [unit: —] [e2e: —] [risk: P1]
- **Botón "Cerrar"** — cierra el menú. [unit: —] [e2e: —] [risk: P2]

### 3.7 NewBookingPanel

_SlideOver "Nueva cita"_

- **CustomerTypeahead** — buscador typeahead de clientes existentes; al seleccionar → vincula y bloquea el teléfono. [unit: —] [e2e: —] [risk: P1]
- **Botón desvincular cliente** — desvincula y permite editar manualmente. [unit: —] [e2e: —] [risk: P1]
- **Campo teléfono** — libre si no hay cliente vinculado; bloqueado (read-only) si está vinculado. [unit: —] [e2e: —] [risk: P1]
- **ServiceLinePicker (servicio principal)** — selector de servicio + duración + precio. [unit: —] [e2e: —] [risk: P1]
- **Lista de servicios extra** — múltiples ServiceLinePicker adicionales (R7 multi-servicio). [unit: —] [e2e: —] [risk: P1]
- **Botón "+ Añadir otro servicio"** — agrega otro ServiceLinePicker a la lista. [unit: —] [e2e: —] [risk: P1]
- **Select barbero** — lista de barberos activos. [unit: —] [e2e: —] [risk: P1]
- **Campo fecha** — date picker, prefilled desde el slot clicado. [unit: —] [e2e: —] [risk: P1]
- **Campo hora** — time input, prefilled. [unit: —] [e2e: —] [risk: P1]
- **Total duración** — suma automática de duraciones (servicio principal + extras). [unit: src/lib/bookings/duration.test.ts] [e2e: —] [risk: P1]
- **Mensaje de error** — inline si faltan campos o la API rechaza. [unit: —] [e2e: —] [risk: P1]
- **Botón "Crear cita"** — submit, spinner, cierra el panel en éxito. [unit: —] [e2e: —] [risk: P1]

### 3.8 BookingDetailPanel

_SlideOver de detalle — la pieza más rica del dashboard_

#### Cabecera y metadata

- **Banner de estado full-width** — color por status: confirmada/completada/cancelada/no-show. [unit: —] [e2e: —] [risk: P1]
- **Nombre del cliente clickable** → abre ClientProfile en overlay (variant="panel"). [unit: —] [e2e: —] [risk: P1]
- **Botón copiar teléfono** — copia al portapapeles con feedback. [unit: —] [e2e: —] [risk: P2]
- **Label de fuente** — "Booksy" / "WhatsApp Bot" / "Dashboard" / "PWA". [unit: —] [e2e: —] [risk: P2]
- **Fecha y hora** — display de la cita. [unit: —] [e2e: —] [risk: P1]
- **Barbero asignado** — nombre. [unit: —] [e2e: —] [risk: P1]
- **Servicio + precio** — lista de servicios (principal + extras) con precios individuales. [unit: —] [e2e: —] [risk: P1]
- **PaymentBadge** — estado de pago: pagado (método) / pendiente. [unit: —] [e2e: —] [risk: P0]

#### Acciones sobre la cita

- **Marcar como completada** — flujo bifurcado:
  - Si SumUp conectado → SumupCheckoutPrompt.
  - Si no → PaymentMethodPrompt (Efectivo / Tarjeta / Bizum / Online / Gratis).
  - En éxito → UndoToast "Completada · Deshacer". [unit: —] [e2e: —] [risk: P0]
- **UndoToast Completada** — deshace el cambio via PATCH en X segundos. [unit: —] [e2e: —] [risk: P1]
- **Marcar como no-show** — confirm inline + UndoToast. [unit: —] [e2e: —] [risk: P1]
- **Cancelar cita** — ConfirmDialog "¿Cancelar esta cita?" → PATCH status. [unit: —] [e2e: —] [risk: P1]
- **Mover cita** — editor de fecha / hora / barberId; PATCH `/api/bookings/[id]/move`; error si solape. [unit: src/lib/unavailability.test.ts] [e2e: —] [risk: P1]
- **Editar servicio / precio (pre-completada)** — ServiceLinePicker libre; guarda vía PATCH. [unit: —] [e2e: —] [risk: P1]
- **Editar servicio / precio (post-completada)** — botón "Rectificar" → RectificativaModal. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Citas Booksy (canEditFreely=false)** — campos deshabilitados; icono Lock con tooltip "Cita importada de Booksy". [unit: —] [e2e: —] [risk: P2]

#### Venta de producto asociada

- **Botón "+ Vender producto"** — solo visible cuando `status='confirmed'`; abre AddProductSaleModal. [unit: —] [e2e: —] [risk: P1]
- **AddProductSaleModal** — GET `/api/products` → lista; selector producto + cantidad + método pago (Efectivo/Tarjeta/Online); POST `/api/products/sales` con bookingId + barberId + customerPhone auto-fill; estado confirmación. [unit: —] [e2e: —] [risk: P1]

#### Enlace de pago online

- **Botón "Generar enlace de pago"** — POST `/api/bookings/[id]/payment-link`; devuelve URL. [unit: —] [e2e: —] [risk: P0]
- **Botón "Copiar URL"** — copia la URL al portapapeles. [unit: —] [e2e: —] [risk: P1]
- **Botón "Copiar QR"** — copia/muestra el QR del enlace. [unit: —] [e2e: —] [risk: P1]
- **Polling 4s** — verifica si el cliente ha pagado (estado `paid`). [unit: —] [e2e: —] [risk: P0]

#### Reembolso

- **Botón "Reembolsar"** — solo visible si completada + pagado. [unit: —] [e2e: —] [risk: P0]
- **Paso de confirmación** — muestra importe + aviso "Esta acción es irreversible". [unit: —] [e2e: —] [risk: P0]
- **POST reembolso** — `reverse_transfer + app fee` (Stripe Connect) o SumUp; caja idempotente. [unit: —] [e2e: —] [risk: P0]

### 3.9 PromosFillModal (Llenar huecos)

- **Selector de ventana temporal** — 4 presets: Hoy / Mañana / Este finde / Próx. 7 días. [unit: —] [e2e: —] [risk: P1]
- **POST `/api/promos/preview`** — devuelve gaps + elegibles + mensaje plantilla. [unit: —] [e2e: —] [risk: P1]
- **Estado de carga** — Loader2 mientras hace preview. [unit: —] [e2e: —] [risk: P2]
- **Resumen de huecos** — count + total minutos formateado (h/m). [unit: —] [e2e: —] [risk: P1]
- **Slider de descuento** — stops fijos (`DISCOUNT_STOPS`, default `DEFAULT_DISCOUNT_PCT`). [unit: —] [e2e: —] [risk: P1]
- **Textarea de mensaje** — editable, prefilled con `defaultMessage`. [unit: —] [e2e: —] [risk: P1]
- **Lista de clientes elegibles** — checkbox por cliente (nombre + recentVisits + lastBookingAt); deseleccionar excluye al cliente del envío. [unit: —] [e2e: —] [risk: P1]
- **Botón "Confirmar envío"** — POST `/api/promos/send`; muestra resumen de enviados. [unit: —] [e2e: —] [risk: P1]
- **Estado resumen post-envío** — éxito / error por cliente con Check / AlertCircle. [unit: —] [e2e: —] [risk: P1]

### 3.10 Importar citas (ImportFlow)

_`src/app/dashboard/agenda/importar/`_

#### Paso "upload"

- **Drop zone** — arrastra imágenes; acepta `image/*`; límite 8 MB por imagen; hasta 10 imágenes. [unit: —] [e2e: —] [risk: P1]
- **Botón "Elegir archivos"** — file picker alternativo. [unit: —] [e2e: —] [risk: P1]
- **Error tamaño** — "Alguna imagen supera 8 MB — redúcela antes de subirla." [unit: —] [e2e: —] [risk: P1]
- **Vista previa de imágenes subidas** — thumbnails de las imágenes seleccionadas. [unit: —] [e2e: —] [risk: P2]
- **Botón "Extraer citas"** — llama a `/api/bookings/import-vision`, spinner Loader2. [unit: —] [e2e: —] [risk: P1]

#### Paso "review"

- **Tabla editable** — columnas: fecha / hora / nombre cliente / teléfono / servicio / barbero / duración (NumberInput) / precio / confianza. [unit: —] [e2e: —] [risk: P1]
- **Chip de confianza** — high / medium / low por fila extraída. [unit: —] [e2e: —] [risk: P2]
- **Botón papelera por fila** — elimina una cita antes de importar. [unit: —] [e2e: —] [risk: P1]
- **Botón "Confirmar importación"** — POST `/api/bookings/import`, spinner. [unit: —] [e2e: —] [risk: P1]

#### Paso "done"

- **Resumen de importación** — total / created / failed. [unit: —] [e2e: —] [risk: P1]
- **Log por fila** — created ✓ / skipped / failed con mensaje. [unit: —] [e2e: —] [risk: P1]
- **Botón "Volver a la agenda"** — link a `/dashboard/agenda`. [unit: —] [e2e: —] [risk: P2]

---

## 4. Ventas

_`src/app/dashboard/ventas/`_ — AreaShell con VentasHeaderAction (period selector).

### 4.1 TPV / POS (página índice)

_`PosTerminal.tsx`_

#### Rail de categorías

- **"Venta rápida"** — servicios favoritos del catálogo. [unit: —] [e2e: —] [risk: P1]
- **"Servicios"** — lista completa de servicios. [unit: —] [e2e: —] [risk: P1]
- **"Productos"** — productos de la tienda interna. [unit: —] [e2e: —] [risk: P1]
- **"Cantidad personalizada"** — importe libre. [unit: —] [e2e: —] [risk: P1]

#### Grid de artículos

- **Tile por artículo** — nombre + precio; click → añade al carrito. [unit: —] [e2e: —] [risk: P1]

#### Carrito

- **CustomerTypeahead** — asociar cliente opcional (para atribución). [unit: —] [e2e: —] [risk: P1]
- **CartLine** — nombre / cantidad / descuento (%) / precio unitario / tipo (`service|product|custom`). [unit: —] [e2e: —] [risk: P1]
- **Botón "Editar artículo"** — abre modal inline con campo descuento + precio. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P1]
- **TOTAL** — suma calculada. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **Botón "Cobrar"** — avanza a payment stage. [unit: —] [e2e: —] [risk: P1]

#### Fase de pago (PAYMENT_METHODS)

- **Efectivo** — cierra la venta como `cash`. [unit: —] [e2e: —] [risk: P0]
- **Tarjeta** — abre SumupCheckoutPrompt si SumUp conectado. [unit: —] [e2e: —] [risk: P0]
- **Bizum** — cierra como `bizum`. [unit: —] [e2e: —] [risk: P0]
- **Online** — genera enlace de pago Stripe. [unit: —] [e2e: —] [risk: P0]

#### Fase de recibo

- **`bookingId` para factura on-demand** — botón "Generar factura" si `invoicingEnabled`. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Estado "Venta completada"** — icono Check + resumen. [unit: —] [e2e: —] [risk: P1]
- **Botón "Nueva venta"** — resetea el carrito. [unit: —] [e2e: —] [risk: P1]

### 4.2 Transacciones

_`ventas/transacciones/page.tsx`_

- **DataTable columnas**: Fecha / Concepto (nombre + cliente) / Tipo (servicio/producto/propina) / Método / Factura / Importe. [unit: —] [e2e: —] [risk: P1]
- **InvoiceCell** — si `invoicingEnabled`: "Generar" (crea factura y recarga) o link "Ver" a `/facturas/[id]`. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Total sum** — suma de la columna Importe al pie. [unit: —] [e2e: —] [risk: P0]
- **Fuente de datos** — bookings `completed` + `product_sales` del periodo seleccionado, ordenados por fecha desc. [unit: —] [e2e: —] [risk: P1]

### 4.3 Caja

_`ventas/caja/page.tsx`_

#### Estado deshabilitado

- **Empty state** — texto "Habilita la caja en Ajustes" + link a `/dashboard/ajustes/pagos`. [unit: —] [e2e: —] [risk: P2]

#### Estado habilitado

- **CajaRollup** — totales del día por método: Efectivo / Tarjeta / Online. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **CajaRegisters (master-detail)** — lista de sesiones (cronológica, abierta arriba) + DataPanel de detalle. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]

#### Lista de sesiones (CajaRegisters izquierda)

- **Fila de sesión** — fecha + apertura € + total € + badge ABIERTO/CERRADO. [unit: —] [e2e: —] [risk: P1]
- **Sesión activa seleccionada** — resaltada por defecto. [unit: —] [e2e: —] [risk: P1]

#### DataPanel de sesión seleccionada (CajaRegisters derecha)

- **TOTAL grande** — importe total de la sesión. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **Estado badge** — ABIERTO / CERRADO. [unit: —] [e2e: —] [risk: P1]
- **Meta de apertura** — importe de apertura + fecha + quién abrió. [unit: —] [e2e: —] [risk: P1]
- **Tabs TRANSACCIONES / RESUMEN** — conmutan el contenido del panel. [unit: —] [e2e: —] [risk: P1]
- **Tab TRANSACCIONES** — tabla de movimientos con badge PAGADO, fecha, concepto, importe. [unit: —] [e2e: —] [risk: P1]
- **Tab RESUMEN** — desglose por método de pago + gastos/ingresos extra. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **Botón "Apunte"** — abre modal para registrar movimiento manual (entrada/salida + importe + concepto). [unit: —] [e2e: —] [risk: P1]
- **Modal Apunte** — tipo (entrada/salida) + importe + nota + guardar vía POST `/api/cash/movements`. [unit: —] [e2e: —] [risk: P0]
- **Botón "Cerrar caja"** — ConfirmDialog + POST `/api/cash/close` + polling GET `/api/cash/current` cada 15s. [unit: —] [e2e: —] [risk: P0]
- **Botón "Abrir caja"** — solo visible si no hay sesión abierta; modal con importe de apertura + POST `/api/cash/open`. [unit: —] [e2e: —] [risk: P0]
- **Botón "PDF"** — genera/descarga PDF de la sesión. [unit: —] [e2e: —] [risk: P2]
- **BarberBreakdown collapsible** — `<details>` dentro del resumen; se abre con `?breakdown=open`. [unit: —] [e2e: —] [risk: P1]

### 4.4 Resumen de ventas

_`ventas/resumen/page.tsx`_

- **StatStrip** — 4 KPIs: Facturado total / Servicios / Productos / Propinas (con trends vs periodo anterior). [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **BarberBreakdown** — desglose por barbero (visible si ≥2 barberos activos con ventas); columnas: Barbero / Facturado / Citas / Propinas / Nota media / TOP badge. [unit: —] [e2e: —] [risk: P1]
- **StatsPeriodTabs** — filtro de periodo (Hoy / 7d / 30d / Este mes / Personalizado). [unit: —] [e2e: —] [risk: P1]

### 4.5 Cobros online

_`ventas/cobros/page.tsx`_

- **OnlinePaymentsSummary** — total cobrado online + últimas N transacciones Stripe. [unit: —] [e2e: —] [risk: P0]
- **Link card a Ajustes/Pagos** — acceso rápido a configurar Stripe Connect. [unit: —] [e2e: —] [risk: P2]

### 4.6 Facturas (listado Ventas)

_`ventas/facturas/page.tsx`_

- **MonthSelect** — selector de mes. [unit: —] [e2e: —] [risk: P1]
- **TypeSelect** — filtro tipo: Todas / Factura / Ticket. [unit: —] [e2e: —] [risk: P1]
- **VoidedToggle** — mostrar/ocultar anuladas. [unit: —] [e2e: —] [risk: P1]
- **StatStrip** — Total facturado / IVA / Nº documentos. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Banner error VeriFactu** — visible si hay envíos fallidos; permite filtrar por estado error. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Botón "Exportar Libro (PDF)"** — descarga libro de registro. [unit: —] [e2e: —] [risk: P0]
- **Botón "Exportar Excel"** — descarga XLSX. [unit: —] [e2e: —] [risk: P0]
- **Botón "Exportar CSV"** — descarga CSV. [unit: —] [e2e: —] [risk: P0]
- **Botón "Nueva factura"** — link a `/dashboard/facturas/nueva`. [unit: —] [e2e: —] [risk: P1]
- **VerifactuHelpPanel** — panel colapsable con explicación VeriFactu. [unit: —] [e2e: —] [risk: P2]
- **DataTable** — Fecha / Número / Cliente / Tipo / VerifactuBadge / Estado / Importe / link "Ver". [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **VerifactuBadge** — estado del envío AEAT: pending/sent/accepted/rejected/error. [unit: src/lib/verifactu/hash.test.ts] [e2e: —] [risk: P0]
- **Empty state genérico** — "No hay facturas para este periodo". [unit: —] [e2e: —] [risk: P2]
- **Empty state por filtro tipo** — "No hay tickets/facturas" según TypeSelect. [unit: —] [e2e: —] [risk: P2]

### 4.7 Propinas

_`ventas/propinas/page.tsx`_

- **TipsSettings** — toggle habilitar propinas; solo activo si `connectActive` (Stripe Connect); importes sugeridos editables. [unit: —] [e2e: —] [risk: P0]
- **Aviso "Se requiere Stripe Connect"** — si `!connectActive`, CTA a Ajustes/Pagos. [unit: —] [e2e: —] [risk: P1]
- **TipsList** — tabla de propinas con selector de asignación a barbero por fila. [unit: —] [e2e: —] [risk: P1]
- **Selector de barbero por propina** — dropdown para reasignar si la propina llegó sin barbero claro. [unit: —] [e2e: —] [risk: P1]

### 4.8 Productos (Tienda interna)

_`ventas/productos/page.tsx`_ — ProductsManager

- **Tabla de productos** — nombre / imagen / precio / stock. [unit: —] [e2e: —] [risk: P1]
- **Botón "+ Nuevo producto"** — abre modal de creación. [unit: —] [e2e: —] [risk: P1]
- **Modal de creación/edición** — nombre + imageUrl + priceCents + stockQuantity (null = sin control de stock). [unit: —] [e2e: —] [risk: P1]
- **Botón "Guardar"** — POST o PATCH `/api/products`. [unit: —] [e2e: —] [risk: P1]
- **Botón "Eliminar"** — ConfirmDialog + DELETE. [unit: —] [e2e: —] [risk: P1]
- **Estado sin productos** — "Todavía no tienes productos." [unit: —] [e2e: —] [risk: P2]

---

## 5. Facturas (ruta canónica)

_`src/app/dashboard/facturas/`_

### 5.1 Listado

_`facturas/page.tsx`_ — replica la lógica de `ventas/facturas` con FiltersBar.

- **FiltersBar** — MonthSelect + TypeSelect + VoidedToggle, misma lógica. [unit: —] [e2e: —] [risk: P1]
- **StatStrip** — Total / IVA / N documentos. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Banner VeriFactu error** — idem. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Botones exportar PDF / Excel / CSV** — idem. [unit: —] [e2e: —] [risk: P0]
- **Botón "Nueva factura"** — link a `/dashboard/facturas/nueva`. [unit: —] [e2e: —] [risk: P1]
- **VerifactuHelpPanel** — colapsable con info AEAT. [unit: —] [e2e: —] [risk: P2]
- **DataTable** — Fecha / Número / Cliente / Tipo / VerifactuBadge / Estado / Importe / link "Ver". [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Empty states** — por periodo / por filtro. [unit: —] [e2e: —] [risk: P2]

### 5.2 Detalle de factura

_`facturas/[id]/page.tsx`_

- **Cabecera** — número de factura + tipo (Factura / Ticket simplificado). [unit: —] [e2e: —] [risk: P0]
- **Banner "ANULADA"** — visible si `status='voided'`, en danger. [unit: —] [e2e: —] [risk: P0]
- **Datos emisor** — fiscalName + NIF + dirección del local. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Datos receptor** — nombre + NIF del cliente (si factura completa). [unit: —] [e2e: —] [risk: P0]
- **Líneas de factura** — concepto / cantidad / precio unitario / IVA / total por línea. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Base imponible / IVA / Total** — tabla resumen. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **QR VeriFactu** — solo si `verifactu_status='accepted'` o `'accepted_with_errors'`; `QrBlock` + URL AEAT. [unit: src/lib/verifactu/qr.test.ts] [e2e: —] [risk: P0]
- **VerifactuTimeline** — historial de estados del envío AEAT. [unit: —] [e2e: —] [risk: P0]
- **Botón "Imprimir / PDF"** — `PrintButton` llama `window.print()`; @print CSS oculta nav y acciones. [unit: —] [e2e: —] [risk: P1]
- **Botón "Rectificar"** — `RectificativaButton` → abre `RectificativaModal`. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **RectificativaModal** — motivo de rectificación + nuevo precio; crea factura rectificativa y anula la original. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Link "← Facturas"** — volver al listado. [unit: —] [e2e: —] [risk: P2]

### 5.3 Factura nueva (manual)

_`facturas/nueva/page.tsx` + `ManualInvoiceForm.tsx`_

- **Campo NIF del receptor** — libre; si se rellena → tipo "Factura completa", si vacío → "Ticket simplificado". [unit: src/lib/verifactu/xml.test.ts] [e2e: —] [risk: P0]
- **Hint de tipo live** — "Factura completa" vs "Ticket simplificado" según NIF. [unit: —] [e2e: —] [risk: P0]
- **Aviso tope ticket** — si total > 400 € y sin NIF, aviso inline (RD 1619/2012 art. 4). [unit: —] [e2e: —] [risk: P0]
- **Campo fecha** — date, default hoy. [unit: —] [e2e: —] [risk: P1]
- **Selector de servicio** — sugerencias del catálogo del local. [unit: —] [e2e: —] [risk: P1]
- **Selector de barbero** — sugerencias del equipo. [unit: —] [e2e: —] [risk: P1]
- **Campo precio** — número en €, base de cálculo IVA. [unit: —] [e2e: —] [risk: P0]
- **IVA derivado** — calculado sobre `ivaRate` del cliente. [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Botón "Emitir factura"** — POST `/api/invoices`; redirect a detalle de la factura creada. [unit: —] [e2e: —] [risk: P0]
- **Error de validación** — inline si faltan campos o NIF inválido. [unit: —] [e2e: —] [risk: P1]

---

## 6. Finanzas (P&L)

_`src/app/dashboard/finanzas/`_ — antiguo módulo, ahora accesible desde Informes > Panel vía PanelSwitch.

### FinanzasClient

- **MonthStepper** — prev/next mes con `prevMonth` / `nextMonth` helpers compartidos. [unit: src/lib/dashboard/period.test.ts] [e2e: —] [risk: P1]
- **Estado de carga** — Skeleton animado (hero + 2×2 grid + action row + collapsibles). [unit: —] [e2e: —] [risk: P2]

#### Hero block (resumen del mes)

- **Ingresos totales** — `ingresosCents` (servicios + productos + propinas + manuales). [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Tendencia vs año anterior** — `trendPct(ingresos, prevYearIngresos)`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Sparkline de ingresos** — 12 puntos de historia mensual. [unit: —] [e2e: —] [risk: P2]
- **IVA countdown** — próximo vencimiento trimestral (20 abr / jul / oct / ene) con días restantes. [unit: —] [e2e: —] [risk: P0]

#### KPI 2×2 grid

- **Gastos variables** — `gastosVariablesCents`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Costos fijos** — `costosFijosCents`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Nóminas** — `nominasCents` (coste del equipo auto-calculado). [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Beneficio real** — `beneficioRealCents` (bruto − retiros). [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]

#### Fila de acciones rápidas

- **"Ver nóminas"** — link a `/dashboard/informes/nominas`. [unit: —] [e2e: —] [risk: P1]
- **"Ver facturas"** — link a `/dashboard/facturas`. [unit: —] [e2e: —] [risk: P1]
- **"Imprimir P&L"** — `window.print()`. [unit: —] [e2e: —] [risk: P2]

#### Colapsibles de detalle

- **IVA repercutido / soportado / a pagar** — `computeIvaBreakdown`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **IRPF estimado** — `irpfEstimadoCents`. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Desglose ingresos** — servicios / productos / propinas / manuales. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Gastos variables** — lista de `expenses` con categoría + nota + importe; botón "+ Añadir gasto". [unit: —] [e2e: —] [risk: P0]
- **Modal añadir gasto** — fecha + categoría + importe (€) + nota; POST `/api/finanzas/expenses`. [unit: —] [e2e: —] [risk: P0]
- **Botón eliminar gasto** — ConfirmDialog + DELETE. [unit: —] [e2e: —] [risk: P0]
- **Costos fijos** — lista de `fixedCosts` (nombre + categoría + importe + `activeFrom` + toggle active); botón "+ Añadir coste fijo". [unit: —] [e2e: —] [risk: P0]
- **Modal añadir coste fijo** — nombre + categoría + importe + activeFrom; POST `/api/finanzas/fixed-costs`. [unit: —] [e2e: —] [risk: P0]
- **Toggle activo coste fijo** — PATCH `/api/finanzas/fixed-costs/[id]`. [unit: —] [e2e: —] [risk: P0]
- **Retiros** — lista + botón "+ Retirada"; modal con fecha + importe; POST `/api/finanzas/withdrawals`. [unit: —] [e2e: —] [risk: P0]
- **Ingresos manuales** — lista + botón "+ Ingreso manual"; modal con fecha + importe + nota; POST `/api/finanzas/manual-incomes`. [unit: —] [e2e: —] [risk: P0]

### Payroll (`finanzas/Payroll.tsx`)

- **SWR fetch** — GET `/api/finanzas/payroll?month=YYYY-MM`. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Fila por barbero** — colapsable: nombre + total nómina; al expandir: desglose línea a línea (servicios base + comisión + productos + propinas + bonos). [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Total del equipo** — suma de todas las nóminas al pie. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Estado sin nóminas** — "Sin actividad este mes". [unit: —] [e2e: —] [risk: P2]
- **Pro-gate** — UpgradeRequired si no `payrollEnabled`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]

---

## 7. Clientes

_`src/app/dashboard/clientes/`_

### 7.1 Lista de clientes

_`clientes/page.tsx`_

- **SearchAndSort** — buscador por nombre/teléfono + selector de orden (Más visitados / Más gasta / Último / Nombre). [unit: —] [e2e: —] [risk: P1]
- **Filter pills** — Todos / Inactivos (≥45d) / No-shows / Bloqueados; muestra count por pill. [unit: —] [e2e: —] [risk: P1]
- **Banner inactivos** — "N clientes no vuelven desde hace +45 días · Envíales un WhatsApp". [unit: —] [e2e: —] [risk: P1]
- **Tabla de clientes** — columnas: Cliente (avatar + nombre + tel) / Visitas / Gastado (€) / Última visita / Nota (estrella media) / Estado / Acciones. [unit: —] [e2e: —] [risk: P1]
- **StatusChip** — habitual / inactivo / nuevo / en riesgo / bloqueado. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **CustomerContactActions** — botón WhatsApp directo (enlace `wa.me`). [unit: —] [e2e: —] [risk: P1]
- **UnblockCustomerButton** — botón desbloquear; visible solo si `status='blocked'`; POST `/api/customers/[id]/unblock`. [unit: —] [e2e: —] [risk: P1]
- **ForgiveNoShowsButton** — botón perdonar no-shows; actualiza contador. [unit: —] [e2e: —] [risk: P1]
- **Link a ficha** — click en nombre → `/dashboard/clientes/[id]`. [unit: —] [e2e: —] [risk: P1]
- **Empty state Todos** — "Todavía no tienes clientes". [unit: —] [e2e: —] [risk: P2]
- **Empty state filtro** — "No hay clientes inactivos/no-shows/bloqueados". [unit: —] [e2e: —] [risk: P2]

### 7.2 Ficha de cliente (ClientProfile)

_`clientes/[id]/page.tsx` + `ClientProfile.tsx`_

#### variant="page" — ruta directa

- **Link "← Todos los clientes"** — back nav. [unit: —] [e2e: —] [risk: P2]

#### Cabecera (ambas variants)

- **Avatar** — iniciales en fondo de color. [unit: —] [e2e: —] [risk: P2]
- **Nombre** — display prominente. [unit: —] [e2e: —] [risk: P1]
- **Teléfono** — con `SourceChip` de origen. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]

#### Fila contadores (exacta Booksy)

- **TOTAL** — total de citas (todas). [unit: —] [e2e: —] [risk: P1]
- **COMPLETADAS** — citas completadas. [unit: —] [e2e: —] [risk: P1]
- **CANCELADAS** — citas canceladas. [unit: —] [e2e: —] [risk: P1]
- **INASISTENCIAS** — no-shows. [unit: —] [e2e: —] [risk: P1]

#### KPIs de valor

- **Gastado (€)** — suma de bookings completadas (price × 1, en euros). [unit: —] [e2e: —] [risk: P0]
- **Nota media** — promedio de ratings. [unit: —] [e2e: —] [risk: P1]

#### Tabs

##### CITAS

- **Sub-tab "Próximas (N)"** — citas `confirmed` con `date >= hoy`, orden ascendente. [unit: —] [e2e: —] [risk: P1]
- **Sub-tab "Pasadas (N)"** — resto de citas. [unit: —] [e2e: —] [risk: P1]
- **Fila de cita** — bloque fecha + servicio + precio + botón "Reagendar" (link a la agenda con prefill). [unit: —] [e2e: —] [risk: P1]
- **Estado sin citas** — "No hay citas próximas/pasadas". [unit: —] [e2e: —] [risk: P2]

##### FIDELIDAD

- **Saldo de sellos/puntos** — `loyaltyBalance` + `loyaltyMode` (sellos/puntos). [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Historial de movimientos de fidelidad** — lista cronológica de stamps/points ganados/canjeados. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

##### INFORMACIÓN DEL CLIENTE

- **Teléfono** — display con `mailto:`-style. [unit: —] [e2e: —] [risk: P1]
- **Email** — CustomerEmailEditor (inline edición). [unit: —] [e2e: —] [risk: P1]
- **CustomerEmailEditor — modo vista** — muestra email o placeholder "Sin email"; botón lápiz activa edición. [unit: —] [e2e: —] [risk: P1]
- **CustomerEmailEditor — modo edición** — input + Guardar / Cancelar; vacío → borra (NULL); PATCH `/api/customers/[id]/email`. [unit: —] [e2e: —] [risk: P1]
- **CustomerEmailEditor — error** — inline si email inválido. [unit: —] [e2e: —] [risk: P1]
- **Origen** — SourceChip (WhatsApp / PWA / Dashboard / Bot…). [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P2]
- **Notas privadas (CustomerNotesEditor) — modo vista** — muestra notas o placeholder; botón lápiz activa edición. [unit: —] [e2e: —] [risk: P1]
- **CustomerNotesEditor — modo edición** — textarea (max 2000 chars) + Guardar / Cancelar; PATCH `/api/customers/[id]/notes`. [unit: —] [e2e: —] [risk: P1]
- **CustomerNotesEditor — error** — inline si falla el PATCH. [unit: —] [e2e: —] [risk: P1]

#### variant="panel" — overlay desde BookingDetailPanel

- **Mismo ClientProfile** — `variant="panel"`, layout centrado compacto. [unit: —] [e2e: —] [risk: P1]
- **Todos los tabs y acciones** — idénticos a variant="page". [unit: —] [e2e: —] [risk: P1]

### 7.3 Atribución de fuente

_`clientes/atribucion/page.tsx`_

- **SourceBreakdown** — últimos 30 días: nuevos clientes agrupados por `first_source`. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **Barras por fuente** — WhatsApp Bot / PWA / Booksy / Dashboard / Desconocido; % del total. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **Ventana de atribución** — `PROMO_ATTRIB_DAYS = 7` (primero 7 días). [unit: —] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin nuevos clientes en los últimos 30 días". [unit: —] [e2e: —] [risk: P2]

---

## 8. Equipo

_`src/app/dashboard/equipo/`_ — AreaShell. Layout con StatsPeriodTabs en algunas sub-páginas.

### 8.1 Empleados (BarbersManager)

_`equipo/page.tsx`_

#### Lista de barberos (izquierda)

- **Búsqueda** — filtrado instantáneo por nombre. [unit: —] [e2e: —] [risk: P1]
- **Fila de barbero** — handle de arrastre (GripVertical) + avatar (foto o monograma) + nombre + rol + badge activo/inactivo. [unit: —] [e2e: —] [risk: P1]
- **Fila seleccionada** — highlight, abre detalle a la derecha. [unit: —] [e2e: —] [risk: P1]
- **Drag reorder** — reordena `displayOrder` vía PATCH `/api/barbers/[id]`. [unit: —] [e2e: —] [risk: P1]
- **Flechas ↑↓ teclado** — accesibilidad para reorden sin drag. [unit: —] [e2e: —] [risk: P2]
- **Botón "+ Añadir"** — abre modal de creación. [unit: —] [e2e: —] [risk: P1]

#### Modal creación de barbero

- **Campo nombre** — requerido. [unit: —] [e2e: —] [risk: P1]
- **Campo rol** — libre (e.g. "Barbero senior"). [unit: —] [e2e: —] [risk: P2]
- **Toggle online bookable** — aparece en la PWA para elección de cliente. [unit: —] [e2e: —] [risk: P1]
- **Botón "Crear"** — POST `/api/barbers`; refresca la lista. [unit: —] [e2e: —] [risk: P1]

#### Panel de detalle (derecha)

- **Foto del barbero** — upload via Vercel Blob (`@vercel/blob/client`); Preview + botón "Cambiar foto". [unit: —] [e2e: —] [risk: P1]
- **Botón "Cambiar foto"** — file picker → upload → PATCH `/api/barbers/[id]` con `photoUrl`. [unit: —] [e2e: —] [risk: P1]
- **Nombre editable** — inline edit + guardar PATCH. [unit: —] [e2e: —] [risk: P1]
- **Rol editable** — inline edit + guardar PATCH. [unit: —] [e2e: —] [risk: P2]
- **Toggle "Activo"** — PATCH `active`; inactivos no aparecen en agenda. [unit: —] [e2e: —] [risk: P1]
- **Toggle "Reservas online"** — PATCH `onlineBookable`. [unit: —] [e2e: —] [risk: P1]
- **Nivel de permiso** — radio empleado / admin; PATCH `permissionLevel`. [unit: —] [e2e: —] [risk: P1]
- **Bio** — textarea + guardar PATCH. [unit: —] [e2e: —] [risk: P2]
- **HoursEditor (horario propio)** — si el barbero tiene horario distinto al local; usa mismo componente que NegocioForm. [unit: —] [e2e: —] [risk: P1]
- **Horario heredado del local** — texto "Mismo horario que el local" + botón "Personalizar". [unit: —] [e2e: —] [risk: P1]
- **Días bloqueados del barbero** — lista + "+ Añadir fecha". [unit: —] [e2e: —] [risk: P1]
- **BarberSalaryEditor** — perfil de pago: tipo (fijo / mixto / autónomo) + salarioBase / comisionServices% / comisionProducts% / chairRent; Pro-gated. [unit: src/lib/payroll/services-commission.test.ts] [e2e: —] [risk: P0]
- **Botón "Eliminar barbero"** — ConfirmDialog + DELETE; si tiene citas futuras → ReassignModal (reassign a otro barbero). [unit: —] [e2e: —] [risk: P1]

#### ReassignModal

- **Select barbero destino** — para reasignar citas futuras del barbero eliminado. [unit: —] [e2e: —] [risk: P1]
- **Botón "Eliminar y reasignar"** — DELETE `/api/barbers/[id]` con `reassignTo`. [unit: —] [e2e: —] [risk: P1]

#### BarberBreakdown (Equipo)

- **Colapsible `<details>`** — abierto con `?breakdown=open`. [unit: —] [e2e: —] [risk: P1]
- **StatsPeriodTabs** — filtro periodo. [unit: —] [e2e: —] [risk: P1]
- **Tabla BarberBreakdown** — columnas: Barbero / Facturado / Citas completadas / Propinas / Nota media / TOP badge. [unit: —] [e2e: —] [risk: P1]

### 8.2 Turnos (TurnosManager)

_`equipo/turnos/page.tsx`_

#### Toolbar

- **Toggle vista Día / Semana** — conmuta entre las dos vistas de TurnosManager. [unit: —] [e2e: —] [risk: P1]
- **Selector de fecha / semana** — navega el periodo. [unit: —] [e2e: —] [risk: P1]

#### Vista Día

- **Fila por barbero** — eje X = horas; bloque verde = ventana abierta (desde `hours` propio o heredado del local); inset gris "Descanso" por `barber_breaks`; banda danger = `barber_block` de esa fecha. [unit: src/lib/unavailability.test.ts] [e2e: —] [risk: P1]
- **Click en fila** → chooser: Editar horario / Día libre / Ausencia / Descanso / bloquear. [unit: —] [e2e: —] [risk: P1]

#### Vista Semana

- **Grid barbero × 7 días** — celda = ventana del día + cómputo de horas. [unit: —] [e2e: —] [risk: P1]
- **Botón "Copiar"** — copia el `hours` semanal de un barbero a otros; PATCH `/api/barbers/[id]`. [unit: —] [e2e: —] [risk: P1]

#### ScheduleEditorModal ("Editar · Horario de trabajo")

- **Toggle por día** — on/off; off → "Cerrado". [unit: —] [e2e: —] [risk: P1]
- **Inicio / Fin por día activo** — inputs HH:MM con validación `HHMM_RE`. [unit: —] [e2e: —] [risk: P1]
- **"+ Añadir descanso"** — fila indentada con Inicio/Fin + papelera. [unit: —] [e2e: —] [risk: P1]
- **Selector "Periodo de tiempo"** — Inmediatamente / Semana que viene / A partir del día; solo "Inmediatamente" activo (las otras deshabilitadas con motivo: schema sin fecha-efectiva). [unit: —] [e2e: —] [risk: P1]
- **Guardar** — PATCH `/api/barbers/[id]` (hours) + PUT `/api/barbers/[id]/breaks` (breaks); error si breaks falla sin cerrar. [unit: —] [e2e: —] [risk: P1]
- **Error** — inline. [unit: —] [e2e: —] [risk: P1]

#### BlockModal ("Descanso / bloquear hueco")

- **Campo fecha** — date input, default = día visible. [unit: —] [e2e: —] [risk: P1]
- **Campo inicio HH:MM** — validado con `HHMM_RE`. [unit: —] [e2e: —] [risk: P1]
- **Campo fin HH:MM** — validado + `fin > inicio`. [unit: —] [e2e: —] [risk: P1]
- **Campo nota** — texto libre. [unit: —] [e2e: —] [risk: P2]
- **Botón "Guardar"** — POST `/api/barbers/[id]/blocks` kind:'block'; `onSaved` → `router.refresh()`. [unit: —] [e2e: —] [risk: P1]
- **Error** — inline. [unit: —] [e2e: —] [risk: P1]

#### AbsenceModal ("Día libre · barbero")

- **Toggle "Todo el día"** — on → sin franjas; off → campos inicio/fin. [unit: —] [e2e: —] [risk: P1]
- **Campo fecha** — date input. [unit: —] [e2e: —] [risk: P1]
- **Campos inicio/fin** — visibles solo si `!allDay`; HH:MM validado. [unit: —] [e2e: —] [risk: P1]
- **Select motivo** — catálogo cerrado: Día personal / Enfermedad / Vacaciones / Formación. [unit: —] [e2e: —] [risk: P1]
- **Campo nota** — texto libre. [unit: —] [e2e: —] [risk: P2]
- **Toggle "Aprobado"** — default true; PATCH columna `approved`. [unit: —] [e2e: —] [risk: P1]
- **"Repetir"** — control visible pero deshabilitado (schema sin recurrencia); tooltip explica el scope. [unit: —] [e2e: —] [risk: P2]
- **Botón "Guardar"** — POST `/api/barbers/[id]/blocks` kind:'absence'; `onSaved` → `router.refresh()`. [unit: —] [e2e: —] [risk: P1]
- **Error** — inline. [unit: —] [e2e: —] [risk: P1]

### 8.3 Comisiones

_`equipo/comisiones/page.tsx`_ — ComisionesClient view="comisiones"

- **Pro-gate** — UpgradeRequired si `!enabled`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]

#### Comisión por servicio (R8)

- **Select barbero** — filtra la tabla de overrides. [unit: —] [e2e: —] [risk: P1]
- **Tabla override** — servicio / % comisión vs. global; inline edit por celda; PUT `/api/barbers/[id]/commissions`. [unit: src/lib/payroll/services-commission.test.ts] [e2e: —] [risk: P0]
- **% global fallback** — si no hay override, usa `commissionServicesPct` del barbero. [unit: src/lib/payroll/services-commission.test.ts] [e2e: —] [risk: P0]

#### Tipos de bono (R9)

- **BonusesManager** — reutilizado de `_components/BonusesManager.tsx`: listado + "+ Añadir tipo de bono". [unit: src/lib/bonuses/progress.test.ts] [e2e: —] [risk: P1]
- **Modal nuevo bono** — nombre + tipo (meta/tramo) + umbrales + importe; POST `/api/bonuses`. [unit: src/lib/bonuses/progress.test.ts] [e2e: —] [risk: P1]
- **Eliminar bono** — ConfirmDialog + DELETE. [unit: —] [e2e: —] [risk: P1]

### 8.4 Bonos

_`equipo/bonos/page.tsx`_ — Pro-gated

- **BonusesManager** — catálogo de tipos de bono (CRUD). [unit: src/lib/bonuses/progress.test.ts] [e2e: —] [risk: P1]
- **BonusTracker** — progreso mensual de cada barbero hacia sus bonos; barras de progreso + importe acumulado. [unit: src/lib/bonuses/progress.test.ts] [e2e: —] [risk: P1]

### 8.5 Competición

_`equipo/competicion/page.tsx`_ — ComisionesClient view="competicion"

- **Pro-gate** — UpgradeRequired si `!enabled`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]

#### Competición semanal (R10)

- **Lista de competiciones** — CRUD: nombre + tipo (por citas/por facturación) + premio fijo + bono de racha; SWR GET `/api/competitions`. [unit: src/lib/competitions/leaderboard.test.ts] [e2e: —] [risk: P1]
- **Botón "+ Nueva competición"** — abre modal. [unit: —] [e2e: —] [risk: P1]
- **Modal nueva competición** — nombre + tipo + prize (€) + streak bonus (€). [unit: src/lib/competitions/leaderboard.test.ts] [e2e: —] [risk: P1]
- **Eliminar competición** — ConfirmDialog + DELETE. [unit: —] [e2e: —] [risk: P1]
- **Leaderboard congelado** — ranking semanal cerrado; posición + nombre + métrica + racha actual. [unit: src/lib/competitions/leaderboard.test.ts] [e2e: —] [risk: P1]
- **Estado sin competiciones** — "Crea tu primera competición". [unit: —] [e2e: —] [risk: P2]

---

## 9. Informes

_`src/app/dashboard/informes/`_

### 9.1 Panel (OperatorPanel + FinanzasClient)

_`informes/page.tsx`_

#### PanelSwitch

- **Conmutador OperatorPanel / P&L** — botón toggle que alterna entre las dos vistas. [unit: —] [e2e: —] [risk: P1]

#### OperatorPanel

- **StatStrip de ingresos** — Facturado / Servicios / Productos / Propinas del mes; trends vs mes anterior. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Sparkline de ingresos** — 12 meses de historia. [unit: —] [e2e: —] [risk: P2]
- **Citas por estado** — completed / confirmed / no_show / cancelled con dot color + count + %. [unit: —] [e2e: —] [risk: P1]
- **Clientes nuevos vs habituales** — count + % retención. [unit: —] [e2e: —] [risk: P1]
- **Nota media** — promedio de ratings del mes. [unit: —] [e2e: —] [risk: P1]
- **Estado sin actividad** — "Sin actividad en este periodo." [unit: —] [e2e: —] [risk: P2]

#### FinanzasClient (P&L completo)

- Ver [Sección 6](#6-finanzas-pl) — mismo componente, mismo contenido. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]

### 9.2 Ingresos

_`informes/ingresos/page.tsx`_ — ReportLayout con INGRESOS_RAIL.

- **"Ingreso por tipo"** — barras: servicios / productos / propinas (cents); selección de barra filtra la tabla. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **"Ventas por servicio top 10"** — DataTable: Servicio / N ventas / Importe total; orden desc por importe. [unit: —] [e2e: —] [risk: P1]
- **"Ventas por producto"** — DataTable: Producto / N ventas / Importe total. [unit: —] [e2e: —] [risk: P1]
- **BarberBreakdown** — desglose por barbero (si ≥2 con ventas). [unit: —] [e2e: —] [risk: P1]
- **"Evolución mensual"** — bar chart de ingresos últimos 12 meses. [unit: src/lib/dashboard/period.test.ts] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin ingresos en el periodo". [unit: —] [e2e: —] [risk: P2]

### 9.3 Citas

_`informes/citas/page.tsx`_ — ReportLayout con CITAS_RAIL.

- **StatStrip** — Total citas / Tasa no-show (%) / Tasa cancelación (%) / Perdido estimado (€). [unit: —] [e2e: —] [risk: P1]
- **Breakdown por estado** — completed / confirmed / no_show / cancelled con counts y %. [unit: —] [e2e: —] [risk: P1]
- **"Clientes con más no-shows"** — DataTable lifetime top 10 por count. [unit: —] [e2e: —] [risk: P1]
- **"Evolución mensual completadas"** — bar chart últimas 12 meses. [unit: src/lib/dashboard/period.test.ts] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin citas en el periodo". [unit: —] [e2e: —] [risk: P2]

### 9.4 Clientes (informe)

_`informes/clientes/page.tsx`_ — ReportLayout con CLIENTES_RAIL.

- **StatStrip** — Total clientes / Nuevos (30d) / Retención (%) / En riesgo (count). [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **SourceBreakdown** — últimos 30d: nuevos por fuente. [unit: src/lib/attribution/derive-source.test.ts] [e2e: —] [risk: P1]
- **"Mejores clientes"** — DataTable top 10 por € gastado. [unit: —] [e2e: —] [risk: P1]
- **"En riesgo"** — DataTable: ≥2 citas, ≥45d sin volver (`RISK_DAYS=45`). [unit: —] [e2e: —] [risk: P1]
- **"Nuevos vs habituales"** — barra de retención: 2ª cita ≤60d. [unit: —] [e2e: —] [risk: P1]
- **`HABITUAL_DAYS=30`** — umbral habitual. [unit: —] [e2e: —] [risk: P1]
- **`INACTIVO_DAYS=90`** — umbral inactivo. [unit: —] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin clientes en el periodo". [unit: —] [e2e: —] [risk: P2]

### 9.5 Marketing (informe)

_`informes/marketing/page.tsx`_ — ReportLayout con MARKETING_RAIL.

- **StatStrip** — Promos enviadas / Trajeron reserva (%) / Reseñas totales / Nota media. [unit: —] [e2e: —] [risk: P1]
- **Distribución de reseñas** — barras 1–5 estrellas con count + %. [unit: —] [e2e: —] [risk: P1]
- **"¿Funcionan las promos?"** — barra de conversión %: clientes que recibieron promo y reservaron. [unit: —] [e2e: —] [risk: P1]
- **Log de promos** — DataTable: Fecha / Tipo promo / Enviadas / Convirtieron / Conversión %. [unit: —] [e2e: —] [risk: P1]
- **"Lo que dicen tus clientes"** — cards de reviews con estrellas + nombre + fecha + canal (WhatsApp/Google) + comentario. [unit: —] [e2e: —] [risk: P1]
- **Estado sin datos** — "Sin actividad de marketing en el periodo". [unit: —] [e2e: —] [risk: P2]

### 9.6 Nóminas

_`informes/nominas/page.tsx`_

- **Pro-gate** — UpgradeRequired si `!payrollEnabled`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **Estado bloqueado** — "Activa el plan Pro para ver nóminas detalladas". [unit: —] [e2e: —] [risk: P2]
- **PayrollMonthView** — MonthStepper (prev/next mes) + Payroll SWR. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **MonthStepper** — etiqueta "mayo de 2026" + botones prev/next. [unit: src/lib/dashboard/period.test.ts] [e2e: —] [risk: P1]
- **Payroll expandible por barbero** — collapse/expand; desglose línea a línea. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]
- **Total del equipo** — pie de tabla. [unit: src/lib/payroll/compute.test.ts] [e2e: —] [risk: P0]

---

## 10. Marketing

_`src/app/dashboard/marketing/`_

### 10.1 Fidelidad

_`marketing/page.tsx`_ — Pro-gated `loyaltyAdvanced`

#### LoyaltySettings

- **Toggle activar fidelidad** — habilita el módulo. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Radio modo** — Sellos / Puntos. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]

##### Configuración modo Sellos

- **Sellos por visita** — número de sellos que se dan por cita. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Sellos para recompensa** — umbral de canje. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Descripción de la recompensa** — texto libre (e.g. "Corte gratis"). [unit: —] [e2e: —] [risk: P2]

##### Configuración modo Puntos

- **Puntos por € gastado** — ratio. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Puntos para recompensa** — umbral de canje. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Descripción de la recompensa** — texto libre. [unit: —] [e2e: —] [risk: P2]

- **Botón "Guardar configuración"** — PATCH `/api/loyalty/settings`. [unit: —] [e2e: —] [risk: P1]

#### LoyaltyCustomerLookup

- **Buscador de cliente** — typeahead por nombre/teléfono. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Saldo actual** — sellos/puntos del cliente seleccionado. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Campo "Ajuste de saldo"** — NumberInput para añadir/quitar manualmente. [unit: src/lib/loyalty/compute.test.ts] [e2e: —] [risk: P1]
- **Botón "Aplicar ajuste"** — POST `/api/loyalty/adjust`. [unit: —] [e2e: —] [risk: P1]
- **Botón "Canjear recompensa"** — marca la recompensa como canjeada. [unit: —] [e2e: —] [risk: P1]

### 10.2 Promos

_`marketing/promos/page.tsx`_

- **Pro-gate** — UpgradeRequired si `!promosContextuales`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **PromosToggle** — habilitar/deshabilitar promos contextuales (envía push o WhatsApp). [unit: —] [e2e: —] [risk: P1]
- **Card "Reactivar inactivos"** — "Próximamente" badge. [unit: —] [e2e: —] [risk: P2]
- **Card "Felicitar cumpleaños"** — "Próximamente" badge. [unit: —] [e2e: —] [risk: P2]
- **Card "Analytics avanzados"** — "Próximamente" badge. [unit: —] [e2e: —] [risk: P2]

### 10.3 WhatsApp Bot

_`marketing/whatsapp/page.tsx`_

- **Campo nombre del bot** — `name`, max 40 chars. [unit: —] [e2e: —] [risk: P1]
- **Radio tono** — Cercano / Neutro / Formal. [unit: —] [e2e: —] [risk: P1]
- **Textarea mensaje de bienvenida** — mensaje que envía el bot al primer contacto. [unit: —] [e2e: —] [risk: P1]
- **Campo URL de Google Reviews** — `https://` solo, filtro 5★; validación format. [unit: —] [e2e: —] [risk: P1]
- **Botón "Guardar"** — `saveBotSettings` server action. [unit: —] [e2e: —] [risk: P1]
- **Estado de guardado** — spinner + confirmación. [unit: —] [e2e: —] [risk: P2]

### 10.4 Reseñas

_`marketing/resenas/page.tsx`_

#### RatingsToggle

- **Toggle "Activar solicitud de reseñas"** — habilita el flujo post-cita. [unit: —] [e2e: —] [risk: P1]
- **Campo "Enviar N minutos después"** — NumberInput (`followupMinutesAfter`); default en `FOLLOWUP_DELAY_MINUTES`. [unit: —] [e2e: —] [risk: P1]
- **Botón "Guardar"** — PATCH `/api/ratings/settings`. [unit: —] [e2e: —] [risk: P1]

#### StatStrip de reseñas

- **Nota media** — promedio global. [unit: —] [e2e: —] [risk: P1]
- **Total reseñas** — count. [unit: —] [e2e: —] [risk: P1]
- **5★ %** — porcentaje de 5 estrellas. [unit: —] [e2e: —] [risk: P1]

#### Distribución de estrellas

- **Barras 1–5** — count + % por nivel. [unit: —] [e2e: —] [risk: P1]

#### Review cards

- **Estrellas** — display visual 1–5. [unit: —] [e2e: —] [risk: P1]
- **Nombre del cliente** — o "Anónimo". [unit: —] [e2e: —] [risk: P1]
- **Fecha** — fecha de la reseña. [unit: —] [e2e: —] [risk: P1]
- **Icono de canal** — WhatsApp / Google. [unit: —] [e2e: —] [risk: P2]
- **Nombre del barbero** — barbero al que se asigna la reseña. [unit: —] [e2e: —] [risk: P1]
- **Comentario** — texto de la reseña. [unit: —] [e2e: —] [risk: P1]
- **Empty state** — "Todavía sin reseñas". [unit: —] [e2e: —] [risk: P2]

### 10.5 Tienda (productos pública)

_`marketing/tienda/page.tsx`_ — ProductsManager

- **Tabla productos** — misma que en `ventas/productos` (componente reutilizado). [unit: —] [e2e: —] [risk: P1]
- **CRUD completo** — crear / editar / eliminar. [unit: —] [e2e: —] [risk: P1]

---

## 11. Ajustes

_`src/app/dashboard/ajustes/`_

### 11.1 Negocio

_`ajustes/page.tsx`_ — NegocioForm

- **Campo nombre del negocio** — `businessName`; `saveBusiness` server action. [unit: —] [e2e: —] [risk: P1]
- **Campo teléfono WhatsApp** — `whatsappNumber`; formato E.164 validado (libphonenumber-js). [unit: src/lib/phone.test.ts] [e2e: —] [risk: P1]
- **Campo dirección** — `address`. [unit: —] [e2e: —] [risk: P2]

#### ServicesManager

- **Lista de servicios** — nombre + duración + precio; ordenable. [unit: —] [e2e: —] [risk: P1]
- **Botón "+ Añadir servicio"** — nueva fila editable. [unit: —] [e2e: —] [risk: P1]
- **Edición inline** — nombre / duración / precio por fila. [unit: —] [e2e: —] [risk: P1]
- **Borrar servicio** — botón papelera. [unit: —] [e2e: —] [risk: P1]

#### HoursEditor

- **Toggle por día** — on/off (cerrado). [unit: —] [e2e: —] [risk: P1]
- **Inicio / Fin por día activo** — inputs HH:MM. [unit: —] [e2e: —] [risk: P1]

- **Selector `slotStepMinutes`** — radio 15 / 30 / 45 min (granularidad de la agenda). [unit: —] [e2e: —] [risk: P1]

#### BlockedDatesManager

- **Lista de fechas bloqueadas** — el negocio cierra (vacaciones, festivos). [unit: —] [e2e: —] [risk: P1]
- **Botón "+ Añadir fecha"** — date picker → añade a la lista. [unit: —] [e2e: —] [risk: P1]
- **Botón eliminar fecha** — quita la fecha. [unit: —] [e2e: —] [risk: P1]

- **Botón "Guardar cambios"** — `saveBusiness` server action; toast de confirmación. [unit: —] [e2e: —] [risk: P1]

### 11.2 Pagos

_`ajustes/pagos/page.tsx`_

#### CashRegisterToggle

- **Toggle "Habilitar caja registradora"** — PATCH `cashRegister`; habilita el módulo Caja. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]

#### SumupConnect

- **Estado "No conectado"** — visible solo si `cashRegister` habilitado; botón "Conectar SumUp" → OAuth SumUp. [unit: —] [e2e: —] [risk: P0]
- **Estado "Conectado"** — badge + nombre de terminal + botón "Desconectar". [unit: —] [e2e: —] [risk: P0]

#### MobileAppConnect

- **Visible solo si SumUp conectado** — instrucciones para vincular la app de SumUp con el móvil. [unit: —] [e2e: —] [risk: P1]

#### ConnectSettings (Stripe Connect)

- **Estado "Sin cuenta"** — botón "Crear cuenta Stripe" → `/api/stripe/connect/onboard`. [unit: —] [e2e: —] [risk: P0]
- **Estado "Pendiente"** — "Tu cuenta está en revisión" + botón "Reanudar onboarding". [unit: —] [e2e: —] [risk: P0]
- **Estado "Activo"** — badge verde + texto "Stripe Connect activo" + botón "Gestionar cuenta". [unit: —] [e2e: —] [risk: P0]

#### InvoicingSettings

- **Toggle "Habilitar facturación"** — activa VeriFactu. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Campo nombre fiscal** — nombre empresa / autónomo. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Campo NIF** — validación formato. [unit: src/lib/verifactu/format.test.ts] [e2e: —] [risk: P0]
- **Campo dirección fiscal** — calle + número. [unit: —] [e2e: —] [risk: P0]
- **Campo ciudad** — ciudad. [unit: —] [e2e: —] [risk: P0]
- **Campo código postal** — 5 dígitos. [unit: —] [e2e: —] [risk: P0]
- **Campo IVA rate** — número %, default 21. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **Campo prefijo numeración** — `invoiceNumberPrefix`, e.g. "FAC-". [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Campo siguiente número de factura** — NumberInput `invoiceNumberNext`; bloqueado si ya se emitió alguna factura (`hasEmittedInvoices`). [unit: src/lib/invoicing.test.ts] [e2e: —] [risk: P0]
- **Lock si hay facturas emitidas** — tooltip "No se puede cambiar si ya hay facturas emitidas". [unit: —] [e2e: —] [risk: P0]
- **Botón "Guardar"** — PATCH `/api/invoicing/settings`. [unit: —] [e2e: —] [risk: P0]
- **"Facturas emitidas" summary** — count + link a `/dashboard/ventas/facturas`. [unit: —] [e2e: —] [risk: P1]

### 11.3 Reservas online

_`ajustes/reservas/page.tsx`_ — PublicPageSettings

- **Campo slug** — `slug`, URL amigable de la barbería; validación unicidad (async). [unit: —] [e2e: —] [risk: P1]
- **Toggle "App pública activa"** — `publicEnabled`; si off, la PWA muestra "Cerrado". [unit: —] [e2e: —] [risk: P1]
- **Campo logo URL (logo principal)** — `brandLogoUrl`. [unit: —] [e2e: —] [risk: P2]
- **Campo logo URL alternativo** — `brandLogoAltUrl`. [unit: —] [e2e: —] [risk: P2]
- **Campo cover URL** — `brandCoverUrl`. [unit: —] [e2e: —] [risk: P2]
- **Color de marca** — `brandColor`; color picker. [unit: —] [e2e: —] [risk: P2]
- **Selector tema** — `brandTheme`; claro / oscuro. [unit: —] [e2e: —] [risk: P2]
- **Campo descripción pública** — `publicDescription`, textarea. [unit: —] [e2e: —] [risk: P2]
- **Campo Instagram handle** — `instagramHandle`, sin @. [unit: —] [e2e: —] [risk: P2]
- **Campo TikTok handle** — `tiktokHandle`. [unit: —] [e2e: —] [risk: P2]
- **Campo Facebook URL** — `facebookUrl`. [unit: —] [e2e: —] [risk: P2]
- **Campo website URL** — `websiteUrl`. [unit: —] [e2e: —] [risk: P2]
- **Botón "Guardar"** — PATCH `/api/public-page`. [unit: —] [e2e: —] [risk: P1]
- **Preview link** — link "Ver tu app" → `b/[slug]`. [unit: —] [e2e: —] [risk: P2]

### 11.4 Recepcionista IA

_`ajustes/recepcionista/page.tsx`_

- **Pro-gate** `recepcionistaIA` — UpgradeRequired si no tiene la feature. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **VoiceTest** — browser-only (Twilio bridge pendiente); prueba de voz en tiempo real; microfono + speaker en el navegador. [unit: —] [e2e: —] [risk: P2]
- **Aviso "Solo para pruebas"** — texto explicando que el bridge con Twilio está pendiente. [unit: —] [e2e: —] [risk: P2]
- **Datos de barbers** — usa `booksyServices` jsonb (legacy read-only) para nombres de barberos en el contexto de la IA de voz. [unit: —] [e2e: —] [risk: P2]

### 11.5 App pública

_`app/page.tsx`_

- **QR code** — generado con `brandColor`; no tiene link de descarga en este punto, solo display. [unit: —] [e2e: —] [risk: P2]
- **URL compartir** — display de `b/[slug]`. [unit: —] [e2e: —] [risk: P1]
- **Botón "Copiar URL"** — AppPageCopyButton; copia al portapapeles. [unit: —] [e2e: —] [risk: P1]
- **Link "Ver"** — abre la PWA en nueva pestaña. [unit: —] [e2e: —] [risk: P2]
- **Link "Descargar QR"** — descarga la imagen del QR. [unit: —] [e2e: —] [risk: P2]
- **Contador de instalaciones activas** — `activeInstalls` (push subscriptions activas). [unit: —] [e2e: —] [risk: P1]
- **Aviso "No publicada"** — visible si `!publicEnabled`; CTA a `/dashboard/ajustes/reservas`. [unit: —] [e2e: —] [risk: P1]
- **Link "Personalizar"** — enlace a `/dashboard/ajustes/reservas`. [unit: —] [e2e: —] [risk: P2]
- **Sección "Notificaciones push"** — info sobre installs y permisos. [unit: —] [e2e: —] [risk: P1]
- **GtmSettings** — Pro-gated `gtmContainer`; campo para GTM container ID. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **GtmSettings — campo ID** — `GTM-XXXXXXX`; PATCH `/api/gtm`. [unit: —] [e2e: —] [risk: P1]

### 11.6 Ayuda

_`ayuda/page.tsx`_

- **Intro text** — "Tu primer puerto: el chat-widget…". [unit: —] [e2e: —] [risk: P2]

#### Contact cards

- **Card WhatsApp** — link `wa.me/34644288663` en nueva pestaña; número `+34 644 288 663`. [unit: —] [e2e: —] [risk: P2]
- **Card Email** — link `mailto:soporte@otracita.es`. [unit: —] [e2e: —] [risk: P2]

#### FAQs (HELP_SECTIONS)

- **Secciones por tema** — iteradas de `HELP_SECTIONS` (fuente única compartida con el chat widget). [unit: —] [e2e: —] [risk: P2]
- **`<details>` expandibles** — pregunta en `<summary>` + ChevronDown rotate + respuesta en texto; links markdown `[label](/path)` → `<a>` clickables. [unit: —] [e2e: —] [risk: P2]

---

## 12. Mi plan (Suscripción)

_`mi-plan/page.tsx`_

#### TierBanner

- **Estado trial** — banner gold con `daysLeft` restantes + `OpenStripePortalButton`. [unit: —] [e2e: —] [risk: P1]
- **Estado solo (free)** — banner con `UpgradeToProButton`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **Estado pro / estudio** — banner tranquilo ("Plan activo"). [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]

- **CTA "Gestiona facturas"** — link a `/dashboard/facturas`. [unit: —] [e2e: —] [risk: P2]

#### Plan card

- **Nombre del plan** — `planMeta.name`. [unit: src/lib/billing/tier.test.ts] [e2e: —] [risk: P1]
- **Descripción del plan** — `planMeta.description`. [unit: —] [e2e: —] [risk: P2]
- **Importe / moneda** — `amount / currency`. [unit: —] [e2e: —] [risk: P0]
- **SubscriptionStatusBadge** — active / trialing / past_due / canceled. [unit: —] [e2e: —] [risk: P1]
- **Próxima renovación** — `nextPeriodEnd`. [unit: —] [e2e: —] [risk: P1]
- **OpenStripePortalButton** — abre el portal de Stripe para gestionar el plan. [unit: —] [e2e: —] [risk: P0]

#### Historial de facturas Stripe

- **Lista de facturas** — iteradas desde Stripe: fecha / descripción / InvoiceStatusBadge / importe / link PDF. [unit: —] [e2e: —] [risk: P0]
- **InvoiceStatusBadge** — paid / open / void. [unit: —] [e2e: —] [risk: P0]
- **Link PDF** — descarga la factura de Stripe. [unit: —] [e2e: —] [risk: P0]
- **Estado sin facturas** — "No hay facturas todavía". [unit: —] [e2e: —] [risk: P2]

#### OnlinePaymentsSummary

- **Total online cobrado** — Stripe Connect del mes. [unit: —] [e2e: —] [risk: P0]
- **Últimas transacciones** — mini tabla. [unit: —] [e2e: —] [risk: P0]

---

## 13. Rutas legacy / redirect

- **`/dashboard/crecer`** — redirect permanente a `/dashboard/marketing`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/equipo/nominas`** — redirect a `/dashboard/informes/nominas`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/page.tsx`** — redirect a `/dashboard/agenda`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/caja/page.tsx`** — ruta legacy de caja global (no sub-ruta de Ventas); misma UI que `ventas/caja`. [unit: src/lib/cash/compute.test.ts] [e2e: —] [risk: P0]
- **`/dashboard/negocio/page.tsx`** — ruta legacy para negocio; debe redirigir a `/dashboard/ajustes`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/resenas/page.tsx`** — ruta legacy; contenido movido a `/dashboard/marketing/resenas`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/fidelidad/page.tsx`** — ruta legacy; contenido movido a `/dashboard/marketing`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/bot/page.tsx`** — ruta legacy para el bot; contenido en `/dashboard/marketing/whatsapp`. [unit: —] [e2e: —] [risk: P2]
- **`/dashboard/finanzas/page.tsx`** — ruta legacy para el P&L; ahora accesible vía Informes > Panel con PanelSwitch. [unit: src/lib/finanzas/pnl-math.test.ts] [e2e: —] [risk: P0]
- **`/dashboard/voice-test/page.tsx`** — ruta de prueba del recepcionista de voz (no en nav principal). [unit: —] [e2e: —] [risk: P2]

---

## Summary (A)

El dashboard otracita cubre **7 áreas** de primer nivel más shell, setup y rutas legacy, con los siguientes módulos críticos de dinero y fiscalidad (risk P0): toda la capa VeriFactu/AEAT (emitir, rectificar, timeline, QR aceptado), facturación manual con detección NIF y tope ticket 400 €, bookings.price en EUROS (no cents — foot-gun crítico), TPV con 4 métodos de pago + SumUp, caja registradora (apertura/cierre/apuntes/PDF), Stripe Connect onboarding + payment links + refunds, propinas con asignación a barbero, P&L con IVA soportado/repercutido/vencimientos trimestrales, nóminas por barbero (fijo/mixto/autónomo), comisiones por servicio con override, y el módulo de fidelidad stamps/points.

Los módulos de flujo core (risk P1) cubren: agenda con ventana dinámica, drag&drop, 3 vistas (Día/Semana/Mes), polling SWR 10s, BookingDetailPanel con sus 8 acciones, NewBookingPanel multi-servicio, import vision en 3 pasos, gestión del equipo (barberos CRUD + turnos + ausencias + bloques), clientes con ficha Booksy-grade y edición inline, y marketing completo (promos, bot, reseñas, fidelidad).

**Hoja count total: 312 hojas.**

Test files mapeados a sus áreas:
- `_agenda-window.test.ts` → §3.1, §3.2 (ventana dinámica, offhours)
- `derive-source.test.ts` → §7.1, §7.2, §7.3, §9.4 (atribución fuente)
- `tier.test.ts` → §8.3, §8.4, §8.5, §9.6, §10.1, §10.2, §11.4, §12 (feature gates)
- `progress.test.ts` → §8.3, §8.4 (bonos/comisiones)
- `duration.test.ts` → §3.7 (total duración multi-servicio)
- `compute.test.ts` (cash) → §4.3, §11.2 (caja registradora)
- `leaderboard.test.ts` → §8.5 (competición)
- `period.test.ts` → §9.2, §9.3, §9.6 (evolución mensual)
- `pnl-math.test.ts` → §4.6, §6, §9.1, §9.2, §11.2 (P&L, IVA)
- `invoicing.test.ts` → §3.8, §4.1, §5.2, §5.3, §11.2 (facturas, rectificativas)
- `compute.test.ts` (loyalty) → §7.2, §10.1 (fidelidad)
- `compute.test.ts` (payroll) → §6, §9.6, §11.2 (nóminas)
- `services-commission.test.ts` → §8.1, §8.3 (comisiones por servicio)
- `phone.test.ts` → §11.1 (E.164 teléfono)
- `unavailability.test.ts` → §3.1, §8.2 (drag&drop, bloques)
- `format.test.ts`, `hash.test.ts`, `qr.test.ts`, `xml.test.ts` (verifactu) → §4.6, §5.1, §5.2, §5.3, §11.2
