-- Sprint 4 #18 — telemetria de eventos del pipeline de deteccion de notificaciones.
-- Sustituye a Log.d nativo (filtrado por Samsung/Android 12+ en release builds).
-- Permite debugear el flujo runtime sync -> AI classifier -> registro sin depender
-- de dumpsys notification ni logcat.

create table if not exists public.notification_detection_telemetry (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id bigint references public.workspaces(id) on delete cascade,
  event text not null,
  suggestion_id bigint references public.notification_detected_movement_suggestions(id) on delete set null,
  native_suggestion_id text,
  financial_app_key text,
  surface text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_detection_telemetry_workspace_created_idx
  on public.notification_detection_telemetry(workspace_id, created_at desc);

create index if not exists notification_detection_telemetry_event_idx
  on public.notification_detection_telemetry(event, created_at desc);

create index if not exists notification_detection_telemetry_suggestion_idx
  on public.notification_detection_telemetry(suggestion_id)
  where suggestion_id is not null;

alter table public.notification_detection_telemetry enable row level security;

drop policy if exists "notification_detection_telemetry_workspace_members_select"
  on public.notification_detection_telemetry;
create policy "notification_detection_telemetry_workspace_members_select"
  on public.notification_detection_telemetry
  for select
  using (
    user_id = auth.uid()
    and (
      workspace_id is null
      or exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = notification_detection_telemetry.workspace_id
          and wm.user_id = auth.uid()
      )
    )
  );

drop policy if exists "notification_detection_telemetry_workspace_members_insert"
  on public.notification_detection_telemetry;
create policy "notification_detection_telemetry_workspace_members_insert"
  on public.notification_detection_telemetry
  for insert
  with check (
    user_id is null
    or user_id = auth.uid()
  );
