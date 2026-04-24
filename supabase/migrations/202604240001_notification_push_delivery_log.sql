create table if not exists public.notification_push_delivery_log (
  id bigserial primary key,
  notification_id bigint not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  priority text not null check (priority in ('critical', 'important', 'informational')),
  decision text not null check (decision in ('sent', 'skipped_daily_limit', 'skipped_priority', 'skipped_no_token')),
  usage_date date not null,
  bypass_daily_limit boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists notification_push_delivery_log_notification_uidx
  on public.notification_push_delivery_log(notification_id);

create index if not exists notification_push_delivery_log_user_date_idx
  on public.notification_push_delivery_log(user_id, usage_date desc);

create index if not exists notification_push_delivery_log_user_decision_idx
  on public.notification_push_delivery_log(user_id, decision, usage_date desc);

alter table public.notification_push_delivery_log enable row level security;
