-- Capa IA de duplicados (2026-07-14): cuando la IA no puede confirmar si un posible
-- duplicado es real (timeout/error), la sugerencia NO se cierra sola: pasa a
-- 'needs_review' y el usuario decide desde la bandeja (quick entry). Evita tanto
-- tragarse movimientos reales como duplicar automaticamente.

alter table public.notification_detected_movement_suggestions
  drop constraint if exists notification_detected_movement_suggestions_status_check;

alter table public.notification_detected_movement_suggestions
  add constraint notification_detected_movement_suggestions_status_check
  check (status in ('pending', 'registered', 'discarded', 'duplicate', 'needs_review'));
