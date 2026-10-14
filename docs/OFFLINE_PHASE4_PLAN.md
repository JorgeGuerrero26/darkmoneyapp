# Motor offline — Fase 4: obligaciones y workspaces compartidos

Estado: **ejecutada en la rama local `offline-fase3-4` con el alcance de la sección 6; prueba en dispositivo
PENDIENTE**. Depende de que la Fase 2 esté validada en el iPhone y de
que la Fase 3 haya dejado el patrón genérico (almacén/escritor por tabla). Puede cambiar después de
esas pruebas. Contexto: `docs/OFFLINE_ENGINE_DESIGN.md`, `OFFLINE_PHASE1_PLAN.md`,
`OFFLINE_PHASE2_PLAN.md`, `OFFLINE_PHASE3_PLAN.md`.

**Decisión del dueño, 2026-10-13:** los flujos compuestos quedan solo online en Fase 3.
Fase 4 requiere una operación atómica de grupo en servidor: todo o nada, rollback de todas
las partes, reintento idempotente y bandeja con el resultado del grupo. No basta ordenar por
`seq`. **No se diseña ni implementa ese contrato aquí:** los pagos, intereses, ajustes y cualquier flujo
que combine evento + movimiento siguen siendo solo en línea (ver sección 6).

## 1. Objetivo y alcance

1. **Obligaciones offline** (deudas/préstamos): crear, editar, registrar pagos/eventos, borrar.
2. **Workspaces compartidos**: usar el motor con más de un workspace por usuario y con roles
   distintos (dueño, miembro, solo lectura), con conflictos reales entre personas.
3. **Obligaciones compartidas vistas por viewers** (no son miembros del workspace): caché aparte,
   **solo lectura**, alimentado por la edge function `list-shared-obligations`.

| Grupo | Tablas |
|---|---|
| Núcleo | `obligations`, `obligation_events` |
| Compartir | `obligation_shares`, `obligation_payment_requests`, `obligation_event_viewer_links` |
| Auditoría | `obligation_change_history` (solo lectura local; la escribe el servidor) |
| Lectura de pertenencia | `workspace_members` (espejo de solo lectura, ya contemplado en el diseño) |

**No entra:** invitaciones a workspaces (nunca offline), IA, billing, adjuntos (Fase 5),
cifrado en reposo (Fase 5).

## 2. Decisiones

1. **El servidor manda sobre las reglas de negocio.** El trigger
   `obligation_events_settle_and_guard` (rechaza sobrepagos y marca la obligación `paid`) existe solo
   en servidor. Offline el cliente puede **mostrar** el estado esperado con una réplica local, pero el
   servidor decide: un sobrepago al sincronizar vuelve como `rejected` a la bandeja con el motivo
   ("el pago excede lo que se debía"), y el estado local se corrige con el pull.
2. **Réplica de `v_obligation_summary` y `v_counterparty_summary`** (saldo pendiente, pagado,
   próximo vencimiento): funciones puras en `features/obligations/lib/` con pruebas de paridad contra
   datos reales (fixtures de solo lectura en `.tmp/offline-fixtures/`). Si no hay paridad exacta,
   mostrar último valor del servidor con la etiqueta de "pendiente de sincronizar".
3. **Idempotencia propia:** `obligations` y `movements` ya tienen `client_dedupe_key`; el resto usa
   `op_id` (`sync_applied_ops`). No inventar un tercer mecanismo.
4. **Revisión de conflictos** (`sync_tables.review_fields` / `review_status`): definir y registrar en
   la migración qué campos de `obligation_events` (monto, fecha, tipo) y de `obligations` (monto
   principal, contraparte, moneda) se aplican pero se **marcan para revisar** si otra persona los
   cambió desde la lectura base. Todo lo que sea dinero prefiere marcar de más que de menos.
5. **Pago de obligación = evento + (a veces) movimiento.** Ver cómo `obligations-impl.ts` ya
   encadena ambos y tratarlo como **una unidad en la cola** (mismas reglas de orden por `seq`); si
   falla una mitad, la bandeja debe mostrar ambas.
   Una unidad en la cola no es automáticamente una transacción en servidor: el `push_batch`
   publicado admite `rejected` para una fila y `applied` para la siguiente. Resolver y probar
   el contrato compuesto de la Fase 3 antes de reutilizarlo aquí; no asumir que el orden lo resuelve.
