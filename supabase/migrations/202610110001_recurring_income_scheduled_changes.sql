-- Un ingreso fijo que cambia de monto en una fecha conocida.
--
-- "Desde enero gano 5.000": hasta hoy la proyección repetía el monto actual para siempre, así
-- que un aumento ya acordado no aparecía en ningún mes y el flujo salía corto justo cuando más
-- se lo mira para decidir.
--
-- Es una lista dentro de la fila —igual que `deductions`— y no una tabla aparte: son pocas
-- (un sueldo cambia una o dos veces al año), siempre se leen junto al ingreso y no tienen vida
-- propia. Forma: [{"effective_date": "2027-01-01", "amount": 5000.00}, ...]
--
-- `amount` NO cambia de significado: sigue siendo lo que llega hoy. Cada cambio dice cuánto
-- llega DESDE su fecha, y vale hasta que otro cambio lo reemplace. Como en `amount`, el monto es
-- lo que ENTRA a la cuenta (neto): la app no calcula retenciones.

alter table public.recurring_income
  add column if not exists scheduled_changes jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recurring_income_scheduled_changes_is_array'
  ) then
    alter table public.recurring_income
      add constraint recurring_income_scheduled_changes_is_array
      check (jsonb_typeof(scheduled_changes) = 'array');
  end if;
end $$;
