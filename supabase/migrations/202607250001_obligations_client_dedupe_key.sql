-- Idempotencia del registro de obligaciones (espejo de movements_client_dedupe_key,
-- 202606100002). El guard anti-doble-tap del formulario es solo UI; un retry tras una
-- respuesta perdida (insert OK pero el select de retorno/red falló) podía crear una
-- obligación duplicada. Incidente 2026-07-25: 2 movimientos de apertura para una misma
-- deuda por multi-tap/reintento.
--
-- client_dedupe_key la genera el cliente por intento de submit (se rota tras éxito o al
-- reabrir el formulario). El conflicto 23505 sobre el unique parcial (workspace_id,
-- client_dedupe_key) se trata en cliente como "ya creada": se devuelve la fila existente
-- en lugar de error. El movimiento de apertura reusa "<key>:opening" para ser idempotente
-- también. Sin backfill: filas históricas quedan en NULL.

alter table public.obligations add column if not exists client_dedupe_key text;

create unique index if not exists obligations_client_dedupe_key_uq
  on public.obligations(workspace_id, client_dedupe_key)
  where client_dedupe_key is not null;
