-- Schedules a daily cron job that invokes the send-daily-notification-digest
-- edge function. Without this scheduler the digest is never sent: the function
-- exists but nothing was triggering it.
--
-- REQUIREMENTS:
--   * Supabase Pro plan or higher (pg_cron and pg_net are not available on Free).
--     If on Free, skip this migration and use an external cron (GitHub Actions)
--     that POSTs to the function with the x-webhook-secret header.
--
-- SETUP STEPS (run once from the Supabase SQL editor as the project owner):
--   1) Set the webhook secret as a DB-level config so it does not live in the repo:
--        ALTER DATABASE postgres SET "app.digest_webhook_secret" = '<your-secret>';
--      Or, if you do not want to enforce the secret, leave it unset and remove
--      DIGEST_WEBHOOK_SECRET / WEBHOOK_SECRET from the edge function secrets.
--   2) Set the project ref as a config too (so the URL is not hardcoded if you
--      ever migrate the project):
--        ALTER DATABASE postgres SET "app.supabase_project_ref" = 'cawrdzrcipgibcoefltr';
--   3) Confirm the edge function secret matches what you set in step 1 (Dashboard
--      → Edge Functions → send-daily-notification-digest → secrets).
--
-- Schedule: every day at 22:00 UTC (≈ 17:00 in Lima, GMT-5).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous schedule with the same name so this migration is idempotent.
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'send-daily-notification-digest';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'send-daily-notification-digest',
  '0 22 * * *',
  $cron$
  select net.http_post(
    url := format(
      'https://%s.supabase.co/functions/v1/send-daily-notification-digest',
      coalesce(current_setting('app.supabase_project_ref', true), 'cawrdzrcipgibcoefltr')
    ),
    headers := case
      when coalesce(current_setting('app.digest_webhook_secret', true), '') = '' then
        jsonb_build_object('Content-Type', 'application/json')
      else
        jsonb_build_object(
          'Content-Type', 'application/json',
          'x-webhook-secret', current_setting('app.digest_webhook_secret', true)
        )
    end,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
