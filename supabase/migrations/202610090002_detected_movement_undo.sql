-- Undo owns the complete registration. A failed check/trigger rolls back both
-- the deletes and the canonical state; inbox reading is deliberately unchanged.
-- Read-only guard: RLS hides other users' detections, but undo must not detach them.
-- Exposes only a boolean for the caller's own registration, never the other user's data.
create or replace function public.detected_registration_has_other_links(
  p_workspace_id bigint, p_suggestion_id bigint, p_movement_ids bigint[]
) returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_workspace_member(p_workspace_id)
    or coalesce(cardinality(p_movement_ids), 0) = 0
    or not exists (select 1 from public.notification_detected_movement_suggestions
      where id = p_suggestion_id and workspace_id = p_workspace_id and user_id = uid)
    or (select count(*) from public.movements where id = any(p_movement_ids)
      and workspace_id = p_workspace_id and created_by_user_id = uid) <> cardinality(p_movement_ids) then
    raise exception 'No tienes acceso a este registro.' using errcode = '42501';
  end if;
  return exists (select 1 from public.notification_detected_movement_suggestions
    where movement_id = any(p_movement_ids) and id <> p_suggestion_id);
end;
$$;
revoke all on function public.detected_registration_has_other_links(bigint, bigint, bigint[]) from public, anon;
grant execute on function public.detected_registration_has_other_links(bigint, bigint, bigint[]) to authenticated;

