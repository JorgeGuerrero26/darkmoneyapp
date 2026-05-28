-- F8: agrega un campo opcional `institution_code` a `accounts` para identificar
-- la institución financiera (banco, fintech) asociada a la cuenta. El código es
-- un slug en minúsculas resuelto contra el catálogo cliente
-- (`lib/account-institutions.ts`), no una FK a otra tabla: el catálogo vive en
-- el código de la app para que los logos y nombres puedan evolucionar sin
-- migraciones adicionales.
--
-- Nullable: cuentas existentes y cuentas no bancarias (efectivo, otras) no
-- requieren institución. Backfill no es necesario.

alter table public.accounts
  add column if not exists institution_code text;

comment on column public.accounts.institution_code is
  'Slug opcional del catálogo cliente lib/account-institutions.ts (ej. "bcp", "interbank", "bbva"). Nullable: cuentas sin institución conocida (efectivo, otros) lo dejan en NULL.';
