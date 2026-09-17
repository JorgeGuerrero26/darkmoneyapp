-- Revisión 38 — un ingreso fijo guardaba un solo número y nadie sabía cuál era.
--
-- El usuario escribía 3.659 y el dato no decía si eso era lo que gana o lo que le llega. Son
-- cosas distintas: gana 4.500 en planilla, le descuentan AFP y renta de 5ta, y a su cuenta
-- entran 3.659. La proyección necesita el que LLEGA; la persona quiere ver los tres.
--
-- `amount` NO cambia de significado: sigue siendo lo que entra a la cuenta, y sigue siendo el
-- único obligatorio. Es lo que alimenta la proyección, el dashboard y el asistente. El bruto y
-- los descuentos son un registro informativo sobre él.
--
-- **No se calcula la retención, se copia de la boleta.** Un cálculo propio sería sofisticado y
-- MENOS exacto que el papel que el usuario ya tiene en la mano: cada empleador la calcula a su
-- manera y el número real depende de si procesaron la declaración jurada. Por eso no hay tramos,
-- ni UIT, ni tabla de impuestos en ninguna parte de esta migración.

alter table public.recurring_income
  add column if not exists gross_amount numeric(14,2),
  add column if not exists deductions jsonb not null default '[]'::jsonb;

-- La lista es de largo variable a propósito: hoy son AFP y renta, mañana aparece un préstamo de
-- la empresa o una EPS, y el usuario tiene que poder añadirlo sin que actualicemos la app.
-- Forma: [{"name": "AFP", "amount": 585.00}, ...]
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recurring_income_deductions_is_array'
  ) then
    alter table public.recurring_income
      add constraint recurring_income_deductions_is_array
      check (jsonb_typeof(deductions) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'recurring_income_gross_amount_positive'
  ) then
    alter table public.recurring_income
      add constraint recurring_income_gross_amount_positive
      check (gross_amount is null or gross_amount > 0);
  end if;
end $$;

-- **A propósito NO hay restricción de que bruto − descuentos = amount.**
--
-- Hay descuentos reales que la boleta no detalla —adelantos, ajustes, redondeos— y forzar el
-- cuadre castigaría al usuario por algo que no controla. El formulario muestra la diferencia
-- cuando no cuadra ("difiere en S/ 12.40 de lo que llega") y deja guardar igual. Una regla de
-- integridad aquí convertiría ese aviso en un error que bloquea, que es la decisión contraria.

comment on column public.recurring_income.gross_amount is
  'Monto bruto en planilla, opcional. Informativo: quien manda para toda cifra calculada es '
  '`amount`, que es lo que LLEGA a la cuenta. No se valida que bruto - descuentos = amount.';

comment on column public.recurring_income.deductions is
  'Descuentos declarados por el usuario, copiados de su boleta: [{"name","amount"}]. Lista de '
  'largo variable; la app no calcula retenciones ni conoce tramos de impuestos.';
