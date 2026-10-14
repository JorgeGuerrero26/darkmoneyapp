# Motor offline — Fase 1: servidor (plan, implementación y contrato)

Estado: **ya en producción** (contexto del dueño y lectura de verificación del 2026-10-13).
Se confirmaron las 11 entradas de `sync_tables` y los cinco RPC del contrato en una
transacción READ ONLY terminada en ROLLBACK. No se reaplicó ninguna migración. Diseño general en
[OFFLINE_ENGINE_DESIGN.md](OFFLINE_ENGINE_DESIGN.md).

## 1. Alcance

Solo servidor, todo aditivo: ninguna tabla de negocio cambia de forma, ninguna consulta de la
app se ve afectada, y la app actual no necesita ningún cambio para seguir funcionando.

| Migración | Contenido |
|---|---|
| `202610120001_sync_foundation.sql` | Triggers `updated_at` de `spend_types` y `movement_templates`; índices `(workspace_id, updated_at, id)` en 11 tablas; tablas `sync_tables` y `sync_applied_ops`; `sync_purge_applied_ops` |
| `202610120002_sync_reserve_and_pull.sql` | `reserve_ids`, `pull_changes`, `sync_live_ids` |
| `202610120003_sync_push_batch.sql` | `sync_has_column`, `sync_apply_op`, `push_batch` |

Tablas registradas (Fases 2 y 3): `movements`, `accounts`, `categories`, `counterparties`,
`spend_types`, `counterparty_roles`, `budgets`, `subscriptions`, `recurring_income`,
`movement_templates`, `workspace_financial_goals`.

**Fuera de la Fase 1 a propósito** (se añaden como filas de `sync_tables` cuando toquen):
- `obligations` y sus tablas hijas (Fase 4; `obligation_events` no tiene `workspace_id`).
- `subscription_occurrences` (sin `workspace_id`; la genera un trigger) y
  `recurring_income_occurrences` (sin `updated_at`): se resolverán en la Fase 3, por pull de la
  tabla padre o añadiendo la columna.
- `workspaces`, `workspace_members`, `currencies`, `exchange_rates`: pocas filas y de forma
  distinta; el cliente puede seguir leyéndolas con sus consultas actuales.

## 2. Qué se decidió al implementar (cambia respecto al diseño)

1. **Pull por tabla, un solo viaje.** `pull_changes` recibe un cursor por tabla
   `{since, after_id}` y devuelve todas a la vez. Cursor keyset `(updated_at, id)`: varias filas
   con el mismo `updated_at` (una actualización masiva) no pueden atascar la paginación.
2. **El solape lo pone el servidor.** El `next` que devuelve ya viene 2 min atrás de "ahora";
   el cliente solo lo guarda y lo reenvía. Las filas repetidas se absorben con upsert.
3. **Borrados por lista de IDs vigentes** (`sync_live_ids`), no tombstones (diseño 4.2 / 8).
4. **Revisión conservadora.** Un `update` de montos/cuentas/fecha de un movimiento `posted` cuyo
   `base_updated_at` es anterior al `updated_at` de la fila devuelve `review`, **aunque el último
   editor haya sido el mismo usuario**. Durante las pruebas se vio que eximir al "mismo usuario"
   perdía conflictos reales (una edición posterior propia reescribe `updated_by_user_id`). Con
   dinero se prefiere marcar de más.
5. **Borrado seguro.** Borrar una fila editada por otro desde `base_updated_at` se rechaza con
   `edited_since`; no se borra a ciegas.
6. **El servidor fija la autoría.** `created_by_user_id`, `updated_by_user_id` y `updated_at` los
   pone `push_batch`, ignorando lo que mande el cliente. Hoy esas columnas no tienen default ni
   trigger (la app actual no las envía), así que **las filas creadas por el motor sí tendrán
   autor**; es un cambio visible respecto a las filas históricas, y es el deseado.

## 3. Contrato para el cliente (Fase 2)

Esto es lo que el motor del teléfono debe cumplir; cada punto nace de una prueba.

1. **IDs:** pedir bloques con `reserve_ids(ws, tabla, n)` mientras hay red (mantener ~200 por
   tabla; rellenar cuando queden < 50) y asignarlos a las filas creadas offline. Nunca inventar
   un ID: chocaría con la secuencia más tarde.
2. **Orden y dependencias:** enviar las operaciones en el orden en que se hicieron (la cuenta
   antes que el movimiento que la usa). Si una operación sale `rejected` con `dependency`,
   las que dependen de su fila deben retenerse.
3. **Fusionar ediciones consecutivas** de la misma fila en una sola operación (con la
   `base_updated_at` más antigua), y tras cada respuesta actualizar `base_updated_at` con
   `row.updated_at` de la respuesta. Si no, una edición propia encadenada se marca `review`.
4. **`op_id` estable:** generar un `uuid` por operación al encolarla y reusarlo en cada
   reintento; así un reintento tras un corte devuelve `replayed: true` en vez de duplicar.
5. **Lotes de hasta 200 operaciones**; una `rejected` no detiene el lote.
6. **Tras cada `push_batch`, hacer pull**: los triggers del servidor pueden modificar otras filas
   (suscripciones, sugerencias detectadas, conciliación).
