# Motor offline — Fase 3: catálogos, presupuestos, suscripciones, ingresos recurrentes, plantillas, metas

Estado: **3.0–3.6 ejecutadas en la rama local `offline-fase3-4` (P1 y P2 resueltas por el dueño, 2026-10-13)**.
La prueba en dispositivo sigue PENDIENTE (`docs/OFFLINE_DEVICE_TEST.md`) y la migración de servidor no está aplicada.
Resultado real de 3.4–3.6 en la sección 9. Antes de leer esto: `docs/OFFLINE_ENGINE_DESIGN.md` (diseño),
`docs/OFFLINE_PHASE1_PLAN.md` (servidor) y `docs/OFFLINE_PHASE2_PLAN.md` (cliente de movimientos,
que es el **patrón a repetir**).

## 1. Objetivo y alcance

Que se puedan **crear, editar y borrar sin internet** (y sincronizar solos) estas entidades, con la
misma experiencia que ya tienen los movimientos:

| Grupo | Tablas del servidor |
|---|---|
| Catálogos | `accounts`, `categories`, `counterparties`, `counterparty_roles`, `spend_types` |
| Presupuestos | `budgets` (lectura de avance = vista `v_budget_progress`, hay que replicarla) |
| Suscripciones | Definición `subscriptions`; historial `subscription_occurrences` de solo lectura |
| Ingreso recurrente | Definición `recurring_income`; ocurrencias de solo lectura |
| Otros | `movement_templates`, `workspace_financial_goals` |

Las 10 tablas padre/catálogos de esta fase ya están en `sync_tables` (migración
`202610120001`, todas `writable`); el registro tiene 11 entradas contando `movements`.
**Faltan las dos tablas de ocurrencias.** La verificación de 3.0 confirmó que
`subscription_occurrences` no tiene `workspace_id` y `recurring_income_occurrences` no
tiene `updated_at`. No se pueden registrar tal cual en los RPC actuales; ver §7.

**No entra:** pagos/llegadas compuestos offline, obligaciones y workspaces compartidos (Fase 4), adjuntos, IA, billing, cifrado en
reposo (Fase 5), invitaciones (nunca).

## 2. Decisiones

1. **Mismo interruptor beta** (`darkmoney/offline-engine-enabled`). Apagado = comportamiento
   idéntico al actual. Nada de esto debe afectar a quien no lo active.
2. **Un único patrón genérico, no uno por tabla.** Hoy `lib/offline/movement-store.ts` y
   `movement-writes.ts` son específicos de movimientos. Extraer (sin cambiar su comportamiento ni
   sus pruebas) un almacén y un escritor genéricos parametrizados por tabla:
   `upsertMirrorRows` ya es genérico; añadir `createRowLocal / updateRowLocal / deleteRowLocal`
   que usan outbox + pool de IDs. Movimientos sigue usando su camino propio (tiene centavos y
   saldos).
3. **Migración nueva de SQLite (v2), nunca editar la v1**: tablas espejo nuevas con el mismo
   molde (`id`, `workspace_id`, `updated_at`, `data` JSON) más columnas indexadas solo si una
   consulta local las necesita. `MIRRORED_TABLES` en `schema.ts` crece; `runtime` y
   `sync-engine` ya iteran esa lista.
4. **Orden de la cola = causalidad.** Crear categoría offline y luego un movimiento que la usa:
   el outbox se envía por `seq`, así que el padre llega antes. Los IDs salen del pool
   (`reserve_ids`), nunca se inventan. Subir el tamaño del bloque por tabla si el uso real lo pide.
5. **Borrados con `RESTRICT`** (p. ej. borrar una contraparte que tiene obligaciones) pueden ser
   rechazados por el servidor al enviar: ya existe la bandeja "Para revisar / rechazados"; el mensaje
   debe explicar el motivo en lenguaje llano (`lib/offline/status-copy.ts`).
   Las referencias de movimientos a cuentas, categorías, tipos de gasto y contrapartes son
   `ON DELETE SET NULL`, no `RESTRICT`. El espejo debe conservar ese efecto. Además,
   `useDeleteSubscriptionMutation` borra explícitamente los movimientos vinculados: no debe
   sustituirse por un borrado genérico del padre que los conserve con `subscription_id = null`.
