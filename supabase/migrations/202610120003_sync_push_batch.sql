-- Motor offline, Fase 1 (3/3): enviar operaciones locales.
-- Diseño: docs/OFFLINE_ENGINE_DESIGN.md (4.4, 4.5) · Plan: docs/OFFLINE_PHASE1_PLAN.md
--
-- push_batch(p_ops) aplica una lista ordenada de operaciones y devuelve un resultado por cada
-- una, en el mismo orden. Una operación que falla NO aborta las demás: queda "rejected" con
-- su motivo y el cliente decide (bandeja "Cambios no aplicados").
--
-- Operación (jsonb):
--   { op_id uuid, table text, kind 'insert'|'update'|'delete', workspace_id bigint,
--     row_id bigint, fields jsonb, base_updated_at timestamptz }
--
-- Resultado (jsonb):
--   { op_id, status, table, row_id, row?, previous?, replayed?, code?, message? }
--   status = applied  : aplicada tal cual.
--            merged   : la fila había cambiado desde base_updated_at; se aplicaron solo los campos
--                       enviados encima de la versión del servidor (último escritor por campo).
--            review   : como merged, pero toca montos/cuentas/fecha de un movimiento confirmado
--                       cambiado desde la base: `previous` trae los valores sustituidos.
--                       (Contrato con el cliente: fusionar ediciones consecutivas de una misma
--                       fila en una sola operación, y tomar base_updated_at de la respuesta
--                       anterior; si no, una edición propia encadenada se marca para revisión.)
--            noop     : no había nada que hacer (borrar lo ya borrado, update sin campos,
--                       movimiento ya registrado con el mismo client_dedupe_key).
--            rejected : no se aplicó; `code` (forbidden, dependency, duplicate, check_violation,
--                       row_not_found, edited_since, unknown_column, invalid_op, error).
--
-- SECURITY INVOKER: el RLS y los triggers de cada tabla corren como el usuario, igual que hoy
-- con PostgREST. Idempotente por op_id (sync_applied_ops).

create or replace function public.sync_has_column(p_table text, p_column text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from pg_attribute a
    where a.attrelid = format('public.%I', p_table)::regclass
      and a.attname = p_column and a.attnum > 0 and not a.attisdropped
  );
$$;

