-- Detección de pagos por correo: el usuario reenvía desde Gmail a
-- recibos+<token>@darkmoney.company y la edge function inbound-email-detection resuelve
-- por ese token a quién pertenece el correo.
--
-- El token es un SECRETO: quien lo conozca puede inyectar sugerencias (no movimientos: todo
-- exige confirmación). Por eso es rotable — se revoca y se genera otro sin tocar la cuenta
-- de correo del usuario.

create table if not exists public.inbound_email_aliases (
  -- El token lo genera Postgres, NO el cliente: gen_random_uuid() es criptográficamente
  -- aleatorio, mientras que Math.random() en Hermes es predecible y esto es un secreto.
  -- 32 chars hex. Mismo criterio que los tokens de invitación, que se acuñan en el servidor.
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Búsqueda del alias activo del usuario (la pantalla de Configuración).
create index if not exists inbound_email_aliases_user_idx
  on public.inbound_email_aliases(user_id) where revoked_at is null;

alter table public.inbound_email_aliases enable row level security;

-- El usuario solo ve y crea los suyos. La edge function usa service role y salta RLS.
drop policy if exists inbound_email_aliases_own_select on public.inbound_email_aliases;
create policy inbound_email_aliases_own_select on public.inbound_email_aliases
  for select using (auth.uid() = user_id);

drop policy if exists inbound_email_aliases_own_insert on public.inbound_email_aliases;
create policy inbound_email_aliases_own_insert on public.inbound_email_aliases
  for insert with check (auth.uid() = user_id and is_workspace_member(workspace_id));

drop policy if exists inbound_email_aliases_own_update on public.inbound_email_aliases;
create policy inbound_email_aliases_own_update on public.inbound_email_aliases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
