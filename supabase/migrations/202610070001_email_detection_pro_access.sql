-- PRO vigente es la única fuente de permiso para la detección por correo.
-- Conserva el acceso manual del administrador que la app ya reconocía por correo.
-- Nunca sobreescribe un registro explícito de entitlement, incluido uno desactivado.
insert into public.user_entitlements (user_id, plan_code, pro_access_enabled, manual_override, metadata)
select id, 'pro', true, true, '{"grant_reason":"existing_app_admin_access"}'::jsonb
from auth.users where lower(email) = 'joradrianmori@gmail.com'
on conflict (user_id) do nothing;

create or replace function public.has_email_detection_pro_access(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (p_user_id = auth.uid() or auth.role() = 'service_role')
    and exists (
      select 1 from public.user_entitlements e
      where e.user_id = p_user_id and e.pro_access_enabled
        and (e.manual_override or e.current_period_end is null or e.current_period_end > now())
    ), false
  );
$$;
revoke all on function public.has_email_detection_pro_access(uuid) from public, anon;
grant execute on function public.has_email_detection_pro_access(uuid) to authenticated, service_role;

drop policy if exists inbound_email_aliases_own_select on public.inbound_email_aliases;
create policy inbound_email_aliases_own_select on public.inbound_email_aliases
  for select to authenticated using (
    auth.uid() = user_id and public.is_workspace_member(workspace_id)
    and public.has_email_detection_pro_access()
  );
drop policy if exists inbound_email_aliases_own_insert on public.inbound_email_aliases;
create policy inbound_email_aliases_own_insert on public.inbound_email_aliases
  for insert to authenticated with check (
    auth.uid() = user_id and public.is_workspace_member(workspace_id)
    and public.has_email_detection_pro_access()
  );
drop policy if exists inbound_email_aliases_own_update on public.inbound_email_aliases;
create policy inbound_email_aliases_own_update on public.inbound_email_aliases
  for update to authenticated using (
    auth.uid() = user_id and public.is_workspace_member(workspace_id)
    and public.has_email_detection_pro_access()
  ) with check (
    auth.uid() = user_id and public.is_workspace_member(workspace_id)
    and public.has_email_detection_pro_access()
  );

-- Protege también clientes antiguos y escrituras con service_role. Android no cambia.
-- Se mantiene la lectura del historial; el formulario pendiente exige PRO en la app.
create or replace function public.guard_email_detection_suggestion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and
    (old.package_name = 'email:inbound') <> (new.package_name = 'email:inbound') then
    raise exception 'No se puede cambiar el origen de una sugerencia por correo.' using errcode = '42501';
  end if;
  if new.package_name = 'email:inbound' and not public.has_email_detection_pro_access(new.user_id) then
    raise exception 'La detección por correo requiere DarkMoney PRO activo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_email_detection_suggestion() from public, anon, authenticated;
drop trigger if exists guard_email_detection_suggestion_pro on public.notification_detected_movement_suggestions;
create trigger guard_email_detection_suggestion_pro
  before insert or update on public.notification_detected_movement_suggestions
  for each row execute function public.guard_email_detection_suggestion();

-- Una app anterior puede intentar crear el movimiento antes de marcar la sugerencia.
-- La restricción debe actuar antes del movimiento, no después de afectar el saldo.
create or replace function public.guard_email_detected_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare suggestion public.notification_detected_movement_suggestions;
begin
  if new.metadata ->> 'suggestionId' is null then return new; end if;
  select * into suggestion from public.notification_detected_movement_suggestions s
    where s.id::text = new.metadata ->> 'suggestionId' and s.package_name = 'email:inbound';
  if found and (
    suggestion.workspace_id <> new.workspace_id
    or not public.has_email_detection_pro_access(suggestion.user_id)
  ) then
    raise exception 'La detección por correo requiere DarkMoney PRO activo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_email_detected_movement() from public, anon, authenticated;
drop trigger if exists guard_email_detected_movement_pro on public.movements;
create trigger guard_email_detected_movement_pro
  before insert on public.movements
  for each row execute function public.guard_email_detected_movement();
