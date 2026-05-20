# V1 Feedback — Master Plan

> **Esta es la sesión-master.** Aquí se organiza, no se implementa.
> Cada workstream (WS-*) se ejecuta en su **propia sesión de Claude Code**
> para no contaminar contexto. Este archivo es el **estado compartido**:
> toda sub-sesión lo lee primero, lee SOLO su sección + los screenshots
> listados ahí, y al terminar actualiza su fila de estado.

- Fuente del feedback: Notion → *otracita HQ* → "V1 FEEDBACK DE OTRACITA" (reunión 2026-05-17)
- Screenshots de referencia (Booksy): `booksy_screen/Screenshot 2026-05-18 at <ts>.png`
- Reni feedback = `R1–R12` · Añadidos de Alex = `A1–A7` · Dirección global = `UI0`

---

## UI0 — North Star: panel de control, no revista

La UI actual es demasiado texto / demasiado editorial. Booksy es denso,
estructurado, operable de un vistazo. Principios a copiar (evidencia entre paréntesis):

1. **Nav universal: rail de iconos a la izquierda + tabs horizontales** para sub-secciones. Siempre visible, todo a un clic. (`09.46.25`, `09.48.41`, `10.17.08`, `10.00.16`)
2. **Layout de 3 paneles: nav | contenido denso | panel de acción acoplado a la derecha** (slide-in) — el contexto nunca se pierde, sin cambio de página para actuar. (`09.58.37`, `10.04.36`, `10.00.16`)
3. **Agenda densa codificada por color**: 1 columna por barbero con avatar; citas = bloques planos de color por estado, texto 2 líneas, mínimo whitespace. (`09.39.31`, `10.04.41`)
4. **Datos = tablas + KPI cards, no prosa.** Multi-columna, barras apiladas, area charts con pills de %. (`09.50.15`, `09.52.45`, `09.48.41`)
5. **Acciones = modales/popups sobre el contexto atenuado, no rutas nuevas.** (`10.22.09`, `10.01.36`, `10.18.21`, `10.22.23`)
6. **Botón primario sticky, oscuro, alto contraste** ancla cada pantalla editable (GUARDAR / CONFIRMAR Y PAGAR). (`09.57.09`, `10.00.41`, `10.18.57`)
7. **Settings = grid de icon-cards → drill-down con sub-nav propia.** (`09.53.25` → `09.57.09`)
8. **Contraejemplo:** `09.56.19` (página Stripe) es la única pantalla editorial — y es externa/legal. El producto debe parecerse a TODO menos a esa.

---

## Workstreams (cada uno = 1 sesión)

| WS | Alcance | Feedback IDs | Screenshots clave | Estado |
|----|---------|--------------|-------------------|--------|
| **WS-0 · Shell & nav** | Rail de iconos izq. + tabs horizontales global; matar lo editorial; tokens de densidad. Base sobre la que viven A/B/F. equipo = **rutas anidadas**. | A4, A6, UI0 | 09.46.25, 09.48.41, 09.53.25, 10.17.08 | ✅ DONE — branch `worktree-ws0-shell-refit` (7 commits, `shell-builder`). merged a main local (8e031f0). Push/deploy en espera de OK de Alex |
| **WS-A · Agenda redesign** | Foto+color por barbero, click slot→modal, barbero solicitado visible, drag&drop + mover manual, badge cobrado (display). | A5, A7, A2, R1, R3, R6(display) | 09.39.31, 09.39.52, 09.58.37, 10.04.36, 10.04.41, 10.04.46, 10.22.09 | ⬜ pendiente |
| **WS-B · Disponibilidad & turnos** | "Falta de disponibilidad" (bloquear franjas), botón "Descanso" on/off, editor horario, ausencias. | R2, R12 | 09.39.52, 10.17.35, 10.17.56, 10.18.07, 10.18.21, 10.18.57, 10.22.23 | 🔨 EN CURSO `turnos-builder` branch `ws-b-disponibilidad-turnos`. Backend+API+tests DONE (3 commits: schema `barber_breaks`/`barber_blocks` aditivas, `availability.ts`/`create.ts` restan franjas con `hours` intacto + test no-regresión, API tenant-scoped). UI (timeline+modales) esperando OK del shape brief. NO mergeado |
| **WS-C · Cita multi-servicio & edición** | Varios servicios por cita; volver atrás en pago / editar precio o servicio pero que quede registrado; campos numéricos borrables. | R7, A3, R11 | 09.58.37, 10.00.16, 10.00.25, 10.01.18, 10.01.36 | ⬜ pendiente |
| **WS-D · Cobro & pagos** | Tap to pay (estilo Booksy); captura de método de pago → alimenta R6; paridad checkout/caja. | A1, R6(captura) | 09.54.31, 09.56.19, 09.57.56, 10.00.41, 10.01.18, 10.06.29 | ⏳ A1 POS UI MISSING; R6 captura PARTIAL (bloqueado WS-A) |
| **WS-E · Clientes (CRM)** | Campo email por cliente; campo "¿De dónde llegó?" (atribución marketing). | R4, R5 | 10.04.36, 10.16.58, 09.50.15 | ⏳ R5 DONE; R4 MISSING (implementar email field) |
| **WS-F · Equipo, comisiones & bonos** | Base Pro existe; **decisión Alex: construir gaps**. R8 % por-servicio (hoy global), R9 tipos de bono (hoy 1 forma), R10 competición semanal acumulable (ausente). | R8, R9, R10 | 09.46.25, 10.16.45, 10.16.58, 10.17.08 | 🔨 reabierto, build gaps |

