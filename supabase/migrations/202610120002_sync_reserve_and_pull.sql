-- Motor offline, Fase 1 (2/3): reservar IDs y traer cambios.
-- Diseño: docs/OFFLINE_ENGINE_DESIGN.md (4.1, 4.2, 4.3) · Plan: docs/OFFLINE_PHASE1_PLAN.md
--
-- reserve_ids   -> bloques de IDs reales para crear filas offline sin remapear referencias.
-- pull_changes  -> filas nuevas/cambiadas desde un cursor, por tabla y en un solo viaje.
-- sync_live_ids -> IDs vigentes por tabla, para que el cliente detecte lo que se borró.

-- Reservar IDs. SECURITY DEFINER solo para poder llamar a nextval(); el acceso lo decide la
-- membresía del workspace. Los IDs salen SIEMPRE de la secuencia de la tabla: un ID inventado
-- por el cliente chocaría más tarde con la secuencia (probado en la Fase 0, S3).
create or replace function public.reserve_ids(
  p_workspace_id bigint,
  p_table text,
  p_count integer default 100
)
returns bigint[]
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_seq text;
  v_ids bigint[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 500 then
    raise exception 'p_count must be between 1 and 500' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sync_tables where table_name = p_table and writable) then
    raise exception 'table % is not syncable', p_table using errcode = '22023';
  end if;

  v_seq := pg_get_serial_sequence(format('public.%I', p_table), 'id');
  if v_seq is null then
    raise exception 'table % has no id sequence', p_table using errcode = '22023';
  end if;

  execute format('select array_agg(nextval(%L)) from generate_series(1, %s)', v_seq, p_count)
    into v_ids;
  return v_ids;
end;
$$;

revoke all on function public.reserve_ids(bigint, text, integer) from public, anon;
grant execute on function public.reserve_ids(bigint, text, integer) to authenticated;

-- Traer cambios. SECURITY INVOKER: el RLS de cada tabla sigue mandando.
--
-- p_cursors: { "<tabla>": { "since": "<timestamptz>", "after_id": <bigint> } }. Una tabla sin
-- cursor se trae completa. Cada tabla devuelve hasta p_limit filas ordenadas por
-- (updated_at, id); has_more = true significa "vuelve a llamar con next".
--
-- next ya incluye el SOLAPE (2 min): una transacción que confirma tarde con un updated_at
-- anterior al cursor no se pierde, porque el cursor siempre queda 2 min detrás de "ahora".
-- Las filas repetidas por el solape son inocuas: el cliente hace upsert idempotente.
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
      select coalesce(jsonb_agg(to_jsonb(x) - 'rn' order by x.updated_at, x.id) filter (where x.rn <= $4), '[]'::jsonb),
             count(*)::integer
      from (
        select t.*, row_number() over (order by t.updated_at, t.id) as rn
        from public.%I t
        where t.workspace_id = $1
          and ($2::timestamptz is null or (t.updated_at, t.id) > ($2::timestamptz, $3::bigint))
        order by t.updated_at, t.id
        limit $4 + 1
      ) x
    $q$, v_table)
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

-- IDs vigentes por tabla: el cliente borra en local lo que ya no aparece (no hay tombstones;
-- con el volumen actual son ~10 kB para ~1.000 movimientos). Ver diseño 4.2.
create or replace function public.sync_live_ids(
  p_workspace_id bigint,
  p_tables text[] default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table text;
  v_ids jsonb;
  v_result jsonb := '{}'::jsonb;
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
    execute format(
      'select coalesce(jsonb_agg(t.id order by t.id), ''[]''::jsonb) from public.%I t where t.workspace_id = $1',
      v_table
    ) into v_ids using p_workspace_id;
    v_result := v_result || jsonb_build_object(v_table, v_ids);
  end loop;

  return jsonb_build_object('server_time', now(), 'ids', v_result);
end;
$$;

revoke all on function public.sync_live_ids(bigint, text[]) from public, anon;
grant execute on function public.sync_live_ids(bigint, text[]) to authenticated;
