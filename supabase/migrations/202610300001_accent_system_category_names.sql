-- Solo nombres heredados del sistema. No se renombran categorías personales y se evitan
-- colisiones con otra categoría del mismo espacio. Los cambios deben llegar al cliente offline.
with names(old_name, new_name) as (
  values ('Tecnologia', 'Tecnología'), ('Alimentacion', 'Alimentación'), ('Diversion', 'Diversión')
)
update public.categories as category
set name = names.new_name, updated_at = now()
from names
where category.is_system = true
  and category.name = names.old_name
  and not exists (
    select 1 from public.categories as other
    where other.workspace_id = category.workspace_id
      and other.id <> category.id
      and lower(other.name) in (lower(names.old_name), lower(names.new_name))
  );
