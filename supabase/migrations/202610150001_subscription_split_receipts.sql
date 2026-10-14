-- Receipt projection only: original ledger rows/balances remain unchanged.
-- All members of a group are considered, including unlinked/voided parts.
create or replace view public.v_subscription_payment_receipts
with (security_invoker = true) as
with parsed as not materialized (
  select m.*,
    m.metadata ->> 'split_group' as group_key,
    case when (jsonb_typeof(m.metadata -> 'split_index') = 'number'
      and m.metadata ->> 'split_index' ~ '^[1-9][0-9]{0,2}(\.0+)?$')
      or (jsonb_typeof(m.metadata -> 'split_index') = 'string'
      and m.metadata ->> 'split_index' ~ '^[1-9][0-9]{0,2}$')
      then (m.metadata ->> 'split_index')::numeric::integer end as part_index,
    case when (jsonb_typeof(m.metadata -> 'split_total') = 'number'
      and m.metadata ->> 'split_total' ~ '^[1-9][0-9]{0,2}(\.0+)?$')
      or (jsonb_typeof(m.metadata -> 'split_total') = 'string'
      and m.metadata ->> 'split_total' ~ '^[1-9][0-9]{0,2}$')
      then (m.metadata ->> 'split_total')::numeric::integer end as part_count
  from public.movements m
), grouped as (
  select h.id, h.workspace_id, h.subscription_id, h.occurred_at, h.metadata,
    g.total_amount, g.part_ids,
    coalesce(
      h.part_count between 2 and 100 and g.n = h.part_count
      and g.indices = h.part_count and g.heads = 1 and g.valid
      and h.source_account_id is not null and h.created_by_user_id is not null and isfinite(h.occurred_at)
      and h.movement_type::text in ('expense','subscription_payment')
      and g.total_amount::text not in ('NaN','Infinity','-Infinity')
      and g.total_amount > 0 and g.total_amount * 100 <= 9007199254740991,
      false
    ) as complete
  from parsed h
  cross join lateral (
    select count(*) as n, count(distinct p.part_index) as indices,
      count(*) filter (where p.part_index = 1) as heads,
      sum(p.source_amount) as total_amount,
      array_agg(p.id order by p.part_index,p.id) as part_ids,
      bool_and(coalesce(
        jsonb_typeof(p.metadata -> 'split_group') = 'string'
        and p.part_count = h.part_count and p.part_index between 1 and h.part_count
        and p.status::text = 'posted' and p.movement_type = h.movement_type
        and p.created_by_user_id = h.created_by_user_id
        and p.source_account_id = h.source_account_id
        and p.destination_account_id is null and p.destination_amount is null
        and p.occurred_at = h.occurred_at
        and p.source_amount > 0 and p.source_amount::text not in ('NaN','Infinity','-Infinity')
        and (p.subscription_id is null or p.subscription_id = h.subscription_id),
        false
      )) as valid
    from parsed p
    where p.workspace_id = h.workspace_id and p.metadata ? 'split_group' and p.group_key = h.group_key
  ) g
  where h.subscription_id is not null and h.metadata ? 'split_group'
    and jsonb_typeof(h.metadata -> 'split_group') = 'string' and btrim(h.group_key) <> '' and h.part_index = 1
)
select id, workspace_id, subscription_id, occurred_at, metadata,
  case when complete then total_amount end as source_amount,
  case when complete then 'complete' else 'incomplete' end::text as receipt_status,
  part_ids as receipt_part_ids
from grouped
union all
select m.id, m.workspace_id, m.subscription_id, m.occurred_at, m.metadata,
  coalesce(nullif(m.source_amount,0),m.destination_amount) as source_amount,
  'complete'::text as receipt_status, array[m.id] as receipt_part_ids
from public.movements m
where m.subscription_id is not null and m.status::text = 'posted'
  and not (coalesce(m.metadata,'{}'::jsonb) ?| array['split_group','split_index','split_total'])
  and (m.source_amount > 0 or m.destination_amount > 0)
  and coalesce(nullif(m.source_amount,0),m.destination_amount)::text not in ('NaN','Infinity','-Infinity');