6. **Efectos de negocio que hoy hace el servidor** (triggers) y que offline hay que replicar o
   diferir. Cada uno requiere una decisión escrita en este doc antes de implementarse:
   - `trg_movements_sync_subscription`: pagar una suscripción (movimiento) marca/crea ocurrencias.
   - Avance de presupuestos (`v_budget_progress`) y su período vigente: lo abre la pantalla al
     montarse (ver memoria "presupuestos-regla-que-se-repite"); toda columna nueva sale por la vista.
   - Próximo vencimiento / estado de suscripción (`features/subscriptions/lib/subscriptionStanding.ts`
     ya es lógica pura del cliente: reutilizar).
   Regla: **réplica local con prueba de paridad contra datos reales**, o diferir al servidor con
   texto claro en la UI ("se actualiza al sincronizar"). Nunca mostrar un número que pueda diferir
   del servidor sin saberlo (lección del proyecto: medir contra datos reales antes de decidir).

## 3. Trabajo por etapas (un commit por etapa cuando el dueño lo autorice)

**3.0 Verificación solo lectura contra producción** (siempre en transacción con `rollback`):
columnas, identity ALWAYS/BY DEFAULT, FKs y `ON DELETE`, triggers y `updated_at` de las 11 tablas
y de las ocurrencias. Anotar resultados en este doc. Actualizar `DATABASE_DICTIONARY.md` (local).

**3.1 Servidor (solo si 3.0 lo pide).** Migración nueva en `supabase/migrations/` con prefijo de
fecha posterior a `202610120003`: filas nuevas en `sync_tables`, índices `(workspace_id, updated_at, id)`,
triggers `updated_at` que falten. **No se aplica a producción sin autorización explícita del dueño**;
probar en PGlite (`supabase/tests/sync/`) y, si se pide, en producción dentro de una transacción
revertida. Documentar rollback.

**3.2 Núcleo local.** Migración SQLite v2, almacén/escritor genéricos, pull/espejo de las tablas
nuevas, pruebas unitarias con `node:sqlite` (`lib/offline/__tests__/`).

**3.3 Réplicas de cálculo** (presupuestos, estado de suscripciones, próximo vencimiento): funciones
puras en `features/*/lib/` con pruebas de paridad usando fixtures reales en `.tmp/offline-fixtures/`
(gitignored; se generan con un script de solo lectura como `m3.mjs`).

**3.4 Integración por módulo**, uno por vez, siguiendo exactamente lo hecho en
`services/queries/workspace-data.ts` para movimientos: la `mutationFn` intenta
`offlineRuntime.*` primero, cae al camino online si devuelve `null`; `networkMode: "always"` solo
si `useOfflineLocalReady`; el `queryFn` lee local cuando está listo. Orden sugerido:
categorías/contrapartes/cuentas → plantillas/metas → presupuestos → suscripciones → ingreso recurrente.
Archivos: `services/queries/{accounts,categories-counterparties,spend-types,budgets,subscriptions-recurring-income,subscription-occurrences,movement-templates}.ts`.
**Cuidado:** en el árbol de trabajo hay cambios sin commitear del dueño en `app/subscriptions.tsx`,
`features/subscriptions/**` y `lib/subscription-helpers.ts`. No revertirlos, no reformatearlos,
editar mínimo y avisar si hay solape.

**3.5 UI.** El aviso/estado ya existe (`components/offline/OfflineSyncNotice.tsx`): mostrarlo en los
módulos nuevos usando el slot `context` de `ResourceModuleTemplate` (no crear componentes duplicados).
Textos en español llano (`docs/CHANGELOG_STYLE.md`).

**3.6 Pruebas.** Extender `lib/offline/__tests__/sync-engine.e2e.ts` (PGlite con migraciones reales):
alta de categoría + movimiento sin red, borrado rechazado por `RESTRICT`, edición concurrente de dos
dispositivos, presupuesto/suscripción creados offline. Actualizar `docs/OFFLINE_DEVICE_TEST.md` con
los casos nuevos para el iPhone (se registran aparte: **las pruebas automáticas no verifican el teléfono**).

