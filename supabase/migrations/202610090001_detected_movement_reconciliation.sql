-- Conciliar no crea movimientos ni cambia saldos, read_at o archived_at.
create or replace function public.detection_reconciliation_text(value text)
returns text language sql immutable set search_path = '' as $$
  select trim(regexp_replace(translate(lower(coalesce(value, '')),
    'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Helper privado. Incluye detecciones resueltas para evitar asignar el mismo
-- movimiento a dos pagos parecidos sin una referencia explícita que los vincule.
create or replace function public.detection_reconciliation_matches(p_workspace_id bigint, p_user_id uuid, p_suggestion_id bigint default null)
returns table (suggestion_id bigint, movement_id bigint, can_resolve boolean, reason text)
language sql stable set search_path = '' as $$
  with pairs as (
    select s.id as sid, m.id as mid, s.status as suggestion_status,
      m.metadata ->> 'suggestionId' = s.id::text as linked,
      length(coalesce(s.metadata ->> 'operationNumber', '')) >= 4
        and s.metadata ->> 'operationNumber' = m.metadata ->> 'operationNumber'
        and regexp_replace(s.financial_app_key, '_email$', '') =
          regexp_replace(coalesce(m.metadata ->> 'financialAppKey', ''), '_email$', '') as operation_linked,
      public.detection_reconciliation_text(s.description) = public.detection_reconciliation_text(m.description) as same_description,
      date_trunc('minute', s.occurred_at) = date_trunc('minute', m.occurred_at)
        and length(public.detection_reconciliation_text(s.description)) >= 4
        and public.detection_reconciliation_text(s.description) !~
          '^(pago|compra|consumo|movimiento|transferencia|yapeo)( (bcp|yape|bancaria|a terceros|a celular|entre mis cuentas|enviado|recibido))?$'
        and s.confidence = 'high'
        and coalesce(s.metadata ->> 'dateSource', 'receipt') <> 'received'
        and (s.package_name <> 'email:inbound' or s.metadata ->> 'senderAuthenticated' = 'true')
        and (s.movement_type <> 'transfer' or
          (coalesce(s.metadata ->> 'accountId', s.metadata ->> 'sourceAccountId') is not null
           and s.metadata ->> 'destinationAccountId' is not null)) as precise,
      abs(extract(epoch from m.occurred_at - s.occurred_at)) as time_distance
    from public.notification_detected_movement_suggestions s
    join public.movements m on m.workspace_id = s.workspace_id and m.status = 'posted'
    join public.accounts a on a.id = case when m.movement_type = 'income'
      then m.destination_account_id else m.source_account_id end
    where s.workspace_id = p_workspace_id and s.user_id = p_user_id
      and (p_suggestion_id is null or s.id = p_suggestion_id or exists (
        select 1 from public.notification_detected_movement_suggestions target
        where target.id = p_suggestion_id and target.workspace_id = p_workspace_id and target.user_id = p_user_id
          and target.amount = s.amount and target.currency_code = s.currency_code
          and target.movement_type = s.movement_type
          and date_trunc('minute', target.occurred_at) = date_trunc('minute', s.occurred_at)
      ))
      and s.status in ('pending', 'needs_review', 'registered', 'duplicate')
      and (s.package_name <> 'email:inbound' or public.has_email_detection_pro_access(p_user_id))
      and not (coalesce(m.metadata, '{}'::jsonb) ? 'split_group')
      and (
        m.metadata ->> 'suggestionId' = s.id::text
        or (
          m.movement_type::text = s.movement_type::text and a.currency_code = s.currency_code
          and (case when m.movement_type = 'income' then m.destination_amount else m.source_amount end) = s.amount
          and m.occurred_at >= (date_trunc('day', s.occurred_at at time zone 'America/Lima') at time zone 'America/Lima')
          and m.occurred_at < ((date_trunc('day', s.occurred_at at time zone 'America/Lima') + interval '1 day') at time zone 'America/Lima')
          and (coalesce(s.metadata ->> 'accountId', case when s.movement_type = 'income'
            then s.metadata ->> 'destinationAccountId' else s.metadata ->> 'sourceAccountId' end) is null
            or coalesce(s.metadata ->> 'accountId', case when s.movement_type = 'income'
              then s.metadata ->> 'destinationAccountId' else s.metadata ->> 'sourceAccountId' end) = a.id::text)
          and (s.movement_type <> 'transfer' or s.metadata ->> 'destinationAccountId' is null
            or s.metadata ->> 'destinationAccountId' = m.destination_account_id::text)
        )
      )
  ), scored as (
    select *, count(*) over (partition by sid) as candidates,
      count(*) filter (where precise and same_description) over (partition by mid) as signals,
      row_number() over (partition by sid order by linked desc nulls last,
        operation_linked desc nulls last, (precise and same_description) desc nulls last,
        same_description desc, time_distance, mid) as rank
    from pairs
  )
  select sid, mid,
    candidates = 1 and (coalesce(linked, false) or coalesce(operation_linked, false)
      or (precise and same_description and signals = 1)),
    case when linked then 'linked_detection' when operation_linked then 'operation_number'
      when precise and same_description and signals = 1 and candidates = 1 then 'exact_details'
      else 'possible_duplicate' end
  from scored where rank = 1 and suggestion_status in ('pending', 'needs_review')
    and (p_suggestion_id is null or sid = p_suggestion_id);
$$;

revoke all on function public.detection_reconciliation_text(text) from public, anon, authenticated;
revoke all on function public.detection_reconciliation_matches(bigint, uuid, bigint) from public, anon, authenticated;

create or replace function public.reconcile_detected_movements(p_workspace_id bigint, p_suggestion_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  match record;
  fresh record;
  suggestion public.notification_detected_movement_suggestions;
  movement public.movements;
  resolved jsonb := '[]'::jsonb;
  candidates jsonb := '[]'::jsonb;
begin
  if uid is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'No tienes acceso a este workspace.' using errcode = '42501';
  end if;
  -- Coalescer el polling, la revisión y el trigger sin esperas entre ellos.
  if not pg_try_advisory_xact_lock(hashtextextended(uid::text || ':' || p_workspace_id::text || ':detections', 0)) then
    return jsonb_build_object('resolvedIds', resolved, 'candidates', candidates);
  end if;
  for match in select * from public.detection_reconciliation_matches(p_workspace_id, uid, p_suggestion_id)
  loop
    if match.can_resolve then
      -- Mantener el orden movimiento -> detección, igual que el registro.
      select * into movement from public.movements where id = match.movement_id for share;
      if not found then continue; end if;
      select * into suggestion from public.notification_detected_movement_suggestions
        where id = match.suggestion_id and user_id = uid and workspace_id = p_workspace_id
          and status in ('pending', 'needs_review') for update skip locked;
      if not found then continue; end if;
      -- Tras esperar un lock, comprobar otra vez el movimiento y la unicidad.
      select * into fresh from public.detection_reconciliation_matches(p_workspace_id, uid, suggestion.id)
        where suggestion_id = suggestion.id and movement_id = movement.id;
      if not found or not fresh.can_resolve then continue; end if;
      update public.notification_detected_movement_suggestions
        set status = 'duplicate', movement_id = movement.id, updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reconciliation',
            jsonb_build_object('mode', 'automatic', 'reason', fresh.reason, 'matchedAt', now()))
        where id = suggestion.id and status in ('pending', 'needs_review');
      update public.notifications set payload = coalesce(payload, '{}'::jsonb) ||
        jsonb_build_object('status', 'duplicate', 'movementId', movement.id), updated_at = now()
        where user_id = uid and related_entity_type = 'detected_movement_suggestion'
          and related_entity_id = suggestion.id and kind = 'detected_movement_suggestion';
      resolved := resolved || jsonb_build_array(suggestion.id);
    else
      select * into movement from public.movements where id = match.movement_id;
      if found then candidates := candidates || jsonb_build_object(
        'suggestionId', match.suggestion_id, 'movement', to_jsonb(movement)); end if;
    end if;
  end loop;
  return jsonb_build_object('resolvedIds', resolved, 'candidates', candidates);
end;
$$;
revoke all on function public.reconcile_detected_movements(bigint, bigint) from public, anon;
grant execute on function public.reconcile_detected_movements(bigint, bigint) to authenticated;

create or replace function public.reconcile_after_manual_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'posted' and auth.uid() is not null
    and new.metadata ->> 'suggestionId' is null
    and not (coalesce(new.metadata, '{}'::jsonb) ? 'split_group')
    and public.is_workspace_member(new.workspace_id) then
    perform public.reconcile_detected_movements(new.workspace_id);
  end if;
  return new;
end;
$$;
revoke all on function public.reconcile_after_manual_movement() from public, anon, authenticated;
drop trigger if exists reconcile_after_manual_movement on public.movements;
create trigger reconcile_after_manual_movement
  after insert or update of movement_type, status, occurred_at, description, source_account_id,
    source_amount, destination_account_id, destination_amount, metadata on public.movements
  for each row execute function public.reconcile_after_manual_movement();
