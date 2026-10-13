# Motor offline propio — diseño (Fase 0)

Estado: **borrador de Fase 0, 2026-10-12.** Nada de esto está implementado.
Decisiones ya tomadas por el dueño: offline **completo** (opción C), **motor propio** (no
PowerSync), conflictos en workspaces compartidos = **último escritor gana por campo**, salvo
montos de movimientos ya confirmados, que se marcan para revisión. Sincronización **continua y
transparente**, más botón manual de respaldo. No existe proyecto Supabase de pruebas.

## 1. Modelo

Hoy la UI espera al servidor y el caché de React Query (AsyncStorage, 24 h, primera página)
es una copia. El objetivo es **local-first**: la UI lee y escribe en SQLite (`expo-sqlite`) y
un motor reconcilia con Supabase.

```
UI → hooks (misma firma) → repositorio SQLite ──┐
                                                 ├─ motor de sync ⇄ Supabase (RPC)
escritura local → cola de operaciones ───────────┘
```

## 2. Qué se sincroniza

| Nivel | Tablas | Fase |
|---|---|---|
| 1 | `movements` (lectura/escritura). Solo lectura: `accounts`, `categories`, `counterparties`, `counterparty_roles`, `spend_types`, `currencies`, `exchange_rates`, `workspaces`, `workspace_members` | 2 |
| 2 | Escritura de catálogos, `budgets`, `subscriptions` + `subscription_occurrences`, `recurring_income` + occurrences, `movement_templates`, `workspace_financial_goals` | 3 |
| 3 | `obligations`, `obligation_events`, `obligation_shares`, `obligation_payment_requests`, `obligation_event_viewer_links`, `obligation_change_history` | 4 |
| Nunca | IA, billing, entitlements, invitaciones, telemetría, `app_error_logs`, `inbound_email_aliases`. `notifications` solo como caché de lectura. | — |

Los viewers de obligaciones compartidas no son miembros del workspace: leen por la edge
function `list-shared-obligations` (service role). Su lectura offline es un caché aparte y de
solo lectura (Fase 4).

## 3. Hallazgos que condicionan el diseño

1. IDs `bigint` generados por el servidor.
2. No hay borrado lógico (ningún `deleted_at`): los borrados son físicos.
3. `updated_at` existe en las tablas, pero no se encontró en `supabase/migrations/` el trigger
   que lo mantiene (probablemente vive en el esquema base). **Verificar en la base.**
4. El servidor calcula: `v_account_balances`, `v_budget_progress`, `v_obligation_summary`,
   `v_counterparty_summary`, `v_latest_exchange_rates`, `movements_filtered_summary`,
   `movement_filter_amount` y el trigger `obligation_events_settle_and_guard` (rechaza
   sobrepagos y marca `paid`). Hay que replicarlo en el cliente.
5. Realtime ya no existe; lo reemplaza `hooks/useForegroundDataRefresh.ts`. El pull del motor
   se engancha ahí.
6. El servidor escribe con la app cerrada (detección por correo, triggers): el pull lo recoge.
7. Tablas usadas por el código y ausentes de `DATABASE_DICTIONARY.md`:
   `obligation_payment_requests`, `obligation_event_viewer_links`,
   `workspace_analytics_snapshots`, `movement_analytics_signals`.

## 4. Decisiones propuestas

### 4.1 IDs — bloques reservados

RPC `reserve_ids(p_table text, p_count int)` devuelve un rango de IDs reales sacado de la
secuencia de la tabla. El cliente guarda un bloque (~200 por tabla) y asigna IDs reales offline;
`push_batch` inserta con ID explícito (función `SECURITY INVOKER` que necesita que la columna
acepte ID explícito: validar `generated always` vs `by default`).

- Ventaja: ninguna referencia (movimiento → cuenta, etc.) se reescribe al sincronizar.
- Respaldo si el bloque se agota offline: IDs temporales negativos + remapeo al subir.
- Se rellena el bloque en cada sync con red cuando queda por debajo de un umbral.
- **Por validar (spike):** que los huecos en la secuencia no rompan nada que asuma contigüidad.

