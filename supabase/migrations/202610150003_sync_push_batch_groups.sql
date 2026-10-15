-- Motor offline, Fase 5.1: operaciones atómicas de grupo en push_batch.
-- Plan: docs/OFFLINE_PHASE5_ATOMIC_GROUPS_PLAN.md
--
-- Hasta ahora push_batch aplicaba cada operación por separado. Un pago (movimiento + evento, o
-- movimiento + avance de una suscripción) son varias filas que deben ir juntas: si una mitad falla,
-- no puede quedar la otra.
--
-- Contrato nuevo (opcional): una operación puede traer
--     group_id   text    identificador del grupo (el cliente genera un uuid)
--     group_size integer cuántas operaciones tiene el grupo (2 a 10)
-- Las operaciones con el mismo group_id se aplican en el orden en que llegan, dentro de una
-- subtransacción: si cualquiera termina "rejected", se deshace TODO el grupo (también su registro en
-- sync_applied_ops). El resultado de la culpable conserva su motivo real; las demás devuelven
-- code = 'group_failed'. Un grupo al que le faltan operaciones en el lote, o con datos incoherentes,
-- se rechaza entero (group_incomplete / invalid_op): nunca se aplica una mitad.
--
-- Las operaciones SIN group_id se comportan exactamente como antes (los clientes viejos no cambian).
-- Cada resultado de una operación de grupo trae además `group_id`. Reintentar un grupo ya aplicado
-- devuelve sus resultados con replayed = true. Se espera que el cliente envíe el grupo seguido; si
-- viniera intercalado, el grupo se aplica completo al llegar su primera operación.
--
-- sync_apply_op no cambia. SECURITY INVOKER: el RLS y los triggers corren como el usuario.

create or replace function public.push_batch(p_ops jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  c_max_ops constant integer := 200;
  c_max_group constant integer := 10;
  v_n integer;
  v_ops jsonb[];
  v_results jsonb[];
  v_i integer;
  v_j integer;
  v_gid text;
  v_size integer;
  v_idx integer[];
  v_r jsonb;
  v_failed jsonb;
  v_failed_idx integer;
  v_bad text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'p_ops must be a json array' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_ops);
  if v_n > c_max_ops then
    raise exception 'too many operations (max %)', c_max_ops using errcode = '54000';
  end if;
  if v_n = 0 then
    return '[]'::jsonb;
  end if;

  select array_agg(value order by ord) into v_ops from jsonb_array_elements(p_ops) with ordinality as t(value, ord);
  v_results := array_fill(null::jsonb, array[v_n]);

  for v_i in 1 .. v_n loop
    if v_results[v_i] is not null then
      continue; -- ya resuelta como parte de su grupo
    end if;

    v_gid := nullif(v_ops[v_i] ->> 'group_id', '');
    if v_gid is null then
      v_results[v_i] := public.sync_apply_op(v_ops[v_i]);
      continue;
    end if;

    select array_agg(k order by k) into v_idx
    from generate_subscripts(v_ops, 1) k
    where v_ops[k] ->> 'group_id' = v_gid;

    -- Validación del grupo completo antes de aplicar nada.
    v_bad := null;
    if coalesce(v_ops[v_i] ->> 'group_size', '') !~ '^[0-9]{1,3}$' then
      v_bad := 'invalid_op';
    else
      v_size := (v_ops[v_i] ->> 'group_size')::integer;
      if v_size < 2 or v_size > c_max_group
         or exists (select 1 from unnest(v_idx) k where coalesce(v_ops[k] ->> 'group_size', '') <> v_size::text) then
        v_bad := 'invalid_op';
      elsif cardinality(v_idx) <> v_size then
        v_bad := 'group_incomplete';
      end if;
    end if;

    if v_bad is not null then
      foreach v_j in array v_idx loop
        v_results[v_j] := jsonb_build_object(
          'op_id', v_ops[v_j] ->> 'op_id', 'status', 'rejected', 'code', v_bad,
          'table', v_ops[v_j] ->> 'table', 'group_id', v_gid,
          'message', case v_bad when 'group_incomplete'
            then 'al grupo le faltan operaciones en este envío; no se aplicó ninguna'
            else 'grupo inválido; no se aplicó ninguna operación' end);
      end loop;
      continue;
    end if;

    v_failed := null;
    v_failed_idx := null;
    begin
      foreach v_j in array v_idx loop
        v_r := public.sync_apply_op(v_ops[v_j]);
        v_results[v_j] := v_r;
        if v_r ->> 'status' = 'rejected' then
          v_failed := v_r;
          v_failed_idx := v_j;
          raise exception 'group_rejected' using errcode = 'P0001';
        end if;
      end loop;
    exception when others then
      -- La subtransacción deshizo todo lo que el grupo había escrito.
      if v_failed is null then
        v_failed_idx := v_j;
        v_failed := jsonb_build_object(
          'op_id', v_ops[v_j] ->> 'op_id', 'status', 'rejected', 'code', 'error',
          'table', v_ops[v_j] ->> 'table', 'message', sqlerrm);
      end if;
      foreach v_j in array v_idx loop
        if v_j = v_failed_idx then
          v_results[v_j] := v_failed;
        else
          v_results[v_j] := jsonb_build_object(
            'op_id', v_ops[v_j] ->> 'op_id', 'status', 'rejected', 'code', 'group_failed',
            'table', v_ops[v_j] ->> 'table',
            'message', 'el grupo no se aplicó porque otra operación del grupo fue rechazada');
        end if;
      end loop;
    end;

    foreach v_j in array v_idx loop
      v_results[v_j] := v_results[v_j] || jsonb_build_object('group_id', v_gid);
    end loop;
  end loop;

  return to_jsonb(v_results);
end;
$$;

revoke all on function public.push_batch(jsonb) from public, anon;
grant execute on function public.push_batch(jsonb) to authenticated;
