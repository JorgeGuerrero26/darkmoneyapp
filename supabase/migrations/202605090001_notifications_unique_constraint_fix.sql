-- Replace the UNIQUE INDEX from 202605070001 with a proper UNIQUE CONSTRAINT.
--
-- PostgREST (Supabase JS client) requires a named UNIQUE CONSTRAINT registered
-- in pg_constraint for ON CONFLICT (columns) to resolve correctly. A plain
-- unique index is not sufficient — it causes:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Affected upsert sites:
--   hooks/useNotificationGenerator.ts line ~792
--   services/queries/workspace-data.ts lines ~4116, ~4135

-- Remove duplicate rows keeping the most recent one per conflict key,
-- so the ADD CONSTRAINT below does not fail on pre-existing duplicates.
DELETE FROM public.notifications n1
USING public.notifications n2
WHERE n1.id < n2.id
  AND n1.user_id               = n2.user_id
  AND n1.related_entity_type   = n2.related_entity_type
  AND n1.related_entity_id     = n2.related_entity_id
  AND n1.kind                  = n2.kind
  AND n1.related_entity_type  IS NOT NULL
  AND n1.related_entity_id    IS NOT NULL;

-- Drop the index-only approach from the previous migration.
DROP INDEX IF EXISTS public.uq_notifications_user_entity_kind;

-- Drop constraint if it somehow already exists (idempotent).
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS uq_notifications_user_entity_kind;

-- Add the proper UNIQUE CONSTRAINT on non-null entity rows.
-- NULL entity rows (daily baselines) are intentionally excluded via the
-- partial index predicate so multiple baselines of different kinds can
-- coexist without hitting the constraint.
ALTER TABLE public.notifications
  ADD CONSTRAINT uq_notifications_user_entity_kind
  UNIQUE (user_id, related_entity_type, related_entity_id, kind);
