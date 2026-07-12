-- Retención de app_error_logs: sin límite, la tabla crece indefinidamente
-- (pico observado: 968 filas en un solo día durante el incidente 2026-07-11).
-- Cron diario que borra entradas de más de 60 días. Requiere pg_cron (ya
-- habilitado por 202605270001_schedule_daily_digest_cron.sql).

create extension if not exists pg_cron;

-- Idempotente: quitar el job previo si existe.
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'app-error-logs-retention';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

-- 03:30 UTC diario (~22:30 Lima), fuera de horas pico.
select cron.schedule(
  'app-error-logs-retention',
  '30 3 * * *',
  $$ delete from public.app_error_logs where created_at < now() - interval '60 days' $$
);