### 4.2 Borrados — tabla de tombstones

`sync_tombstones(table_name, row_id, workspace_id, deleted_at)` llenada por un trigger
`AFTER DELETE` en cada tabla sincronizable. No toca ninguna de las consultas existentes
(más de 100 `from("...")` en el cliente). El pull trae tombstones posteriores al cursor.
Se purga pasado un plazo (p. ej. 90 días); un dispositivo sin sincronizar más tiempo que eso
hace resync completo.

### 4.3 Cursor de pull

`pull_changes(p_workspace_id, p_since timestamptz, p_tables text[], p_limit int)` por keyset
`(updated_at, id)`, con **solape de ~2 min** sobre el cursor y upserts idempotentes en el
cliente (una transacción que confirma tarde con `updated_at` anterior no se pierde). Requiere
índice `(workspace_id, updated_at)` por tabla y el trigger de `updated_at` verificado.

### 4.4 Escritura — log de operaciones

Cada cambio local guarda en SQLite una fila de cola:

```
op_id uuid · table · row_id · kind (insert|update|delete) · changed_fields json
· base_updated_at · created_at · attempts · status (pending|sent|applied|rejected)
```

`push_batch(p_ops jsonb)` aplica en orden, **idempotente por `op_id`** (tabla
`sync_applied_ops`), `SECURITY INVOKER` para que el RLS actual aplique tal cual. Responde por
op: `applied | merged | rejected(reason)`. Es la generalización de `client_dedupe_key`, que
se mantiene en `movements` y `obligations`.

### 4.5 Conflictos

Servidor manda. Si la fila cambió desde `base_updated_at`:
- campos distintos → se fusionan;
- mismo campo → gana el último escritor;
- monto/cuentas de un movimiento `posted` → se aplica pero se marca **para revisión**.

Rechazos (sobrepago por el trigger de obligaciones, pérdida de acceso al workspace, fila
borrada por otro): bandeja **"Cambios no aplicados"** con el motivo y acción de reintentar o
descartar. Offline el usuario ya vio el cambio como guardado, así que la bandeja es obligatoria.

### 4.6 Cálculos derivados

Funciones TS puras en `features/*/lib/` que replican las vistas y RPC listados en 3.4, con
**pruebas de paridad**: fixtures con la salida real del servidor (capturadas en solo lectura)
contra la salida local. Ya existen piezas (`movementActsAsIncome`, `catalogMovementAmount`,
`convertAmountToWorkspaceBase`). Es la parte de mayor costo y riesgo de deriva: cada migración
futura que cambie una vista debe actualizar su réplica y su fixture.

### 4.7 Capa de lectura

Los hooks de React Query mantienen su firma; su `queryFn` pasa a leer del repositorio SQLite.
Tras una escritura local o un pull, un bus de eventos invalida las queries afectadas. Se activa
**por módulo con un flag** (`OFFLINE_ENGINE_<modulo>`), publicado primero apagado. El
`PersistQueryClientProvider` se retira módulo a módulo; el `buster` de `lib/query-client.ts` se
bumpea en cada cambio de shape.

### 4.8 Sesión y seguridad

- La lectura local nunca depende de tener sesión viva.
- La cola de envío espera a un token válido; respetar el lock de auth documentado en
  `lib/auth-warmup.ts` y `lib/query-client.ts` (no disparar ráfagas al volver a primer plano).
- Una base SQLite **por usuario**, borrada al cerrar sesión. Valorar cifrado en reposo (SQLCipher
  o clave en SecureStore) como requisito de seguridad antes de la Fase 5.
- Usar el cooldown y la concurrencia acotada de `lib/query-client.ts` (`runBounded`) para el
  pull inicial.

### 4.9 Adjuntos

