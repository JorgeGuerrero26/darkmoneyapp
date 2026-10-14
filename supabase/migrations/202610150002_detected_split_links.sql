-- Requires 202610150001_subscription_split_receipts.sql and the atomic split RPC.
-- Recurring income links remain association metadata, not an implicit confirmed arrival.
create or replace function public.register_detected_movement_split(
  p_workspace_id bigint, p_suggestion_id bigint, p_expected_updated_at timestamptz,
  p_header jsonb, p_parts jsonb
) returns jsonb language plpgsql security invoker
set search_path = '' set timezone = 'UTC' as $$
declare
  uid uuid := auth.uid();
  suggestion public.notification_detected_movement_suggestions;
  head public.movements;
  part public.movements;
  group_key text := 'suggestion:' || p_suggestion_id::text;
  v_kind text;
  v_account bigint;
  v_currency text;
  v_counterparty bigint;
  v_subscription bigint;
  v_recurring bigint;
  v_total numeric;
  v_amount numeric;
  v_sum numeric := 0;
  v_description text;
  v_notes text;
  v_occurred timestamptz;
  v_meta jsonb;
  v_request jsonb;
  v_parts jsonb := '[]'::jsonb;
  v_line jsonb;
  v_category bigint;
  v_spend bigint;
  v_category_ids bigint[] := '{}';
  v_spend_ids bigint[] := '{}';
  ids bigint[] := '{}';
  n integer;
  i integer := 0;
  affected integer;
  inserted boolean;
