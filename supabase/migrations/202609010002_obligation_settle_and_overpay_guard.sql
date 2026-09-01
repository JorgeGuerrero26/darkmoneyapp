-- Dos reglas que hasta ahora no existían en ningún sitio:
--
--   1. Una deuda que llega a cero se liquida sola.
--   2. Nada puede dejar el saldo en negativo.
--
-- Viven en un trigger sobre `obligation_events` y no en la app a propósito. El saldo se puede
-- mover por cinco caminos distintos —registrar un pago, editarlo, borrarlo, aceptar una
-- solicitud de pago del deudor, o que el otro usuario registre un cobro desde SU teléfono sobre
-- una obligación compartida— y tres de ellos no pasan por la pantalla que validaría. Puesto en
-- el cliente habría que acordarse de repetirlo en cada uno, y el que se olvide es justo por
-- donde entra el dato malo. Puesto aquí, no hay camino que lo esquive.
--
-- El estado `paid` ("Liquidada") existía en el enum, en los filtros y en el dashboard desde el
-- principio, pero NADA lo ponía nunca: se pagaba una deuda entera y se quedaba en `active` con
-- saldo 0 estorbando en la lista para siempre, salvo que uno se acordara de archivarla a mano.
-- Hoy hay cuatro obligaciones en cero y tres están archivadas a mano; la cuarta —"Deuda iphone",
-- al 100%— sigue en la lista.

-- ── El saldo, con la misma fórmula que la vista `obligation_summaries` ────────────────────────
create or replace function public.obligation_pending_amount(p_obligation_id bigint)
returns numeric
language sql
stable
set search_path = public
as $$
  select round(
    o.principal_amount
    + coalesce(sum(e.amount) filter (where e.event_type::text = 'principal_increase'), 0)
    - coalesce(sum(e.amount) filter (where e.event_type::text = 'principal_decrease'), 0)
    + coalesce(sum(e.amount) filter (where e.event_type::text = 'interest'), 0)
    + coalesce(sum(e.amount) filter (where e.event_type::text = 'fee'), 0)
    + coalesce(sum(e.amount) filter (where e.event_type::text = 'adjustment'), 0)
    - coalesce(sum(e.amount) filter (where e.event_type::text = 'discount'), 0)
    - coalesce(sum(e.amount) filter (where e.event_type::text = 'writeoff'), 0)
    - coalesce(sum(e.amount) filter (where e.event_type::text = 'payment'), 0)
  , 2)
  from public.obligations o
  left join public.obligation_events e on e.obligation_id = o.id
  where o.id = p_obligation_id
  group by o.principal_amount;
$$;

comment on function public.obligation_pending_amount is
  'Saldo pendiente SIN el GREATEST(0) de la vista: aquí el negativo tiene que poder verse, porque es lo que el trigger rechaza.';

-- ── El trigger ───────────────────────────────────────────────────────────────────────────────
create or replace function public.obligation_events_settle_and_guard()
returns trigger
language plpgsql
-- SECURITY DEFINER porque el que dispara el trigger puede ser el usuario con quien la obligación
-- está COMPARTIDA: registra su pago y hay que cambiar el estado de una fila que su RLS no le deja
-- tocar. Sin esto, el pago del viewer entra y la liquidación se pierde en silencio.
security definer
set search_path = public
as $$
declare
  v_obligation_id bigint;
  v_pending numeric;
  v_status text;
begin
  v_obligation_id := coalesce(new.obligation_id, old.obligation_id);
  if v_obligation_id is null then
    return coalesce(new, old);
  end if;

  -- AFTER, no BEFORE: así la fila nueva ya está en la tabla y el saldo se recalcula leyendo, sin
  -- tener que replicar a mano el signo que le toca a cada tipo de evento. Una excepción aquí
  -- revierte igual toda la sentencia.
  v_pending := public.obligation_pending_amount(v_obligation_id);
  if v_pending is null then
    return coalesce(new, old);
  end if;

  -- La tolerancia es la misma que usa la app para decidir si algo está saldado (0.009): sin ella,
  -- un céntimo de redondeo en un pago que cubre el total exacto se leería como sobrepago.
  if v_pending < -0.009 then
    raise exception 'El monto excede el saldo pendiente por %.', abs(v_pending)
      using errcode = 'check_violation';
  end if;

  select o.status::text into v_status from public.obligations o where o.id = v_obligation_id;

  -- `draft` todavía no es una deuda viva y `cancelled` la archivó una persona a propósito: el
  -- automatismo no le lleva la contraria a ninguna de las dos.
  if v_status in ('active', 'defaulted') and v_pending <= 0.009 then
    update public.obligations set status = 'paid', updated_at = now() where id = v_obligation_id;
  elsif v_status = 'paid' and v_pending > 0.009 then
    -- Y al revés: si se borra un pago, se edita a menos, o llega un interés nuevo, la deuda
    -- vuelve a estar viva. Sin esta rama quedaría "Liquidada" con saldo, que es peor que no
    -- haberla liquidado nunca.
    update public.obligations set status = 'active', updated_at = now() where id = v_obligation_id;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.obligation_events_settle_and_guard is
  'Liquida la obligación cuando el saldo llega a cero, la reabre si vuelve a subir, y rechaza cualquier evento que lo dejaría en negativo. Cubre las tres vías: pago propio, edición y solicitud aceptada.';

drop trigger if exists obligation_events_settle_and_guard on public.obligation_events;
create trigger obligation_events_settle_and_guard
  after insert or update or delete on public.obligation_events
  for each row
  execute function public.obligation_events_settle_and_guard();

-- ── Puesta al día de lo que ya está en cero ──────────────────────────────────────────────────
-- Sin esto, "Deuda iphone" seguiría en `active` hasta que alguien le tocara un evento. No se
-- toca lo archivado a mano.
update public.obligations o
set status = 'paid', updated_at = now()
where o.status::text in ('active', 'defaulted')
  and public.obligation_pending_amount(o.id) <= 0.009;
