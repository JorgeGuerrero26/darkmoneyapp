-- assistant_facts: memoria del contador interno (asistente IA). Hechos cortos
-- que el usuario pide recordar explícitamente ("mi primo paga la mitad de
-- Amazon") y que se inyectan al contexto de cada conversación. El modelo solo
-- escribe aquí vía las tools remember_fact/forget_fact con el JWT del usuario
-- (RLS de miembros); nunca escribe datos financieros.

create table if not exists public.assistant_facts (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  fact text not null check (char_length(fact) between 3 and 300),
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_facts_workspace
  on public.assistant_facts (workspace_id, created_at desc);

alter table public.assistant_facts enable row level security;

drop policy if exists "assistant_facts_member_select" on public.assistant_facts;
create policy "assistant_facts_member_select"
  on public.assistant_facts for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "assistant_facts_member_insert" on public.assistant_facts;
create policy "assistant_facts_member_insert"
  on public.assistant_facts for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "assistant_facts_member_delete" on public.assistant_facts;
create policy "assistant_facts_member_delete"
  on public.assistant_facts for delete to authenticated
  using (public.is_workspace_member(workspace_id));
