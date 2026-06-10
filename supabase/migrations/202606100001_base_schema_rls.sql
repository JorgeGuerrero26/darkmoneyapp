-- Auditoría 2026-06-10 (hallazgo S1, CRÍTICO): el esquema base nunca tuvo RLS.
-- Verificado contra la BD productiva vía REST con SOLO la anon key (sin sesión):
-- profiles, currencies, workspaces, workspace_members, accounts, counterparties,
-- counterparty_roles, categories, obligations, obligation_events,
-- obligation_change_history, subscriptions, movements, notification_preferences
-- y notifications devolvían filas. Las 8 vistas v_* también (ejecutan como owner
-- y saltan el RLS de las tablas base).
--
-- Modelo: pertenencia por workspace_members (CLAUDE/DATABASE_DICTIONARY §3) para
-- tablas colaborativas; user_id = auth.uid() para tablas personales; catálogo
-- currencies solo lectura autenticada. Las edge functions usan service role y
-- no se ven afectadas. El flujo de obligaciones compartidas del viewer invitado
-- pasa por la edge function list-shared-obligations (service role); el único
-- read cliente cross-workspace (metadata de invitación pendiente vía
-- v_obligation_summary) se cubre con la cláusula de obligation_shares en el
-- select de obligations.

-- ─── Helpers (SECURITY DEFINER: evitan recursión de policies sobre workspace_members) ──

create or replace function public.is_workspace_member(ws_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.shares_workspace_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on mine.workspace_id = theirs.workspace_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user_id
  );
$$;

grant execute on function public.is_workspace_member(bigint) to authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;

-- ─── Tablas colaborativas por workspace_id ───────────────────────────────────
-- accounts, categories, counterparties, counterparty_roles, movements,
-- obligation_change_history, subscriptions: CRUD para miembros del workspace.

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts',
    'categories',
    'counterparties',
    'counterparty_roles',
    'movements',
    'obligation_change_history',
    'subscriptions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_member_select" on public.%I', t, t);
    execute format(
      'create policy "%s_member_select" on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))',
      t, t
    );
    execute format('drop policy if exists "%s_member_insert" on public.%I', t, t);
    execute format(
      'create policy "%s_member_insert" on public.%I for insert to authenticated with check (public.is_workspace_member(workspace_id))',
      t, t
    );
    execute format('drop policy if exists "%s_member_update" on public.%I', t, t);
    execute format(
      'create policy "%s_member_update" on public.%I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))',
      t, t
    );
    execute format('drop policy if exists "%s_member_delete" on public.%I', t, t);
    execute format(
      'create policy "%s_member_delete" on public.%I for delete to authenticated using (public.is_workspace_member(workspace_id))',
      t, t
    );
  end loop;
end;
$$;

-- ─── obligations: miembro CRUD + lectura para invitados con share activo ─────
-- (la metadata de la invitación pendiente se lee del cliente vía v_obligation_summary)

alter table public.obligations enable row level security;

drop policy if exists "obligations_member_select" on public.obligations;
create policy "obligations_member_select"
  on public.obligations for select to authenticated
  using (
    public.is_workspace_member(workspace_id)
    or exists (
      select 1 from public.obligation_shares os
      where os.obligation_id = obligations.id
        and os.invited_user_id = auth.uid()
        and os.status in ('pending', 'accepted')
    )
  );

drop policy if exists "obligations_member_insert" on public.obligations;
create policy "obligations_member_insert"
  on public.obligations for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "obligations_member_update" on public.obligations;
create policy "obligations_member_update"
  on public.obligations for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "obligations_member_delete" on public.obligations;
create policy "obligations_member_delete"
  on public.obligations for delete to authenticated
  using (public.is_workspace_member(workspace_id));

-- ─── obligation_events: sin workspace_id, resuelve vía su obligación ─────────

alter table public.obligation_events enable row level security;

drop policy if exists "obligation_events_member_select" on public.obligation_events;
create policy "obligation_events_member_select"
  on public.obligation_events for select to authenticated
  using (
    exists (
      select 1 from public.obligations o
      where o.id = obligation_events.obligation_id
        and public.is_workspace_member(o.workspace_id)
    )
  );

drop policy if exists "obligation_events_member_insert" on public.obligation_events;
create policy "obligation_events_member_insert"
  on public.obligation_events for insert to authenticated
  with check (
    exists (
      select 1 from public.obligations o
      where o.id = obligation_events.obligation_id
        and public.is_workspace_member(o.workspace_id)
    )
  );

