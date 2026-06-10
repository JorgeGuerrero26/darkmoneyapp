-- Auditoría 2026-06-10 (hallazgo N4): cuando el headless detectaba un posible duplicado,
-- solo re-mostraba la notificación y la sugerencia quedaba 'pending' → cada re-disparo
-- reintentaba el registro indefinidamente. El nuevo estado 'duplicate' cierra la sugerencia
-- vinculándola al movimiento existente, sin loop.

alter table public.notification_detected_movement_suggestions
  drop constraint if exists notification_detected_movement_suggestions_status_check;

alter table public.notification_detected_movement_suggestions
  add constraint notification_detected_movement_suggestions_status_check
  check (status in ('pending', 'registered', 'discarded', 'duplicate'));
