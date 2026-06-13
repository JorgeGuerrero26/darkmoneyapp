-- Realtime estaba muerto: los hooks use*RealtimeSync se suscriben a postgres_changes sobre
-- movements/accounts/obligations/notifications, pero ninguna migración agregó esas tablas a la
-- publicación supabase_realtime → el servidor nunca emitía eventos. Resultado: la app no se
-- actualizaba en vivo y todo dependía de refetches manuales (lentos), había que cerrar/reabrir.
--
-- REPLICA IDENTITY FULL: para que los payloads de UPDATE/DELETE incluyan las columnas viejas
-- (p. ej. workspace_id) que el cliente necesita para filtrar; sin esto, los filtros realtime por
-- workspace pueden no aplicar a deletes. El JWT del usuario se setea aparte en el cliente
-- (supabase.realtime.setAuth) para que RLS deje pasar los eventos.
--
-- Idempotente: ADD TABLE falla si la tabla ya está publicada, así que se guarda con un check
-- contra pg_publication_tables para que supabase db push sea repetible.

do $$
declare
  t text;
begin
  foreach t in array array['movements', 'accounts', 'obligations', 'notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.movements replica identity full;
alter table public.accounts replica identity full;
alter table public.obligations replica identity full;
alter table public.notifications replica identity full;
