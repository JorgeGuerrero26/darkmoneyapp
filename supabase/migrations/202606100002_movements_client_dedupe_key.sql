-- Auditoría 2026-06-10 (hallazgo D1): el insert de movimientos no tenía idempotencia.
-- El guard anti-doble-tap es solo UI; una carrera overlay-headless + React, o un retry
-- tras timeout ambiguo (insert OK pero el select de retorno falló), podía duplicar.
--
-- client_dedupe_key la genera el cliente por intento de registro:
--  - vías de notificación (QuickEntry / headless): "suggestion:<id>" — la sugerencia es
--    un evento único, registrarla dos veces debe devolver el movimiento existente.
--  - formulario completo: clave aleatoria por sesión de submit (se regenera tras éxito).
-- El conflicto 23505 se trata en cliente como "ya registrado": se devuelve la fila
-- existente en lugar de error. Sin backfill: filas históricas quedan en NULL.

alter table public.movements add column if not exists client_dedupe_key text;

create unique index if not exists movements_client_dedupe_key_uq
  on public.movements(workspace_id, client_dedupe_key)
  where client_dedupe_key is not null;
