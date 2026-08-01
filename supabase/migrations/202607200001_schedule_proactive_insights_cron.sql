-- Crons de proactive-insights: resumen semanal (lunes 09:00 Lima = 14:00 UTC) y
-- anomalías diarias (21:00 Lima = 02:00 UTC).
-- Usa Supabase Vault para URL/anon_key/secret, igual que el cron activo
-- 'daily-notification-digest-lima-9pm' (patrón que SÍ autentica; el config de DB
-- app.* no está seteado y el pooler no puede setearlo — vault es la vía real).
-- Requiere pg_cron + pg_net + secrets en vault: project_url, anon_key,
-- digest_webhook_secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  job_id bigint;
begin
  for job_id in
    select jobid from cron.job where jobname in ('proactive-insights-weekly', 'proactive-insights-anomaly')
  loop
    perform cron.unschedule(job_id);
  end loop;
end
$$;

-- Resumen semanal: lunes 09:00 Lima (14:00 UTC).
select cron.schedule(
  'proactive-insights-weekly',
  '0 14 * * 1',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/proactive-insights?mode=weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'digest_webhook_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron', 'scheduled_at', now()),
    timeout_milliseconds := 60000
  );
  $cron$
);

-- Anomalías: todos los días 21:00 Lima (02:00 UTC).
select cron.schedule(
  'proactive-insights-anomaly',
  '0 2 * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/proactive-insights?mode=anomaly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'digest_webhook_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron', 'scheduled_at', now()),
    timeout_milliseconds := 60000
  );
  $cron$
);