**Dependencias / orden recomendado**
- **WS-0 primero** para todo lo visual (A/B/F viven dentro del shell nuevo).
- **R6** cruza WS-A (mostrar badge en agenda) ↔ WS-D (capturar el método). WS-D define el dato; WS-A lo pinta.
- WS-C, WS-E, WS-F son mayormente backend/datos → pueden ir en paralelo sin WS-0.
- **Paso 0 de WS-E y WS-F:** verificar contra lo ya implementado (commits recientes `feat(analytics)` atribución, `feat(bonuses)`, `feat(payroll)`). NO asumir hecho ni no-hecho — comprobar en código antes de construir.

---

## Ledger de feedback

| ID | Punto | WS | Estado |
|----|-------|----|--------|
| R1 | Drag & drop citas entre horarios al reservar + ajustar minutos libremente | WS-A | ⬜ |
| R2 | "Falta de disponibilidad" — bloquear franjas/horas | WS-B | 🔨 PARTIAL — backend+API DONE (`barber_blocks`, motor resta franjas, bookings la rechaza); falta UI (BlockModal/AbsenceModal) |
| R3 | Mover cita con ratón a hora/barbero sin entrar en "Horarios y cambios" (drag&drop + manual) | WS-A | ⬜ |
| R4 | Campo correo en cada cliente | WS-E | ⬜ MISSING — `customers` table has no email column |
| R5 | Campo "¿De dónde llegó?" (Google/IG/TikTok/Recomendación/Walk-in) | WS-E | ✅ DONE — `feat(analytics)` 0c8efd9 fully implemented |
| R6 | Badge "cobrado" en agenda por método ($ efectivo · tarjeta · B Bizum · Z Zumup) | WS-A + WS-D | ⬜ PARTIAL — captura en schema + cash movement lib, badge display bloqueado por WS-A |
| R7 | Varios servicios en una misma cita | WS-C | ⬜ |
| R8 | % / comisión por servicio | WS-F | 🔨 PARTIAL — base Pro `commissionServicesPct` global por-barbero; construir % por-servicio |
| R9 | "Bono por meta alcanzada" como opción | WS-F | 🔨 PARTIAL — `bonuses` 1 forma (meta→premio); añadir tipos de bono (meta = una opción) |
| R10 | Bonos semanales acumulables — competición de equipo (€25/sem, 4 sem = €100) | WS-F | 🔨 MISSING — construir competición: ventana semanal + leaderboard + racha 4-sem + zero-sum |
| R11 | Campos numéricos: permitir borrar el valor (no forzar a 0) | WS-C | ⬜ |
| R12 | Editor horario: botón lateral "Descanso" on/off | WS-B | 🔨 PARTIAL — backend+API DONE (`barber_breaks` recurrente, motor resta descansos); falta UI (ScheduleEditorModal) |
| A1 | Tap to pay estilo Booksy | WS-D | ⬜ |
| A2 | Mostrar en agenda si se solicitó barbero explícito | WS-A | ⬜ |
| A3 | Ir atrás en pago / editar precio o servicio, pero que quede registrado | WS-C | ⬜ |
| A4 | Equipo y app organizados por pestañas | WS-0 | ✅ DONE — equipo = rutas anidadas (Empleados/Turnos/Comisiones) vía SubTabs; resto de hubs en PageShell |
| A5 | UI agenda: foto + colores de barbero (copiar Booksy) | WS-A | ⬜ |
| A6 | Menú izquierda con iconos + pestañas horizontales | WS-0 | ✅ DONE — AppRail (rail de iconos w-16) + SubTabs horizontales; sidebar editorial w-60 eliminado |
| A7 | Click en slot de agenda → modal con opciones | WS-A | ⬜ |

