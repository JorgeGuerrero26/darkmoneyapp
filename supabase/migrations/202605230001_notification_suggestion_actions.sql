-- Sprint 4 #16 — tracking de aceptacion/rechazo de sugerencias de notificaciones
-- Permite medir tasa de aceptacion de categorias/descripciones sugeridas por IA
-- para alimentar mejoras del sistema de aprendizaje.

create table if not exists public.notification_suggestion_actions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  suggestion_id bigint references public.notification_detected_movement_suggestions(id) on delete set null,
  dedupe_key text,
  action text not null check (action in (
    'accept_category',
    'override_category',
    'accept_description',
    'edit_description',
    'accept_counterparty',
    'override_counterparty',
    'register',
    'discard'
  )),
  surface text not null check (surface in ('overlay', 'quick_entry', 'headless', 'list')),
  model_at_decision text,
  confidence_at_decision text,
  suggested_value text,
  final_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_suggestion_actions_workspace_created_idx
  on public.notification_suggestion_actions(workspace_id, created_at desc);

create index if not exists notification_suggestion_actions_suggestion_idx
  on public.notification_suggestion_actions(suggestion_id)
  where suggestion_id is not null;

create index if not exists notification_suggestion_actions_action_idx
  on public.notification_suggestion_actions(workspace_id, action, created_at desc);

alter table public.notification_suggestion_actions enable row level security;

drop policy if exists "notification_suggestion_actions_workspace_members_select"
  on public.notification_suggestion_actions;
create policy "notification_suggestion_actions_workspace_members_select"
  on public.notification_suggestion_actions
  for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_suggestion_actions.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "notification_suggestion_actions_workspace_members_insert"
  on public.notification_suggestion_actions;
create policy "notification_suggestion_actions_workspace_members_insert"
  on public.notification_suggestion_actions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_suggestion_actions.workspace_id
        and wm.user_id = auth.uid()
    )
  );