7. **Pull:** guardar por tabla el `next` de la última respuesta; si `has_more`, repetir
   inmediatamente. Hacer upsert por `id`. Cada cierto tiempo (o al abrir) pedir `sync_live_ids`
   y borrar en local lo que ya no esté.
8. **Resultados** y qué hacer con cada uno:

| status | Significado | Acción del cliente |
|---|---|---|
| `applied` | Aplicada tal cual | Reemplazar la fila local por `row`; sacar la op de la cola |
| `merged` | La fila había cambiado; se aplicaron solo los campos enviados | Igual; la fila local queda con la versión fusionada |
| `review` | Como `merged` pero tocó monto/cuentas/fecha de un movimiento confirmado | Igual, y registrar en la bandeja "Para revisar" con `previous` (valores sustituidos) |
| `noop` | Nada que hacer (ya borrado, sin campos, dedupe) | Sacar de la cola; si trae `row`, usarla |
| `rejected` | No se aplicó | Mover a "Cambios no aplicados" con `code`/`message`; no reintentar solo |

`code` de `rejected`: `forbidden` (RLS/permiso), `dependency` (FK), `duplicate`, `check_violation`
(p. ej. sobrepago), `row_not_found`, `edited_since`, `unknown_column`, `invalid_op`, `error`.

9. **Dinero:** montos como números exactos (`numeric(14,2)`); en local, centavos enteros.

## 4. Pruebas

| Prueba | Dónde | Resultado |
|---|---|---|
| `supabase/tests/sync/sync_engine.test.mjs` — 54 comprobaciones: migraciones idempotentes, reserva de IDs, aislamiento por workspace, idempotencia por `op_id`, dedupe, FK, `applied/merged/review/noop/rejected`, borrado seguro, pull paginado e incremental con solape, `sync_live_ids`, RLS, permisos | PostgreSQL local (PGlite), sin tocar ninguna base | **54 / 54** |
| Ensayo contra el esquema real: aplicar las 3 migraciones, ciclo completo (reservar, insertar cuenta y movimiento con los triggers reales, editar, dedupe, pull de 11 tablas, `sync_live_ids`, borrar, no-miembro) | Producción, dentro de una transacción terminada en `rollback`, con autorización del dueño | **todo OK**; conteos idénticos antes y después (1.238 movimientos, 10 cuentas, 37 categorías) y sin objetos residuales (script en `.tmp/offline-fixtures/f1-prod-dryrun.mjs`) |

Ejecutar la batería local: `npm i --no-save @electric-sql/pglite` y
`node supabase/tests/sync/sync_engine.test.mjs`.

**No cubierto:** carga/concurrencia reales (dos dispositivos empujando a la vez), `pg_net`/cron,
y el rendimiento del plan Nano bajo `push_batch` de 200 operaciones. Se mide en la Fase 2 con el
motor real.

## 5. Procedimiento histórico para llevarlo a producción (ya aplicado)

La Fase 1 ya está desplegada. Los pasos siguientes se conservan como referencia; no deben
ejecutarse de nuevo durante las Fases 3 y 4. Sus migraciones publicadas son inmutables.

1. Revisar el diff de las 3 migraciones.
2. Respaldo: ya existe `.github/workflows/db-backup.yml` (sin commit aún) y
   `docs/RESTORE_BACKUP.md`; conviene que haya un respaldo reciente antes.
3. Aplicar en orden `202610120001` → `202610120002` → `202610120003`.
   Duración esperada: segundos (los índices son sobre ~1.000 filas). Los `create trigger`
   toman un bloqueo breve sobre `spend_types` y `movement_templates`.
4. Verificar con `select * from sync_tables` y una llamada de `pull_changes` desde la app o psql.
5. **Rollback** (si hiciera falta): `drop function push_batch, sync_apply_op, sync_has_column,
   pull_changes, sync_live_ids, reserve_ids, sync_purge_applied_ops; drop table sync_applied_ops,
   sync_tables;` y los 2 triggers e 11 índices. Nada de la app depende de ellos todavía.
6. Documentado en `DATABASE_DICTIONARY.md` (local, gitignored): secciones `sync_tables`,
   `sync_applied_ops` y "Funciones del motor offline".

## 6. Riesgos y decisiones abiertas

- **`sync_applied_ops` crece** una fila por operación; sin agendar `sync_purge_applied_ops`.
  Con el uso actual es despreciable; decidir si agendar en `pg_cron` (el plan Nano ya sufrió por
  DDL/arranques en frío: ver memoria `supabase-nano-sin-ram`).
- **Triggers pesados por operación:** `push_batch` ejecuta los mismos triggers de `movements`
  (conciliación, suscripciones) que hoy. Un lote de 200 movimientos los dispara 200 veces dentro
  de una transacción; medir en Fase 2.
- **Una transacción por lote:** todo el `push_batch` es una transacción; `now()` es el mismo para
  todas las filas del lote (inocuo para el cursor, que desempata por `id`).
- **El motor corre con los permisos del usuario:** si una política RLS futura bloquea algo que hoy
  se permite, el efecto es `rejected: forbidden`, nunca un salto de seguridad.