6. **Multi-workspace en el runtime.** Hoy `OfflineRuntime` maneja **un** `workspaceId` activo
   (`configure({ enabled, userId, workspaceId })`) con cursores por `(workspace, tabla)`. Ampliar a
   N workspaces del usuario: hidratar y hacer pull de cada uno (acotado con `runBounded`), cola
   compartida con `workspace_id` por operación, `canReadLocal(workspaceId)` por espacio. Respetar el
   cooldown/concurrencia de `lib/query-client.ts` y el lock de auth (`lib/auth-warmup.ts`).
7. **Permisos:** pérdida de acceso o rol insuficiente al enviar → `rejected` con motivo claro
   ("ya no tienes permiso en este espacio"), nunca error genérico. El espejo de `workspace_members`
   permite **ocultar** acciones no permitidas offline; el servidor sigue siendo la autoridad (RLS).
8. **Viewers:** caché local de solo lectura separado del espejo (otra tabla SQLite, otra ruta de
   refresco); jamás entra a la cola. Si no hay red, se muestra el último caché con su antigüedad.

## 3. Trabajo por etapas

**4.0 Verificación solo lectura contra producción** (transacción con `rollback`): columnas, FKs,
`ON DELETE` (cascadas de `obligations` hacia eventos/shares/solicitudes/links/historial;
`obligations → counterparties` es `RESTRICT`), triggers, RLS de cada tabla por rol, funciones y
vistas que las usan. Documentar las 4 tablas hoy ausentes del diccionario y actualizar
`DATABASE_DICTIONARY.md` (local).

**4.1 Servidor.** Migración nueva (prefijo posterior a la última de Fase 3): filas en `sync_tables`
con `review_fields`, índices `(workspace_id, updated_at, id)`, triggers `updated_at` faltantes;
revisar que `push_batch` respeta el trigger de obligaciones (rechazo ≠ error del lote). Probar en
PGlite (`supabase/tests/sync/`). **No aplicar a producción sin autorización explícita.** Rollback
documentado.

**4.2 Multi-workspace en el motor** (§2.6) con pruebas de runtime (`runtime.test.ts` ampliado) y e2e.

**4.3 Núcleo de obligaciones local:** migración SQLite v3, almacén y escritor (reusa lo genérico de
Fase 3), unidad "pago = evento + movimiento", bandeja con motivos.

**4.4 Réplicas de cálculo** (§2.2) con paridad real.

**4.5 Integración**: `services/queries/obligations.ts` y `obligations-impl.ts` (≈3.300 líneas:
cambios mínimos y por función; el corte físico de la Fase 4.2 del refactor ya está hecho, no
reabrirlo), mismo patrón que movimientos (`offlineRuntime.*` primero, `networkMode` condicionado,
lectura local si `useOfflineLocalReady`). Pantallas bajo `features/obligations/**` y `app/obligation*`:
solo el aviso de estado en el slot `context`; sin componentes duplicados. Respetar `?from=more` y
`useOriginBackNavigation`.

**4.6 Viewers (solo lectura):** caché de `list-shared-obligations`, indicador de antigüedad.

**4.7 Pruebas:** e2e con dos dispositivos y dos usuarios distintos en el mismo workspace
(conflicto de monto, sobrepago concurrente, pérdida de permiso, borrado de obligación con eventos),
paridad con datos reales, y casos nuevos en `docs/OFFLINE_DEVICE_TEST.md`. **Prueba en dispositivo
registrada por separado** (no sustituible por las automáticas).

## 4. Validación y despliegue

Igual que Fase 3: `npm run typecheck`, `npm test`, `npm run test:offline-e2e`, `git diff --check`;
servidor primero (compatible hacia atrás) y cliente después; OTA solo con autorización del dueño.

## 5. Riesgos

- **R1** Doble escritura (evento + movimiento) con fallo parcial: es el mayor riesgo de
  inconsistencia de dinero. Sin una prueba e2e que lo cubra, no se activa.
- **R2** Dos personas pagando la misma obligación sin red: el servidor rechaza el que llega segundo
  si sobrepasa; el usuario debe entender por qué (copy).
