-- El resumen de Movimientos mezclaba montos de cuentas PEN y USD antes de
-- convertir el agregado. Cada fila debe convertirse a la moneda base del
-- espacio, igual que el resumen web. Las filas anuladas no mueven saldos.
create or replace function public.movements_filtered_summary(
  p_workspace_id bigint,
  p_types text[] default null,
  p_status text default null,
  p_account_id bigint default null,
  p_category_id bigint default null,
  p_uncategorized boolean default false,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_search text default null,
  p_movement_ids bigint[] default null
)
returns table (
  income_total numeric,
  expense_total numeric,
  income_count bigint,
  expense_count bigint
)
language sql
stable
set search_path = public
as $$
  with currency_context as (
    select upper(trim(coalesce(w.base_currency_code::text, p.base_currency_code::text, 'PEN'))) as base_currency_code
    from public.workspaces w
    left join public.profiles p on p.id = auth.uid()
    where w.id = p_workspace_id
  ),
  filtered as (
    select
      m.movement_type,
      coalesce(m.source_amount, 0) as source_amount,
      coalesce(m.destination_amount, 0) as destination_amount,
      upper(trim(coalesce(sa.currency_code::text, c.base_currency_code))) as source_currency_code,
      upper(trim(coalesce(da.currency_code::text, c.base_currency_code))) as destination_currency_code,
      c.base_currency_code
    from public.movements m
    cross join currency_context c
    left join public.accounts sa on sa.id = m.source_account_id
    left join public.accounts da on da.id = m.destination_account_id
    where m.workspace_id = p_workspace_id
      and m.movement_type <> 'transfer'
      and m.status <> 'voided'
      and (p_types is null or m.movement_type::text = any(p_types))
      and (p_status is null or m.status::text = p_status)
      and (p_date_from is null or m.occurred_at >= p_date_from)
      and (p_date_to is null or m.occurred_at <= p_date_to)
      and (
        p_account_id is null
        or m.source_account_id = p_account_id
        or m.destination_account_id = p_account_id
      )
      and (
        not coalesce(p_uncategorized, false)
        or (
          m.category_id is null
          and m.movement_type::text in
            ('income', 'refund', 'expense', 'subscription_payment', 'obligation_payment')
        )
      )
      and (coalesce(p_uncategorized, false) or p_category_id is null or m.category_id = p_category_id)
      and (p_search is null or m.description ilike '%' || p_search || '%')
      and (p_movement_ids is null or m.id = any(p_movement_ids))
  ),
  classified as (
    select
      case
        when movement_type::text in ('income', 'refund') then true
        when movement_type::text in ('expense', 'subscription_payment') then false
        else destination_amount > source_amount
      end as acts_income,
      source_amount,
      destination_amount,
      source_currency_code,
      destination_currency_code,
      base_currency_code
    from filtered
  ),
  selected_amounts as (
    select
      acts_income,
      abs(case
        when acts_income and destination_amount <> 0 then destination_amount
        when acts_income then source_amount
        when source_amount <> 0 then source_amount
        else destination_amount
      end) as amount,
      case
        when acts_income and destination_amount <> 0 then destination_currency_code
        when acts_income then source_currency_code
        when source_amount <> 0 then source_currency_code
        else destination_currency_code
      end as currency_code,
      base_currency_code
    from classified
  ),
  converted as (
    select
      a.acts_income,
      a.amount * case
        when a.currency_code = a.base_currency_code then 1
        else coalesce(
          (select fx.rate from public.v_latest_exchange_rates fx
           where upper(trim(fx.from_currency_code)) = a.currency_code
             and upper(trim(fx.to_currency_code)) = a.base_currency_code
           limit 1),
          (select 1 / nullif(fx.rate, 0) from public.v_latest_exchange_rates fx
           where upper(trim(fx.from_currency_code)) = a.base_currency_code
             and upper(trim(fx.to_currency_code)) = a.currency_code
           limit 1),
          1
        )
      end as amount_in_base_currency
    from selected_amounts a
  )
  select
    coalesce(sum(amount_in_base_currency) filter (where acts_income), 0) as income_total,
    coalesce(sum(amount_in_base_currency) filter (where not acts_income), 0) as expense_total,
    count(*) filter (where acts_income) as income_count,
    count(*) filter (where not acts_income) as expense_count
  from converted;
$$;

comment on function public.movements_filtered_summary is
  'Entró/salió del filtro completo, convertido por fila a la moneda base. Excluye transferencias y anulados. La RLS se aplica como SECURITY INVOKER.';
