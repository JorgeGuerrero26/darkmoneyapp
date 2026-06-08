-- Add is_pinned flag to recurring_income so users can keep critical fixed
-- incomes (e.g. main salary, primary rent) at the top of the list regardless
-- of their status/due-date grouping.

alter table public.recurring_income
  add column if not exists is_pinned boolean not null default false;

create index if not exists idx_recurring_income_workspace_pinned
  on public.recurring_income (workspace_id)
  where is_pinned = true;

-- Note: app reads from the raw table (not from a view), so no view
-- recreation is needed. The TypeScript mapper has `?? false` fallback so the
-- app does not break if this migration is applied later than the deploy.