Cola de subidas separada (Storage): primero se sincroniza la metadata en `attachments`, luego
el archivo desde `expo-file-system`, con reintento. No pasa por el log de filas.

### 4.10 Disparadores del motor

Push inmediato tras cada escritura local (debounce corto) · al volver la conectividad · al
volver a primer plano (reutilizando `useForegroundDataRefresh`) · al llegar un push · botón
manual · reintento con backoff exponencial. El sync con la app cerrada no es fiable en Android
y es muy limitado en iOS: **no se promete**; se sincroniza al abrir.

## 5. Plan de validación de la Fase 0

**Estado (2026-10-12): Fase 0 completa.** M1, M2, M3, S2 y S3 hechos; S1 con referencia en PC (medición en teléfono diferida a la Fase 2). Detalle en la sección 8.

No hay proyecto Supabase de pruebas, y las migraciones nuevas no se corren contra producción
sin una decisión explícita del dueño. Por eso:

| Spike | Se puede hoy | Notas |
|---|---|---|
| S1. `expo-sqlite` en el teléfono: 10 mil movimientos, insertar y consultar, midiendo | Sí (solo cliente) | Requiere build de desarrollo con la dependencia nativa |
| S2. Prototipo de `pull_changes` y tiempos en Nano | **No** sin entorno de pruebas | Alternativa: escribir el SQL y revisarlo por papel, o crear un proyecto de pruebas |
| S3. Bloques de IDs con inserción de ID explícito | **No** sin entorno de pruebas | Revisar por papel la definición de las columnas `id` en el esquema base |
| M1. Filas por tabla del workspace más grande | Sí (solo lectura, vía pooler) | Dimensiona la sincronización inicial |
| M2. Verificar trigger de `updated_at`, cascadas y índices | Sí (solo lectura) | Condiciona 4.3 |
| M3. Capturar fixtures de vistas para pruebas de paridad | Sí (solo lectura) | Sirve a 4.6 |

**Recomendación:** crear un proyecto Supabase de pruebas (el plan gratuito basta) antes de la
Fase 1; la Fase 1 modifica el esquema y no debe estrenarse en producción. Cada migración nueva
se documenta en `DATABASE_DICTIONARY.md` (regla del proyecto).

## 6. Fases (resumen)

| Fase | Contenido | Estimación |
|---|---|---|
| 0 | Este diseño + S1, M1–M3 (+ S2, S3 si hay entorno de pruebas) | 1 semana |
| 1 | Servidor: índices y triggers de `updated_at`, `reserve_ids`, `pull_changes`, `sync_live_ids`, `push_batch`, `sync_applied_ops`. **Escrita y probada (ver `OFFLINE_PHASE1_PLAN.md`); pendiente de aplicar a producción** | 2–3 semanas |
| 2 | SQLite + motor + piloto de movimientos de punta a punta | 4–6 semanas |
| 3 | Catálogos, presupuestos, suscripciones, ingresos recurrentes | 4–5 semanas |
| 4 | Obligaciones y workspaces compartidos | 4–6 semanas |
| 5 | Endurecimiento, migración del caché, cifrado, pruebas en dispositivo, APK | 3–4 semanas |

## 7. Restricciones de despliegue (de CLAUDE.md)

- `expo-sqlite` es dependencia nativa: **APK nuevo con bump de `version`**; el motor no llega por
  OTA a los binarios actuales. Pasar `npm run build:android` con el preflight.
- iPhone: sin cuenta Apple Developer de pago el IPA sigue congelado en 1.0.8. Vía gratuita
  posible: compilar el IPA sin firmar en un runner macOS de GitHub Actions y firmarlo con
  Sideloadly (por probar; limita los minutos de macOS en repos privados). No bloquea las
  Fases 0–4.
- Si un cambio altera el shape de datos persistidos, bumpear el `buster` en
  `lib/query-client.ts`.
