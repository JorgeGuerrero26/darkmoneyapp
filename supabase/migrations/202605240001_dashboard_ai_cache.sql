-- Cache server-side de respuestas IA del Advanced Dashboard.
-- Las edge functions dashboard-advanced-ai-* consultan esta tabla antes de
-- llamar a Gemini. Si existe una entrada vigente para (workspace_id, feature_key,
-- usage_date), se devuelve la respuesta cacheada y se evita un nuevo call.
-- La entrada se inserta tras una respuesta exitosa de Gemini.
-- RLS habilitada sin políticas: solo accesible vía service role desde edge functions.

create table if not exists public.dashboard_ai_cache (
  id bigserial primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  usage_date date not null,
  tone text,
  model text,
  response jsonb not null,
  summary_hash text,
  created_at timestamptz not null default now()
);

create unique index if not exists dashboard_ai_cache_workspace_feature_date_uidx
  on public.dashboard_ai_cache(workspace_id, feature_key, usage_date);

create index if not exists dashboard_ai_cache_user_created_idx
  on public.dashboard_ai_cache(user_id, created_at desc);

alter table public.dashboard_ai_cache enable row level security;