begin
  if uid is null or p_workspace_id is null or p_workspace_id <= 0
    or p_suggestion_id is null or p_suggestion_id <= 0
    or not public.is_workspace_member(p_workspace_id) then
    raise exception 'No tienes acceso a esta detección.' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or not isfinite(p_expected_updated_at)
    or jsonb_typeof(p_header) is distinct from 'object'
    or jsonb_typeof(p_parts) is distinct from 'array' then
    raise exception 'Revisa el encabezado y las partes de la división.' using errcode = '23514';
  end if;
  n := jsonb_array_length(p_parts);
  if n < 2 or n > 100 then
    raise exception 'La división debe tener entre 2 y 100 partes.' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_object_keys(p_header) k where k not in
    ('movementType','accountId','currencyCode','amount','description','notes','occurredAt','counterpartyId','metadata','subscriptionId','recurringIncomeId')) then
    raise exception 'El encabezado contiene campos no admitidos.' using errcode = '23514';
  end if;
  v_kind := p_header ->> 'movementType';
  v_description := btrim(p_header ->> 'description');
  v_currency := upper(btrim(p_header ->> 'currencyCode'));
  if v_kind is null or v_kind not in ('expense','income') or coalesce(v_description,'') = ''
    or coalesce(p_header ->> 'accountId','') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p_header -> 'amount') is distinct from 'number'
    or (p_header ->> 'amount') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    or jsonb_typeof(p_header -> 'description') is distinct from 'string'
    or jsonb_typeof(p_header -> 'occurredAt') is distinct from 'string' then
    raise exception 'Revisa tipo, cuenta, importe, descripción y fecha.' using errcode = '23514';
  end if;
  v_account := (p_header ->> 'accountId')::bigint;
  v_total := (p_header ->> 'amount')::numeric;
  if v_total <= 0 or v_total > 999999999999.99 then
    raise exception 'El importe no es válido.' using errcode = '23514';
  end if;
  v_occurred := (p_header ->> 'occurredAt')::timestamptz;
  if not isfinite(v_occurred) then raise exception 'Fecha no válida.' using errcode = '23514'; end if;
  if p_header ->> 'counterpartyId' is not null then
    if (p_header ->> 'counterpartyId') !~ '^[1-9][0-9]*$' then raise exception 'Contraparte no válida.' using errcode = '23514'; end if;
    v_counterparty := (p_header ->> 'counterpartyId')::bigint;
  end if;
  if p_header ->> 'notes' is not null and jsonb_typeof(p_header -> 'notes') <> 'string' then
    raise exception 'Notas no válidas.' using errcode = '23514';
  end if;
  v_notes := nullif(btrim(p_header ->> 'notes'),'');
  v_meta := coalesce(nullif(p_header -> 'metadata','null'::jsonb),'{}'::jsonb);
  if jsonb_typeof(v_meta) <> 'object' then raise exception 'Metadatos no válidos.' using errcode = '23514'; end if;
  if v_meta ? 'obligation_event_id' or v_meta ? 'obligationEventId' then
    raise exception 'Una división no puede registrar un evento de obligación.' using errcode = '23514';
  end if;
  if p_header ->> 'subscriptionId' is not null then
    if (p_header ->> 'subscriptionId') !~ '^[1-9][0-9]*$' then raise exception 'Suscripción no válida.' using errcode = '23514'; end if;
    v_subscription := (p_header ->> 'subscriptionId')::bigint;
  end if;
  if p_header ->> 'recurringIncomeId' is not null then
    if (p_header ->> 'recurringIncomeId') !~ '^[1-9][0-9]*$' then raise exception 'Ingreso fijo no válido.' using errcode = '23514'; end if;
    v_recurring := (p_header ->> 'recurringIncomeId')::bigint;
  end if;
  if (v_subscription is not null and (v_kind <> 'expense' or v_recurring is not null))
    or (v_recurring is not null and v_kind <> 'income')
    or (v_meta ->> 'subscriptionId' is not null and (v_meta ->> 'subscriptionId') is distinct from v_subscription::text)
    or (v_meta ->> 'recurring_income_id' is not null and (v_meta ->> 'recurring_income_id') is distinct from v_recurring::text) then
    raise exception 'El vínculo no coincide con el tipo y encabezado del movimiento.' using errcode = '23514';
  end if;
  v_meta := v_meta - array['source','suggestionId','financialAppKey','confidence','split_group','split_index','split_total','detectedSplitRequest','recurring_income_id','subscriptionId'];

  -- Read canonical provenance and check PRO before any insert (also checked after locking).
  select * into suggestion from public.notification_detected_movement_suggestions
    where id = p_suggestion_id and workspace_id = p_workspace_id and user_id = uid;
  if not found then raise exception 'La detección no está disponible.' using errcode = '42501'; end if;
  if suggestion.package_name = 'email:inbound' and not public.has_email_detection_pro_access() then
    raise exception 'La detección por correo requiere DarkMoney PRO activo.' using errcode = '42501';
  end if;
  if v_currency is distinct from upper(btrim(suggestion.currency_code::text))
    or not exists (select 1 from public.accounts where id = v_account and workspace_id = p_workspace_id
      and not is_archived and upper(btrim(currency_code::text)) = v_currency) then
    raise exception 'Elige una cuenta activa en la moneda detectada.' using errcode = '23514';
  end if;
  if v_counterparty is not null and not exists (select 1 from public.counterparties
    where id = v_counterparty and workspace_id = p_workspace_id and not is_archived) then
    raise exception 'La contraparte no está disponible en este espacio.' using errcode = '23514';
  end if;

  if v_subscription is not null and not exists (select 1 from public.subscriptions
    where id = v_subscription and workspace_id = p_workspace_id and status::text = 'active'
      and upper(btrim(currency_code::text)) = v_currency) then
    raise exception 'La suscripción activa no está disponible en esta moneda y espacio.' using errcode = '23514';
  end if;
  if v_recurring is not null and not exists (select 1 from public.recurring_income
    where id = v_recurring and workspace_id = p_workspace_id and status::text = 'active'
      and upper(btrim(currency_code::text)) = v_currency) then
    raise exception 'El ingreso fijo activo no está disponible en esta moneda y espacio.' using errcode = '23514';
  end if;

  for v_line in select value from jsonb_array_elements(p_parts) loop
    if jsonb_typeof(v_line) <> 'object' or exists (select 1 from jsonb_object_keys(v_line) k where k not in ('amount','categoryId','spendTypeId'))
      or jsonb_typeof(v_line -> 'amount') is distinct from 'number'
      or coalesce(v_line ->> 'amount','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or coalesce(v_line ->> 'categoryId','') !~ '^[1-9][0-9]*$' then
      raise exception 'Revisa el importe y categoría de cada parte.' using errcode = '23514';
    end if;
    v_amount := (v_line ->> 'amount')::numeric;
    v_category := (v_line ->> 'categoryId')::bigint;
    v_spend := null;
    if v_line ->> 'spendTypeId' is not null then
      if (v_line ->> 'spendTypeId') !~ '^[1-9][0-9]*$' then raise exception 'Tipo de gasto no válido.' using errcode = '23514'; end if;
      v_spend := (v_line ->> 'spendTypeId')::bigint;
    end if;
    if v_amount <= 0 or v_amount > 999999999999.99 or v_category = any(v_category_ids)
      or not exists (select 1 from public.categories where id = v_category and workspace_id = p_workspace_id
        and is_active and kind::text in (v_kind,'both'))
      or (v_spend is not null and (v_kind <> 'expense' or not exists (select 1 from public.spend_types
        where id = v_spend and workspace_id = p_workspace_id and is_active))) then
      raise exception 'Importe, categoría o tipo de gasto no disponible.' using errcode = '23514';
    end if;
    v_category_ids := array_append(v_category_ids,v_category);
    if v_spend is not null and not (v_spend = any(v_spend_ids)) then v_spend_ids := array_append(v_spend_ids,v_spend); end if;
    v_sum := v_sum + v_amount;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('amount',v_amount,'categoryId',v_category,'spendTypeId',v_spend));
  end loop;
  if v_sum <> v_total then raise exception 'La suma de las partes debe coincidir exactamente con el total.' using errcode = '23514'; end if;
  v_request := jsonb_build_object('expectedUpdatedAt',p_expected_updated_at,'movementType',v_kind,
    'accountId',v_account,'currencyCode',v_currency,'amount',v_total,'description',v_description,
    'notes',v_notes,'occurredAt',v_occurred,'counterpartyId',v_counterparty,'metadata',v_meta,'parts',v_parts);

  -- Keep old unlinked requests byte-compatible. Capture links only when provided.
  if v_subscription is not null then v_request := v_request || jsonb_build_object('subscriptionId',v_subscription); end if;
  if v_recurring is not null then
    v_request := v_request || jsonb_build_object('recurringIncomeId',v_recurring);
    v_meta := v_meta || jsonb_build_object('recurring_income_id',v_recurring);
  end if;
  v_meta := v_meta || jsonb_build_object('source','notification_detection','suggestionId',p_suggestion_id,
    'financialAppKey',suggestion.financial_app_key,'confidence',suggestion.confidence,'split_group',group_key,'split_total',n);
  v_line := v_parts -> 0;

  -- The unique head key serializes retries/simple-vs-split registration.
  -- Acquire movement rows BEFORE the suggestion, as Undo and reconciliation do.
  insert into public.movements (workspace_id,created_by_user_id,movement_type,status,occurred_at,description,notes,
    source_account_id,source_amount,destination_account_id,destination_amount,category_id,spend_type_id,counterparty_id,subscription_id,metadata,client_dedupe_key)
  values (p_workspace_id,uid,v_kind::public.movement_type,'posted',v_occurred,v_description || ' (1/' || n || ')',v_notes,
    case when v_kind = 'expense' then v_account end,case when v_kind = 'expense' then (v_line ->> 'amount')::numeric end,
    case when v_kind = 'income' then v_account end,case when v_kind = 'income' then (v_line ->> 'amount')::numeric end,
    (v_line ->> 'categoryId')::bigint,(v_line ->> 'spendTypeId')::bigint,v_counterparty,v_subscription,
    v_meta || jsonb_build_object('split_index',1,'detectedSplitRequest',v_request),group_key)
  on conflict (workspace_id,client_dedupe_key) where client_dedupe_key is not null do nothing;
  get diagnostics affected = row_count;
  inserted := affected = 1;
  select * into head from public.movements where workspace_id = p_workspace_id and client_dedupe_key = group_key for update;
  if not found then raise exception 'No se pudo confirmar el inicio de la división.' using errcode = '42501'; end if;
  if head.metadata ->> 'split_group' is distinct from group_key or head.metadata -> 'detectedSplitRequest' is distinct from v_request then
    raise exception 'La detección tiene otro registro o intento distinto. Actualiza antes de continuar.' using errcode = '23514';
  end if;
  perform 1 from public.movements where workspace_id = p_workspace_id and metadata ->> 'split_group' = group_key order by id for update;
  -- Hold active references against archive/type changes, after locking the head.
  perform 1 from public.accounts where id = v_account and workspace_id = p_workspace_id and not is_archived
    and upper(btrim(currency_code::text)) = v_currency for share;
  if not found then raise exception 'La cuenta cambió durante la revisión.' using errcode = '23514'; end if;
  if v_counterparty is not null then
    perform 1 from public.counterparties where id = v_counterparty and workspace_id = p_workspace_id and not is_archived for share;
    if not found then raise exception 'La contraparte cambió.' using errcode = '23514'; end if;
  end if;

  if v_subscription is not null then
    perform 1 from public.subscriptions where id = v_subscription and workspace_id = p_workspace_id
      and status::text = 'active' and upper(btrim(currency_code::text)) = v_currency for share;
    if not found then raise exception 'La suscripción cambió durante la revisión.' using errcode = '23514'; end if;
  end if;
  if v_recurring is not null then
    perform 1 from public.recurring_income where id = v_recurring and workspace_id = p_workspace_id
      and status::text = 'active' and upper(btrim(currency_code::text)) = v_currency for share;
    if not found then raise exception 'El ingreso fijo cambió durante la revisión.' using errcode = '23514'; end if;
  end if;

  perform 1 from public.categories where id = any(v_category_ids) and workspace_id = p_workspace_id and is_active
    and kind::text in (v_kind,'both') order by id for share;
  get diagnostics affected = row_count;
  if affected <> n then raise exception 'Las categorías cambiaron.' using errcode = '23514'; end if;
  perform 1 from public.spend_types where id = any(v_spend_ids) and workspace_id = p_workspace_id and is_active order by id for share;
  get diagnostics affected = row_count;
  if affected <> cardinality(v_spend_ids) then raise exception 'Los tipos de gasto cambiaron.' using errcode = '23514'; end if;

  select * into suggestion from public.notification_detected_movement_suggestions
    where id = p_suggestion_id and workspace_id = p_workspace_id and user_id = uid for update;
  if not found then raise exception 'La detección ya no está disponible.' using errcode = '42501'; end if;
  if suggestion.package_name = 'email:inbound' and not public.has_email_detection_pro_access() then
    raise exception 'La detección por correo requiere DarkMoney PRO activo.' using errcode = '42501';
  end if;
  if upper(btrim(suggestion.currency_code::text)) is distinct from v_currency
    or v_meta ->> 'financialAppKey' is distinct from suggestion.financial_app_key
    or v_meta ->> 'confidence' is distinct from suggestion.confidence then
    raise exception 'La detección cambió durante el registro.' using errcode = '23514';
  end if;
  if inserted then
    if suggestion.status not in ('pending','needs_review') or suggestion.movement_id is not null
      or suggestion.updated_at is distinct from p_expected_updated_at then
      raise exception 'La detección cambió. Actualiza antes de guardar.' using errcode = '42501';
    end if;
    if exists (select 1 from public.movements where workspace_id = p_workspace_id and id <> head.id
      and (metadata ->> 'suggestionId' = p_suggestion_id::text or metadata ->> 'split_group' = group_key)) then
      raise exception 'Existen otras partes de un registro anterior. No se creó otra división.' using errcode = '23514';
    end if;
    for i in 2..n loop
      v_line := v_parts -> (i-1);
      insert into public.movements (workspace_id,created_by_user_id,movement_type,status,occurred_at,description,notes,
        source_account_id,source_amount,destination_account_id,destination_amount,category_id,spend_type_id,counterparty_id,subscription_id,metadata,client_dedupe_key)
      values (p_workspace_id,uid,v_kind::public.movement_type,'posted',v_occurred,v_description || ' (' || i || '/' || n || ')',v_notes,
        case when v_kind = 'expense' then v_account end,case when v_kind = 'expense' then (v_line ->> 'amount')::numeric end,
        case when v_kind = 'income' then v_account end,case when v_kind = 'income' then (v_line ->> 'amount')::numeric end,
        (v_line ->> 'categoryId')::bigint,(v_line ->> 'spendTypeId')::bigint,v_counterparty,v_subscription,
        v_meta || jsonb_build_object('split_index',i),group_key || ':split-' || i);
    end loop;
  elsif suggestion.status is distinct from 'registered' or suggestion.movement_id is distinct from head.id then
    raise exception 'El registro existente está incompleto o cambió. No se añadieron partes.' using errcode = '23514';
  end if;

  -- Check every persisted part, including retries after a lost response. Never
  -- accept an edited/incomplete group merely because its dedupe key exists.
  for i in 1..n loop
    v_line := v_parts -> (i-1);
    select * into part from public.movements where workspace_id = p_workspace_id
      and client_dedupe_key = case when i = 1 then group_key else group_key || ':split-' || i end;
    if not found or part.created_by_user_id is distinct from uid or part.movement_type::text is distinct from v_kind
      or part.status::text is distinct from 'posted' or part.updated_at is distinct from part.created_at
      or part.description is distinct from (v_description || ' (' || i || '/' || n || ')')
      or part.notes is distinct from v_notes or part.occurred_at is distinct from v_occurred
      or part.category_id is distinct from (v_line ->> 'categoryId')::bigint
      or part.spend_type_id is distinct from (v_line ->> 'spendTypeId')::bigint or part.counterparty_id is distinct from v_counterparty
      or part.source_account_id is distinct from (case when v_kind = 'expense' then v_account end)
      or part.source_amount is distinct from (case when v_kind = 'expense' then (v_line ->> 'amount')::numeric end)
      or part.destination_account_id is distinct from (case when v_kind = 'income' then v_account end)
      or part.destination_amount is distinct from (case when v_kind = 'income' then (v_line ->> 'amount')::numeric end)
      or part.fx_rate is not null or part.obligation_id is not null or part.subscription_id is distinct from v_subscription
      or part.metadata is distinct from (v_meta || jsonb_build_object('split_index',i) ||
        case when i = 1 then jsonb_build_object('detectedSplitRequest',v_request) else '{}'::jsonb end) then
      raise exception 'Una parte fue editada o cambió. Revisa el registro completo.' using errcode = '23514';
    end if;
    ids := array_append(ids,part.id);
  end loop;
  if exists (select 1 from public.movements where workspace_id = p_workspace_id and not(id = any(ids))
    and (metadata ->> 'suggestionId' = p_suggestion_id::text or metadata ->> 'split_group' = group_key)) then
    raise exception 'Hay otras partes vinculadas a esta detección.' using errcode = '23514';
  end if;
  if public.detected_registration_has_other_links(p_workspace_id,p_suggestion_id,ids) then
    raise exception 'Otra detección depende de una parte de este registro.' using errcode = '42501';
  end if;
  if inserted then
    update public.notification_detected_movement_suggestions set status = 'registered', movement_id = head.id, updated_at = now()
      where id = p_suggestion_id and workspace_id = p_workspace_id and user_id = uid
        and status in ('pending','needs_review') and updated_at = p_expected_updated_at and movement_id is null;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'No se pudo confirmar la detección; la división se revirtió.' using errcode = '42501'; end if;
  end if;
  return jsonb_build_object('workspaceId',p_workspace_id,'suggestionId',p_suggestion_id,
    'status','registered','movementId',head.id,'movementIds',to_jsonb(ids),'alreadyRegistered',not inserted);
