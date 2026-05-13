# Estrategia otracita

> Documento de **estrategia de negocio** locked-in 2026-05-01. Separado de
> PRODUCT.md (que cubre brand + producto) y DESIGN.md (que cubre sistema
> visual). Cualquier decisión que se tome y que contradiga este documento
> requiere actualizarlo explícitamente, no ignorarlo.

## Aspiración

**Debunk Booksy en España sin levantar capital.**

Bootstrap ambicioso. No es lifestyle pequeño, no es venture rocket. Es la
apuesta por velocidad vía **comunidad + producto + voz castellana**, no vía
cash burn.

Outcome aceptable a 3-5 años: ser la categoría dominante de software para
barberías en España, o terminar adquiridos por Booksy/Treatwell/Square.
Cualquiera de las dos vale.

## Dónde jugamos

### Mercado primario

Barberías en España con 1-5 sillones por local, **1 a 5 locales** del
mismo dueño. Dueño 25-50 años, móvil-first, **ya pagando** algo a
Booksy/Treatwell/Fresha **o** gestionando manual con WhatsApp del propio
barbero.

**Multi-local (2-5 locales mismo dueño): mercado válido.** Mecánica
simple: cada local = una cuenta otracita independiente. El dueño con 2
locales paga 2 × tier (ej: 2 × Pro = €98/mes). Cada local tiene su
agenda, su PWA pública, su factura, su Stripe Connect. Cero código
nuevo. Si captamos 5+ clientes multi-local que pidan dashboard
agregado, entonces construimos un "Multi" tier con consolidación.
Hasta entonces, no es priority.

**CRÍTICO: comunicar el soporte multi-local explícitamente.** Si no lo
decimos en el landing, el dueño con 2 locales bouncea en silencio
asumiendo que "esto es para 1 local solo" y nunca tenemos la señal.
Implementación obligatoria desde el primer día:

- FAQ entry "¿Soporta varios locales?" con la mecánica clara
- Nota breve en sección de precios: "¿Más de un local? Hablamos antes"
- Link directo a WhatsApp del equipo para multi-local
- (Cuando arranque adopción) onboarding form pregunta "¿gestionas más
  de un local?" para tag automático en DB

**Audiencia inclusiva por geografía**, no por nacionalidad: cualquier
persona que regenta una barbería en España (española, venezolana, peruana,
catalana, marroquí, etc). El idioma del producto es **castellano**, sin
claim identitario.

### Geografía fase 1 (12 meses)

Madrid + Barcelona como concentración deliberada (densidad de barberías
con perfil receptivo). Resto de España solo orgánico/referido. Latam y
otros mercados europeos: cerrados los primeros 12 meses.

**Q1 (mayo-jul 2026): foco exclusivo Barcelona.** Decisión tomada
2026-05-12 con Reni (cofounder comercial, vive en BCN). Madrid se mueve
a Q2 cuando tengamos red de embajadores BCN activa y playbook validado.
Motivo: densidad de red propia de Reni en BCN + cero coste operativo de
desplazamiento Q1.

### Anti-mercado (NO jugamos)

- Peluquerías unisex grandes (>5 sillones por local, mix mujer/hombre)
- **Cadenas franquiciadas grandes** (>5 locales o sistema de franquicia
  con central que necesita reporting consolidado, gestión de marca
  centralizada, control de empleados cross-local). Hasta 5 locales mismo
  dueño SÍ es mercado (cada local cuenta separada). Más allá necesita
  features de chain management que no construimos.
- Spa, estética, uñas, masaje, tatuaje, mascotas
- Latam y otros mercados internacionales (Q5+)
- Plataforma vertical multi-servicio (dilución)

## Cómo ganamos

Tres palancas combinadas. Ninguna sola es suficiente; las tres juntas
crean la posición defensible.

### Palanca 1: producto integrado vs stack fragmentado

El barbero típico paga hoy a 4-5 herramientas distintas (Booksy + Holded +
chatbot + fidelidad + voz IA si quiere). Total mediana de mercado:
~€280/mes. otracita Pro a €49/mes hace lo mismo (excepto voz IA);
Estudio a €169/mes incluye voz IA. Ahorro evidente.

### Palanca 2: VeriFactu de fábrica

Obligatorio AEAT desde julio 2027. Booksy/Treatwell/Holded NO lo cubren
nativo. Es deadline regulatorio que **obliga** al barbero a moverse.
Posicionamiento: *"Llega VeriFactu. Ya está resuelto."*

