# DarkMoney Phase 2 - Incoming Features

> **Revision 2 (2026-07-07)**: documento actualizado tras el cierre de Fase 1.
> Desde la revision original (2026-06-11) la app cambio sustancialmente; la
> seccion "Lectura Verificada" y las prioridades reflejan el estado real actual.

## Proposito

DarkMoney ya no esta en una fase "solo transaccional". La app ya registra
movimientos, lee notificaciones financieras en Android, usa IA en formularios y
dashboard, tiene modulos de recurso estandarizados, exporta CSV en varias listas,
maneja adjuntos/comprobantes y cuenta con bases colaborativas como workspaces e
invitaciones de obligaciones.

La fase 2 debe convertir esa base en una experiencia mas profesional:
investigacion historica, reportes trazables, asistentes IA que consultan datos con
evidencia, automatizaciones reversibles y superficies de decision que aprovechen
los motores analiticos existentes sin duplicarlos.

Este documento es una guia de producto y arquitectura. No reemplaza auditorias
tecnicas puntuales, pero si define que debe reutilizarse, que falta y que orden
conviene seguir.

## Lectura Verificada De La App Actual

Revision hecha contra rutas, features, queries, funciones edge, migraciones y
documentos del repo al 2026-07-07 (cierre de Fase 1).

### Estado Post-Fase 1 (nuevo desde la revision original)

Todo lo siguiente YA EXISTE y las epicas deben asumirlo como base:

- **Estandarizacion 100%**: los 10 modulos de recurso auditados y conformes
  (2026-07-05); auditoria de movimientos sin hallazgos altos/medios abiertos.
- **Red de seguridad**: 126 tests TS (jest-expo, conteo 2026-07-12 tras migrar
  las reglas de notificaciones a builders puros) + 19 tests JUnit Kotlin + CI en
  GitHub Actions (typecheck + tests en cada push). Toda feature nueva de Fase 2
  DEBE entrar con tests de su logica pura.
- **OTA updates operativo** (EAS Update, canal `preview`): los cambios JS se
  publican con `eas update` y llegan sin reinstalar APK. Las features de Fase 2
  pueden iterarse en trenes OTA; solo lo nativo requiere APK + bump de version.
- **Arranque instantaneo**: cache de React Query persistido en AsyncStorage
  (whitelist + TTL 24h + buster). REGLA: cualquier feature que cambie el shape
  de una query persistida debe bumpear el buster en lib/query-client.ts.
- **Telemetria real**: `app_error_logs` (1800+ filas) demostro ser la fuente de
  diagnostico mas valiosa del proyecto; `recordDetectionEvent` cubre el pipeline
  de deteccion. Las epicas deben instrumentar sus eventos desde el dia 1.
- **Captura rapida completa**: Repetir movimiento (swipe), plantillas
  (`movement_templates` en prod), split de gastos por categoria
  (metadata.split_group), chips de montos frecuentes. La epica de IA accionable
  se apoya en estos contratos, no los reemplaza.
- **Realtime resiliente**: `lib/realtime-channel.ts` con re-suscripcion con
  backoff; los 4 hooks de sync migrados. Modulos nuevos con realtime deben usar
  este helper.
- **Refactor R7 completo**: MovementForm 1729→1160 lineas; la logica vive en
  `features/movements/lib` y hooks dedicados (FX, sugerencias, saldos, adjuntos,
  validacion compartida entre vias). El chat accionable debe consumir ESTOS
  modulos, no duplicarlos.

### Modulos Y Plantilla

- Las listas principales de recurso ya usan `ResourceModuleTemplate` y
  `ResourceSectionList` en cuentas, movimientos, presupuestos, contactos,
  obligaciones, suscripciones, ingresos fijos, categorias, tipos de cambio,
  notificaciones y configuracion.
- Tambien existen detalles con `ResourceModuleTemplate` para cuenta, contacto,
  presupuesto, suscripcion e ingreso fijo.
- `app/movement/[id].tsx` y `app/obligation/[id].tsx` son detalles especiales con
  scroll y flujos propios. No deben bloquear fase 2, pero cualquier feature nueva
  que toque detalle de movimiento u obligacion debe ser cuidadosa porque son zonas
  de alto impacto.
- Las pantallas abiertas desde Mas ya usan, en general, `useOriginBackNavigation`
  y rutas con `?from=more`. Cualquier modulo nuevo, como reportes o insights,
  debe seguir esa regla desde el inicio.

### Movimientos Y Busqueda Actual

- Existe paginacion de movimientos en `services/queries/movements.ts` con filtros
  por tipo, status, cuenta, categoria, rango de fechas, texto y lista de ids.