create or replace function public.sync_apply_op(p_op jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  c_server_managed constant text[] := array['id','workspace_id','created_at','updated_at','created_by_user_id','updated_by_user_id'];
  v_uid uuid := auth.uid();
  v_op_id uuid;
  v_table text;
  v_kind text;
  v_ws bigint;
  v_row_id bigint;
  v_fields jsonb;
  v_base timestamptz;
  v_cfg public.sync_tables;
  v_prev jsonb;
  v_cur jsonb;
  v_row jsonb;
  v_clean jsonb;
  v_payload jsonb;
  v_unknown text[];
  v_cols text;
  v_sets text;
  v_status text;
  v_previous jsonb;
  v_conflict boolean;
  v_review boolean;
  v_result jsonb;
  v_state text;
begin
  v_op_id := (p_op ->> 'op_id')::uuid;
  v_table := p_op ->> 'table';
  v_kind := p_op ->> 'kind';
  v_ws := (p_op ->> 'workspace_id')::bigint;
  v_row_id := (p_op ->> 'row_id')::bigint;
  v_fields := coalesce(p_op -> 'fields', '{}'::jsonb);
  v_base := nullif(p_op ->> 'base_updated_at', '')::timestamptz;

  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_cfg from public.sync_tables where table_name = v_table and writable;
  if not found or v_kind not in ('insert','update','delete') or v_ws is null or v_row_id is null
     or jsonb_typeof(v_fields) <> 'object' then
    return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'invalid_op',
                              'message', 'operación inválida o tabla no sincronizable');
  end if;

  -- Reintento: devolver lo que ya se aplicó, sin ejecutar nada.
  select result into v_prev from public.sync_applied_ops where op_id = v_op_id and user_id = v_uid;
  if found then
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  if v_kind = 'insert' then
    v_clean := v_fields - c_server_managed;
    select array_agg(k) into v_unknown
    from jsonb_object_keys(v_clean) k
    where not public.sync_has_column(v_table, k);
    if v_unknown is not null then
      return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'unknown_column',
                                'message', 'columnas desconocidas: ' || array_to_string(v_unknown, ', '));
    end if;

    v_payload := v_clean || jsonb_build_object('id', v_row_id, 'workspace_id', v_ws);
    if public.sync_has_column(v_table, 'created_by_user_id') then
      v_payload := v_payload || jsonb_build_object('created_by_user_id', v_uid);
    end if;
    if public.sync_has_column(v_table, 'updated_by_user_id') then
      v_payload := v_payload || jsonb_build_object('updated_by_user_id', v_uid);
    end if;
    select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(v_payload) k;

    begin
      execute format(
        'insert into public.%1$I as t (%2$s) overriding system value '
        'select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning to_jsonb(t)',
        v_table, v_cols
      ) into v_row using v_payload;
      v_status := 'applied';
    exception when unique_violation then
      -- Mismo movimiento ya registrado (dedupe de la app): devolver el existente.
      if v_table = 'movements' and v_clean ->> 'client_dedupe_key' is not null then
        select to_jsonb(m) into v_row from public.movements m
        where m.workspace_id = v_ws and m.client_dedupe_key = v_clean ->> 'client_dedupe_key';
      end if;
      if v_row is null then
        raise;
      end if;
      v_status := 'noop';
    end;

  elsif v_kind = 'update' then
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table) into v_cur using v_row_id;
    if v_cur is null then
      return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'row_not_found',
                                'table', v_table, 'row_id', v_row_id,
                                'message', 'la fila ya no existe o no tienes acceso');
    end if;
    if (v_cur ->> 'workspace_id')::bigint is distinct from v_ws then
      return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'invalid_op',
                                'message', 'workspace_id no coincide con la fila');
    end if;

    v_clean := v_fields - c_server_managed;
    select array_agg(k) into v_unknown
    from jsonb_object_keys(v_clean) k
    where not public.sync_has_column(v_table, k);
    if v_unknown is not null then
      return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'unknown_column',
                                'message', 'columnas desconocidas: ' || array_to_string(v_unknown, ', '));
    end if;

    v_conflict := v_base is not null and (v_cur ->> 'updated_at')::timestamptz > v_base;
    v_review := false;
    -- Con dinero se prefiere marcar de más que de menos: no se exime al "mismo usuario", porque
    -- una edición suya posterior reescribe updated_by_user_id y taparía el cambio de otra
    -- persona. Los falsos positivos se evitan en el cliente (fusionar ediciones consecutivas de
    -- una fila y tomar base_updated_at de la respuesta anterior).
    if v_conflict and cardinality(v_cfg.review_fields) > 0 and (v_cur ->> 'status') = v_cfg.review_status then
      select coalesce(jsonb_object_agg(k, v_cur -> k), '{}'::jsonb) into v_previous
      from unnest(v_cfg.review_fields) k
      where v_clean ? k and (v_clean -> k) is distinct from (v_cur -> k);
      v_review := v_previous <> '{}'::jsonb;
    end if;

    if v_clean = '{}'::jsonb then
      v_row := v_cur;
      v_status := 'noop';
    else
      v_payload := v_clean;
      if public.sync_has_column(v_table, 'updated_by_user_id') then
        v_payload := v_payload || jsonb_build_object('updated_by_user_id', v_uid);
      end if;
      select string_agg(format('%1$I = r.%1$I', k), ', ') into v_sets from jsonb_object_keys(v_payload) k;
      execute format(
        'update public.%1$I as t set %2$s from jsonb_populate_record(null::public.%1$I, $1) r '
        'where t.id = $2 returning to_jsonb(t)',
        v_table, v_sets
      ) into v_row using v_payload, v_row_id;
      if v_row is null then
        return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'forbidden',
                                  'table', v_table, 'row_id', v_row_id, 'message', 'sin permiso para editar');
      end if;
      v_status := case when v_review then 'review' when v_conflict then 'merged' else 'applied' end;
    end if;

  else -- delete
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table) into v_cur using v_row_id;
    if v_cur is null then
      v_row := null;
      v_status := 'noop';
    elsif v_base is not null and (v_cur ->> 'updated_at')::timestamptz > v_base then
      -- Otra persona la editó desde que el usuario la vio: no se borra a ciegas.
      return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'edited_since',
                                'table', v_table, 'row_id', v_row_id, 'row', v_cur,
                                'message', 'la fila cambió desde que se vio; revisa antes de borrar');
    else
      execute format('delete from public.%I t where t.id = $1 returning t.id', v_table) into v_row_id using v_row_id;
      if v_row_id is null then
        return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'forbidden',
                                  'table', v_table, 'message', 'sin permiso para borrar');
      end if;
      v_row := null;
      v_status := 'applied';
    end if;
  end if;

  v_result := jsonb_build_object('op_id', v_op_id, 'status', v_status, 'table', v_table,
                                 'row_id', coalesce((v_row ->> 'id')::bigint, (p_op ->> 'row_id')::bigint));
  if v_row is not null then
    v_result := v_result || jsonb_build_object('row', v_row);
  end if;
  if v_review then
    v_result := v_result || jsonb_build_object('previous', v_previous);
  end if;

  insert into public.sync_applied_ops (op_id, user_id, workspace_id, table_name, row_id, kind, result)
  values (v_op_id, v_uid, v_ws, v_table, (v_result ->> 'row_id')::bigint, v_kind, v_result);

  return v_result;

exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return jsonb_build_object(
    'op_id', v_op_id, 'status', 'rejected',
    'table', v_table, 'row_id', v_row_id,
    'code', case v_state
      when '42501' then 'forbidden'
      when '23503' then 'dependency'
      when '23505' then 'duplicate'
      when '23514' then 'check_violation'
      else 'error' end,
    'sqlstate', v_state,
    'message', sqlerrm
  );
end;
$$;

create or replace function public.push_batch(p_ops jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  c_max_ops constant integer := 200;
  v_op jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'p_ops must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_ops) > c_max_ops then
    raise exception 'too many operations (max %)', c_max_ops using errcode = '54000';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_results := v_results || jsonb_build_array(public.sync_apply_op(v_op));
  end loop;

  return v_results;
end;
$$;

revoke all on function public.sync_has_column(text, text) from public, anon;
revoke all on function public.sync_apply_op(jsonb) from public, anon;
revoke all on function public.push_batch(jsonb) from public, anon;
grant execute on function public.sync_has_column(text, text) to authenticated;
grant execute on function public.sync_apply_op(jsonb) to authenticated;
grant execute on function public.push_batch(jsonb) to authenticated;