- Regla nueva para el proyecto una vez que arranque la Fase 1: **toda migración que toque una
  tabla sincronizable debe revisar el contrato de `pull_changes`/`push_batch` y la réplica local
  de vistas**; añadirla a CLAUDE.md cuando se apruebe el diseño.

## 8. Resultados de las mediciones (2026-10-12, solo lectura, vía pooler)

Consultas dentro de `begin read only` + `rollback`; script en el scratchpad de la sesión, fuera
del repo, sin secretos impresos.

**M1 — volumen.** Todo es pequeño:

| Tabla | Filas | | Tabla | Filas |
|---|---|---|---|---|
| `movements` | 1.238 (968 kB) | | `obligations` | 9 |
| `categories` | 37 | | `obligation_events` | 86 |
| `accounts` | 10 | | `subscriptions` / `occurrences` | 7 / 17 |
| `counterparties` | 11 | | `budgets` / `recurring_income` | 5 / 3 |

El workspace más grande tiene 1.115 movimientos (2026-03-15 → hoy). **La sincronización
inicial completa de ese workspace cabe en unos pocos cientos de kB**; no se necesita paginación
agresiva ni cursores complejos para arrancar. Corolario: la lentitud al guardar **no** es por
volumen de datos, sino por red/servidor (ver riesgo 4).

**M2 — hallazgos de esquema:**

- `updated_at` es `not null default now()` y los triggers `trg_*_updated_at` (BEFORE UPDATE)
  existen en `accounts`, `budgets`, `categories`, `counterparties`, `movements`,
  `obligation_events`, `obligations`, `recurring_income`, `subscriptions`. **Confirmado.**
  `movement_templates` y `spend_types` tienen la columna pero no se vio su trigger en la
  consulta (`spend_types`/`movement_templates` no estaban en la lista de triggers): revisar.
- **No existe ningún índice** sobre `updated_at` en las tablas sincronizables (los únicos son de
  `obligation_shares` y `workspace_invitations`). Con estos volúmenes no urge, pero se crea en la
  Fase 1 por higiene.
- **IDs: `GENERATED ALWAYS AS IDENTITY`** en todas las tablas salvo `recurring_income`
  (`BY DEFAULT`). El insert con ID explícito exige `OVERRIDING SYSTEM VALUE`, que PostgREST no
  expone: debe hacerse dentro de `push_batch` (función SQL). No requiere privilegios especiales,
  pero es **lo primero que hay que probar** cuando exista entorno de pruebas (spike S3).
- **Claves foráneas:** casi todas son `ON DELETE SET NULL` (cuentas, categorías, contrapartes,
  obligaciones → movimientos). Borrar una cuenta modifica movimientos (el trigger de
  `updated_at` dispara, así que el pull los verá). `obligations → counterparties` es `RESTRICT`.
  Cascadas reales: `obligation_events`, `obligation_change_history`, `obligation_shares`,
  `obligation_payment_requests`, `obligation_event_viewer_links` (desde `obligations`) y
  `counterparty_roles` (desde `counterparties`). El **cliente debe replicar estas reglas** al
  borrar localmente, o el estado offline divergirá del servidor.
- Triggers con efecto de negocio sobre `movements`: `trg_movements_sync_subscription`
  (INSERT/UPDATE/DELETE), `reconcile_after_manual_movement`,
  `resolve_detection_after_movement_insert`, `guard_email_detected_movement_pro`. Un push puede
  por tanto **modificar otras filas** (ocurrencias de suscripción, sugerencias detectadas): tras
  cada `push_batch` el motor debe hacer pull de esas tablas.
- Tablas no documentadas que **sí existen**: `obligation_payment_requests` y
  `obligation_event_viewer_links`. `workspace_analytics_snapshots` y `movement_analytics_signals`
  **no son tablas** (probablemente vistas o RPC): no entran al motor.

**Ajustes al diseño por estos resultados:**

