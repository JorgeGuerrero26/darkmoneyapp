create table if not exists public.notification_detected_movement_suggestions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  financial_app_key text not null,
  package_name text not null,
  app_label text not null,
  movement_type text not null check (movement_type in ('expense', 'income', 'transfer', 'unknown')),
  amount numeric(14, 2) not null,
  currency_code text not null check (currency_code in ('PEN', 'USD')),
  description text not null,
  occurred_at timestamptz not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  dedupe_key text not null,
  notification_key text,
  status text not null default 'pending' check (status in ('pending', 'registered', 'discarded')),
  movement_id bigint references public.movements(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_detected_movement_suggestions
  drop constraint if exists uq_detected_movement_suggestion_dedupe;

alter table public.notification_detected_movement_suggestions
  add constraint uq_detected_movement_suggestion_dedupe
  unique(user_id, workspace_id, dedupe_key);

create index if not exists detected_movement_suggestions_workspace_status_idx
  on public.notification_detected_movement_suggestions(workspace_id, status, created_at desc);

create table if not exists public.notification_detection_app_settings (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  financial_app_key text not null,
  enabled boolean not null default true,
  default_account_id bigint references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_notification_detection_app_settings unique(user_id, workspace_id, financial_app_key)
);

alter table public.notification_detected_movement_suggestions enable row level security;
alter table public.notification_detection_app_settings enable row level security;

drop policy if exists "detected_movement_suggestions_workspace_members_select" on public.notification_detected_movement_suggestions;
create policy "detected_movement_suggestions_workspace_members_select"
  on public.notification_detected_movement_suggestions
  for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_detected_movement_suggestions.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "detected_movement_suggestions_workspace_members_insert" on public.notification_detected_movement_suggestions;
create policy "detected_movement_suggestions_workspace_members_insert"
  on public.notification_detected_movement_suggestions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_detected_movement_suggestions.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "detected_movement_suggestions_workspace_members_update" on public.notification_detected_movement_suggestions;
create policy "detected_movement_suggestions_workspace_members_update"
  on public.notification_detected_movement_suggestions
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_detected_movement_suggestions.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_detected_movement_suggestions.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "notification_detection_app_settings_owner_select" on public.notification_detection_app_settings;
create policy "notification_detection_app_settings_owner_select"
  on public.notification_detection_app_settings
  for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_detection_app_settings.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "notification_detection_app_settings_owner_insert" on public.notification_detection_app_settings;
create policy "notification_detection_app_settings_owner_insert"
  on public.notification_detection_app_settings
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_detection_app_settings.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "notification_detection_app_settings_owner_update" on public.notification_detection_app_settings;
create policy "notification_detection_app_settings_owner_update"
  on public.notification_detection_app_settings
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_detection_app_settings.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = notification_detection_app_settings.workspace_id
        and wm.user_id = auth.uid()
    )
  );
