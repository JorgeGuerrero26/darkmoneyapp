-- La restriccion que `202609170002` dejo escrita como pendiente, ahora que existe el formulario.
--
-- El ciclo solo tiene sentido en una tarjeta de credito. Un banco con dia de corte es un dato
-- fantasma: nadie lo ve en pantalla —el bloque solo aparece para `credit_card`— pero la
-- proyeccion podria leerlo y colocar un pago que no existe.
--
-- No se podia anadir antes. Sin el formulario que limpia los tres campos al cambiar de tipo,
-- convertir una tarjeta en cuenta de banco fallaba con un error opaco en mitad de una edicion.
-- Ahora el formulario los limpia al cambiar de tipo Y los manda como null para cualquier tipo
-- que no sea tarjeta, asi que si esta restriccion salta es un bug de la app: justo para lo que
-- sirve.

-- Primero limpiar lo que hubiera quedado suelto entre las dos migraciones.
update public.accounts
set statement_day = null,
    payment_day = null,
    credit_limit = null
where type <> 'credit_card'
  and (statement_day is not null or payment_day is not null or credit_limit is not null);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_cycle_only_on_credit_cards'
  ) then
    alter table public.accounts
      add constraint accounts_cycle_only_on_credit_cards
      check (
        type = 'credit_card'
        or (statement_day is null and payment_day is null and credit_limit is null)
      );
  end if;
end $$;