revoke all on public.v_subscription_payment_receipts from public, anon;
grant select on public.v_subscription_payment_receipts to authenticated, service_role;
comment on view public.v_subscription_payment_receipts is
  'Read-only receipt projection: one head and native total per complete split. Never a ledger/balance source.';

create or replace function public.sync_subscription_occurrences(
  p_subscription_id bigint,
  p_close_legacy boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s           public.subscriptions%rowtype;
  pointer     date;      -- el puntero tal como estaba al entrar
  cur         date;
  horizon     date;
  last_due    date;
  next_open   date;
  period_days integer;
  tolerance   integer;
  guard       integer := 0;
  mv          record;
  target      bigint;
begin
  select * into s from public.subscriptions where id = p_subscription_id;
  if not found then
    return;
  end if;
  -- Derived writes are scoped too; SECURITY DEFINER must not grant an outsider
  -- a calendar mutation merely because they guessed the subscription ID.
  if auth.role() is distinct from 'service_role' then
    if auth.uid() is not null then
      if not public.is_workspace_member(s.workspace_id) then
        raise exception 'No tienes acceso a esta suscripción.' using errcode = '42501';
      end if;
    elsif auth.role() is not null or session_user not in ('postgres','supabase_admin') then
      raise exception 'No tienes acceso a esta suscripción.' using errcode = '42501';
    end if;
  end if;
  pointer := s.next_due_date;

  -- 1. Un movimiento anulado (o borrado: la FK deja movement_id en null) reabre su mes.
  update public.subscription_occurrences o
     set status = 'scheduled', movement_id = null, paid_at = null, updated_at = now()
   where o.subscription_id = s.id
     and o.status = 'paid'
     and (
       o.movement_id is null
       or not exists (
         select 1 from public.v_subscription_payment_receipts m
          where m.id = o.movement_id and m.subscription_id = s.id and m.receipt_status = 'complete'
       )
     );

  -- 2. Materializar los meses que falten, hasta hoy.
  --    Pausada o cancelada no acumula cobros nuevos: el horizonte se congela donde quedo.
  horizon := case
    when s.status = 'active' then (now() at time zone 'America/Lima')::date
    else pointer - 1
  end;
  if s.end_date is not null and s.end_date < horizon then
    horizon := s.end_date;
  end if;

  /* Solo el backfill mira hacia atras desde `start_date`. En el dia a dia se arranca en el
     puntero: el formulario promete que "Empezó" es solo referencia y no afecta los cobros, asi
     que poner una fecha de inicio vieja no puede inventar meses en deuda. */
  cur := case when p_close_legacy then s.start_date else pointer end;

  while cur <= horizon and guard < 400 loop
    guard := guard + 1;
    last_due := cur;

    insert into public.subscription_occurrences (subscription_id, due_date, expected_amount, status)
    values (
      s.id, cur, s.amount,
      case when s.status = 'cancelled' then 'cancelled'::public.subscription_occurrence_status
           else 'scheduled'::public.subscription_occurrence_status end
    )
    on conflict (subscription_id, due_date) do nothing;

    cur := public.next_subscription_due(cur, s.frequency, s.interval_count, s.day_of_month);
    exit when cur <= last_due; -- salvaguarda: una cadencia rota no cuelga la transaccion
  end loop;

  -- 3. Emparejar. Se recorre por MOVIMIENTO, no por mes: la pregunta real es "esta plata, ¿que
  --    mes cubre?", y asi un pago con retraso encuentra su mes en vez de quedarse suelto.
  period_days := public.next_subscription_due(pointer, s.frequency, s.interval_count, s.day_of_month) - pointer;
  tolerance := greatest(3, period_days / 2); -- medio periodo: mas alla ya es del mes siguiente

  for mv in
    select m.id,
           (m.occurred_at at time zone 'America/Lima')::date as paid_on,
           m.occurred_at,
           case
             when m.metadata ->> 'paid_for_due_date' ~ '^\d{4}-\d{2}-\d{2}$'
               then (m.metadata ->> 'paid_for_due_date')::date
           end as hint
      from public.v_subscription_payment_receipts m
     where m.subscription_id = s.id
       and m.receipt_status = 'complete'
       and not exists (
         select 1 from public.subscription_occurrences o where o.movement_id = m.id
       )
     order by m.occurred_at, m.id
  loop
    select o.id into target
      from public.subscription_occurrences o
     where o.subscription_id = s.id
       and o.status = 'scheduled'
       and (o.due_date = mv.hint or abs(o.due_date - mv.paid_on) <= tolerance)
     order by
       -- La hoja de "marcar pagada" deja escrito a que vencimiento iba: eso manda sobre la fecha.
       case when o.due_date = mv.hint then 0 else 1 end,
       abs(o.due_date - mv.paid_on),
       o.due_date
     limit 1;

    if found then
      update public.subscription_occurrences
         set status = 'paid', movement_id = mv.id, paid_at = mv.occurred_at, updated_at = now()
       where id = target;
    end if;
  end loop;

  -- 4. Cerrar lo anterior al puntero, solo en el backfill.
  /* Antes del puntero no hay historial que reconstruir: el modelo viejo dio esos meses por
     cerrados y no dejo rastro de si se pagaron o se saltaron. Inventar una deuda de hace meses
     seria peor que decir que no se sabe. */
  if p_close_legacy then
    update public.subscription_occurrences o
       set status = 'skipped',
           notes = coalesce(o.notes, 'Cerrada antes de llevar historial'),
           updated_at = now()
     where o.subscription_id = s.id
       and o.status = 'scheduled'
       and o.due_date < pointer;
  end if;

  -- 5. El puntero es la primera sin resolver.
  select min(o.due_date) into next_open
    from public.subscription_occurrences o
   where o.subscription_id = s.id and o.status = 'scheduled';

  if next_open is null then
    /* El puntero que todavia no ha vencido NO se recalcula: las ocurrencias solo se
       materializan hasta hoy, asi que un cobro futuro aun no tiene fila y calcular "el
       siguiente al ultimo materializado" se lo saltaria. Paso de verdad al aplicar esto: cuatro
       suscripciones creadas el 3 de setiembre con su primer cobro el 30 saltaron al 31 de
       octubre, perdiendo el de setiembre. */
    if pointer > horizon then
      next_open := pointer;
    else
      select max(o.due_date) into last_due
        from public.subscription_occurrences o where o.subscription_id = s.id;
      next_open := case
        when last_due is null then pointer
        else public.next_subscription_due(last_due, s.frequency, s.interval_count, s.day_of_month)
      end;
    end if;
  end if;

  if next_open is distinct from s.next_due_date then
    update public.subscriptions set next_due_date = next_open where id = s.id;
  end if;
end;
$$;
revoke all on function public.sync_subscription_occurrences(bigint,boolean) from public, anon;
grant execute on function public.sync_subscription_occurrences(bigint,boolean) to authenticated, service_role;
-- A legacy first-only link still depends on changes to its unlinked parts.
create or replace function public.tg_movements_sync_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_sub bigint; old_sub bigint; new_ws bigint; old_ws bigint;
  new_group text; old_group text; sub_id bigint;
begin
  if tg_op in ('INSERT','UPDATE') then
    new_sub := new.subscription_id; new_ws := new.workspace_id; new_group := new.metadata ->> 'split_group';
  end if;
  if tg_op in ('UPDATE','DELETE') then
    old_sub := old.subscription_id; old_ws := old.workspace_id; old_group := old.metadata ->> 'split_group';
  end if;
  for sub_id in
    select distinct x.id from (
      select new_sub as id union all select old_sub
      union all
      select m.subscription_id from public.movements m
      where m.subscription_id is not null and m.metadata ? 'split_group'
        and ((m.workspace_id = new_ws and m.metadata ->> 'split_group' = new_group)
          or (m.workspace_id = old_ws and m.metadata ->> 'split_group' = old_group))
    ) x where x.id is not null order by x.id
  loop
    perform public.sync_subscription_occurrences(sub_id);
  end loop;
  return null;
end;
$$;
revoke all on function public.tg_movements_sync_subscription() from public, anon, authenticated;
