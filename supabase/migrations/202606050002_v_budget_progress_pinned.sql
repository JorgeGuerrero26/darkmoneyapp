-- Recreate v_budget_progress to expose budgets.is_pinned to the client mapper.
-- Original definition preserved 1:1; only adds `b.is_pinned` to the final SELECT.
-- Run AFTER 202606050001_add_is_pinned_to_budgets.sql.

create or replace view public.v_budget_progress as
 with spend_movements as (
   select m.id as movement_id,
          m.workspace_id,
          m.category_id,
          m.source_account_id as account_id,
          m.occurred_at::date as movement_date,
          sa.currency_code as source_currency_code,
          coalesce(m.source_amount, 0::numeric)::numeric(14,2) as source_amount
     from movements m
          left join accounts sa on sa.id = m.source_account_id
    where m.status = 'posted'::movement_status
      and (m.movement_type = any (array['expense'::movement_type, 'subscription_payment'::movement_type, 'obligation_payment'::movement_type]))
      and m.source_amount is not null
 ), matched_spend as (
   select b_1.id as budget_id,
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
           and (b_1.account_id  is null or sm.account_id  = b_1.account_id)
          left join v_latest_exchange_rates fx_direct
            on upper(fx_direct.from_currency_code) = upper(coalesce(sm.source_currency_code, b_1.currency_code::text::bpchar)::text)
           and upper(fx_direct.to_currency_code)   = upper(b_1.currency_code::text)
          left join v_latest_exchange_rates fx_inverse
            on upper(fx_inverse.from_currency_code) = upper(b_1.currency_code::text)
           and upper(fx_inverse.to_currency_code)   = upper(coalesce(sm.source_currency_code, b_1.currency_code::text::bpchar)::text)
 ), budget_rollup as (
   select ms.budget_id,
          coalesce(sum(ms.converted_amount), 0::numeric)::numeric(14,2) as spent_amount,
          count(*)::integer as movement_count
     from matched_spend ms
    group by ms.budget_id
 )
 select b.id,
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
        case
          when b.category_id is not null and b.account_id is not null then 'category_account'::text
          when b.category_id is not null then 'category'::text
          when b.account_id  is not null then 'account'::text
          else 'general'::text
        end as scope_kind,
        case
          when b.category_id is not null and b.account_id is not null
            then (coalesce(c.name, 'Categoria'::text) || ' en '::text) || coalesce(a.name, 'cuenta'::text)
          when b.category_id is not null then 'Categoria: '::text || coalesce(c.name, 'Sin categoria'::text)
          when b.account_id  is not null then 'Cuenta: '::text    || coalesce(a.name, 'Sin cuenta'::text)
          else 'Gasto total del workspace'::text
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
              end >= b.alert_percent
          as is_near_limit,
        b.is_active and coalesce(br.spent_amount, 0::numeric) > b.limit_amount as is_over_limit,
        b.created_at,
        b.updated_at,
        b.is_pinned
   from budgets b
        left join categories c on c.id = b.category_id
        left join accounts   a on a.id = b.account_id
        left join budget_rollup br on br.budget_id = b.id;
