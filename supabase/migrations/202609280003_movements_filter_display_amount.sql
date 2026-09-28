-- El rango de montos debe comparar lo que muestra la fila. Un cobro de deuda
-- puede tener solo destination_amount y no debe parecer un movimiento de cero.
create or replace function public.movement_filter_amount(public.movements)
returns numeric
language sql
immutable
set search_path = public
as $$
  select abs(case
    when $1.movement_type in ('income', 'refund')
      or (
        $1.movement_type not in ('expense', 'subscription_payment', 'transfer')
        and coalesce($1.destination_amount, 0) > coalesce($1.source_amount, 0)
      )
      then coalesce($1.destination_amount, $1.source_amount, 0)
    else coalesce($1.source_amount, $1.destination_amount, 0)
  end);
$$;

comment on function public.movement_filter_amount(public.movements) is
  'Monto nominal visible de la fila para el rango de Movimientos, incluido el cobro de obligaciones. No convierte monedas.';

notify pgrst, 'reload schema';
