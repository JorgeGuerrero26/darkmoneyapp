-- Búsqueda semántica del asistente: embeddings de movimientos (Gemini 768d).
-- Indexado lazy desde assistant-chat (sin cron/trigger a esta escala).
-- Spec: docs/superpowers/specs/2026-07-19-assistant-semantica-proactividad-design.md

create extension if not exists vector;

create table if not exists public.movement_embeddings (
  movement_id bigint primary key references public.movements(id) on delete cascade,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  embedding vector(768) not null,
  -- hash del texto embebido: si el movimiento cambia, se re-embebe
  source_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_movement_embeddings_workspace
  on public.movement_embeddings (workspace_id);
-- ponytail: sin índice ANN a propósito (~700 filas, seq scan sobra);
-- agregar HNSW cuando un workspace supere ~50k movimientos.

alter table public.movement_embeddings enable row level security;

drop policy if exists "movement_embeddings_member_select" on public.movement_embeddings;
create policy "movement_embeddings_member_select"
  on public.movement_embeddings for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- Sin políticas de escritura: solo el service role (edge function) escribe.

drop function if exists public.match_movements(bigint, vector, int);
create or replace function public.match_movements(
  ws_id bigint,
  query_embedding vector(768),
  match_count int default 15
)
returns table (movement_id bigint, similarity double precision)
language sql stable security invoker
as $$
  select me.movement_id,
         1 - (me.embedding <=> query_embedding) as similarity
  from public.movement_embeddings me
  where me.workspace_id = ws_id
  order by me.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 30)
$$;

grant execute on function public.match_movements(bigint, vector, int) to authenticated;
