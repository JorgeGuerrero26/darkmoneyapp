do $$
begin
  if to_regclass('public.notification_preferences') is null then
    return;
  end if;

  alter table public.notification_preferences
    add column if not exists daily_digest_enabled boolean;

  update public.notification_preferences
  set daily_digest_enabled = true
  where daily_digest_enabled is null;

  alter table public.notification_preferences
    alter column daily_digest_enabled set default true,
    alter column daily_digest_enabled set not null;
end $$;
