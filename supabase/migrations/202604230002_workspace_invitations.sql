create table if not exists public.workspace_invitations (
  id bigserial primary key,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_email text not null,
  invited_display_name text,
  invited_by_display_name text,
  role text not null,
  status text not null default 'pending',
  token text not null,
  note text,
  accepted_at timestamptz,
  responded_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_invitations
  add column if not exists workspace_id bigint references public.workspaces(id) on delete cascade,
  add column if not exists invited_by_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists invited_user_id uuid references auth.users(id) on delete set null,
  add column if not exists invited_email text,
  add column if not exists invited_display_name text,
  add column if not exists invited_by_display_name text,
  add column if not exists role text,
  add column if not exists status text default 'pending',
  add column if not exists token text,
  add column if not exists note text,
  add column if not exists accepted_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists last_sent_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
declare
  status_udt_name text;
begin
  select c.udt_name
  into status_udt_name
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'workspace_invitations'
    and c.column_name = 'status';

  if status_udt_name = 'workspace_invitation_status' then
    execute $sql$
      update public.workspace_invitations
      set
        status = coalesce(nullif(status::text, ''), 'pending')::public.workspace_invitation_status,
        token = coalesce(nullif(token, ''), md5(random()::text || clock_timestamp()::text)),
        created_at = coalesce(created_at, now()),
        updated_at = coalesce(updated_at, now())
      where
        status is null
        or status::text = ''
        or token is null
        or token = ''
        or created_at is null
        or updated_at is null
    $sql$;
  else
    update public.workspace_invitations
    set
      status = coalesce(nullif(status, ''), 'pending'),
      token = coalesce(nullif(token, ''), md5(random()::text || clock_timestamp()::text)),
      created_at = coalesce(created_at, now()),
      updated_at = coalesce(updated_at, now())
    where
      status is null
      or status = ''
      or token is null
      or token = ''
      or created_at is null
      or updated_at is null;
  end if;
end $$;

alter table public.workspace_invitations
  alter column status set default 'pending',
  alter column created_at set default now(),
  alter column updated_at set default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_invitations'
      and column_name = 'workspace_id'
  ) then
    execute 'alter table public.workspace_invitations alter column workspace_id set not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_invitations'
      and column_name = 'invited_by_user_id'
  ) then
    execute 'alter table public.workspace_invitations alter column invited_by_user_id set not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_invitations'
      and column_name = 'invited_email'
  ) then
    execute 'alter table public.workspace_invitations alter column invited_email set not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_invitations'
      and column_name = 'role'
  ) then
    execute 'alter table public.workspace_invitations alter column role set not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_invitations'
      and column_name = 'status'
  ) then
    execute 'alter table public.workspace_invitations alter column status set not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_invitations'
      and column_name = 'token'
  ) then
    execute 'alter table public.workspace_invitations alter column token set not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_invitations'
      and column_name = 'created_at'
  ) then
    execute 'alter table public.workspace_invitations alter column created_at set not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_invitations'
      and column_name = 'updated_at'
  ) then
    execute 'alter table public.workspace_invitations alter column updated_at set not null';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_invitations_role_check'
      and conrelid = 'public.workspace_invitations'::regclass
  ) then
    alter table public.workspace_invitations
      add constraint workspace_invitations_role_check
      check (role in ('admin', 'member', 'viewer'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_invitations_status_check'
      and conrelid = 'public.workspace_invitations'::regclass
  ) then
    alter table public.workspace_invitations
      add constraint workspace_invitations_status_check
      check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked'));
  end if;
end $$;

create unique index if not exists workspace_invitations_token_uidx
  on public.workspace_invitations(token);

create index if not exists workspace_invitations_workspace_status_idx
  on public.workspace_invitations(workspace_id, status, updated_at desc);

create index if not exists workspace_invitations_email_status_idx
  on public.workspace_invitations(lower(invited_email), status, updated_at desc);

create unique index if not exists workspace_invitations_workspace_email_pending_uidx
  on public.workspace_invitations(workspace_id, lower(invited_email))
  where status = 'pending';

alter table public.workspace_invitations enable row level security;

drop policy if exists "workspace_invitations_select_related_users" on public.workspace_invitations;
create policy "workspace_invitations_select_related_users"
on public.workspace_invitations
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_invitations.workspace_id
      and wm.user_id = auth.uid()
  )
  or invited_user_id = auth.uid()
  or lower(invited_email) = lower(coalesce(auth.jwt()->>'email', ''))
);

drop policy if exists "workspace_invitations_insert_workspace_managers" on public.workspace_invitations;
create policy "workspace_invitations_insert_workspace_managers"
on public.workspace_invitations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_invitations.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists "workspace_invitations_update_workspace_managers_or_invited" on public.workspace_invitations;
create policy "workspace_invitations_update_workspace_managers_or_invited"
on public.workspace_invitations
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_invitations.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
  or invited_user_id = auth.uid()
  or lower(invited_email) = lower(coalesce(auth.jwt()->>'email', ''))
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_invitations.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
  or invited_user_id = auth.uid()
  or lower(invited_email) = lower(coalesce(auth.jwt()->>'email', ''))
);
