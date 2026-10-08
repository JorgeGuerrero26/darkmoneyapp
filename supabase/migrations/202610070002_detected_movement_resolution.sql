-- Para el registro simple, crear el movimiento y resolver su detección es una sola
-- transacción. read_at del aviso es independiente y no interviene en esta decisión.
create or replace function public.resolve_detection_after_movement_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare suggestion public.notification_detected_movement_suggestions;
begin
  -- La división existente se resuelve al terminar todas sus líneas en el cliente.
  if new.metadata ->> 'suggestionId' is null or new.metadata ? 'split_group' then return new; end if;
  select * into suggestion from public.notification_detected_movement_suggestions s
    where s.id::text = new.metadata ->> 'suggestionId' for update;
  if not found then return new; end if;
  if suggestion.workspace_id <> new.workspace_id or
    not (suggestion.user_id = auth.uid() or auth.role() = 'service_role') then
    raise exception 'La detección no pertenece a este usuario y workspace.' using errcode = '42501';
  end if;
  if suggestion.status not in ('pending', 'needs_review') then
    raise exception 'Esta detección ya fue resuelta. Actualiza la lista.' using errcode = '42501';
  end if;
  update public.notification_detected_movement_suggestions
    set status = 'registered', movement_id = new.id, updated_at = now()
    where id = suggestion.id;
  return new;
end;
$$;
revoke all on function public.resolve_detection_after_movement_insert() from public, anon, authenticated;
drop trigger if exists resolve_detection_after_movement_insert on public.movements;
create trigger resolve_detection_after_movement_insert
  after insert on public.movements for each row
  execute function public.resolve_detection_after_movement_insert();
