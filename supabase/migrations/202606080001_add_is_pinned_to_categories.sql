-- Add is_pinned flag to categories so users can keep frequently used
-- categories (Alimentación, Sueldo, Vivienda, etc.) at the top of the list
-- regardless of their kind grouping.

alter table public.categories
  add column if not exists is_pinned boolean not null default false;

create index if not exists idx_categories_workspace_pinned
  on public.categories (workspace_id)
  where is_pinned = true;

-- Note: app reads from the raw table (not from a view), so no view recreation
-- is needed. The TypeScript mapper has `?? false` fallback so the app does
-- not break if this migration is applied later than the deploy.