### Palanca 3: especialistas — solo barberías, solo España

Booksy/Treatwell/Fresha son plataformas globales multi-vertical: sirven
peluquería unisex, estética, uñas, spa, mascotas a la vez, en 30+ países.
Eso les fuerza a quedarse en lo genérico: agenda + cobro y para de
contar. Nosotros hacemos lo contrario: solo barberías, solo España.
Cada decisión de producto va a un único perfil (dueño de barbería ES).

Eso se materializa en cosas concretas:

- **Lenguaje barbero, no "centro de belleza"**: cortes, barbas, retoques,
  mantenimientos. No "tratamientos" ni "estilistas". El barbero lo abre y
  siente que es suyo.
- **Operativa española real**: VeriFactu, IVA bien aplicado, festivos
  locales, Stripe Connect 0% comisión (Booksy/Treatwell cobran %),
  roadmap hacia Bizum/SEPA.
- **Módulo de finanzas para el barbero**: control de ingresos/gastos del
  local dentro de la propia herramienta (alquiler, productos, sueldos,
  caja diaria). Booksy no lo tiene porque no es prioridad cuando sirves
  50 verticales en 30 países.

La voz castellana nativa (Q3 ElevenLabs JeiJo) sigue en roadmap como
mejora de UX, pero NO es palanca defendible: cualquier competidor cambia
el modelo de TTS en una semana. La ventaja real es el foco: Booksy no
puede lanzar "Booksy Barberías España" sin contradecir su tesis de
plataforma global. Lo más que pueden hacer es añadir features sueltas;
el producto entero seguirá siendo genérico.

Aclaración importante sobre idioma: el producto está en castellano porque
operamos en España, no porque sea identitario. Audiencia inclusiva por
geografía, no por nacionalidad — los dueños y clientes finales son
frecuentemente de fuera (venezolanos, marroquíes, dominicanos, peruanos,
etc.). El idioma castellano es contexto operativo, no claim comercial.

### Moat real defensible a 3 años

**Comunidad de barberos embajadores + partnerships verticales + canal
afiliados con mentores.** Producto y marca son válvulas de entrada; la
comunidad y los mentores formadores son la puerta cerrada para imitadores
extranjeros. Implementación:

- Embajadores Madrid/BCN (5-10 barberos visibles que recomiendan).
  Q1 = solo BCN (3-5 embajadores).
- Grupo WhatsApp cerrado de clientes (peer support, ideas, cohesión)
- **Canal afiliados con mentores formadores (decidido 2026-05-12):**
  mentores que forman barberos en BCN/Madrid ofrecen código de afiliado
  a sus alumnos; ganan % recurring del MRR de cada alumno-cliente.
  Alcance vertical sin paid ads, alineado con moat comunidad. Mecánica
  (% concreto, duración, payout, contrato): a definir Q1 con Reni.
- Partnerships SumUp (cross-sell mutuo) y proveedores producto barbería
- Presencia en eventos sector (Cosmobeauty, ferias regionales)

## Capacidades requeridas

| Capacidad | Estado actual | Plan 12m |
|---|---|---|
| Producto core (agenda, bot, TPV, factura, fidelidad) | ✅ Existe | Estabilizar, pulir gaps |
| Tier gating + billing | ✅ Implementado 2026-04-30 | Mantener; añadir cap llamadas Estudio |
| Voz IA castellana nativa | ⚠️ Grok actual (inglés-acento) | Migrar a ElevenLabs JeiJo Q3 |
| Comunidad barberos | ❌ Cero | Embajadores Madrid Q2; grupo WA Q3; eventos Q3-Q4 |
| Partnerships | ❌ Cero | SumUp Q3 (referencias mutuas); 1 proveedor producto Q4 |
| Sales operation | ⚠️ Solo founder | Asistente media jornada cuando MRR > €1.500 |
| Marketing / contenido | ❌ Cero | SEO básico Q2 (VeriFactu, migración Booksy); Meta Ads modesto desde MRR > €2.500 |

## Pricing locked-in

| Tier | Mensual | Anual | Trial |
|---|---|---|---|
| Solo | Gratis | Gratis | N/A |
| Pro | 49 € | 39 € (20% off) | 14 días con tarjeta |
| Estudio | 169 € | 119 € (30% off) | Sin trial (sales-led + cross-sell desde Pro) |

