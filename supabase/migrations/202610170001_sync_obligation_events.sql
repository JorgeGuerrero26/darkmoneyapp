-- Motor offline, Fase 5.1 (paso 5): registrar un pago de una obligación sin conexión.
-- Plan: docs/OFFLINE_PHASE5_ATOMIC_GROUPS_PLAN.md
--
-- Un pago de una deuda escribe DOS filas que deben ir juntas (grupo atómico de push_batch): su movimiento de cuenta
-- (obligation_payment) y su evento (obligation_events). Los eventos no se reflejan en el teléfono (el saldo pendiente de la
-- deuda lo sigue calculando el servidor) y la tabla no tiene workspace_id propio, así que no es una tabla sincronizable
-- normal. Se admite SOLO como alta dentro del envío del teléfono:
--
--   1. reserve_ids acepta 'obligation_events' (el pago necesita saber el ID del evento antes de enviarlo: el movimiento lo
--      lleva en su metadata).
--   2. sync_apply_op acepta altas de 'obligation_events': comprueba que la obligación padre sea del espacio indicado y
--      no escribe workspace_id si la tabla no lo tiene. Editar o borrar eventos desde el teléfono se rechaza (invalid_op).
--
-- El resto de sync_apply_op no cambia. El trigger obligation_events_settle_and_guard sigue mandando: un sobrepago rechaza
-- el grupo entero (movimiento incluido), igual que hoy en línea. SECURITY INVOKER: el RLS de cada tabla aplica.

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
  if p_table is distinct from 'obligation_events'
     and not exists (select 1 from public.sync_tables where table_name = p_table and writable) then
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
  v_parent_ws bigint;
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

  if v_table = 'obligation_events' then
    -- Eventos de obligaciones (pagos): no se reflejan en el teléfono ni tienen workspace_id propio; solo se aceptan ALTAS,
    -- dentro de un grupo atómico junto con su movimiento. Editar o borrar eventos sigue siendo en línea.
    select 'obligation_events'::text, 3::smallint, true, '{}'::text[], null::text into v_cfg;
    if v_kind <> 'insert' then
      return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'invalid_op',
                                'message', 'los eventos de obligaciones solo se pueden crear desde el teléfono');
    end if;
  else
    select * into v_cfg from public.sync_tables where table_name = v_table and writable;
  end if;
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

    if v_table = 'obligation_events' then
      select o.workspace_id into v_parent_ws from public.obligations o where o.id = nullif(v_clean ->> 'obligation_id', '')::bigint;
      if v_parent_ws is distinct from v_ws then
        return jsonb_build_object('op_id', v_op_id, 'status', 'rejected', 'code', 'dependency',
                                  'message', 'la obligación no existe o no pertenece a este espacio');
      end if;
    end if;
    v_payload := v_clean || jsonb_build_object('id', v_row_id);
    if public.sync_has_column(v_table, 'workspace_id') then
      v_payload := v_payload || jsonb_build_object('workspace_id', v_ws);
    end if;
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

revoke all on function public.sync_apply_op(jsonb) from public, anon;
grant execute on function public.sync_apply_op(jsonb) to authenticated;