1. **4.2 Borrados:** con este volumen, la alternativa más simple al tombstone es que
   `pull_changes` devuelva además la **lista de IDs vigentes** por tabla (≈10 kB para movimientos)
   y el cliente borre lo que ya no aparece. Se adopta como **versión inicial**; la tabla
   `sync_tombstones` queda como optimización si el volumen crece.
2. **4.3 Cursor:** igual de válido, pero el pull inicial puede traer todo el workspace de una vez.
3. **4.1 IDs:** sigue siendo viable; falta probar `OVERRIDING SYSTEM VALUE` (ver arriba).

### 8.1 M3 — fixtures y paridad (hecho)

Capturados en `.tmp/offline-fixtures/` (**gitignored**: contienen datos financieros reales, no
subirlos ni copiarlos fuera de la máquina): filas del workspace 1 de `movements`, `accounts`,
`categories`, `counterparties`, `budgets`, `obligations`, `obligation_events`, `workspaces`;
salidas de `v_account_balances`, `v_budget_progress`, `v_obligation_summary`,
`v_counterparty_summary`, `v_latest_exchange_rates` y `movements_filtered_summary`; más las
definiciones SQL de las vistas y funciones a portar (`view_defs.json`, `fn_defs.json`).
Scripts: `m3.mjs` (captura, solo lectura) y `bench.mjs`.

**Prueba de paridad hecha:** `v_account_balances` recalculada en SQLite local (montos en
centavos enteros) contra la salida real del servidor: **5 de 5 cuentas idénticas** (entradas,
salidas y saldo). Es la vista más simple; la prueba valida el método (fixtures + comparación),
no que las demás estén resueltas. Las de mayor riesgo siguen siendo `v_budget_progress`,
`v_obligation_summary` y `movements_filtered_summary` (conversión de monedas por tasas): sus
definiciones ya están capturadas para portarlas en Fase 2/3, cada una con su prueba de paridad.

> Regla del motor: **dinero en centavos enteros** en SQLite y en la capa de cálculo local
> (nunca `REAL`), para que los saldos coincidan con `numeric(14,2)` del servidor.

### 8.2 S2 — coste del pull en el servidor (medido como SELECT de solo lectura)

`EXPLAIN ANALYZE` sobre el workspace 1 (1.115 movimientos):

| Consulta | Tiempo de ejecución |
|---|---|
| Cambios de los últimos 7 días (33 filas) | 0,53 ms |
| Todos los movimientos del workspace | 0,83 ms |
| Solo IDs vigentes (detección de borrados) | 0,39 ms |

Hoy usan Seq Scan, que es lo correcto con tan pocas filas; el índice
`(workspace_id, updated_at)` se creará igualmente en Fase 1. **El pull no es un riesgo de
rendimiento para el servidor Nano** con estos volúmenes. Esto mide la consulta, no el viaje de
red: la latencia que percibe el usuario sigue dominada por la conexión, y es justo lo que el
modo offline deja de poner en el camino del guardado.

### 8.3 S1 — SQLite: referencia en escritorio (parcial)

`expo-sqlite` **no está instalado** en el proyecto (`node_modules/expo-sqlite` no existe) y es
dependencia nativa, así que la medición en el teléfono exige un build de desarrollo con la
dependencia añadida. Como referencia del diseño de esquema e índices se midió el mismo modelo
con `node:sqlite` en el PC (11.150 movimientos = los reales replicados 10×):

| Operación | Tiempo en PC |
|---|---|
| Insertar 10.035 movimientos en una transacción | 56,6 ms |
| Página de 30, orden fecha desc | 0,1 ms |
| Página con cursor keyset | 0,1 ms |
| Saldos de todas las cuentas | 2,0 ms |
| Resumen ingresos/gastos de un mes | 0,6 ms |
| Búsqueda `LIKE '%texto%'` | 2,0 ms |
| Insertar 1 movimiento | < 0,1 ms |
| Upsert de 50 filas (pull incremental) | 0,8 ms |

