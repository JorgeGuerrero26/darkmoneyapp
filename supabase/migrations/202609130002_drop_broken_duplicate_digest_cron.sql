-- Quita `send-daily-notification-digest`: era un duplicado ROTO del digest de las 21:00.
--
-- Los dos crons llamaban a la MISMA edge function (`send-daily-notification-digest`), uno a las
-- 17:00 Lima y otro a las 21:00. No eran dos resúmenes distintos: era el mismo, dos veces.
--
-- El de las 17:00 llevaba tiempo fallando en silencio. Evidencia:
--
--   * `net._http_response` devuelve **401** para su llamada de las 17:00 (22:00 UTC), frente al
--     200 del de las 21:00.
--   * Ninguna notificación con `payload->>'generatedBy' = 'daily_digest'` se creó nunca a las
--     17:00 en los últimos 10 días: todas a las 21:00, sin excepción.
--
-- La causa: este job (migración 202605270001) arma su URL con
-- `format('https://%s.supabase.co/...', current_setting('app.supabase_project_ref'))` y lee el
-- secreto de `app.digest_webhook_secret`. Esas variables `app.*` nunca se llegaron a setear —
-- la migración 202607200001 ya lo dejó escrito: "el config de DB app.* no está seteado y el
-- pooler no puede setearlo — vault es la vía real". Por eso se creó
-- `daily-notification-digest-lima-9pm`, que lee del vault y sí funciona. El viejo se quedó
-- encendido, disparando todos los días contra un 401.
--
-- Además de no servir para nada, gastaba: cada disparo despierta a la edge function y le pega a
-- una instancia Nano de 512 MB. El pico de 53 "Thread killed by timeout manager" de las 17:00
-- (informe del panel, 24 h del 13-09-2026) es exactamente esta hora.
--
-- RESTAURACIÓN: volver a aplicar `202605270001_schedule_daily_digest_cron.sql`. Antes de
-- hacerlo, setear de verdad `app.supabase_project_ref` y `app.digest_webhook_secret`, o el job
-- volverá a dar 401.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-daily-notification-digest') then
    perform cron.unschedule('send-daily-notification-digest');
  else
    raise notice 'send-daily-notification-digest ya no existe: nada que quitar.';
  end if;
end
$$;