**Estudio cap llamadas voz IA:** 200 llamadas/mes incluidas, 0,30 €/llamada extra.

**Por qué descuento anual agresivo en Estudio (30% off):** cashflow
upfront vale más que margen mensual durante bootstrap. €1.428 hoy >
€2.028 goteados.

**Stripe Connect application fee:** 0% en Pro y Estudio (compromiso
anti-comisión brand). Posible "Solo Pay" futuro a 0€/mes + 2% fee para
barberías nuevas sin datáfono — no implementado, opcional.

## Sistemas de gestión (qué medimos)

### Métricas semanales

| Métrica | Umbral 12m |
|---|---|
| Demos cualificadas hechas | 3-4/sem |
| Trial Pro iniciados | 2-3/sem |
| Clientes nuevos paid | 3/sem promedio |
| Llamadas IA atendidas (Estudio actives) | growth indicator de upsell |

### Métricas mensuales

| Métrica | Umbral 12m |
|---|---|
| Conversión trial → paid | >50% |
| Churn mensual | <4% |
| MRR | objetivo €8-10K en mes 12 |
| CAC (cuando arranque ads) | <€50 (referido), <€200 (ads) |

## Plan operativo 12m

| Trimestre | Foco | Outputs esperados |
|---|---|---|
| **Q1 mayo-jul 2026** | Validación + primeros 30 clientes en **Barcelona** | Producción estable. Gates aplicados (hecho). Primeros 30 paid en BCN (mayoría Pro). 3-5 embajadores BCN activos. Programa afiliados mentores BCN definido + primeros 3 mentores activados. |
| **Q2 ago-oct 2026** | Tracción + asistente | 60-80 clientes total. Asistente media jornada contratado. 1 partnership SumUp negociado. Roadmap voz IA modular ElevenLabs. |
| **Q3 nov-ene 2027** | Aceleración | 100-130 clientes. Primer Estudio activo con voz IA en producción (ElevenLabs JeiJo). Eventos sector. Meta Ads modesto (€500-1000/mes). |
| **Q4 feb-abr 2027** | Consolidación + decisión | 150+ clientes. MRR €8-10K. Decisión: ¿bootstrap se queda bootstrap, o abrimos seed por momentum? |

## Riesgos clave

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Burn-out del founder | Alto | Asistente media jornada cuanto antes (umbral: >30 clientes) |
| Crecimiento lento sin paid acquisition | Medio-alto | Meta Ads modesto activado en Q3, no esperar a Q4 |
| Booksy reacciona con bot WA + bajada de precio | Medio | VeriFactu + voz IA nativa + comunidad son caros de copiar que precio |
| Adopción Estudio (cross-sell voz IA) lenta | Medio | UX cross-sell muy fácil (banner dashboard, trial in-app corto) |
| VeriFactu se atrasa o cambia regulatoriamente | Bajo | No apostar todo a esa narrativa; mantenerla como 1 de 3 palancas |
| Vendor lock-in xAI Grok / cambio precios voz IA | Bajo | Stack modular (Q3) permite swap proveedor TTS |

## Anti-estrategia

Lo que **NO** hacemos los próximos 12 meses, sin importar qué tan tentador
parezca en el momento:

- ❌ NO levantamos capital
- ❌ NO expandimos a peluquería / estética / uñas / spa
- ❌ NO expandimos a Latam
- ❌ NO contratamos full-time hasta MRR > €5K
- ❌ NO construimos features fuera del core (no app cliente final, no integraciones premium fuera del roadmap)
- ❌ NO bajamos precios para captar más
- ❌ NO hacemos onboarding 1:1 de Pro (solo Estudio)
- ❌ NO nos metemos en marketplaces de terceros (queremos ser categoría, no listing)
- ❌ NO firmamos exclusivas con cadenas grandes (rompería el posicionamiento)

## Decisión criterion

**Cualquier decisión que tome el founder se filtra por**:

1. ¿La firmaría un barbero hablando con otro? (frase tatuable PRODUCT.md)
2. ¿Avanza alguno de: 150 clientes, €8-10K MRR, comunidad activa? (12m goal)
3. ¿Mantiene bootstrap viable? (sin levantar)
4. ¿Refuerza alguna de las 3 palancas (integrado / VeriFactu / voz castellana)?

Si la respuesta a alguna es **no** y al resto no es **sí claro**, no se hace.
