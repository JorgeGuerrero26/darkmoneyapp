-- Add is_pinned flag to budgets so users can keep critical budgets at the top
-- of the list regardless of their attention/ok grouping.

alter table public.budgets
  add column if not exists is_pinned boolean not null default false;

create index if not exists idx_budgets_workspace_pinned
  on public.budgets (workspace_id)
  where is_pinned = true;

-- ─── Update view v_budget_progress to expose is_pinned ───────────────────────
-- The original view definition is not in this repo's migrations folder; if
-- v_budget_progress already exists it must be recreated to surface the new
-- column. The minimal change is to add `b.is_pinned as is_pinned` to the
-- SELECT. Run the matching CREATE OR REPLACE VIEW with the team's current
-- definition. Until that is applied, the app falls back to `false` for
-- isPinned via the mapper, so functionality degrades gracefully without
-- breaking existing reads.

-- TODO: Apply the equivalent of:
-- create or replace view public.v_budget_progress as
--   select ..., b.is_pinned, ... from public.budgets b ...;
