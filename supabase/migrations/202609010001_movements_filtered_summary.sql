-- El neto de Movimientos se calculaba sumando las filas YA CARGADAS, y por eso la pantalla
-- llevaba debajo un aviso —"Totales de los movimientos cargados hasta ahora"— que desmentía a la
-- cifra de arriba. Cuando un número necesita una nota al pie que lo contradiga, el problema es el
-- número.
--
-- Y el sesgo no era aleatorio: la lista carga los movimientos más recientes primero, así que el
-- neto parcial siempre se inclinaba hacia los últimos días. Con el sueldo entrando el 30, el
-- primer número que se ve está inflado; entrando el 2, el mes se ve catastrófico hasta que uno
-- hace scroll. Era el único dato de la pantalla que no se podía verificar mirando.
--
-- Paginar la lista y sumar el periodo son dos consultas distintas. Esta es la suma: una llamada,
-- el mismo filtro, sin importar cuántas filas haya en pantalla.
--
-- SECURITY INVOKER (por defecto): la RLS de `movements` sigue mandando, así que esto no ve nada
-- que el usuario no pudiera ver leyendo las filas.

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
  with filtered as (
    select
      m.movement_type,
      coalesce(m.source_amount, 0) as source_amount,
      coalesce(m.destination_amount, 0) as destination_amount
    from public.movements m
    where m.workspace_id = p_workspace_id
      -- Las transferencias no suman ni restan: la plata cambia de bolsillo.
      and m.movement_type <> 'transfer'
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
    -- Espejo exacto de movementActsAsIncome (lib/movement-amounts.ts): lo que decide es hacia
    -- dónde se movió la plata, no cómo se llama el movimiento. Un obligation_payment es un COBRO
    -- cuando a ti te deben —entra— y un pago cuando debes tú.
    select
      case
        when movement_type::text in ('income', 'refund') then true
        when movement_type::text in ('expense', 'subscription_payment') then false
        else destination_amount > source_amount
      end as acts_income,
      source_amount,
      destination_amount
    from filtered
  )
  select
    coalesce(sum(case when acts_income
      then abs(case when destination_amount <> 0 then destination_amount else source_amount end)
      else 0 end), 0) as income_total,
    coalesce(sum(case when not acts_income
      then abs(case when source_amount <> 0 then source_amount else destination_amount end)
      else 0 end), 0) as expense_total,
    count(*) filter (where acts_income) as income_count,
    count(*) filter (where not acts_income) as expense_count
  from classified;
$$;

comment on function public.movements_filtered_summary is
  'Entró/salió del filtro completo de Movimientos, no de las filas cargadas. Clasifica igual que movementActsAsIncome y excluye transferencias.';

revoke all on function public.movements_filtered_summary(
  bigint, text[], text, bigint, bigint, boolean, timestamptz, timestamptz, text, bigint[]
) from public;

grant execute on function public.movements_filtered_summary(
  bigint, text[], text, bigint, bigint, boolean, timestamptz, timestamptz, text, bigint[]
) to authenticated;