create or replace function public.undo_detected_movement_registration(
  p_workspace_id bigint, p_suggestion_id bigint, p_expected_movement_id bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  suggestion public.notification_detected_movement_suggestions;
  head public.movements;
  part public.movements;
  group_key text := 'suggestion:' || p_suggestion_id::text;
  split_count integer;
  ids bigint[];
  affected integer;
begin
  if uid is null or not public.is_workspace_member(p_workspace_id)
    or p_suggestion_id is null or p_expected_movement_id is null
    or p_suggestion_id <= 0 or p_expected_movement_id <= 0 then
    raise exception 'No tienes acceso a esta detección.' using errcode = '42501';
  end if;

  -- Same lock order as registration/reconciliation: movements before suggestion.
  select * into head from public.movements
    where id = p_expected_movement_id and workspace_id = p_workspace_id for update;
  if found and head.metadata ? 'split_group' then
    if head.metadata ->> 'split_group' is distinct from group_key then
      raise exception 'La división no pertenece a esta detección.' using errcode = '42501';
    end if;
    perform 1 from public.movements
      where workspace_id = p_workspace_id and metadata ->> 'split_group' = group_key
      order by id for update;
  end if;
  select * into suggestion from public.notification_detected_movement_suggestions
    where id = p_suggestion_id and workspace_id = p_workspace_id and user_id = uid for update;
  if not found then
    raise exception 'La detección no está disponible en este espacio.' using errcode = '42501';
  end if;
  if suggestion.package_name = 'email:inbound' and not public.has_email_detection_pro_access() then
    raise exception 'La detección por correo requiere DarkMoney PRO activo.' using errcode = '42501';
  end if;

  -- Lost-response retry, never a second delete. A new registration invalidates it.
  if suggestion.status = 'pending' and suggestion.movement_id is null
    and suggestion.metadata #>> '{registrationUndo,movementId}' = p_expected_movement_id::text
    and not exists (select 1 from public.movements
      where workspace_id = p_workspace_id and metadata ->> 'suggestionId' = p_suggestion_id::text) then
    return jsonb_build_object('suggestionId', p_suggestion_id, 'workspaceId', p_workspace_id,
      'status', 'pending', 'movementId', null, 'alreadyUndone', true,
      'deletedMovementIds', suggestion.metadata #> '{registrationUndo,deletedMovementIds}');
  end if;
  if suggestion.status is distinct from 'registered'
    or suggestion.movement_id is distinct from p_expected_movement_id
    or head.id is null then
    raise exception 'La detección cambió. Actualiza antes de deshacer.' using errcode = '42501';
  end if;

  if head.metadata ? 'split_group' then
    if coalesce(head.metadata ->> 'split_total', '') !~ '^[1-9][0-9]{0,2}$'
      or head.metadata ->> 'split_index' is distinct from '1'
      or head.movement_type::text not in ('expense', 'income') then
      raise exception 'La división está incompleta; no se eliminó ninguna parte.' using errcode = '23514';
    end if;
    split_count := (head.metadata ->> 'split_total')::integer;
    if split_count < 2 or split_count > 100 then
      raise exception 'La división contiene un número de partes inválido.' using errcode = '23514';
    end if;
    select array_agg(id order by id) into ids from public.movements
      where workspace_id = p_workspace_id and metadata ->> 'split_group' = group_key;
    if cardinality(ids) <> split_count then
      raise exception 'La división está incompleta; no se eliminó ninguna parte.' using errcode = '23514';
    end if;
    if (select count(distinct metadata ->> 'split_index') from public.movements where id = any(ids)) <> split_count then
      raise exception 'La división repite partes; no se eliminó ninguna.' using errcode = '23514';
    end if;
  else
    ids := array[head.id];
  end if;

  for part in select * from public.movements where id = any(ids) order by id loop
    if part.created_by_user_id is distinct from uid
      or part.workspace_id is distinct from p_workspace_id
      or part.status::text is distinct from 'posted'
      or part.metadata ->> 'suggestionId' is distinct from p_suggestion_id::text
      or part.metadata ->> 'source' is distinct from 'notification_detection'
      or part.updated_at is distinct from part.created_at
      or part.obligation_id is not null or part.metadata ? 'obligation_event_id' then
      raise exception 'El registro fue editado o vinculado. Revísalo desde Movimientos; no se eliminó nada.' using errcode = '42501';
    end if;
    if split_count is null then
      if part.client_dedupe_key is distinct from group_key then
        raise exception 'No se puede deshacer un movimiento manual desde esta detección.' using errcode = '42501';
      end if;
    else
      if coalesce(part.metadata ->> 'split_index', '') !~ '^[1-9][0-9]{0,2}$'
        or part.metadata ->> 'split_total' is distinct from split_count::text
        or part.movement_type is distinct from head.movement_type then
        raise exception 'La división cambió; no se eliminó ninguna parte.' using errcode = '23514';
      end if;
      affected := (part.metadata ->> 'split_index')::integer;
      if affected > split_count or part.client_dedupe_key is distinct from
        (case when affected = 1 then group_key else group_key || ':split-' || affected::text end) then
        raise exception 'La división cambió; no se eliminó ninguna parte.' using errcode = '23514';
      end if;
    end if;
  end loop;
  if exists (select 1 from public.movements where workspace_id = p_workspace_id
    and (metadata ->> 'suggestionId' = p_suggestion_id::text or metadata ->> 'split_group' = group_key)
    and not (id = any(ids))) then
    raise exception 'Hay otras partes vinculadas a esta detección. No se eliminó nada.' using errcode = '23514';
  end if;
  if public.detected_registration_has_other_links(p_workspace_id, p_suggestion_id, ids) then
    raise exception 'Otro aviso depende de este registro. Revísalo desde Movimientos; no se eliminó nada.' using errcode = '42501';
  end if;
  -- Attachments have a polymorphic entity_id, not an ON DELETE cascade. Preserve evidence.
  if exists (select 1 from public.attachments
    where workspace_id = p_workspace_id and entity_type = 'movement' and entity_id = any(ids)) then
    raise exception 'El registro tiene un comprobante. Revísalo desde Movimientos; no se eliminó nada.' using errcode = '42501';
  end if;

  delete from public.movements where workspace_id = p_workspace_id and id = any(ids);
  get diagnostics affected = row_count;
  if affected <> cardinality(ids) then
    raise exception 'No tienes permiso para eliminar el registro completo.' using errcode = '42501';
  end if;
  update public.notification_detected_movement_suggestions
    set status = 'pending', movement_id = null, updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('registrationUndo',
        jsonb_build_object('movementId', p_expected_movement_id, 'deletedMovementIds', to_jsonb(ids), 'undoneAt', now()))
    where id = p_suggestion_id and workspace_id = p_workspace_id and user_id = uid and status = 'registered';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'No se pudo reabrir la detección; no se eliminó nada.' using errcode = '42501';
  end if;
  return jsonb_build_object('suggestionId', p_suggestion_id, 'workspaceId', p_workspace_id,
    'status', 'pending', 'movementId', null, 'alreadyUndone', false, 'deletedMovementIds', to_jsonb(ids));
end;
$$;
revoke all on function public.undo_detected_movement_registration(bigint, bigint, bigint) from public, anon;
grant execute on function public.undo_detected_movement_registration(bigint, bigint, bigint) to authenticated;