- **R3** Multi-workspace multiplica el volumen del pull inicial y el uso de disco; medir y acotar.
- **R4** Roles/permisos que cambian mientras el dispositivo está offline.
- **R5** `v_obligation_summary` es la réplica más delicada del proyecto; sin paridad, no se oculta
  el valor del servidor.

## 6. Resultado de la ejecución (2026-10-13/14, rama `offline-fase3-4`)

Decisión del dueño aplicada: pagos y flujos compuestos **solo en línea**; la operación atómica de grupo **no se implementa**
y queda como requisito de una fase posterior. Lo hecho se probó en automático (Jest, PGlite con las migraciones reales y
SQLite en memoria); **nada se probó en un teléfono** y la migración de servidor **no está aplicada**.

| Etapa | Estado | Qué quedó |
|---|---|---|
| 4.0 verificación en producción | hecha (solo lectura + ROLLBACK) | `obligations` encaja en el motor genérico (identity, `workspace_id`, `updated_at`, RLS por miembro). `obligation_events` NO tiene `workspace_id` y su trigger decide sobrepagos: no puede ir por el lote genérico. Diccionario local actualizado. |
| 4.1 servidor | escrita y probada en PGlite, **sin aplicar** | `202610140001_sync_obligations.sql`: índice de descarga, trigger `updated_at` asegurado y registro de `obligations` en `sync_tables` (escribible, revisión de `principal_amount`/`counterparty_id`/`currency_code` mientras esté activa). |
| 4.2 varios espacios | hecha | El runtime sincroniza **todos** los espacios del usuario (primero el abierto) y envía lo pendiente de un espacio aunque ya esté en otro. Corrige un fallo de la Fase 2: lo guardado en el espacio A quedaba sin enviar al pasar al B. Cambiar de espacio ya encuentra la copia lista. |
| 4.3 núcleo de obligaciones | hecha (definiciones) | SQLite v3 (`obligations`), escritura genérica con cola, aviso al borrar un contacto con obligaciones (RESTRICT) y SET NULL de la cuenta de liquidación. |
| 4.4 réplicas de cálculo | **no aplica** | No se replica `v_obligation_summary`: lo que se crea sin red se muestra con el resumen mínimo exacto de una obligación sin pagos (pendiente = principal, avance 0) y se reemplaza por el del servidor al sincronizar. Lo editado conserva todo lo que calcula el servidor. |
| 4.5 integración | hecha (crear, editar, archivar) | Hooks con la base local primero; con movimiento de apertura: aviso de internet y nada guardado. Contactos: comprobación local de movimientos y obligaciones. Aviso de sincronización en Obligaciones. |
| 4.6 invitados (solo lectura) | hecha | `shared-obligations` se guarda en disco **solo con el modo sin conexión encendido** (24 h máximo). Nunca entra a la cola. |
| 4.7 pruebas | hecha en automático | 5 escenarios e2e con dos dispositivos (alta, fusión de ediciones, revisión de conflicto, contacto con obligaciones, SET NULL) + pruebas de la lista fusionada, del runtime con dos espacios y de la persistencia. |

**Fuera de esta ejecución, a propósito (siguen en línea):** borrar una obligación (no se conocen sus eventos sin
reflejarlos), registrar pagos/intereses/ajustes, editar o borrar eventos, compartir (invitaciones, solicitudes de pago,
vínculos de invitado) y la operación atómica de grupo.

### Preguntas abiertas

1. **Operación atómica de grupo** (pago = evento + movimiento, y apertura de obligación = obligación + movimiento): contrato de
   servidor nuevo con rollback, reintento idempotente y bandeja con el resultado del grupo. Sin ella, esos flujos no pueden
   ofrecerse sin conexión. Lo decide el dueño cuando haya prueba en dispositivo.
2. **Espejar `obligation_events` de solo lectura** (lectura por el padre, como las ocurrencias de suscripciones) permitiría
   borrar obligaciones y replicar `v_obligation_summary` con paridad. Es la réplica más delicada del proyecto: no se hizo
   sin paridad contra datos reales.
3. **Pool de IDs y volumen:** cada espacio nuevo reserva ~200 IDs por tabla escribible (12 tablas) y descarga su copia
   completa. Medir en dispositivo con un usuario con varios espacios.
