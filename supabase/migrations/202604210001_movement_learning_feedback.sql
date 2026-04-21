create table if not exists public.movement_learning_feedback (
  id bigserial primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  movement_id bigint not null references public.movements(id) on delete cascade,
  feedback_kind text not null,
  normalized_description text,
  previous_category_id bigint references public.categories(id) on delete set null,
  accepted_category_id bigint references public.categories(id) on delete set null,
  confidence numeric(5, 4),
  source text not null default 'dashboard',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists movement_learning_feedback_workspace_created_idx
  on public.movement_learning_feedback(workspace_id, created_at desc);

create index if not exists movement_learning_feedback_movement_idx
  on public.movement_learning_feedback(movement_id);

create index if not exists movement_learning_feedback_category_idx
  on public.movement_learning_feedback(accepted_category_id);

alter table public.movement_learning_feedback enable row level security;

drop policy if exists "movement_learning_feedback_select_workspace_members" on public.movement_learning_feedback;
create policy "movement_learning_feedback_select_workspace_members"
  on public.movement_learning_feedback
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = movement_learning_feedback.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "movement_learning_feedback_insert_workspace_members" on public.movement_learning_feedback;
create policy "movement_learning_feedback_insert_workspace_members"
  on public.movement_learning_feedback
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = movement_learning_feedback.workspace_id
        and wm.user_id = auth.uid()
    )
  );