## 4. Validación

`npm run typecheck`, `npm test`, `npm run test:offline-e2e`, `git diff --check`. Si se toca
navegación/pestañas/listas/gestos: conservar `detachInactiveScreens` y dejar anotado que la prueba de
swipe en iOS sigue pendiente de dispositivo. Changelog (`constants/changelog.ts`) solo cuando la
función sea visible para el usuario y se publique.

## 5. Despliegue

Cambios solo JS/SQLite-local → OTA con `npm run ota -- "..."` **solo con la autorización del dueño**
(no publicar de forma autónoma). Si la migración de servidor lo requiere, orden: servidor primero
(compatible hacia atrás), cliente después. El runtime actual es 1.1.0; otros runtimes no tienen
SQLite y no reciben el motor.

## 6. Riesgos

- **R1** Tablas de ocurrencias sin `workspace_id`: pueden no encajar en `pull_changes`. Opciones:
  sincronizarlas vía su padre, o dejarlas de solo lectura derivada. Decidir en 3.0.
- **R2** Réplica de `v_budget_progress` (conversión de monedas con tasas): alto riesgo de deriva.
  Sin paridad exacta con datos reales, mostrar el último valor del servidor.
- **R3** Pool de IDs: más tablas escribibles = más bloques; vigilar el consumo.
- **R4** Triggers del servidor que cambian filas al recibir una op (efectos laterales): el pull
  posterior debe reflejarlos; probar que el cliente no queda con datos viejos.

## 7. Resultado de 3.0 (2026-10-13)

Verificación real hecha exclusivamente con `SELECT` dentro de `BEGIN READ ONLY`, finalizada
siempre con `ROLLBACK`. No se llamó a `reserve_ids`, no se probó ningún push en producción y
no se aplicó DDL. Script y evidencia locales, gitignored:
`.tmp/offline-fixtures/phase3-schema-readonly.mjs` y `phase3-schema.json`.

| Tabla | ID identity | Workspace directo | Updated at | Resultado |
| --- | --- | --- | --- | --- |
| `accounts`, `categories`, `counterparties`, `budgets`, `subscriptions` | ALWAYS | Sí | Sí | Registradas; triggers de actualización presentes |
| `counterparty_roles`, `spend_types`, `recurring_income`, `movement_templates`, `workspace_financial_goals` | BY DEFAULT | Sí | Sí | Registradas; triggers de actualización presentes |
| `subscription_occurrences` | ALWAYS | **No** | Sí | Workspace y RLS se obtienen mediante `subscriptions`; no está registrada |
| `recurring_income_occurrences` | ALWAYS | Sí | **No** | No tiene trigger de actualización; no está registrada |

Otros hallazgos que deben conservarse al ejecutar:

- Las ocurrencias de suscripciones las materializan los triggers del padre y de movimientos.
  Su unicidad es `(subscription_id, due_date)`. No convertirlas en altas manuales independientes.
- Las ocurrencias de ingresos tienen `amount numeric(18,4)`, `actual_date` nullable,
  `currency_code text` y ningún `updated_at`. El diccionario local indicaba otra cosa y se corrigió.
  La lectura agregada encontró 5 filas, ninguna con fracciones de centavo. Esto no demuestra
  que el contrato permita redondear futuras filas con cuatro decimales.
- Las metas pertenecen a `(workspace_id, user_id)` y su RLS permite solo la meta del usuario;
  el lector local debe filtrar también por usuario, no solo por workspace.
- `accounts.opening_balance` tiene CHECK `>= 0`; la réplica no debe aceptar como definitivo
  un dato que el servidor rechaza. Preservar el camino online con el interruptor apagado.
- La Fase 1 sí está en producción: se leyeron las 11 entradas de `sync_tables` y las
  definiciones de `reserve_ids`, `pull_changes`, `sync_live_ids`, `sync_apply_op` y `push_batch`.

### Comprobación del contrato compuesto en PGlite