El esquema (índices por `(workspace_id, occurred_at desc, id desc)`, por cuenta origen/destino
y por `(workspace_id, updated_at)`) responde en milisegundos con **10× tus datos actuales**. En
el teléfono será más lento (típicamente 5–20×), pero seguiría en el orden de decenas de ms.
**Pendiente: confirmarlo en tu teléfono** (ver 8.5).

### 8.4 S3 — ID explícito con `OVERRIDING SYSTEM VALUE` (hecho y confirmado)

Probado dos veces, con el mismo resultado:

1. En un PostgreSQL local (PGlite 0.5.9 / PG 18), con rol `authenticated`, RLS por membresía y
   una tabla `identity always` (`.tmp/offline-fixtures/s3-pglite.mjs`).
2. **En producción, con autorización explícita del dueño (2026-10-12)**, dentro de una
   transacción que se revierte, usando solo objetos nuevos `zz_s3_*` (ninguna tabla real se leyó
   ni se escribió), con el rol `authenticated` y un `sub` real de miembro del workspace 1.
   Conteos antes/después idénticos (1.238 movimientos, 10 cuentas) y sin objetos residuales.

| Caso | Resultado |
|---|---|
| Insert directo con `id` (lo que hace PostgREST) | **Falla**: `cannot insert a non-DEFAULT value into column "id"` |
| RPC `SECURITY INVOKER` con `OVERRIDING SYSTEM VALUE` y `id` explícito, workspace propio | **OK** |
| Mismo RPC en un workspace ajeno | **Bloqueado por RLS**: el RLS actual sigue protegiendo |
| `id` repetido | `23505` (duplicado), por lo que `push_batch` es idempotente por clave primaria |

Conclusiones para el diseño (4.1):

- Un RPC `SECURITY INVOKER` basta; no hace falta `SECURITY DEFINER` para insertar con ID propio.
- **Todo ID usado offline debe salir de la propia secuencia** (`reserve_ids` con `nextval`).
  Un ID inventado por el cliente que la secuencia alcance después provoca `23505` (probado en
  local). `reserve_ids` sí necesitará `SECURITY DEFINER` (o `grant usage` sobre las secuencias)
  y comprobar `is_workspace_member`.
- Los huecos en la secuencia por bloques no usados son inocuos; la app ya convive con huecos.

### 8.5 Estado final de la Fase 0

| Ítem | Estado |
|---|---|
| M1 volumen · M2 esquema · M3 fixtures y paridad · S2 coste del pull · S3 IDs explícitos | **Hecho** |
| S1 SQLite | **Referencia en PC hecha.** Medición en el teléfono diferida a la **primera semana de la Fase 2** (decisión del dueño: opción recomendada), porque exige un cambio nativo. El spike ya está escrito: `.tmp/offline-fixtures/s1-device-spike/SqliteSpikeScreen.tsx` (usa una base propia que borra al terminar; no toca Supabase). |
| Trigger `updated_at` en `spend_types` y `movement_templates` | Se añade en Fase 1. |

**Criterio de salida de la Fase 0 cumplido:** el diseño no tiene supuestos sin verificar salvo el
rendimiento de SQLite en el teléfono, que no cambia la arquitectura (solo podría ajustar tamaños
de página y de lote).

## 9. Riesgos

1. Deriva entre las réplicas locales de las vistas y el servidor (saldos distintos).
2. Rechazos del servidor sobre cambios ya mostrados como guardados (mitigado con la bandeja).
3. Datos de otro usuario en el dispositivo tras cerrar sesión (mitigado con una base por usuario).
4. Plan Nano de Supabase con poca RAM: el pull inicial y los picos de `push_batch` pueden
   saturarlo; paginar y limitar concurrencia.
5. Regresiones en una app que hoy funciona: de ahí los flags por módulo y la entrega por fases.
6. Los datos actuales son pequeños (ver sección 8); el riesgo de volumen crece solo si se suman muchos usuarios.
