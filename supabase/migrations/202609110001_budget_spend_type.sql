-- Presupuesto por tipo de gasto: "maximo 300 al mes en deseos".
--
-- **Por que no bastaba la categoria.** Un presupuesto por categoria limita EN QUE gastas, no si
-- hacia falta, y las dos categorias con mas movimientos son mixtas: Alimentacion es el mercado y
-- tambien la cena del viernes. Limitar "Alimentacion" castiga el mercado; limitar "Deseos" es la
-- regla que se queria de verdad.
--
-- **El gasto se empareja por el tipo EFECTIVO**, igual que las metricas del inicio: el del
-- movimiento y, si no tiene, el de su categoria. Es lo que hace que el presupuesto cuente desde
-- el primer dia en vez de esperar a que se re-etiqueten los movimientos que ya existen.

alter table public.budgets
  add column if not exists spend_type_id bigint
  references public.spend_types(id) on delete set null;

create index if not exists budgets_workspace_spend_type_idx
  on public.budgets (workspace_id, spend_type_id, period_start, period_end)
  where spend_type_id is not null;

-- El ambito forma parte de la identidad de la regla: "Maximo mensual" por deseos y "Maximo
-- mensual" por necesidades son dos reglas distintas, y sin el tipo en la clave la segunda choca
-- con la primera al abrir su periodo.
drop index if exists budgets_rule_period_unique;
create unique index budgets_rule_period_unique
  on public.budgets (
    workspace_id,
    coalesce(category_id, -1::bigint),
    coalesce(account_id, -1::bigint),
    coalesce(spend_type_id, -1::bigint),
    lower(name),
    period_start
  );

comment on column public.budgets.spend_type_id is
  'Limita el gasto de este tipo (necesidad, deseo, ahorro). Se empareja por el tipo efectivo del movimiento: el suyo propio y, si no tiene, el de su categoria.';

-- La vista se rehace entera porque hay que tocar tres sitios: de donde sale el tipo efectivo, el
-- emparejamiento, y la etiqueta del ambito.
drop view if exists public.v_budget_progress;

