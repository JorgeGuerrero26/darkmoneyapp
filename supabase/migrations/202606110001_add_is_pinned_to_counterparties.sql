-- Add is_pinned flag to counterparties so users can keep key contacts
-- (clients, suppliers, banks, services) at the top of the contacts list
-- regardless of their type grouping.

alter table public.counterparties
  add column if not exists is_pinned boolean not null default false;

create index if not exists idx_counterparties_workspace_pinned
  on public.counterparties (workspace_id)
  where is_pinned = true;

-- Note: app reads contacts from the raw table through the workspace snapshot,
-- so no view recreation is needed. The TypeScript mapper has `?? false`
-- fallback so the app does not break if this migration is applied later than
-- the deploy.
