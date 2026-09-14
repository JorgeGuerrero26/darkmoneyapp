-- Separa los dos crons que disparaban en el MISMO minuto.
--
-- `daily-notification-digest-lima-9pm` y `proactive-insights-anomaly` estaban ambos en
-- `0 2 * * *` (21:00 Lima). Los pusieron dos migraciones distintas, en fechas distintas, y cada
-- una eligio "las 21:00" sin saber de la otra. Las dos hacen net.http_post a una edge function
-- con IA, asi que la instancia recibia las dos cargas a la vez.
--
-- Evidencia (informe del panel, 24 h del 13-09-2026): seis respuestas 504 entre las 21:00:05 y
-- las 21:00:24 del 12-09, sobre endpoints distintos (v_account_balances, v_user_workspaces,
-- notifications, accounts, movements) -- cinco segundos despues del disparo. El mismo patron se
-- repite con los otros crons: 504 en /rest/v1/exchange_rates a las 08:00:13 (sync-exchange-rates
-- corre 08:00) y pico de 53 "Thread killed by timeout manager" a las 17:00
-- (send-daily-notification-digest corre 17:00). Tres coincidencias independientes.
--
-- Se mueve el de anomalias, no el digest: el digest es visible para el usuario y su hora (9pm)
-- es parte de lo que se le prometio, mientras que las anomalias solo alimentan insights que se
-- leen al dia siguiente. Nuevo hueco: 03:00 UTC = 22:00 Lima, una hora despues del digest y
-- media hora antes de la limpieza de app_error_logs (03:30 UTC).
--
-- Se usa alter_job y no unschedule+schedule a proposito: cambia SOLO el horario y no vuelve a
-- escribir el comando, que lee secretos del vault y no conviene retipear.

do $$
declare
  target bigint;
begin
  select jobid into target from cron.job where jobname = 'proactive-insights-anomaly';
  if target is null then
    raise notice 'proactive-insights-anomaly no existe: nada que reprogramar.';
    return;
  end if;
  perform cron.alter_job(target, schedule => '0 3 * * *');
end
$$;
