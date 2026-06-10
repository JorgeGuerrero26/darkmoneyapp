-- Add is_pinned flag to exchange_rates so users can keep frequently used
-- currency pairs (USD-PEN, etc.) at the top of the list.

alter table public.exchange_rates
  add column if not exists is_pinned boolean not null default false;

create index if not exists idx_exchange_rates_pinned
  on public.exchange_rates (is_pinned)
  where is_pinned = true;

-- Note: app reads from the raw table via useExchangeRatesQuery (not from
-- v_latest_exchange_rates), so no view recreation is needed. v_latest_exchange_rates
-- (used by v_budget_progress) does NOT need is_pinned. The TS mapper has `?? false`
-- fallback so the app does not break if applied later than the deploy.
