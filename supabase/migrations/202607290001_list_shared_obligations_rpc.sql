-- Obligaciones compartidas en UN solo viaje.
--
-- Antes: edge function `list-shared-obligations`, que costaba el hop cliente→función, su
-- arranque en frío, y 3 consultas secuenciales dentro (shares → vista → eventos) más la
-- resolución de sesión. Medido: cada viaje a la BD cuesta ~150 ms desde el teléfono y el
-- trabajo real de Postgres es de 10-60 ms, así que lo que dominaba era el número de viajes.
--
-- SECURITY DEFINER porque la vista y los eventos de una obligación ajena no son legibles por
-- RLS para quien solo la tiene compartida. El filtro por auth.uid() es la única puerta: no
-- acepta parámetros, así que un usuario no puede pedir los datos de otro.
--
-- Las columnas de obligation_events se listan explícitamente, igual que hacía la edge function:
-- con to_jsonb(e) se filtraría cualquier columna nueva de la tabla sin querer.

create or replace function public.list_shared_obligations()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'obligation', to_jsonb(o) || jsonb_build_object('events', coalesce(ev.events, '[]'::jsonb)),
        'share', to_jsonb(s)
      )
      order by s.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.obligation_shares s
  join public.v_obligation_summary o on o.id = s.obligation_id
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id', e.id,
               'obligation_id', e.obligation_id,
               'event_type', e.event_type,
               'event_date', e.event_date,
               'created_at', e.created_at,
               'amount', e.amount,
               'installment_no', e.installment_no,
               'reason', e.reason,
               'description', e.description,
               'notes', e.notes,
               'movement_id', e.movement_id,
               'created_by_user_id', e.created_by_user_id,
               'metadata', e.metadata
             )
             order by e.event_date desc, e.id desc
           ) as events
      from public.obligation_events e
     where e.obligation_id = s.obligation_id
  ) ev on true
  where s.status = 'accepted'
    and (
      s.invited_user_id = auth.uid()
      or s.invited_email = (select u.email from auth.users u where u.id = auth.uid())
    );
$$;

-- Nadie anónimo: el filtro depende de auth.uid().
revoke all on function public.list_shared_obligations() from public;
revoke all on function public.list_shared_obligations() from anon;
grant execute on function public.list_shared_obligations() to authenticated;
