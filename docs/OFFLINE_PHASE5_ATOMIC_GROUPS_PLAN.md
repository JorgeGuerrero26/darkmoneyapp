# Fase 5.1 — Operación atómica de grupo (pagos sin internet)

Estado: **diseño para aprobar**. No se ha tocado la base de datos ni el cliente.

## 1. Problema

Hoy `push_batch` aplica cada operación **por separado**: si una falla, las demás se aplican igual.
Por eso estos flujos, que escriben varias filas que deben ir juntas, siguen exigiendo internet
(`assertCompoundOnline`):

| Flujo | Filas que deben ir juntas |
|---|---|
| Pagar una suscripción | `movements` (insert) + `subscriptions` (update `next_due_date`) |
| Anotar llegada de ingreso fijo | `movements` (insert) + `recurring_income_occurrences` (update) |
| Pago o evento de obligación | `obligation_events` (insert) + `movements` (insert) |
| Obligación con movimiento de apertura | `obligations` (insert) + `movements` (insert) + evento `opening` |

Si se enviaran sueltas y una mitad fallara (por ejemplo un sobrepago que rechaza el trigger
`obligation_events_settle_and_guard`), quedaría el dinero movido sin su evento, o al revés.

## 2. Diseño

### 2.1 Servidor (migración nueva, reemplaza `push_batch`)

- Cada operación puede traer `group_id` (texto, uuid generado por el cliente) y `group_size` (2–10).
- Las operaciones con el mismo `group_id` se aplican **en el orden recibido, dentro de un bloque con
  subtransacción** (`begin … exception when others`). Si cualquier operación del grupo termina en
  `rejected` (o lanza error), **se deshace todo el grupo**, incluido su registro en `sync_applied_ops`.
- Resultado del grupo fallido: la operación culpable devuelve su código real (`check_violation`,
  `dependency`…); las demás devuelven `rejected` con `code: group_failed`.
- Un grupo incompleto en el lote (menos operaciones que `group_size`) se rechaza entero con
  `group_incomplete`: nunca se aplica una mitad.
- Idempotencia: reintentar el mismo grupo es seguro (cada `op_id` ya se registra y el grupo se
  deshace o se aplica completo). Un grupo ya aplicado devuelve `noop` en todas sus operaciones.
- Operaciones **sin** `group_id` se comportan exactamente como hoy: los clientes viejos no cambian.
- Se mantiene `security invoker` (RLS aplica) y el límite de 200 operaciones por lote.

### 2.2 Cliente

- La cola (`outbox`) guarda `group_id`/`group_size`. **No se fusionan** operaciones de grupos
  distintos, ni un grupo con operaciones sueltas (la fusión insert+update sigue valiendo dentro de
  la misma fila y del mismo grupo).
- El motor de sincronización nunca parte un grupo entre dos lotes: se envía completo o se espera.
- Escritura local: todas las filas del grupo se escriben en **una sola transacción de SQLite** y se
  ven juntas en pantalla (saldo, estado de la suscripción, etc.).
- Si el servidor rechaza el grupo: **todas** sus filas se revierten en el teléfono y llega un aviso
  a la bandeja con el motivo ("el pago excede lo que se debía", "la suscripción ya no existe"…).
  Ya existe la bandeja de rechazados; solo se agrupan sus líneas.
- La línea de estado dice "1 pago guardado en tu teléfono" (un grupo cuenta como un cambio).

### 2.3 Orden de entrega (cada paso se prueba y se publica solo)

1. Servidor: grupos en `push_batch` + pruebas e2e con PostgreSQL local (grupo completo, grupo con
   fallo a la mitad, reintento, grupo incompleto, clientes sin grupo, sobrepago de obligación).
2. Cliente: cola, motor y escritura local de grupos + pruebas.
3. **Pagar suscripción** sin internet (el más simple: 1 insert + 1 update, sin trigger de rechazo).
4. **Llegada de ingreso fijo**.
5. **Pagos y eventos de obligaciones** (el que puede ser rechazado por sobrepago).
6. **Obligación con movimiento de apertura**.

## 3. Riesgos y decisiones para el dueño

- **Dinero y conflictos.** Si pagas una deuda sin internet y mientras tanto otra persona del espacio
  ya la pagó, el servidor rechaza tu pago al sincronizar y el teléfono lo deshace con aviso. Es
  distinto de los movimientos normales (que se aceptan y se marcan para revisar). *Decisión: ¿se
  acepta ese comportamiento?* (Recomendado: sí; es lo que ya decidió el diseño de la Fase 4.)
- **Triggers del servidor** (`obligation_events_settle_and_guard`, sincronización de ocurrencias de
  suscripciones) se ejecutan dentro del grupo; el orden de las operaciones importa y lo fija el cliente.
- **Migración sobre `push_batch`**: es la función que usa todo el motor offline. Se ensaya en
  transacción con rollback, se respalda la definición actual y se corre `npm run test:offline-e2e`
  antes de aplicar. Se aplica solo con permiso explícito del dueño.
- **Prueba en teléfono**: ninguna prueba automática lo demuestra; cada flujo necesita su caso en
  `docs/OFFLINE_DEVICE_TEST.md`.