drop policy if exists "obligation_events_member_update" on public.obligation_events;
create policy "obligation_events_member_update"
  on public.obligation_events for update to authenticated
  using (
    exists (
      select 1 from public.obligations o
      where o.id = obligation_events.obligation_id
        and public.is_workspace_member(o.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.obligations o
      where o.id = obligation_events.obligation_id
        and public.is_workspace_member(o.workspace_id)
    )
  );

drop policy if exists "obligation_events_member_delete" on public.obligation_events;
create policy "obligation_events_member_delete"
  on public.obligation_events for delete to authenticated
  using (
    exists (
      select 1 from public.obligations o
      where o.id = obligation_events.obligation_id
        and public.is_workspace_member(o.workspace_id)
    )
  );

-- ─── workspaces ──────────────────────────────────────────────────────────────

alter table public.workspaces enable row level security;

drop policy if exists "workspaces_member_select" on public.workspaces;
create policy "workspaces_member_select"
  on public.workspaces for select to authenticated
  using (public.is_workspace_member(id) or owner_user_id = auth.uid());

drop policy if exists "workspaces_owner_insert" on public.workspaces;
create policy "workspaces_owner_insert"
  on public.workspaces for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "workspaces_member_update" on public.workspaces;
create policy "workspaces_member_update"
  on public.workspaces for update to authenticated
  using (public.is_workspace_member(id) or owner_user_id = auth.uid())
  with check (public.is_workspace_member(id) or owner_user_id = auth.uid());

drop policy if exists "workspaces_owner_delete" on public.workspaces;
create policy "workspaces_owner_delete"
  on public.workspaces for delete to authenticated
  using (owner_user_id = auth.uid());

-- ─── workspace_members ───────────────────────────────────────────────────────
-- Lectura: la propia fila o co-miembros (vía función definer, sin recursión).
-- Escritura: la propia membresía (aceptar invitación / salir) o el owner del workspace.

alter table public.workspace_members enable row level security;

drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select"
  on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert" on public.workspace_members;
create policy "workspace_members_insert"
  on public.workspace_members for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_update" on public.workspace_members;
create policy "workspace_members_update"
  on public.workspace_members for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_delete" on public.workspace_members;
create policy "workspace_members_delete"
  on public.workspace_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

-- ─── profiles: propio + co-miembros (nombres en UI colaborativa) ─────────────

alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_workspace_with(id));

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── currencies: catálogo de solo lectura para autenticados ──────────────────

alter table public.currencies enable row level security;

drop policy if exists "currencies_authenticated_select" on public.currencies;
create policy "currencies_authenticated_select"
  on public.currencies for select to authenticated
  using (true);

-- ─── Tablas personales: notifications / notification_preferences ─────────────

do $$
declare
  t text;
begin
  foreach t in array array['notifications', 'notification_preferences']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_own_select" on public.%I', t, t);
    execute format(
      'create policy "%s_own_select" on public.%I for select to authenticated using (user_id = auth.uid())',
      t, t
    );
    execute format('drop policy if exists "%s_own_insert" on public.%I', t, t);
    execute format(
      'create policy "%s_own_insert" on public.%I for insert to authenticated with check (user_id = auth.uid())',
      t, t
    );
    execute format('drop policy if exists "%s_own_update" on public.%I', t, t);
    execute format(
      'create policy "%s_own_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t, t
    );
    execute format('drop policy if exists "%s_own_delete" on public.%I', t, t);
    execute format(
      'create policy "%s_own_delete" on public.%I for delete to authenticated using (user_id = auth.uid())',
      t, t
    );
  end loop;
end;
$$;

-- ─── activity_log: feed/auditoría — miembros leen e insertan; sin update/delete ──

alter table public.activity_log enable row level security;

drop policy if exists "activity_log_member_select" on public.activity_log;
create policy "activity_log_member_select"
  on public.activity_log for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "activity_log_member_insert" on public.activity_log;
create policy "activity_log_member_insert"
  on public.activity_log for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

-- ─── subscription_occurrences: sin workspace_id, resuelve vía su suscripción ──

alter table public.subscription_occurrences enable row level security;

drop policy if exists "subscription_occurrences_member_select" on public.subscription_occurrences;
create policy "subscription_occurrences_member_select"
  on public.subscription_occurrences for select to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_occurrences.subscription_id
        and public.is_workspace_member(s.workspace_id)
    )
  );

drop policy if exists "subscription_occurrences_member_insert" on public.subscription_occurrences;
create policy "subscription_occurrences_member_insert"
  on public.subscription_occurrences for insert to authenticated
  with check (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_occurrences.subscription_id
        and public.is_workspace_member(s.workspace_id)
    )
  );

drop policy if exists "subscription_occurrences_member_update" on public.subscription_occurrences;
create policy "subscription_occurrences_member_update"
  on public.subscription_occurrences for update to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_occurrences.subscription_id
        and public.is_workspace_member(s.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_occurrences.subscription_id
        and public.is_workspace_member(s.workspace_id)
    )
  );

drop policy if exists "subscription_occurrences_member_delete" on public.subscription_occurrences;
create policy "subscription_occurrences_member_delete"
  on public.subscription_occurrences for delete to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_occurrences.subscription_id
        and public.is_workspace_member(s.workspace_id)
    )
  );

-- ─── Limpieza de policies legacy (select-only, mismo criterio member; quedaban
--     definidas sin RLS habilitado y ahora duplicarían la evaluación) ──────────

drop policy if exists "members can view workspace accounts" on public.accounts;
drop policy if exists "members can view workspace categories" on public.categories;
drop policy if exists "members can view workspace counterparties" on public.counterparties;
drop policy if exists "members can view workspace movements" on public.movements;
drop policy if exists "members can view obligation events" on public.obligation_events;
drop policy if exists "members can view workspace obligations" on public.obligations;
drop policy if exists "members can view workspace subscriptions" on public.subscriptions;
drop policy if exists "users can view own memberships" on public.workspace_members;
drop policy if exists "members can view their workspaces" on public.workspaces;

-- ─── Vistas: ejecutar con permisos del invocador (respetan el RLS de las bases) ──

alter view public.v_user_workspaces set (security_invoker = true);
alter view public.v_account_balances set (security_invoker = true);
alter view public.v_obligation_summary set (security_invoker = true);
alter view public.v_counterparty_summary set (security_invoker = true);
alter view public.v_budget_progress set (security_invoker = true);
alter view public.v_subscription_upcoming set (security_invoker = true);
alter view public.v_workspace_balances set (security_invoker = true);
alter view public.v_latest_exchange_rates set (security_invoker = true);