Se añadieron dos pruebas a `lib/offline/__tests__/sync-engine.e2e.ts`, usando las migraciones
publicadas **sin modificarlas**, roles y tablas locales del harness. No es una prueba de
paridad de triggers ni una escritura contra producción.

1. Edición inválida de suscripción seguida de movimiento válido: el lote devuelve
   `rejected / applied`; el movimiento queda y la edición no. Reenviar los mismos `op_id`
   no duplica el movimiento.
2. Movimiento rechazado por una cuenta ausente seguido de avance de un ingreso recurrente:
   devuelve `rejected / applied`; la fecha avanza y no existe el movimiento.

**Orden por `seq` no significa una unidad atómica ni conserva los abortos condicionales.**
El flujo online de `useConfirmRecurringIncomeArrivalMutation` se detiene si falla crear el
movimiento o la ocurrencia; encolar las tres operaciones y enviarlas con el contrato actual
puede avanzar la fecha después de ese fallo. `markSubscriptionPaid` tiene otro orden y admite
explícitamente el fallo parcial después de avanzar la fecha. No unificar estos comportamientos
en silencio.

## 8. Decisiones del dueño (2026-10-13)

### P1 — resuelta: flujos compuestos solo online en Fase 3

Pagar una suscripción, confirmar una llegada y todo flujo que combine movimiento + ocurrencia +
avance de fecha quedan **ONLINE-ONLY**. Sin red no se inicia ninguna parte ni se encola una
operación; se muestra un aviso claro desde `lib/offline/status-copy.ts`. Con la beta apagada
se preservan firmas, textos y camino online. La operación atómica de grupo se exige en Fase 4,
pero no se diseña en esta entrega.

Sí entran al núcleo offline: catálogos, presupuestos, plantillas, metas y crear/editar/borrar la
**definición** de suscripciones e ingresos recurrentes. Los hooks y la UI de esos módulos se
integrarán después (3.4 y 3.5).

### P2 — resuelta: monto exacto del servidor, historial de solo lectura

El monto se conserva **como texto exacto dentro del JSON local**. Nunca se redondea en silencio.
Una fila con fracción de centavo es de solo lectura offline. Las ocurrencias de ingresos son
siempre de solo lectura en esta fase: se permite añadir `updated_at` + trigger y registrarlas
con `writable = false`. Las de suscripciones se leen por el padre, no se registran en
`sync_tables` ni se reservan IDs para ellas.

Para no perder precisión durante el transporte, el nuevo SQL convierte `amount` a texto antes
de construir el JSON de esas filas. Los centavos indexados se calculan solo cuando el valor
es exactamente representable en centavos; el JSON mantiene el valor de cuatro decimales.

### Preguntas abiertas actuales

Ninguna para 3.1–3.3. La Fase 4 necesita el contrato atómico de grupos como requisito previo,
sin diseño ni implementación en esta entrega.

## 9. Validación histórica de 3.0, antes de resolver P1/P2 (2026-10-13)

| Comando ejecutado | Resultado literal/resumen del proceso |
| --- | --- |
| `npm run typecheck` | Código 0; `tsc --noEmit` terminó sin errores |
| `npm test -- --runInBand` | Código 0; `Test Suites: 183 passed, 183 total`; `Tests: 1507 passed, 1507 total` |
| `npm run test:offline-e2e` | Código 0; `tests 19`; `suites 6`; `pass 19`; `fail 0`; `skipped 0` |
| `git diff --check` | Código 0; sin errores de whitespace |

Jest avisó `Jest did not exit one second after the test run has completed`, pero el proceso
terminó con código 0. Ese aviso también estaba en la validación anterior a los cambios.
Git emitió avisos de conversión LF → CRLF para documentos y la prueba e2e; no fueron errores
de whitespace. Logs locales: `.tmp/phase3-final-*.log`.

En 3.0 no se ejecutó git add, commit ni push; no se publicó OTA/EAS; no se escribió ni aplicó una
migración. Los archivos de trabajo del dueño no se editaron. `DATABASE_DICTIONARY.md` y
los fixtures permanecen gitignored. No hay una nueva función visible que anunciar en changelog.