- El snapshot general en `services/queries/workspace-data.ts` limita movimientos a
  los ultimos 2 anos para mantener el payload manejable.
- Por esa razon, los reportes historicos profesionales no deben depender solo del
  snapshot actual. Necesitan query/read model dedicado por rango, paginado y con
  indices pensados para historicos.
- `MovementForm` ya centraliza validacion con `validateMovementForm`, contrato de
  guardado con `buildMovementCreateInput` / `buildMovementUpdateInput`, undo al
  crear y `client_dedupe_key` para idempotencia.
- El registro rapido desde notificaciones comparte parte del contrato, pero los
  documentos de auditoria de movimientos siguen siendo referencia obligatoria
  antes de agregar IA accionable o nuevas vias de escritura.

### IA Ya Implementada

- Formularios y notificaciones ya tienen IA para categoria, descripcion,
  contraparte, recurrencia, riesgo y recomendacion de presupuesto.
- Existen edge functions:
  - `movement-category-ai-suggestion`
  - `movement-counterparty-ai-suggestion`
  - `movement-description-ai-cleanup`
  - `movement-recurring-ai-suggestion`
  - `movement-risk-ai-explanation`
  - `movement-budget-ai-recommendation`
  - `notification-movement-ai-classifier`
- El dashboard avanzado ya tiene IA por areas:
  - `dashboard-advanced-ai-summary`
  - `dashboard-advanced-ai-patterns`
  - `dashboard-advanced-ai-flow`
  - `dashboard-advanced-ai-history`
  - `dashboard-advanced-ai-health`
- Ya existen cuotas/cache de IA con `ai_feature_daily_usage`,
  `ai_feature_usage_events` y `dashboard_ai_cache`.
- Tambien existe `daily-ai-digest` y `send-daily-notification-digest`.
- **La API de DeepSeek YA esta conectada**: la key vive en las edge functions
  (Deno.env, nunca en el cliente) y todas las funciones IA listadas arriba la
  usan con cuotas y cache. El chat de Fase 2 reutiliza esa misma conexion y
  disciplina de cuotas; NO se agrega una key nueva en el cliente.
- Fase 2 no debe "crear IA" como concepto nuevo. Debe formalizar un sistema de
  herramientas consultivas y accionables sobre lo que ya existe.

### Analitica Ya Implementada

La app ya tiene motores utiles en `services/analytics`:

- `anomaly-detection.ts`
- `cashflow-forecast.ts`
- `category-suggestions.ts`
- `duplicate-detection.ts`
- `financial-graph.ts`
- `focus-scoring.ts`
- `history-change-points.ts`
- `history-factor-analysis.ts`
- `month-clustering.ts`
- `movement-features.ts`
- `pattern-clustering.ts`
- `payment-optimization.ts`

Tambien hay builders del dashboard avanzado en
`features/dashboard/lib/advanced-builders.ts` y componentes como historial anual,
anomalias, salud, patrones, forecast, optimizacion de pagos y calidad de datos.

Por tanto, las epicas de alertas, forecast, historial y recomendaciones deben
hablar de productizar, persistir y exponer estas lecturas fuera del dashboard,
no de construirlas desde cero.

### Notificaciones Financieras

- Android cuenta con `DarkMoneyNotificationListenerService`, overlay nativo,
  headless task, retry de guardado y reconciliacion al volver a foreground.
- Se soportan apps financieras como Yape, Plin, BCP, Interbank y otras definidas
  en `lib/notification-detection-apps.ts`.
- El pipeline ya registra telemetria y acciones de sugerencias.
- Fase 2 debe apoyarse en este sistema para automatizaciones, pero no debe asumir
  escritura silenciosa sin confirmacion, idempotencia, retry y auditoria.

### Adjuntos Y Evidencia

- Los comprobantes ya existen para movimientos y eventos de obligaciones.
- La implementacion actual usa Supabase Storage con carpetas por entidad mediante
  `lib/entity-attachments.ts` y consultas en `services/queries/attachments.ts`.
- `MovementForm` permite adjuntar comprobantes y sincronizarlos en background.
- Los detalles de movimiento y obligacion ya muestran previews, conteos y borrado.
- No se encontro una tabla `movement_attachments` dedicada. Para OCR, busqueda por
  texto o metadatos avanzados convendria agregar una tabla de indice como
  `entity_attachment_index` o similar, no duplicar el storage actual.

### Colaboracion

- Ya existen workspaces, invitaciones de workspace y obligaciones compartidas.
- Las edge functions cubren crear/aceptar/declinar/desvincular invitaciones de
  obligaciones y workspaces.
- El siguiente nivel no es "agregar colaboracion desde cero", sino roles finos,
  actividad visible, comentarios, aprobaciones y permisos por accion.