end;
$$;
revoke all on function public.register_detected_movement_split(bigint,bigint,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.register_detected_movement_split(bigint,bigint,timestamptz,jsonb,jsonb) to authenticated;



-- Old clients must not commit the first part and resolve later in another HTTP call.
-- Deferred checking lets the RPC insert every part and register the suggestion in
-- one transaction; a sequential or incomplete registration rolls back.
create or replace function public.guard_detected_split_commit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  group_key text; head public.movements; suggestion public.notification_detected_movement_suggestions;
  part public.movements; request jsonb; line jsonb; total numeric := 0;
  n integer; affected integer; indices integer[] := '{}'; ids bigint[] := '{}';
begin
  if new.metadata ->> 'source' is distinct from 'notification_detection' or not (new.metadata ? 'split_group') then return new; end if;
  group_key := new.metadata ->> 'split_group';
  -- Insert followed by complete deletion in this same transaction is a no-op.
  if not exists (select 1 from public.movements where workspace_id = new.workspace_id
    and (metadata ->> 'split_group' = group_key or id = new.id)) then return new; end if;
  if group_key is distinct from ('suggestion:' || (new.metadata ->> 'suggestionId')) then
    raise exception 'La división detectada requiere el registro atómico; no se guardó ninguna parte.' using errcode = '23514';
  end if;
  select * into head from public.movements where workspace_id = new.workspace_id and client_dedupe_key = group_key;
  if not found or head.metadata ->> 'split_group' is distinct from group_key
    or head.metadata ->> 'split_index' is distinct from '1'
    or coalesce(head.metadata ->> 'split_total','') !~ '^[1-9][0-9]{0,2}$'
    or jsonb_typeof(head.metadata -> 'detectedSplitRequest') is distinct from 'object' then
    raise exception 'Actualiza la app para guardar la división completa en una sola operación.' using errcode = '23514';
  end if;
  n := (head.metadata ->> 'split_total')::integer;
  if n < 2 or n > 100 then raise exception 'División no válida.' using errcode = '23514'; end if;
  request := head.metadata -> 'detectedSplitRequest';
  if jsonb_typeof(request -> 'parts') is distinct from 'array'
    or jsonb_array_length(request -> 'parts') <> n
    or jsonb_typeof(request -> 'amount') is distinct from 'number'
    or jsonb_typeof(request -> 'accountId') is distinct from 'number'
    or jsonb_typeof(request -> 'occurredAt') is distinct from 'string'
    or jsonb_typeof(request -> 'expectedUpdatedAt') is distinct from 'string'
    or request ->> 'movementType' is distinct from head.movement_type::text
    or head.movement_type::text not in ('expense','income') then
    raise exception 'La petición original de la división no está completa.' using errcode = '23514';
  end if;
  select * into suggestion from public.notification_detected_movement_suggestions
    where workspace_id = head.workspace_id and id::text = head.metadata ->> 'suggestionId' and user_id = head.created_by_user_id;
  if not found or suggestion.status is distinct from 'registered' or suggestion.movement_id is distinct from head.id then
    raise exception 'La división no confirmó la detección; no se guardó ninguna parte.' using errcode = '23514';
  end if;
  for part in select * from public.movements where workspace_id = head.workspace_id
    and metadata ->> 'split_group' = group_key order by id loop
    if coalesce(part.metadata ->> 'split_index','') !~ '^[1-9][0-9]{0,2}$'
      or part.metadata ->> 'split_total' is distinct from n::text
      or part.metadata ->> 'source' is distinct from 'notification_detection'
      or part.metadata ->> 'suggestionId' is distinct from suggestion.id::text
      or part.created_by_user_id is distinct from head.created_by_user_id
      or part.status::text is distinct from 'posted' or part.movement_type is distinct from head.movement_type
      or part.subscription_id is distinct from head.subscription_id then
      raise exception 'La división está incompleta o cambió.' using errcode = '23514';
    end if;
    affected := (part.metadata ->> 'split_index')::integer;
    if affected > n or affected = any(indices) or part.client_dedupe_key is distinct from
      (case when affected = 1 then group_key else group_key || ':split-' || affected::text end) then
      raise exception 'La división repite o perdió partes.' using errcode = '23514';
    end if;
    line := request -> 'parts' -> (affected-1);
    if jsonb_typeof(line -> 'amount') is distinct from 'number'
      or (case when head.movement_type::text = 'expense' then part.source_amount else part.destination_amount end)
        is distinct from (line ->> 'amount')::numeric
      or part.category_id is distinct from (line ->> 'categoryId')::bigint
      or part.spend_type_id is distinct from (line ->> 'spendTypeId')::bigint
      or (case when head.movement_type::text = 'expense' then part.source_account_id else part.destination_account_id end)
        is distinct from (request ->> 'accountId')::bigint
      or part.occurred_at is distinct from (request ->> 'occurredAt')::timestamptz then
      raise exception 'Una parte no coincide con la petición original.' using errcode = '23514';
    end if;
    total := total + (line ->> 'amount')::numeric;
    indices := array_append(indices,affected); ids := array_append(ids,part.id);
  end loop;
  if total is distinct from (request ->> 'amount')::numeric or cardinality(ids) <> n or not(new.id = any(ids)) or exists (
    select 1 from public.movements where workspace_id = head.workspace_id and not(id = any(ids))
      and metadata ->> 'suggestionId' = suggestion.id::text
  ) then raise exception 'La división tiene partes sueltas.' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function public.guard_detected_split_commit() from public, anon, authenticated;
drop trigger if exists guard_detected_split_commit on public.movements;
create constraint trigger guard_detected_split_commit after insert on public.movements
  deferrable initially deferred for each row execute function public.guard_detected_split_commit();