## 10. Entrega 3.1–3.3 (2026-10-13)

### 3.1 — terminada, migración escrita y probada únicamente en PGlite

`202610130001_sync_readonly_occurrences.sql` añade `updated_at`, trigger e índice al historial
de ingresos; lo registra como readonly. El RPC nuevo de suscripciones lee el hijo mediante
el padre con RLS, pagina y devuelve IDs vigentes. Ambos transportan sus montos como texto SQL.
Las migraciones publicadas quedan intactas. El diccionario local documenta el borrador y rollback.

### 3.2 — núcleo terminado, sin conectar todavía los CRUD de los módulos

- SQLite v2 añadida al final; el SQL de v1 tiene una prueba de hash y no cambió. Las cuentas de
  una base v1 se convierten en v2 a JSON con dinero como texto y columna de centavos enteros.
- Almacén/escritor genéricos para las diez tablas: ID reservado + espejo + outbox en una
  transacción. Sin pool/hidratación se devuelve el indicador de fallback, sin inventar IDs.
- Cada tabla tiene hidratación independiente. Ausencia de una tabla/RPC en un servidor antiguo
  no equivale a una lista vacía y no borra su caché. Ocurrencias fuera del escritor y del pool.
- Dinero como texto exacto, centavos indexados solo si son representables. Fracciones en campos
  o descuentos dejan la definición readonly; metas filtradas por usuario y workspace.
- Borrados replican SET NULL/CASCADE. Un rechazo de padre fuerza recarga de las tablas afectadas
  para restaurar sus hijos; SQLSTATE `23001` también se traduce a dependencia en la bandeja.
- Los lotes contienen un prefijo ordenado sin repetir una fila: permite crear padre + hijo y
  luego borrar el padre con la versión confirmada del insert. No transforma el lote en atómico.
- P1 añade guardas mínimas en los hooks de pagar suscripción y confirmar llegada; creación,
  edición, anulación y borrado de movimientos vinculados siguen el camino online. Borrar una
  suscripción con pagos tampoco se sustituye por un borrado genérico con otra semántica.

### 3.3 — funciones puras y paridad terminadas, todavía sin conectar a las queries

Captura nueva `.tmp/offline-fixtures/phase3-parity-readonly.mjs`: exclusivamente SELECT dentro
de BEGIN READ ONLY + ROLLBACK. JSON privado gitignored, sin credenciales. Se leyeron 1.119
movimientos, 5 cuentas, 27 categorías, 9 contactos, 3 tipos de gasto, 5 presupuestos, 5
suscripciones, 9 ocurrencias y 2 tasas, junto con las vistas y el calendario SQL vigentes.

- `offlineBudgetProgress`: paridad **exacta en todos los campos de los 5 presupuestos** contra
  `v_budget_progress`, incluyendo dinero, porcentaje, conteo y labels. Conversión por movimiento
  y redondeo decimal como PostgreSQL con BigInt, sin sumar dinero con floats.
- `offlineSubscriptionState`: paridad con cada fila de `v_subscription_upcoming` (1 pendiente)
  y con los agregados SQL de pendientes de las 5 suscripciones. Reutiliza `subscriptionStanding`
  sin editarlo; la parte visual se comprueba contra ese presenter, no contra una vista que no existe.
- Se confirmó la firma real `next_subscription_due(date, frequency, interval, anchor)`; la
  captura inicial de tres argumentos se corrigió para incluir `day_of_month`. Paridad del helper
  existente para las 5 filas reales y **108 casos SELECT** con seis cadencias, dos intervalos,
  ancla nula/31/4, fin de mes y bisiesto. No se cambiaron las funciones del dueño.
- Gate explícito: beta, datos completos, paridad verificada y sin efectos de servidor pendientes.
  Zona SQL distinta de UTC, fracción de centavo, rango inválido, tasas ambiguas o total del
  presenter que pierda centavos conservan el valor del servidor. No se oculta su valor en esos casos.

### Requisitos para integrar 3.4 (fuera de esta entrega)

