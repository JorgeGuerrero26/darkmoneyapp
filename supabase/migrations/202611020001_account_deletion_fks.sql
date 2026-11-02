-- Eliminar una cuenta (Edge Function delete-account) sin que el borrado falle y sin llevarse datos de otras personas.
--
-- Antes: borrar a alguien en auth.users fallaba si alguna vez compartió una deuda (obligation_shares, enlaces y
-- solicitudes de pago con RESTRICT / NO ACTION), y en un espacio compartido el CASCADE de created_by_user_id se
-- llevaba las cuentas, movimientos y deudas que esa persona creó, con lo que los demás registraron encima.
-- Solo cambia qué pasa al borrar a una persona; ningún dato cambia al aplicarla.

-- 1. Lo que una persona creó en un espacio compartido se queda en el espacio, sin autor. Su propio espacio sigue
--    borrándose entero por workspaces.owner_user_id (CASCADE), que no se toca.
alter table public.accounts drop constraint accounts_user_id_fkey,
  add constraint accounts_user_id_fkey foreign key (created_by_user_id) references auth.users(id) on delete set null;
alter table public.budgets drop constraint budgets_user_id_fkey,
  add constraint budgets_user_id_fkey foreign key (created_by_user_id) references auth.users(id) on delete set null;
alter table public.categories drop constraint categories_user_id_fkey,
  add constraint categories_user_id_fkey foreign key (created_by_user_id) references auth.users(id) on delete set null;
alter table public.counterparties drop constraint counterparties_user_id_fkey,
  add constraint counterparties_user_id_fkey foreign key (created_by_user_id) references auth.users(id) on delete set null;
alter table public.movements drop constraint movements_user_id_fkey,
  add constraint movements_user_id_fkey foreign key (created_by_user_id) references auth.users(id) on delete set null;
alter table public.obligations drop constraint obligations_user_id_fkey,
  add constraint obligations_user_id_fkey foreign key (created_by_user_id) references auth.users(id) on delete set null;
alter table public.subscriptions drop constraint subscriptions_user_id_fkey,
  add constraint subscriptions_user_id_fkey foreign key (created_by_user_id) references auth.users(id) on delete set null;
alter table public.movement_templates alter column created_by_user_id drop not null,
  drop constraint movement_templates_created_by_user_id_fkey,
  add constraint movement_templates_created_by_user_id_fkey foreign key (created_by_user_id) references auth.users(id) on delete set null;

-- 2. Deudas compartidas: la invitación y los enlaces de quien la veía desaparecen con cualquiera de las dos personas.
--    La deuda es de quien la compartió: si se borra esa persona, se va con su espacio.
alter table public.obligation_shares drop constraint obligation_shares_owner_user_id_fkey,
  add constraint obligation_shares_owner_user_id_fkey foreign key (owner_user_id) references auth.users(id) on delete cascade;
alter table public.obligation_shares drop constraint obligation_shares_invited_by_user_id_fkey,
  add constraint obligation_shares_invited_by_user_id_fkey foreign key (invited_by_user_id) references auth.users(id) on delete cascade;
alter table public.obligation_shares drop constraint obligation_shares_invited_user_id_fkey,
  add constraint obligation_shares_invited_user_id_fkey foreign key (invited_user_id) references auth.users(id) on delete cascade;
alter table public.obligation_event_viewer_links drop constraint obligation_event_viewer_links_linked_by_user_id_fkey,
  add constraint obligation_event_viewer_links_linked_by_user_id_fkey foreign key (linked_by_user_id) references auth.users(id) on delete cascade;

-- 3. Las solicitudes de pago que ya se aceptaron son parte de la deuda del otro: se quedan sin autor (la función
--    cambia el nombre guardado por «Cuenta eliminada» y borra las pendientes).
alter table public.obligation_payment_requests alter column requested_by_user_id drop not null,
  drop constraint obligation_payment_requests_requested_by_user_id_fkey,
  add constraint obligation_payment_requests_requested_by_user_id_fkey foreign key (requested_by_user_id) references auth.users(id) on delete set null;

-- 4. Comprobantes subidos a un espacio compartido: son del espacio, se quedan sin autor.
alter table public.attachments alter column uploaded_by_user_id drop not null,
  drop constraint attachments_uploaded_by_user_id_fkey,
  add constraint attachments_uploaded_by_user_id_fkey foreign key (uploaded_by_user_id) references auth.users(id) on delete set null;

-- 5. Registro técnico de la sincronización sin conexión: no colgaba de nadie y sobrevivía a todo.
alter table public.sync_applied_ops
  add constraint sync_applied_ops_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