### Exportacion

- Ya existe exportacion CSV como archivo real con `lib/share-csv-file.ts`.
- Cuentas, movimientos, presupuestos, contactos, obligaciones, suscripciones,
  ingresos fijos y categorias ya tienen exportacion CSV o builders asociados.
- Fase 2 debe subir esto a reportes reproducibles, historicos y PDF cuando haga
  falta, no reemplazar el sistema CSV actual.

## Correcciones Importantes Al Alcance Inicial

1. **Reportes historicos no son solo dashboard**: el dashboard ya tiene historial
   anual y analitica, pero un usuario que pregunta por una compra antigua necesita
   busqueda dedicada, paginada, exportable y con evidencia.
2. **Receipts no significa "adjuntar archivos"**: adjuntar ya existe. Lo nuevo es
   OCR, indice de texto, busqueda, etiquetas y relacion con garantias/compras
   grandes.
3. **Anomalias y forecast no empiezan de cero**: ya hay motores locales. Falta
   persistencia, estado de revision, feedback del usuario y convertirlos en un
   inbox de decisiones.
4. **IA accionable debe esperar contratos fuertes**: la app ya crea movimientos
   con idempotencia y validacion, pero una IA que escribe necesita confirmacion,
   undo, auditoria y herramientas estrictas por accion.
5. **Colaboracion ya existe**: workspaces y obligaciones compartidas son base. Lo
   profesional es actividad, roles, comentarios y aprobacion.
6. **No usar tablas ficticias en el plan**: si una capacidad futura necesita una
   tabla nueva, el documento debe decirlo como propuesta, no como estado actual.

## Principios De Fase 2

1. **Preguntas reales antes que graficos bonitos**: responder cosas como "cuanto
   me costo esa camara el ano pasado" o "en que se fue mi dinero este mes".
2. **Evidencia siempre visible**: cada cifra debe poder abrir movimientos,
   cuentas, categorias, contactos, obligaciones o adjuntos que la sustentan.
3. **IA como interfaz de consulta primero**: empezar con lectura y explicacion.
   Las acciones llegan despues, con confirmacion.
4. **Automatizacion reversible**: toda escritura automatica debe tener
   idempotencia, undo, historial o auditoria.
5. **Privacidad y costo controlados**: mandar a IA solo el contexto necesario,
   respetar workspace/RLS, cachear respuestas y registrar cuotas.
6. **Reusar el sistema estandar**: nuevos modulos deben usar
   `ResourceModuleTemplate`, filtros tipados, `ActiveFilterBar`,
   `MetricSummaryBar`, `ResourceSectionList`, `FAB` y `useOriginBackNavigation`.
7. **Logica compartible vive en `@darkmoney/shared`**: toda logica de dominio
   pura que web y movil puedan necesitar (agregaciones del read model
   historico, contratos de herramientas IA, modelo de evidencia, tipos y
   builders de insights, calculos financieros) se implementa en el paquete
   `@darkmoney/shared` (repo `JorgeGuerrero26/darkmoneyshare`), no en el
   codigo RN. El movil la consume via wrappers finos de re-export, como ya
   se hace con `@darkmoney/shared/health` (health score del dashboard, via
   `features/dashboard/lib/health.ts`) y `@darkmoney/shared/currency`
   (conversion de paridad, via `lib/currency-conversion.ts`). Solo queda en
   la app lo especifico de plataforma: UI, navegacion, storage, queries.

## Fase 2.0 - Fundaciones Antes De Nuevas Features

Esta fase evita construir sobre atajos. Debe hacerse antes o en paralelo al primer
MVP de reportes.

### 1. Read Model Historico

Objetivo: una fuente de consulta para reportes y chat, distinta del snapshot
liviano.

Necesario:

- Query paginada para movimientos historicos enriquecidos por workspace.
- Filtros por texto, monto aproximado, moneda, cuenta, categoria, contacto, tipo,
  status y rango.
- Capacidad de buscar mas alla de los ultimos 2 anos si el usuario lo pide.
- Orden estable por fecha/id.
- Conversion de moneda coherente por fecha o, si no hay tipo de cambio historico,
  mostrar claramente la moneda original y la moneda base estimada.

Sugerencia tecnica:

- `services/queries/reports.ts` o `services/queries/historical-search.ts`.
- `features/reports/lib` para builders puros.
- Si se agrega SQL, documentar en `DATABASE_DICTIONARY.md` segun `AGENTS.md`.

### 2. Contrato De Herramientas IA

Objetivo: que el chat no "adivine" datos financieros.

Necesario:

- Intenciones tipadas: `search_movements`, `summarize_period`,
  `compare_periods`, `list_due_items`, `find_anomalies`, `create_movement_draft`.
- Schemas estrictos de entrada/salida.
- Respuestas con `evidenceIds` o referencias internas.
- Modo inicial solo lectura.
- Auditoria de prompts/respuestas con datos minimizados y retencion definida.

### 3. Evidencia Y Trazabilidad

Objetivo: cada reporte o respuesta IA debe poder abrir la fuente.

Necesario:

- Modelo comun para `EvidenceRef`: movimiento, cuenta, categoria, contacto,
  presupuesto, suscripcion, ingreso fijo, obligacion, evento, adjunto.
- Preview compacto de evidencias.
- Accion "ver movimientos" o "abrir detalle" en cada resultado.
- Exportacion que incluya fecha de generacion y filtros usados.

### 4. Persistencia De Insights

Objetivo: que anomalias, forecast y recomendaciones tengan estado de producto.

Necesario:

- Estado: nuevo, visto, aceptado, ignorado, archivado.
- Feedback: util, no util, no avisar de esto.
- Snapshot reproducible para explicar por que se genero.
- Version de algoritmo para recalculos.

Nota: hoy `workspace-data.ts` consulta/persiste senales si existen tablas como
`movement_analytics_signals` y `workspace_analytics_snapshots`, pero el plan debe
validar el esquema real antes de depender de ellas.

### 5. Escrituras Seguras

Objetivo: preparar IA accionable y automatizaciones.

**Estado 2026-07-07: MAYORMENTE LISTO.** Fase 1 dejo: validacion compartida
entre vias (`validateMovementForm` en form Y registro rapido), idempotencia
universal (`client_dedupe_key`, incluso por linea de split), undo tras crear,
confirmacion de duplicados con evidencia, refresh de token pre-escritura en
headless y auditoria basica via `recordDetectionEvent`/`app_error_logs`. Lo que
falta para IA accionable es solo la capa de confirmacion visual del draft y el
registro de accion automatica.

Necesario:

- Reusar `validateMovementForm`, `buildMovementCreateInput`,
  `buildMovementUpdateInput` y `client_dedupe_key`.
- Confirmacion visual antes de cualquier create/update/delete.
- Undo cuando aplique.
- Registro de accion automatica: quien, cuando, input, output, entidad afectada.
- Reintentos idempotentes para acciones que puedan fallar por red.

### 6. Zonas De Alto Cuidado

Antes de tocar estas areas, leer auditorias existentes y mantener cambios chicos:

- `components/forms/MovementForm.tsx`: formulario largo y central para la app.
- `components/domain/QuickDetectedMovementEntry.tsx`: via rapida desde deteccion.
- `app/obligation/[id].tsx`: detalle complejo de obligaciones.
- `components/domain/ObligationAnalyticsModal.tsx`: analitica de obligaciones.
- `services/queries/workspace-data.ts`: snapshot y muchas mutaciones historicas.
- Pipeline nativo en `android/app/src/main/java/com/darkmoney/app/notificationdetection`
  y `lib/notification-detection-headless.ts`.

## Quick Wins Pre-Epicas (P0.5)

Hallazgos del analisis integral 2026-07-07: mejoras chicas de alto valor que no
necesitan las fundaciones de Fase 2.0 y pueden salir por OTA en dias.

1. **"Pagar" suscripcion desde la lista**: `markSubscriptionPaid` YA existe y
   hace lo correcto (crea el movimiento posted con subscription_id Y avanza
   next_due_date — queda registrado en ambos modulos). Pero solo esta expuesto
   en el detalle ("Marcar pagada"). Falta: accion de swipe en la fila de
   suscripciones + accion directa en la seccion "Proximos" del dashboard, con
   confirmacion de monto/cuenta/fecha en un sheet compacto.
2. **"Llego" ingreso fijo desde la lista**: espejo del anterior con
   `useConfirmRecurringIncomeArrivalMutation` (ya existe). Misma exposicion:
   swipe + dashboard.
3. **Alertas del dashboard → destino especifico**: las alertas de presupuesto
   navegan a la lista generica; deben abrir el presupuesto puntual (deep link
   con id + highlight).
4. **Renombrar plantillas**: hoy el nombre nace de la descripcion y no se puede
   editar; agregar rename en el long-press.
5. **Historial de pagos en el detalle de suscripcion**: lista de movimientos con
   ese subscription_id (query ya posible con filtros existentes) — "que dias y
   cuanto he pagado" visible sin salir del modulo.
6. **Split tambien en edicion y en el registro rapido de deteccion** (hoy solo
   gasto en creacion del form manual).

## Epicas Candidatas

### 1. Reportes Historicos Inteligentes