Los hooks deberán mapear defaults reales, mantener sus firmas y elegir local solo con todas las
tablas necesarias hidratadas. Las réplicas reciben las tasas persistidas, no constantes. Marcar
`serverEffectsPending` si una definición tiene cambios sin confirmar cuyos triggers modifican
historial/fechas; hasta el pull se conserva el valor del servidor. No generar ocurrencias ni
abrir nuevos períodos en estas funciones puras. El despliegue exige servidor compatible antes
de habilitar las lecturas nuevas; esta entrega no aplicó la migración ni publicó cliente.

### Validación por etapa y fallos encontrados

| Etapa | typecheck | npm test (serial) | offline-e2e | diff --check |
| --- | --- | --- | --- | --- |
| 3.1 | Código 0 | 183 suites / 1.507 tests, código 0 | 21 tests / 7 suites / 0 fallos, código 0 | Código 0 |
| 3.2 | Código 0 | 184 suites / 1.518 tests, código 0 | 24 tests / 8 suites / 0 fallos, código 0 | Código 0 |
| 3.3 y revisión final | Ver informe de cierre | Ver informe de cierre | Ver informe de cierre | Ver informe de cierre |

Fallos intermedios, corregidos: TypeScript rechazó leer metadata sin estrechar el tipo JSON;
PGlite rechazó borrar un padre recién insertado en el mismo lote (`edited_since`) y devolvió
`23001` sin clasificarlo como dependencia. La primera prueba de calendario también comparó
IDs string del driver pg contra IDs numéricos del JSON; se normalizaron los IDs del fixture.
Ninguno se ocultó reduciendo las pruebas o cambiando una migración publicada.

Logs por etapa: `.tmp/phase3-1-*`, `.tmp/phase3-2-*`, `.tmp/phase3-3-*` y `.tmp/phase3-final-*`.
La suite PGlite comprueba el contrato RPC y relaciones representativas en su harness; no
sustituye todos los triggers financieros/RLS de producción ni la prueba en dispositivo.
Informe de archivos, resultados literales, riesgos y prueba manual: `OFFLINE_PHASE3_REPORT.md`.

## 9. Resultado de 3.4–3.6 (2026-10-13/14, rama `offline-fase3-4`)

Con el interruptor encendido, **cuentas, categorías, contactos, tipos de gasto, plantillas, presupuestos y las definiciones de
suscripciones e ingresos recurrentes** se crean, editan y borran por la base local y se sincronizan solos. Los pagos de
suscripciones y las llegadas de ingresos siguen en línea (P1). Las metas y los roles de contacto no tienen pantalla en la app.

- **Lectura:** el snapshot (cuentas, categorías, contactos, suscripciones, ingresos) y la pantalla de categorías leen la copia
  local cuando está lista (`withLocalRows`); tras escribir sin red el cache se rehace desde ella (`applyLocalCatalogsToCache`),
  conservando lo que solo calcula el servidor (resumen financiero de cada contacto).
- **Presupuestos:** el avance se calcula en el teléfono (réplica con paridad) solo cuando hay presupuestos, gastos, cuentas,
  categorías o tipos de gasto sin enviar; si no, manda el servidor. Cualquier duda (zona horaria distinta de UTC, fracción de
  centavo, tasa ambigua) conserva el valor del servidor.
- **Escritura:** mismas validaciones que el camino online (nombre único de tipo de gasto, categoría con movimientos/
  suscripciones/subcategorías, suscripción con pagos). Un monto con fracción de centavo cae al camino online.
- **Fuera de esta ejecución:** el historial de cada suscripción sigue leyendo del servidor (sin red muestra el último dato
  guardado); el aviso de sincronización no se agregó a `app/subscriptions.tsx` porque ese archivo tiene cambios sin commitear
  del dueño.
- **Pruebas:** e2e con dos dispositivos (varios catálogos, respuesta perdida sin duplicar, edición de lo borrado por otra
  persona, edición concurrente) y Jest para escritura, cache, presupuestos y el aviso. Guía de dispositivo en
  `docs/OFFLINE_DEVICE_TEST.md` (secciones A–F).
