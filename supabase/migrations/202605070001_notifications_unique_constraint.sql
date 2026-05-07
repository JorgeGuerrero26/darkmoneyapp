-- Ensure the unique index on notifications exists to prevent duplicate
-- notifications for the same user, entity and kind.
--
-- Usage of this index in code:
--   hooks/useNotificationGenerator.ts uses
--   upsert(..., { onConflict: "user_id,related_entity_type,related_entity_id,kind", ignoreDuplicates: true })
--
-- The unique index must exist on the table for ignoreDuplicates to work.
-- An index (not a SQL constraint) was chosen because Supabase by default
-- creates unique indexes for Row Level Security policies on join tables.

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_entity_kind
  ON public.notifications (user_id, related_entity_type, related_entity_id, kind);
