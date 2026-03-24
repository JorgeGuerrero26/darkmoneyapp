# Esquema esperado: `obligation_events`

Referencia para alinear **Supabase / PostgREST** con la app (DarkMoney).

## Columnas que usa la app

| Columna           | Uso |
|-------------------|-----|
| `id`              | PK (serial) |
| `obligation_id`   | FK → `obligations.id` (**obligatorio** en inserts) |
| `event_type`      | p. ej. `payment`, `principal_increase`, `principal_decrease` |
| `event_date`      | Fecha del evento (fecha de pago / ajuste) |
| `amount`          | Monto |
| `installment_no`  | Opcional (pagos) |
| `reason`          | Opcional (ajustes de principal) |
| `description`     | Opcional |
| `notes`           | Opcional |
| `movement_id`     | Opcional (si enlazas movimiento) |
| `created_by_user_id` | Opcional |
| `metadata`        | JSON, default `{}` |

## Lo que **no** existe en este proyecto

- **`workspace_id`** en `obligation_events`: **no** está en el diccionario / esquema real. El workspace se deduce por `obligations.workspace_id` al cargar el snapshot. Los inserts **no** deben enviar `workspace_id` (PostgREST devuelve error de schema cache si la columna no existe).

## Movimientos

Los movimientos opcionales (`movements`) **sí** llevan `workspace_id`; ese valor se resuelve desde la fila `obligations` antes de insertar.

## Si en el futuro quieres RLS por workspace en eventos

1. Migración SQL: `ALTER TABLE obligation_events ADD COLUMN workspace_id bigint REFERENCES workspaces(id);`
2. Rellenar desde `obligations` y/o trigger `BEFORE INSERT`.
3. Refrescar schema en Supabase (API reinicia cache sola o desde Dashboard).
4. Entonces la app podría volver a incluir `workspace_id` en el `insert`.
