-- Fase 36 — un presupuesto es una regla que se repite, no un período suelto.
--
-- El formulario pedía inicio y fin, así que cada mes nacía un presupuesto nuevo y el usuario
-- tenía que recrearlo el día 1. De ahí salieron las tres filas de "Alimentación mensual" que la
-- fase 35 tuvo que agrupar a mano: la lista mostraba lo que la base guardaba.
--
-- `recurrence` guarda la pregunta correcta —cada cuánto se renueva— para que los períodos los
-- pueda generar el sistema. Los períodos siguen siendo filas: son los que llevan el gasto real
-- de cada mes y el historial que se enseña en "Meses cerrados".

alter table public.budgets
  add column if not exists recurrence text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'budgets_recurrence_check'
  ) then
    alter table public.budgets
      add constraint budgets_recurrence_check
      check (recurrence in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'none'));
  end if;
end $$;

-- Los que ya existen traen su cadencia implícita en lo que duran: un período de 28 a 45 días es
-- mensual. Sin esto, editar un presupuesto que el usuario venía recreando cada mes precargaría
-- "Entre dos fechas", que es justo el trabajo que esta fase viene a quitar.
-- Mismos cortes que `inferRecurrence` en features/budgets/lib/budgetRecurrence.ts.
update public.budgets
set recurrence = case
  when (period_end - period_start + 1) <= 8   then 'weekly'
  when (period_end - period_start + 1) <= 16  then 'biweekly'
  when (period_end - period_start + 1) <= 45  then 'monthly'
  when (period_end - period_start + 1) <= 120 then 'quarterly'
  when (period_end - period_start + 1) <= 400 then 'yearly'
  else 'none'
end
where recurrence = 'none';

-- Generar el período siguiente tiene que poder repetirse sin duplicar: dos teléfonos abriendo la
-- app a la vez intentarán crearlo los dos, y el segundo debe chocar en vez de escribir un gemelo.
-- La clave es la misma que agrupa la lista en reglas (workspace + ámbito + nombre) más el inicio.
create unique index if not exists budgets_rule_period_unique
  on public.budgets (
    workspace_id,
    coalesce(category_id, -1),
    coalesce(account_id, -1),
    lower(name),
    period_start
  );

comment on column public.budgets.recurrence is
  'Cada cuánto se renueva el presupuesto: weekly|biweekly|monthly|quarterly|yearly|none. '
  '"none" es un tramo suelto (un viaje, un proyecto) y no genera períodos nuevos.';

-- La vista es la que llega al cliente, así que la columna nueva tiene que salir por ella. Es el
-- mismo tropiezo que el diccionario ya advierte para `is_pinned`: añadir la columna a la tabla y
-- olvidar la vista deja el dato invisible para la app, sin error en ninguna parte.
--
-- Se reconstruye a partir de su propia definición para no copiar aquí las tres CTEs de cálculo
-- de gasto: lo único que cambia es una columna más al final.
do $$
declare
  definicion text;
begin
  select pg_get_viewdef('public.v_budget_progress'::regclass, true) into definicion;
  if position('b.recurrence' in definicion) = 0 then
    execute replace(
      'create or replace view public.v_budget_progress as ' || definicion,
      '    b.is_pinned' || chr(10) || '   FROM budgets b',
      '    b.is_pinned,' || chr(10) || '    b.recurrence' || chr(10) || '   FROM budgets b'
    );
  end if;
end $$;
