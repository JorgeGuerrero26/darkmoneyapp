-- Toggle de alertas predictivas (cash_runway_alert, commitments_vs_balance).
-- El cron send-daily-notification-digest lo respeta antes de calcular/insertar.
do $$
begin
  if to_regclass('public.notification_preferences') is null then
    return;
  end if;

  alter table public.notification_preferences
    add column if not exists predictive_alerts_enabled boolean;

  update public.notification_preferences
  set predictive_alerts_enabled = true
  where predictive_alerts_enabled is null;

  alter table public.notification_preferences
    alter column predictive_alerts_enabled set default true,
    alter column predictive_alerts_enabled set not null;
end $$;