---

## Índice de screenshots (catálogo — no re-mirar imágenes)

| Archivo | Pantalla Booksy | Patrón UI a copiar | IDs |
|---------|-----------------|--------------------|-----|
| 09.39.31 | Agenda día + menú contextual de slot | 3 columnas barbero (foto+nombre), bloques color por estado, popup "NUEVA CITA / FALTA DISPONIBILIDAD / AUSENCIA", rail fecha+filtros | A5,A6,A7,R2 |
| 09.39.52 | Agenda + panel "Añadir falta de disponibilidad" | Panel slide-in: Fecha/Inicio/Fin/Empleado/Nota; agenda visible detrás; bloques verdes "Descanso" | R2,A7 |
| 09.46.25 | Stats — tab Empleados | Rail iconos + tabs (Panel/Citas/Clientes/Ingresos/Caja/Inventario/Empleados/Marketing); tablas top empleados; "Comisiones de empleados" | A4,A6,R8 |
| 09.46.55 | Stats — Empleados (charts) | Nav iconos colapsado; KPI cards; area chart; barra apilada por tipo de venta (Servicios/Productos/Bonos/Suscripciones) | A6,R9 |
| 09.47.23 | Stats — Marketing | KPI cards Boost; bar chart; barra ratio; top clientes Boost | A6 |
| 09.48.41 | Stats — Panel de control | 2 area charts + pills %; rail derecho de summary cards con sub-métricas | A6 |
| 09.49.08 | Stats — selector de rango fecha | Modal radio De-Para/Día/Semana/Mes/Año + grid mes; flota sobre dashboard | — |
| 09.49.19 | Stats — tab Citas | Area chart + pills; tabla estados (No completada/Completada/Inasist./Cancelada) count+%+valor | A6 |
| 09.50.00 | Stats — tab Clientes | Area chart + barra nuevos/recurrentes; top clientes; lista Informes | A6,R4 |
| 09.50.15 | Informe — lista clientes nuevos | Tabla ancha densa: Nombre/Grupo/Nº citas/1ª visita/Valor/Ingresos/Desc/Imp/Cant/Total + paginación | R5 |
| 09.50.30 | Informe — Clientes (top + grupos) | Top 10 avatar+citas+ingreso; "Clientes por grupo" tabla | — |
| 09.51.30 | Stats — tab Ingresos | KPI cards; breakdown completo por tipo de venta; lista larga Informes (fiscal, facturas pendientes…) | A6 |
| 09.52.45 | Informe — ingresos servicios/productos | 2 tablas densas apiladas con totales | — |
| 09.53.25 | Configuración del negocio (hub) | Grid de icon-cards 2-col (icon+título+desc) + búsqueda | A4 |
| 09.54.31 | Settings — Pagos y Ventas | Header back; filas con chevron; "NEW Tap to Pay" | A1 |
| 09.56.19 | Página partner Stripe (CONTRAEJEMPLO) | Editorial, mucho whitespace — externa/legal, NO copiar | A1 |
| 09.57.09 | Settings — Ventas → Impuestos | Sub-nav izq; filas tipo impuesto 4/7/10/21% + papelera; GUARDAR sticky | R8 |
| 09.57.56 | Settings — Métodos de pago offline | Checkbox list (Efectivo/TPV/Bizum/Amex/PayPal/Bono…); sub-nav; GUARDAR | A1 |
| 09.58.37 | Agenda + panel detalle cita (CONFIRMADO) | Panel header verde: avatar, toggles grupo/recurrente, servicio+precio, Hora ini/fin, Empleado, "Solicitado por cliente" ♥, "+ Añadir otro servicio", Total | A2,A5,A7,R7 |
| 10.00.16 | Checkout — Nueva venta (POS) | Rail categorías izq; grid productos con precio; carrito der: cliente, líneas, Descuento, Total, SELECCIONAR MÉTODO | A1,R7 |
| 10.00.25 | Checkout — Cantidad personalizada | Teclado numérico (⌫), campo €0.00 borrable + Descripción; carrito persiste | R11 |
| 10.00.41 | Checkout — Método de pago + propina | Grid tiles método (Efectivo ✓/TPV/Bizum/Amex/PayPal/Fraccionado/Bono); Pago + Cambio; CONFIRMAR Y PAGAR | A1 |
| 10.01.18 | Checkout — ¡Pago finalizado! recibo | Success + IR AL CALENDARIO; recibo "PAGADO" ID/items/tax/total; kebab (Generar factura/Editar/Asignar) | A3 |
| 10.01.36 | Checkout — Editar artículo (modal) | Modal Precio €, Descuento %, Cantidad desc €; ELIMINAR/CANCELAR/GUARDAR sobre venta registrada | A3,R11 |
| 10.04.36 | Agenda + panel cliente (Próximas) | Avatar+nombre, badge "USUARIO BOOKSY", stat tiles, tabs Citas/Finalizadas/Info, lista Próximas + REBOOK | A5,R4 |
| 10.04.41 | Agenda + cliente (historial) | Filas citas pasadas fechadas, servicio+precio+REBOOK; agenda color detrás | A5 |
| 10.04.46 | Agenda + cliente (historial scroll) | stat tiles + tabs Previas/Pasadas, filas repetidas + REBOOK; agenda completa detrás | A5 |
| 10.06.29 | Caja registradora | Lista cajas diarias (fecha/Apertura/Total/ABIERTO|CERRADO); panel caja abierta Total 450€, Transacciones/Resumen, badge PAGADO | — |
| 10.16.45 | Equipo — tab Empleados (detalle) | Tabs EMPLEADOS/TURNOS/RECURSOS/COMISIONES; lista empleados (avatar, "TOP BARBER", drag); perfil + servicios | A4,A5 |
| 10.16.58 | Equipo — Editar empleado | Foto, Nombre/Teléfono/**Email**, Permiso, Puesto; checkboxes calendario/online; GUARDAR | R4,A4,A5 |
| 10.17.08 | Equipo — tabs (close-up) | Barra tabs EMPLEADOS/TURNOS/RECURSOS/COMISIONES + búsqueda + lápiz | A4,R8 |
| 10.17.35 | Equipo — Turnos (día) | Timeline: filas empleado × eje horas, bloques verdes "11:00-20:00" con "Descanso" inset | R12,A4 |
| 10.17.56 | Equipo — Turnos (semana) | Grid empleado × 7 días, cada celda horas + descanso + lápiz; COPIAR | R12,A4 |
| 10.18.07 | Equipo — popup slot turno | Popup "EDITAR HORARIO DE TRABAJO / AÑADIR AUSENCIA" | R2,R12,A7 |
| 10.18.21 | Equipo — Editar Horario trabajo (modal) | Filas por día: toggle on/off + Inicio/Fin + "+ Añadir descanso" (fila indentada + papelera) | R12,R2 |
| 10.18.57 | Equipo — Horario (período) | Dropdown "Periodo de tiempo" (Inmediatamente/Semana que viene/A partir de) + CANCELAR/GUARDAR | R12 |
| 10.22.09 | Menú contextual slot agenda (close-up) | "NUEVA CITA / FALTA DE DISPONIBILIDAD / AÑADIR AUSENCIA" — slot click → chooser | A7,R2 |
| 10.22.23 | Equipo — Añadir ausencia (modal) | "Todo el día"/1 día, Seleccionar fecha + Repetir, Motivo dropdown, Aprobado toggle; CANCELAR/GUARDAR | R2,R12 |

---

## Protocolo de sub-sesión

Al abrir la sesión de un workstream:

1. Leer este archivo entero (sobre todo **UI0** + tu fila en **Workstreams** + tu sección del **Ledger**).
2. Mirar **solo** los screenshots listados para tu WS (no las 38).
3. Si tu WS tiene "verificar vs commit": **Paso 0 = grep/leer el código existente** antes de construir nada. Reportar qué ya existe.
4. Antes de tocar UI: seguir la regla del proyecto — plan en chat, referencia = los screenshots Booksy de tu WS, aprobación, luego código.
5. Al terminar: actualizar el **Estado** de tu fila (Workstreams + Ledger) en este archivo y commit pequeño y revisable.

_Última actualización: 2026-05-18 (sesión-master)._
