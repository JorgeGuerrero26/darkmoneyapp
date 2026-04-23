create table if not exists public.ai_feature_daily_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint references public.workspaces(id) on delete cascade,
  feature_key text not null,
  usage_date date not null,
  tone text,
  model text,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_feature_daily_usage_feature_user_date_uidx
  on public.ai_feature_daily_usage(feature_key, user_id, usage_date);

create index if not exists ai_feature_daily_usage_user_created_idx
  on public.ai_feature_daily_usage(user_id, created_at desc);

create index if not exists ai_feature_daily_usage_workspace_date_idx
  on public.ai_feature_daily_usage(workspace_id, usage_date desc);

alter table public.ai_feature_daily_usage enable row level security;
