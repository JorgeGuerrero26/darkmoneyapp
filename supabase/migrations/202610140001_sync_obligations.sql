-- Fase 4.1: las obligaciones (deudas y préstamos) entran al motor de sincronización como DEFINICIONES.
--
-- Qué entra: la tabla `obligations` (crear, editar, archivar). Tiene workspace_id, updated_at, ID de
-- identidad y RLS por miembro, así que cabe en el contrato genérico de la Fase 1 sin cambiar ninguna función.
--
-- Qué NO entra, a propósito:
--   * `obligation_events` (pagos, intereses, ajustes). No tiene workspace_id y su trigger
--     `obligation_events_settle_and_guard` decide sobrepagos y marca la obligación como pagada: es lógica
--     de negocio que solo vive en el servidor. Un pago junta evento + movimiento y necesita una operación
--     de grupo atómica (todo o nada) que todavía no existe; hasta entonces sigue siendo solo en línea.
--   * `obligation_shares`, `obligation_payment_requests`, `obligation_event_viewer_links`: dependen de otra
--     persona y de notificaciones; no tienen sentido sin conexión.
--
-- Aditiva y sin aplicar a producción. Las migraciones 202610120001–202610130001 no se modifican.

-- Índice del cursor de descarga (updated_at, id), igual que el resto de tablas sincronizables.
create index if not exists obligations_ws_updated_idx on public.obligations (workspace_id, updated_at, id);

-- `trg_obligations_updated_at` ya existe en producción (verificado en solo lectura, 2026-10-13); se
-- asegura por si falta en otro entorno.
drop trigger if exists trg_obligations_updated_at on public.obligations;
create trigger trg_obligations_updated_at
  before update on public.obligations
  for each row execute function public.set_updated_at();

-- Revisión de conflictos: si otra persona cambió el principal, la contraparte o la moneda desde la lectura
-- base de este dispositivo, el cambio se aplica pero queda marcado "para revisar" (solo mientras esté activa).
insert into public.sync_tables (table_name, tier, writable, review_fields, review_status)
values ('obligations', 3, true, array['principal_amount', 'counterparty_id', 'currency_code'], 'active')
on conflict (table_name) do update
  set tier = excluded.tier,
      writable = excluded.writable,
      review_fields = excluded.review_fields,
      review_status = excluded.review_status;

-- Rollback (solo tras retirar los clientes que la usan): borrar la fila de sync_tables
--   delete from public.sync_tables where table_name = 'obligations';
-- y el índice `obligations_ws_updated_idx`. No toca datos de negocio.
