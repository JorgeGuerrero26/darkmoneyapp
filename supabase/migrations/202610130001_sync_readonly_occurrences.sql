-- Fase 3.1: historial de ingresos de solo lectura y lectura de suscripciones vía padre.
-- Aditiva, sin aplicar a producción. Las migraciones 202610120001–0003 no se modifican.
alter table public.recurring_income_occurrences
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists trg_recurring_income_occurrences_updated_at on public.recurring_income_occurrences;
create trigger trg_recurring_income_occurrences_updated_at before update on public.recurring_income_occurrences
  for each row execute function public.set_updated_at();
create index if not exists recurring_income_occurrences_sync_idx
  on public.recurring_income_occurrences (workspace_id, updated_at, id);
create index if not exists subscription_occurrences_sync_parent_idx
  on public.subscription_occurrences (subscription_id, updated_at, id);

insert into public.sync_tables (table_name, tier, writable)
values ('recurring_income_occurrences', 2, false)
on conflict (table_name) do update set writable = false;

-- El monto de cuatro decimales se convierte a texto ANTES de salir de PostgreSQL.
-- El resto de filas conserva exactamente el contrato de Fase 1.
create or replace function public.pull_changes(
  p_workspace_id bigint,
  p_cursors jsonb default '{}'::jsonb,
  p_tables text[] default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  c_overlap constant interval := interval '2 minutes';
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_now timestamptz := now();
  v_table text;
  v_since timestamptz;
  v_after bigint;
  v_rows jsonb;
  v_total integer;
  v_has_more boolean;
  v_last jsonb;
  v_next_since timestamptz;
  v_next_after bigint;
  v_tables jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;

  for v_table in
    select table_name from public.sync_tables
    where p_tables is null or table_name = any (p_tables)
    order by table_name
  loop
    v_since := nullif(p_cursors #>> array[v_table, 'since'], '')::timestamptz;
    v_after := coalesce(nullif(p_cursors #>> array[v_table, 'after_id'], '')::bigint, 0);

    execute format($q$
      select coalesce(jsonb_agg((to_jsonb(x) - 'rn') || case when %L = 'recurring_income_occurrences' then jsonb_build_object('amount', to_jsonb(x) ->> 'amount') else '{}'::jsonb end order by x.updated_at, x.id) filter (where x.rn <= $4), '[]'::jsonb),
             count(*)::integer
      from (
        select t.*, row_number() over (order by t.updated_at, t.id) as rn
        from public.%I t
        where t.workspace_id = $1
          and ($2::timestamptz is null or (t.updated_at, t.id) > ($2::timestamptz, $3::bigint))
        order by t.updated_at, t.id
        limit $4 + 1
      ) x
    $q$, v_table, v_table)
    into v_rows, v_total
    using p_workspace_id, v_since, v_after, v_limit;

    v_has_more := v_total > v_limit;

    if jsonb_array_length(v_rows) > 0 then
      v_last := v_rows -> (jsonb_array_length(v_rows) - 1);
      v_next_since := (v_last ->> 'updated_at')::timestamptz;
      v_next_after := (v_last ->> 'id')::bigint;
    else
      v_next_since := v_since;
      v_next_after := v_after;
    end if;

    -- Al terminar de paginar, el cursor nunca pasa de (ahora - solape).
    if not v_has_more and (v_next_since is null or v_next_since < v_now - c_overlap) then
      v_next_since := v_now - c_overlap;
      v_next_after := 0;
    end if;

    v_tables := v_tables || jsonb_build_object(
      v_table,
      jsonb_build_object(
        'rows', v_rows,
        'has_more', v_has_more,
        'next', jsonb_build_object('since', v_next_since, 'after_id', v_next_after)
      )
    );
  end loop;

  return jsonb_build_object('server_time', v_now, 'tables', v_tables);
end;
$$;

revoke all on function public.pull_changes(bigint, jsonb, text[], integer) from public, anon;
grant execute on function public.pull_changes(bigint, jsonb, text[], integer) to authenticated;

-- Sin workspace_id propio: se filtra por el padre y se conserva el RLS existente.
-- No se registra esta tabla en sync_tables ni se reserva un ID para ella.
create or replace function public.pull_subscription_occurrences(
  p_workspace_id bigint, p_cursor jsonb default '{}'::jsonb, p_limit integer default 1000
) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_now timestamptz := now();
  v_since timestamptz := nullif(p_cursor ->> 'since', '')::timestamptz;
  v_after bigint := coalesce(nullif(p_cursor ->> 'after_id', '')::bigint, 0);
  v_rows jsonb; v_ids jsonb; v_total integer; v_more boolean; v_last jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg((to_jsonb(x) - 'rn') || jsonb_build_object('expected_amount', x.expected_amount::text)
      order by x.updated_at, x.id) filter (where x.rn <= v_limit), '[]'::jsonb), count(*)::integer
    into v_rows, v_total
    from (
      select o.*, s.workspace_id, row_number() over (order by o.updated_at, o.id) as rn
      from public.subscription_occurrences o join public.subscriptions s on s.id = o.subscription_id
      where s.workspace_id = p_workspace_id
        and (v_since is null or (o.updated_at, o.id) > (v_since, v_after))
      order by o.updated_at, o.id limit v_limit + 1
    ) x;
  v_more := v_total > v_limit;
  if jsonb_array_length(v_rows) > 0 then
    v_last := v_rows -> (jsonb_array_length(v_rows) - 1);
    v_since := (v_last ->> 'updated_at')::timestamptz;
    v_after := (v_last ->> 'id')::bigint;
  end if;
  if not v_more and (v_since is null or v_since < v_now - interval '2 minutes') then
    v_since := v_now - interval '2 minutes'; v_after := 0;
  end if;
  select coalesce(jsonb_agg(o.id order by o.id), '[]'::jsonb) into v_ids
    from public.subscription_occurrences o join public.subscriptions s on s.id = o.subscription_id
    where s.workspace_id = p_workspace_id;
  return jsonb_build_object('server_time', v_now, 'rows', v_rows, 'has_more', v_more,
    'next', jsonb_build_object('since', v_since, 'after_id', v_after), 'live_ids', v_ids);
end;
$$;
revoke all on function public.pull_subscription_occurrences(bigint, jsonb, integer) from public, anon;
grant execute on function public.pull_subscription_occurrences(bigint, jsonb, integer) to authenticated;

-- Rollback (solo tras retirar clientes Fase 3): quitar la fila readonly de sync_tables,
-- restaurar pull_changes desde 202610120002, eliminar el RPC hijo, los dos índices,
-- el trigger y la columna nueva. No cambiar/borrar tablas de negocio ni su historial.