create view public.v_budget_progress as
with spend_movements as (
  select
    m.id as movement_id,
    m.workspace_id,
    m.category_id,
    -- El tipo del movimiento manda; si no dice nada, hereda el de su categoria. La misma regla
    -- que effectiveSpendTypeId en el cliente: si las dos se separan, el presupuesto y el inicio
    -- contarian distinto el mismo gasto.
    coalesce(m.spend_type_id, c.default_spend_type_id) as spend_type_id,
    m.source_account_id as account_id,
    m.occurred_at::date as movement_date,
    sa.currency_code as source_currency_code,
    coalesce(m.source_amount, 0::numeric)::numeric(14,2) as source_amount
  from movements m
    left join accounts sa on sa.id = m.source_account_id
    left join categories c on c.id = m.category_id
  where m.status = 'posted'::movement_status
    and m.movement_type = any (array['expense'::movement_type, 'subscription_payment'::movement_type, 'obligation_payment'::movement_type])
    and m.source_amount is not null
),
matched_spend as (
  select
    b_1.id as budget_id,
    sm.movement_id,
    case
      when upper(coalesce(sm.source_currency_code, b_1.currency_code::text::bpchar)::text) = upper(b_1.currency_code::text) then sm.source_amount
      when fx_direct.rate is not null and fx_direct.rate > 0::numeric then sm.source_amount * fx_direct.rate
      when fx_inverse.rate is not null and fx_inverse.rate > 0::numeric then sm.source_amount / fx_inverse.rate
      else sm.source_amount
    end::numeric(14,2) as converted_amount
  from budgets b_1
    join spend_movements sm
      on sm.workspace_id = b_1.workspace_id
      and sm.movement_date >= b_1.period_start
      and sm.movement_date <= b_1.period_end
      and (b_1.category_id is null or sm.category_id = b_1.category_id)
      and (b_1.account_id is null or sm.account_id = b_1.account_id)
      and (b_1.spend_type_id is null or sm.spend_type_id = b_1.spend_type_id)
    left join v_latest_exchange_rates fx_direct
      on upper(fx_direct.from_currency_code) = upper(coalesce(sm.source_currency_code, b_1.currency_code::text::bpchar)::text)
      and upper(fx_direct.to_currency_code) = upper(b_1.currency_code::text)
    left join v_latest_exchange_rates fx_inverse
      on upper(fx_inverse.from_currency_code) = upper(b_1.currency_code::text)
      and upper(fx_inverse.to_currency_code) = upper(coalesce(sm.source_currency_code, b_1.currency_code::text::bpchar)::text)
),
budget_rollup as (
  select
    ms.budget_id,
    coalesce(sum(ms.converted_amount), 0::numeric)::numeric(14,2) as spent_amount,
    count(*)::integer as movement_count
  from matched_spend ms
  group by ms.budget_id
)
select
  b.id,
  b.workspace_id,
  b.created_by_user_id,
  b.updated_by_user_id,
  b.name,
  b.period_start,
  b.period_end,
  upper(b.currency_code::text) as currency_code,
  b.category_id,
  c.name as category_name,
  b.account_id,
  a.name as account_name,
  b.spend_type_id,
  st.name as spend_type_name,
  case
    when b.category_id is not null and b.account_id is not null then 'category_account'::text
    when b.category_id is not null then 'category'::text
    when b.spend_type_id is not null and b.account_id is not null then 'spend_type_account'::text
    when b.spend_type_id is not null then 'spend_type'::text
    when b.account_id is not null then 'account'::text
    else 'general'::text
  end as scope_kind,
  -- La etiqueta nombra TODAS las mitades del ambito aunque scope_kind se quede con la principal:
  -- un presupuesto de "Alimentacion que sea deseo" tiene que decirlo entero.
  case
    when b.category_id is not null and b.spend_type_id is not null
      then coalesce(c.name, 'Categoria') || ' - ' || coalesce(st.name, 'tipo')
        || case when b.account_id is not null then ' en ' || coalesce(a.name, 'cuenta') else '' end
    when b.category_id is not null and b.account_id is not null
      then coalesce(c.name, 'Categoria') || ' en ' || coalesce(a.name, 'cuenta')
    when b.category_id is not null then 'Categoria: ' || coalesce(c.name, 'Sin categoria')
    when b.spend_type_id is not null
      then coalesce(st.name, 'Tipo de gasto')
        || case when b.account_id is not null then ' en ' || coalesce(a.name, 'cuenta') else '' end
    when b.account_id is not null then 'Cuenta: ' || coalesce(a.name, 'Sin cuenta')
    else 'Gasto total del workspace'
  end as scope_label,
  b.limit_amount,
  coalesce(br.spent_amount, 0::numeric)::numeric(14,2) as spent_amount,
  (b.limit_amount - coalesce(br.spent_amount, 0::numeric))::numeric(14,2) as remaining_amount,
  case
    when b.limit_amount <= 0::numeric then 0::numeric(7,2)
    else round(coalesce(br.spent_amount, 0::numeric) / b.limit_amount * 100::numeric, 2)
  end::numeric(7,2) as used_percent,
  b.alert_percent,
  coalesce(br.movement_count, 0) as movement_count,
  b.rollover_enabled,
  b.notes,
  b.is_active,
  b.is_active
    and coalesce(br.spent_amount, 0::numeric) <= b.limit_amount
    and case
          when b.limit_amount <= 0::numeric then 0::numeric
          else round(coalesce(br.spent_amount, 0::numeric) / b.limit_amount * 100::numeric, 2)
        end >= b.alert_percent as is_near_limit,
  b.is_active and coalesce(br.spent_amount, 0::numeric) > b.limit_amount as is_over_limit,
  b.created_at,
  b.updated_at,
  b.is_pinned,
  b.recurrence
from budgets b
  left join categories c on c.id = b.category_id
  left join accounts a on a.id = b.account_id
  left join spend_types st on st.id = b.spend_type_id
  left join budget_rollup br on br.budget_id = b.id;

-- La vista se recrea, y con ella se van sus permisos. Sin esto la app deja de poder leer sus
-- presupuestos: no falla la migracion, falla la pantalla.
grant select on public.v_budget_progress to anon, authenticated, service_role;
