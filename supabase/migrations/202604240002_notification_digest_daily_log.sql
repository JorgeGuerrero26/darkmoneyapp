create table if not exists public.notification_digest_daily_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  digest_date date not null,
  notification_count integer not null default 0,
  top_kinds text[] not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists notification_digest_daily_log_user_date_uidx
  on public.notification_digest_daily_log(user_id, digest_date);

create index if not exists notification_digest_daily_log_date_idx
  on public.notification_digest_daily_log(digest_date desc, created_at desc);

alter table public.notification_digest_daily_log enable row level security;
