-- Motor offline, Fase 1 (1/3): cimientos del servidor.
-- Diseño: docs/OFFLINE_ENGINE_DESIGN.md · Plan: docs/OFFLINE_PHASE1_PLAN.md
--
-- Qué hace esta migración (todo aditivo; no cambia ninguna tabla de negocio):
--   1. Triggers de updated_at que faltaban (spend_types, movement_templates).
--   2. Índices (workspace_id, updated_at, id) que usa el pull incremental.
--   3. Registro de tablas sincronizables (sync_tables).
--   4. Bitácora de operaciones aplicadas (sync_applied_ops) para que reintentar sea seguro.

-- 1. updated_at: sin este trigger el pull no ve las ediciones de estas dos tablas.
drop trigger if exists trg_spend_types_updated_at on public.spend_types;
create trigger trg_spend_types_updated_at
  before update on public.spend_types
  for each row execute function public.set_updated_at();

drop trigger if exists trg_movement_templates_updated_at on public.movement_templates;
create trigger trg_movement_templates_updated_at
  before update on public.movement_templates
  for each row execute function public.set_updated_at();

-- 2. Índices de pull: (updated_at, id) es el cursor keyset.
create index if not exists movements_ws_updated_idx on public.movements (workspace_id, updated_at, id);
create index if not exists accounts_ws_updated_idx on public.accounts (workspace_id, updated_at, id);
create index if not exists categories_ws_updated_idx on public.categories (workspace_id, updated_at, id);
create index if not exists counterparties_ws_updated_idx on public.counterparties (workspace_id, updated_at, id);
create index if not exists counterparty_roles_ws_updated_idx on public.counterparty_roles (workspace_id, updated_at, id);
create index if not exists spend_types_ws_updated_idx on public.spend_types (workspace_id, updated_at, id);
create index if not exists budgets_ws_updated_idx on public.budgets (workspace_id, updated_at, id);
create index if not exists subscriptions_ws_updated_idx on public.subscriptions (workspace_id, updated_at, id);
create index if not exists recurring_income_ws_updated_idx on public.recurring_income (workspace_id, updated_at, id);
create index if not exists movement_templates_ws_updated_idx on public.movement_templates (workspace_id, updated_at, id);
create index if not exists workspace_financial_goals_ws_updated_idx on public.workspace_financial_goals (workspace_id, updated_at, id);

-- 3. Registro de tablas sincronizables. Las funciones de sync SOLO operan sobre estas tablas:
--    es también la lista blanca que protege el SQL dinámico. Añadir una tabla en una fase
--    posterior = insertar una fila (más sus índices), sin tocar las funciones.
--    Requisitos de una tabla registrada: columnas id (identity), workspace_id y updated_at.
create table if not exists public.sync_tables (
  table_name text primary key,
  tier smallint not null check (tier between 1 and 3),
  writable boolean not null default true,
  -- Columnas que, al editarse sobre una fila cambiada por otra persona desde la lectura base,
  -- no se resuelven con "último escritor gana" sino que se aplican y se marcan para revisión.
  review_fields text[] not null default '{}',
  -- Solo se revisa si la fila tiene este status (p. ej. 'posted' = movimiento confirmado).
  review_status text,
  constraint sync_tables_review_pair check ((cardinality(review_fields) = 0) = (review_status is null))
);

alter table public.sync_tables enable row level security;
drop policy if exists sync_tables_select on public.sync_tables;
create policy sync_tables_select on public.sync_tables for select to authenticated using (true);
revoke all on public.sync_tables from anon, authenticated;
grant select on public.sync_tables to authenticated;

insert into public.sync_tables (table_name, tier, writable, review_fields, review_status) values
  ('movements', 1, true,
     array['source_amount','destination_amount','source_account_id','destination_account_id','fx_rate','occurred_at'], 'posted'),
  ('accounts', 1, true, '{}', null),
  ('categories', 1, true, '{}', null),
  ('counterparties', 1, true, '{}', null),
  ('spend_types', 1, true, '{}', null),
  ('counterparty_roles', 2, true, '{}', null),
  ('budgets', 2, true, '{}', null),
  ('subscriptions', 2, true, '{}', null),
  ('recurring_income', 2, true, '{}', null),
  ('movement_templates', 2, true, '{}', null),
  ('workspace_financial_goals', 2, true, '{}', null)
on conflict (table_name) do nothing;

-- 4. Operaciones ya aplicadas. Un reintento con el mismo op_id devuelve el resultado guardado
--    en vez de volver a ejecutar (generaliza movements.client_dedupe_key a todas las tablas).
create table if not exists public.sync_applied_ops (
  op_id uuid primary key,
  user_id uuid not null default auth.uid(),
  workspace_id bigint not null,
  table_name text not null,
  row_id bigint,
  kind text not null check (kind in ('insert', 'update', 'delete')),
  result jsonb not null,
  applied_at timestamptz not null default now()
);

create index if not exists sync_applied_ops_applied_at_idx on public.sync_applied_ops (applied_at);

alter table public.sync_applied_ops enable row level security;
drop policy if exists sync_applied_ops_own_select on public.sync_applied_ops;
create policy sync_applied_ops_own_select on public.sync_applied_ops
  for select to authenticated using (user_id = auth.uid());
drop policy if exists sync_applied_ops_own_insert on public.sync_applied_ops;
create policy sync_applied_ops_own_insert on public.sync_applied_ops
  for insert to authenticated with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
revoke all on public.sync_applied_ops from anon, authenticated;
grant select, insert on public.sync_applied_ops to authenticated;

-- Retención: una op solo necesita recordarse mientras algún dispositivo pueda reintentarla.
-- Sin programar en pg_cron a propósito (decisión del dueño): llamar a mano o agendar después.
create or replace function public.sync_purge_applied_ops(p_keep interval default interval '30 days')
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.sync_applied_ops where applied_at < now() - p_keep;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.sync_purge_applied_ops(interval) from public, anon, authenticated;
