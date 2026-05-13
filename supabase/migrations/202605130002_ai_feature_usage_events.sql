create table if not exists public.ai_feature_usage_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint references public.workspaces(id) on delete cascade,
  feature_key text not null,
  usage_date date not null,
  model text not null,
  surface text,
  status text not null default 'success',
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_feature_usage_events_feature_user_date_idx
  on public.ai_feature_usage_events(feature_key, user_id, usage_date, created_at desc);

create index if not exists ai_feature_usage_events_workspace_created_idx
  on public.ai_feature_usage_events(workspace_id, created_at desc);

alter table public.ai_feature_usage_events enable row level security;
