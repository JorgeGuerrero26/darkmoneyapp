-- Suscripciones: del puntero al historial (fase 1 de docs/REDISENO_SUSCRIPCIONES.md)
--
-- `subscriptions.next_due_date` solo avanzaba cuando alguien tocaba "marcar pagada", asi que
-- "pagada" significaba "alguien lo dijo" y no "el dinero salio". Un cobro registrado como
-- movimiento normal no cerraba el mes; anular el pago no lo reabria; reactivar una pausada
-- borraba los meses intermedios sin distinguir pagado de saltado.
--
-- `subscription_occurrences` ya existia con los campos exactos (due_date, expected_amount,
-- status, movement_id, paid_at), su unique (subscription_id, due_date), sus indices y su RLS
-- por workspace -- y la app nunca la escribio: 0 filas. Esta migracion la enciende.
--
-- El estado de un mes pasa a ser una OBSERVACION sobre movimientos:
--   * `paid`      tiene un movimiento no anulado emparejado. La unica forma de estar pagada.
--   * `skipped`   ese mes no se cobro (o quedo cerrado antes de que existiera el historial).
--   * `cancelled` la suscripcion estaba cancelada en esa fecha.
--   * `scheduled` sin resolver. "Vencida" se deriva de la fecha; no se guarda un estado que
--                 caduca solo y habria que ir a corregir cada noche.
--
-- `next_due_date` pasa a ser una CACHE de "la primera ocurrencia sin resolver". La columna no
-- se elimina: la leen v_subscription_upcoming, el digest de notificaciones y el dashboard.
--
-- OJO con lo que esto NO hace: solo empareja movimientos que YA estan vinculados a la
-- suscripcion (`movements.subscription_id`). Decidir si un gasto suelto pertenece a una
-- suscripcion es la fase 3, y ahi se pregunta antes de dar nada por pagado.

-- ── Un movimiento no puede pagar dos meses ────────────────────────────────────
create unique index if not exists subscription_occurrences_movement_unique
  on public.subscription_occurrences (movement_id)
  where movement_id is not null;

-- ── La cadencia, igual que en TS (lib/subscription-helpers.ts) ────────────────
-- Postgres recorta igual que date-fns al sumar meses: 31 ene + 1 mes = 28 feb en los dos.
create or replace function public.next_subscription_due(
  p_from date,
  p_frequency public.subscription_frequency,
  p_interval integer
) returns date
language sql
immutable
as $$
  select (p_from + case p_frequency
    when 'daily'     then (greatest(coalesce(p_interval, 1), 1) || ' days')::interval
    when 'weekly'    then (greatest(coalesce(p_interval, 1), 1) || ' weeks')::interval
    when 'monthly'   then (greatest(coalesce(p_interval, 1), 1) || ' months')::interval
    when 'quarterly' then (greatest(coalesce(p_interval, 1), 1) * 3 || ' months')::interval
    when 'yearly'    then (greatest(coalesce(p_interval, 1), 1) || ' years')::interval
    else                  (greatest(coalesce(p_interval, 1), 1) || ' days')::interval
  end)::date
$$;

comment on function public.next_subscription_due(date, public.subscription_frequency, integer)
  is 'Siguiente vencimiento de una cadencia. Espejo de computeNextRecurringDate en TS.';

-- ── Materializar, emparejar y recalcular el puntero ───────────────────────────
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
  pointer := s.next_due_date;

  -- 1. Un movimiento anulado (o borrado: la FK deja movement_id en null) reabre su mes.
  update public.subscription_occurrences o
     set status = 'scheduled', movement_id = null, paid_at = null, updated_at = now()
   where o.subscription_id = s.id
     and o.status = 'paid'
     and (
       o.movement_id is null
       or not exists (
         select 1 from public.movements m
          where m.id = o.movement_id and m.status <> 'voided'
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

    cur := public.next_subscription_due(cur, s.frequency, s.interval_count);
    exit when cur <= last_due; -- salvaguarda: una cadencia rota no cuelga la transaccion
  end loop;

  -- 3. Emparejar. Se recorre por MOVIMIENTO, no por mes: la pregunta real es "esta plata, ¿que
  --    mes cubre?", y asi un pago con retraso encuentra su mes en vez de quedarse suelto.
  period_days := public.next_subscription_due(pointer, s.frequency, s.interval_count) - pointer;
  tolerance := greatest(3, period_days / 2); -- medio periodo: mas alla ya es del mes siguiente

  for mv in
    select m.id,
           (m.occurred_at at time zone 'America/Lima')::date as paid_on,
           m.occurred_at,
           case
             when m.metadata ->> 'paid_for_due_date' ~ '^\d{4}-\d{2}-\d{2}$'
               then (m.metadata ->> 'paid_for_due_date')::date
           end as hint
      from public.movements m
     where m.subscription_id = s.id
       and m.status <> 'voided'
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
    select max(o.due_date) into last_due
      from public.subscription_occurrences o where o.subscription_id = s.id;
    next_open := case
      when last_due is null then pointer
      else public.next_subscription_due(last_due, s.frequency, s.interval_count)
    end;
  end if;

  if next_open is distinct from s.next_due_date then
    update public.subscriptions set next_due_date = next_open where id = s.id;
  end if;
end;
$$;

comment on function public.sync_subscription_occurrences(bigint, boolean)
  is 'Materializa las ocurrencias hasta hoy, empareja los movimientos vinculados y deja next_due_date en la primera sin resolver.';

-- ── Mantenerlo al dia solo ────────────────────────────────────────────────────

create or replace function public.tg_subscriptions_sync_occurrences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si lo unico que cambio es el puntero, lo movimos nosotros: no hay que volver a entrar.
  if tg_op = 'UPDATE'
     and new.next_due_date is distinct from old.next_due_date
     and (new.start_date, new.frequency, new.interval_count, new.amount, new.status, new.end_date)
         is not distinct from
         (old.start_date, old.frequency, old.interval_count, old.amount, old.status, old.end_date)
  then
    return new;
  end if;

  perform public.sync_subscription_occurrences(new.id);
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_sync_occurrences on public.subscriptions;
create trigger trg_subscriptions_sync_occurrences
  after insert or update on public.subscriptions
  for each row execute function public.tg_subscriptions_sync_occurrences();

create or replace function public.tg_movements_sync_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.subscription_id, old.subscription_id) is not null then
    perform public.sync_subscription_occurrences(coalesce(new.subscription_id, old.subscription_id));
  end if;
  -- Si un movimiento cambia de suscripcion, hay que recalcular tambien la que deja.
  if tg_op = 'UPDATE'
     and old.subscription_id is not null
     and old.subscription_id is distinct from new.subscription_id then
    perform public.sync_subscription_occurrences(old.subscription_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_movements_sync_subscription on public.movements;
create trigger trg_movements_sync_subscription
  after insert or update or delete on public.movements
  for each row execute function public.tg_movements_sync_subscription();

-- ── Backfill: reconstruir todo el historial existente ────────────────────────
do $$
declare
  r record;
begin
  for r in select id from public.subscriptions order by id loop
    perform public.sync_subscription_occurrences(r.id, true);
  end loop;
end;
$$;
