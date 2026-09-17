-- Revisión 38 — una tarjeta de crédito era una cuenta sin calendario.
--
-- Ya se podía registrar (tipo `credit_card`), pero no cuándo corta ni cuándo se paga. Sin esas
-- dos fechas, el pago de la tarjeta es un movimiento suelto que aparece el día que lo anotas y
-- no antes: la app no puede avisarte y la proyección no puede anticiparlo.
--
-- Hay una segunda razón, más de fondo, que el brief no había visto: **hoy la proyección resta el
-- gasto de la tarjeta un mes antes de tiempo.** Cuando compras con la tarjeta se registra el
-- gasto y se descuenta ese día, pero de tu cuenta del banco no salió nada — sale el día de pago
-- del mes siguiente. Con `statement_day` y `payment_day` el motor puede mover ese gasto al mes
-- en que de verdad te toca pagarlo.

alter table public.accounts
  add column if not exists statement_day smallint,
  add column if not exists payment_day smallint,
  add column if not exists credit_limit numeric(14,2);

-- Días del mes que se repiten, no fechas. "El 25 de cada mes", no "el 25 de octubre".
-- Los días 29, 30 y 31 se aceptan y el que resuelve el mes corto es el motor, corriéndolos al
-- último día del mes — la misma regla que usan los bancos. Prohibirlos aquí obligaría al usuario
-- a mentir sobre su propia tarjeta.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_statement_day_range'
  ) then
    alter table public.accounts
      add constraint accounts_statement_day_range
      check (statement_day is null or statement_day between 1 and 31);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'accounts_payment_day_range'
  ) then
    alter table public.accounts
      add constraint accounts_payment_day_range
      check (payment_day is null or payment_day between 1 and 31);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'accounts_credit_limit_positive'
  ) then
    alter table public.accounts
      add constraint accounts_credit_limit_positive
      check (credit_limit is null or credit_limit > 0);
  end if;
end $$;

-- **Todavía NO se restringe que estas tres columnas solo existan en `type = 'credit_card'`.**
--
-- Sería correcto —un banco con día de corte es un dato fantasma que el motor podría leer— pero
-- la restricción solo puede entrar junto con el formulario que limpia los campos al cambiar de
-- tipo. Añadirla antes deja una ventana en la que cambiar una tarjeta a cuenta de banco falla
-- con un error opaco. Va en la tanda del formulario, y hasta entonces manda el código: quien lea
-- el ciclo comprueba el tipo primero.

comment on column public.accounts.statement_day is
  'Día del mes en que corta el estado de cuenta (1-31). Solo aplica a type = credit_card. '
  'Si el mes no tiene ese día, el motor usa el último día del mes.';

comment on column public.accounts.payment_day is
  'Día del mes en que vence el pago (1-31). Solo aplica a type = credit_card. Se elige aparte '
  'del corte y no se deduce de él: hay bancos que cobran siempre el mismo día sin importar el corte.';

comment on column public.accounts.credit_limit is
  'Línea de crédito, opcional. Solo aplica a type = credit_card. No participa en ningún cálculo '
  'de saldo: es referencia para el usuario.';
