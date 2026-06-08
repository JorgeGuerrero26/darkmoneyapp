-- Add is_pinned flag to subscriptions so users can keep critical subscriptions
-- (e.g. Netflix, hosting principal) at the top of the list regardless of their
-- status/due-date grouping.

alter table public.subscriptions
  add column if not exists is_pinned boolean not null default false;

create index if not exists idx_subscriptions_workspace_pinned
  on public.subscriptions (workspace_id)
  where is_pinned = true;

-- Note: app reads from the raw table (not v_subscription_upcoming), so no view
-- recreation is needed. If a future query starts using v_subscription_upcoming
-- and needs is_pinned, recreate the view with `b.is_pinned` at the END of the
-- SELECT (not in the middle) to avoid `42P16: cannot change name of view column`.