Objetivo: encontrar y entender gastos pasados aunque el usuario no recuerde la
fecha exacta.

Casos:

- "Cuanto me costo la camara que compre el ano pasado?"
- "Cuanto gaste en delivery durante diciembre?"
- "Muestrame mis compras grandes de tecnologia en 2025."
- "Que pagos hice a este contacto en los ultimos 6 meses?"
- "Cuanto me costo realmente mi viaje a Cusco?"

Aprovechar:

- `usePaginatedMovements` y `applyMovementFilters` como base conceptual.
- Exportacion CSV existente con `shareCsvAsFile`.
- Analitica de historial del dashboard avanzado.
- Contact analytics y detalle de movimientos existentes.

Nuevo:

- Modulo `reports` o `insights` con `ResourceModuleTemplate`.
- Query historica dedicada, no limitada al snapshot de 2 anos.
- Busqueda por texto, monto aproximado, categoria, contacto, cuenta, moneda y
  rango.
- Agrupacion por categoria, contacto, cuenta, comercio, periodo y moneda.
- Resultado con total, promedio, cantidad de movimientos y lista trazable.
- Guardar reportes frecuentes como accesos rapidos.

No hacer:

- No cargar todo el historial en memoria.
- No depender de una respuesta IA para calcular totales.
- No ocultar movimientos fuente.

Prioridad sugerida: **P1**.

### 2. Chat Financiero Con IA Solo Lectura

Objetivo: que el usuario pregunte por sus datos y reciba una respuesta breve,
correcta y con evidencia.

Casos:

- "Cuanto gaste en comida el mes pasado?" / "En que gaste la semana pasada en comida?"
- "Cual fue mi mayor gasto este trimestre?"
- "Creo que gaste mucho, no?" → evaluacion subjetiva: comparar contra el promedio
  de los ultimos 3 meses del usuario y responder en tono conversacional con la
  cifra, la desviacion y la evidencia ("18% mas que tu promedio; el driver fue
  delivery: estos 6 movimientos").
- "Por que baje mi ahorro este mes?"
- "Que suscripciones podria cancelar?"
- "Cuanto debo cobrar esta semana?"

Aprovechar:

- Edge functions IA y cuotas existentes.
- Dashboard AI por summary, patterns, flow, history y health.
- Motores de analitica en `services/analytics`.
- `daily-ai-digest` como antecedente de resumen accionable.

Nuevo:

- Clasificador de intenciones financieras.
- Herramientas server-side con permisos por workspace.
- Respuestas con enlaces a evidencias.
- Chips de seguimiento: ver movimientos, comparar periodo, exportar, crear
  presupuesto.
- Cache por pregunta/filtros cuando aplique.

No hacer:

- No permitir escrituras en el MVP.
- No mandar el workspace completo al modelo si una consulta SQL puede resumirlo.
- No responder cifras sin poder abrir la evidencia.

Prioridad sugerida: **P1**, despues o junto al read model historico.

### 3. IA Que Registra Movimientos Por Lenguaje Natural

Objetivo: permitir entradas conversacionales rapidas, siempre con confirmacion.

Casos:

- "Acabo de gastar 5 soles en taxi, anotalo."
- "Mas tarde voy a salir a comer y pienso gastar 10 soles" → **intencion
  futura**: crear movimiento con status `planned`/`pending` (estados que ya
  existen en el esquema). Cuando el gasto real llegue (deteccion de notificacion
  o registro manual similar en monto/dia), sugerir CONSOLIDAR: confirmar el
  planificado con el monto real en vez de duplicar.
- "Registra 120 soles de cena con tarjeta BCP."
- "Me pagaron 3500 de sueldo hoy."
- "Pague 80 a Juan por la deuda."
- "Pague mi Netflix" → mapear a `markSubscriptionPaid` (contrato ya existente),
  no a un gasto suelto.
- "Transferi 200 de BCP a Interbank."

Aprovechar:

- `MovementForm`, `validateMovementForm`, `buildMovementCreateInput`.
- Sugerencias locales/IA de categoria, contraparte y descripcion.
- Idempotencia con `client_dedupe_key`.
- Undo actual tras guardar movimiento.

Nuevo:

- Parser de comando a `MovementDraft` con confianza por campo.
- Vista compacta de confirmacion antes de guardar.
- Acciones tipadas: gasto, ingreso, transferencia, pago de obligacion,
  pago de suscripcion, llegada de ingreso fijo.
- Aprendizaje de preferencias: taxi -> transporte, sueldo -> ingreso, etc.
- Voz/audio como opcion futura, no requisito del MVP.

No hacer:

- No insertar directo desde el LLM.
- No saltarse validaciones de cuenta, moneda, monto y fecha.
- No mezclar pago de obligacion/suscripcion sin confirmar entidad destino.

Prioridad sugerida: **P1.5**, despues del chat solo lectura.

### 4. Reportes Profesionales Exportables

Objetivo: generar reportes mensuales, anuales o por tema que el usuario pueda
guardar, enviar o revisar.

Casos:

- Reporte mensual de ingresos y gastos.
- Reporte de flujo de caja personal.
- Reporte por categoria, cuenta o contacto.
- Reporte de obligaciones: por cobrar, por pagar, vencidos y pagados.
- Reporte de suscripciones y pagos recurrentes.

Aprovechar:

- CSV por modulo ya existente.
- Builders de dashboard y analitica.
- `shareCsvAsFile` para compartir archivos.

Nuevo:

- `features/reports/lib` con builders reproducibles.
- Plantillas de reporte mensual, anual y personalizado.
- Exportacion PDF cuando el contenido ya sea estable.
- Snapshot de reporte con filtros, periodo, moneda y fecha de generacion.
- Programacion opcional de reporte mensual.

No hacer:

- No duplicar builders CSV por modulo sin necesidad.
- No crear PDF antes de tener estructura de datos estable.

Prioridad sugerida: **P2**.

### 5. Inbox De Insights, Anomalias Y Alertas

Objetivo: pasar de tarjetas de dashboard a un flujo de revision accionable.

Casos:

- "Gastaste 70% mas en comida que tu promedio."
- "Este cobro parece duplicado."
- "Tu saldo puede bajar de X si se pagan tus suscripciones."
- "Hay una suscripcion que no se cobra hace meses."
- "Este movimiento no coincide con tus categorias habituales."

Aprovechar:

- `anomaly-detection`, `duplicate-detection`, `focus-scoring`.
- `ReviewInbox`, `AlertCenter`, `AnomalyWatch` y dashboard avanzado.
- Notificaciones y push existentes.

Nuevo:

- Bandeja de insights con estados de revision.
- Feedback: correcto, ignorar, no avisar de esto.
- Acciones: abrir movimiento, corregir categoria, marcar duplicado, crear regla.
- Persistencia opcional para no recalcular/mostrar lo mismo indefinidamente.

No hacer:

- No bombardear con push por cada senal.
- No mezclar alertas informativas con errores criticos.

Prioridad sugerida: **P2**.

### 6. Automatizaciones Y Reglas

Objetivo: convertir patrones repetidos en reglas controladas por el usuario.

Casos:

- "Todo lo de Uber/Yango va a Transporte."
- "Si viene de Yape y dice alquiler, asignar contacto X."
- "Si el monto es 5 y dice taxi, usar categoria Transporte."
- "Autoarchivar notificaciones duplicadas."

Aprovechar:

- Patrones locales de movimientos.
- Feedback de aprendizaje de categorias.
- Pipeline de notificaciones y dedupe.
- Sugerencias IA existentes.

Nuevo:

- Tabla propuesta `automation_rules`.
- Motor deterministico antes de IA.
- Simulacion antes de aplicar a historicos.
- Historial de ejecuciones.
- Pausar, editar y eliminar reglas.

No hacer:

- No ejecutar reglas nuevas sobre historicos sin vista previa.
- No crear reglas opacas que el usuario no pueda explicar o deshacer.

Prioridad sugerida: **P2**.

### 7. Presupuesto Predictivo Y Forecast

Objetivo: anticipar cierre de mes y presion futura, no solo mostrar el presente.

Casos:

- "A este ritmo terminaras gastando X en comida."
- "Te quedan 12 dias y S/ 340 para este presupuesto."
- "Tu flujo esperado del mes sera negativo si pagas todo lo programado."
- "Puedes ahorrar X si bajas delivery 20%."

Aprovechar:

- `cashflow-forecast.ts`.
- `buildMonthProjectionModel`.
- Presupuestos, ingresos fijos, suscripciones y obligaciones.
- Dashboard de flujo y salud.

Nuevo:

- Forecast por presupuesto/categoria.
- Escenarios simples: normal, conservador, optimista.
- Explicacion con datos fuente.
- Acciones: ajustar presupuesto, posponer pago, revisar suscripcion.

No hacer:

- No depender solo de IA para calcular proyecciones.
- No mostrar proyeccion sin nivel de confianza o datos insuficientes.

Prioridad sugerida: **P2**.

### 8. OCR, Adjuntos Y Evidencia Avanzada

Objetivo: que los comprobantes sirvan para busqueda, garantia y contexto.

Casos:

- OCR de recibo para sugerir monto, fecha, comercio y categoria.
- Buscar "garantia", "camara", "laptop", "boleta".
- Relacionar comprobantes con compras grandes.
- Ver evidencia al abrir un reporte historico.

Aprovechar:

- `AttachmentPicker`, `AttachmentPreviewModal`, `MovementAttachmentsGallery`.
- `lib/entity-attachments.ts`.
- `services/queries/attachments.ts`.

Nuevo:

- Tabla propuesta de indice de adjuntos, por ejemplo `entity_attachment_index`.
- OCR via edge function o servicio externo.
- Texto detectado, confianza, idioma, metadatos y entidad vinculada.
- Busqueda por texto OCR desde reportes.

No hacer:

- No reemplazar el storage actual.
- No subir imagenes a OCR sin permiso claro del usuario.

Prioridad sugerida: **P3**, salvo que reportes historicos lo necesiten antes.

### 9. Experiencia Multiusuario Profesional

Objetivo: que workspaces compartidos sirvan para pareja, familia o negocio
pequeno con control y trazabilidad.

Casos:

- Roles finos: lector, editor, aprobador.
- Comentarios en movimientos.
- Actividad reciente por usuario.
- Solicitudes de revision: "este gasto no lo reconozco".
- Reporte compartido mensual.

Aprovechar:

- Workspaces y `workspace_members`.
- Invitaciones de workspace.
- Obligaciones compartidas, solicitudes y edge functions de share.
- `created_by_user_id` / `updated_by_user_id` en entidades donde existe.

Nuevo:

- Activity log visible.
- Comentarios o notas colaborativas.
- Permisos por modulo o accion.
- Notificaciones de cambios relevantes.
- Politicas RLS revisadas por rol.

No hacer:

- No asumir que compartir workspace equivale a permisos ilimitados.
- No exponer reportes compartidos sin filtros de rol.

Prioridad sugerida: **P3**.

## Roadmap Sugerido

### Fase 2.-1 (inmediata) - Quick Wins

- Los 6 quick wins de la seccion P0.5, publicables por OTA sin fundaciones.
- Sirven ademas como calibracion del tren de releases OTA con usuarios reales.

### Fase 2.0 - Base De Consulta Y Seguridad De Acciones

- Read model historico.
- Contratos de herramientas IA.
- Modelo de evidencia.
- Estado persistente para insights.
- Confirmacion/undo/auditoria para acciones IA.

Resultado esperado: la app puede consultar historicos y explicar resultados sin
romper performance ni privacidad.

### Fase 2.1 - Reportes Historicos Base

- Modulo `reports` o `insights`.
- Busqueda historica estructurada.
- Reportes por periodo/categoria/contacto/cuenta.
- Export CSV inicial usando infraestructura existente.
- Sin IA accionable todavia.

Resultado esperado: el usuario responde preguntas historicas con filtros y vistas.

### Fase 2.2 - Chat Financiero Solo Lectura

- Chat con preguntas sobre datos existentes.
- Herramientas internas de consulta.
- Respuestas con evidencia y links.
- Guardrails de privacidad y costo.

Resultado esperado: el usuario pregunta y entiende, pero la IA no modifica datos.

### Fase 2.3 - IA Accionable Con Confirmacion

- Crear borradores de movimientos desde texto.
- Marcar pagos o llegadas recurrentes desde texto.
- Confirmacion visual obligatoria.
- Undo, dedupe y auditoria.

Resultado esperado: el usuario puede decir "anota esto" y DarkMoney prepara el
registro correcto para aprobarlo.

### Fase 2.4 - Insights, Automatizaciones Y Reportes Pro

- Bandeja de insights.
- Reglas sugeridas/aprobadas.
- Forecast por presupuesto.
- Reporte mensual programable.
- OCR y evidencia avanzada si el MVP historico lo justifica.

Resultado esperado: DarkMoney empieza a anticiparse y ayudar a decidir, no solo
registrar.

## Criterios De Diseno Para Modulos Nuevos

- Usar `ResourceModuleTemplate`.
- Toda logica pura nueva entra con tests en `__tests__/` (el CI los corre en
  cada push; regla establecida al cierre de Fase 1).
- Cambios solo-JS se publican por OTA (`eas update --channel preview`); cambios
  nativos requieren APK y bump de `version` (corta compatibilidad de updates).
- Si una feature cambia el shape de una query persistida (whitelist del cache),
  bumpear el `buster` en `lib/query-client.ts`.
- Instrumentar eventos de uso/fallo desde el dia 1 (patron `recordDetectionEvent`
  / `app_error_logs`).
- Registrar ruta oculta si vive en tabs y se abre desde Mas.
- Usar `useOriginBackNavigation`.
- Usar `FilterToolbar`, `ActiveFilterBar`, `ResourceContextNote`,
  `MetricSummaryBar`, `ResourceSectionList`, `BulkActionBar` y `FAB` donde
  aplique.
- Mantener reglas en `features/<module>/lib`.
- Mantener queries en `services/queries`.
- No crear rows/cards/listas inline si ya existe componente generico.
- Validar con `npm run typecheck` y `git diff --check`.

## Dependencias Tecnicas Clave

- Indices historicos por `workspace_id`, `occurred_at`, `category_id`,
  `counterparty_id`, cuentas y texto normalizado.
- Politica clara para conversion historica de moneda.
- Schemas estrictos para herramientas IA.
- Cache/cuotas por feature IA.
- Auditoria de acciones IA y automatizaciones.
- Persistencia de insights si se vuelven notificaciones o bandeja.
- Reglas RLS revisadas si se agregan reportes compartidos.
- Documentacion en `DATABASE_DICTIONARY.md` para cualquier migracion nueva.

## Riesgos

- **Alucinacion de IA**: mitigar con herramientas deterministicas y evidencia.
- **Acciones no deseadas**: toda escritura requiere confirmacion, dedupe y undo.
- **Costo IA**: usar SQL primero, cachear, resumir y limitar contexto.
- **Privacidad**: permitir restringir cuentas/categorias/rangos y minimizar datos.
- **Performance historica**: paginar, indexar y no usar snapshots enormes.
- **Ruido de alertas**: estados de revision y feedback antes de push masivo.
- **Regresiones en core**: movimientos, notificaciones y obligaciones son flujos
  centrales; cambios chicos y verificados.

## Play Store En El Horizonte

La meta declarada es publicar en Play Store. Implicancias para Fase 2:

- **Build**: pasar de APK local a AAB (EAS Build ya configurado en eas.json,
  perfil `production` con canal propio). La primera subida fija el keystore para
  siempre: usar EAS-managed keys o respaldar el upload keystore.
- **Tramite**: cuenta Play Console ($25), politica de privacidad obligatoria
  (datos financieros), formulario Data Safety, y para cuentas personales nuevas
  el closed testing de 12 testers x 14 dias.
- **Permisos sensibles**: `BIND_NOTIFICATION_LISTENER_SERVICE` y
  `SYSTEM_ALERT_WINDOW` requieren justificacion clara en la ficha; preparar el
  texto del caso de uso (deteccion de movimientos con consentimiento explicito).
- **OTA post-publicacion**: permitido por Google para JS; el canal `production`
  de EAS Update queda reservado para la app de tienda, `preview` para pruebas.

## Primeros Experimentos Recomendados

1. Reporte historico: buscar compras por texto, rango y monto aproximado.
2. Reporte trazable: total de una categoria en un mes con lista de movimientos.
3. Pregunta IA: "cuanto gaste en categoria X el mes pasado" usando herramientas
   deterministicas y evidencia.
4. Comando IA: "gaste S/ 5 en taxi" que abre confirmacion de movimiento.
5. Insight simple: gasto inusual por categoria contra promedio de 3 meses con
   accion "ver movimientos".
6. Reporte mensual exportable con CSV y estructura lista para PDF.

## Criterio De Exito

- El usuario encuentra una compra antigua en menos de 20 segundos.
- Cada respuesta IA muestra de donde salieron los numeros.
- Crear un movimiento por lenguaje natural toma menos pasos que abrir el
  formulario completo, pero conserva validacion y confirmacion.
- Las alertas ayudan a decidir y no se sienten como ruido.
- Los reportes se pueden guardar o compartir sin trabajo manual extra.
- El sistema reutiliza los motores existentes en vez de duplicar logica.

## Referencias Del Repo Revisadas

- `app/(app)/dashboard.tsx`
- `features/dashboard/components/advanced/AdvancedDashboard.tsx`
- `features/dashboard/lib/advanced-builders.ts`
- `services/analytics/*`
- `services/queries/movements.ts`
- `services/queries/workspace-data.ts`
- `services/queries/attachments.ts`
- `lib/entity-attachments.ts`
- `lib/notification-detection-native.ts`
- `lib/notification-detection-headless.ts`
- `hooks/useNotificationDetectionForegroundReconcile.ts`
- `supabase/functions/*`
- `supabase/migrations/*ai*`
- `supabase/migrations/*notification*`
- `supabase/migrations/202606100002_movements_client_dedupe_key.sql`
- `docs/AUDITORIA_REGISTRO_MOVIMIENTOS.md`
- `docs/APP_DESIGN_AND_CODE_PATTERNS.md`
- `docs/OBLIGATIONS_MODULE_AUDIT.md`
