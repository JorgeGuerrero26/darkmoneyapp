import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { STALE } from "../../lib/query-client";
import { attachLearningReceipts, type LearningMovement, type LearningReceipt } from "../../features/detected-movements/lib/personal-learning";

/** Recent live decisions only; deleting/voiding/editing automatically retracts or replaces evidence. */
export async function fetchDetectionLearning(userId: string, workspaceId: number): Promise<LearningMovement[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const [workspace, members] = await Promise.all([
    supabase.from("workspaces").select("kind, owner_user_id").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).limit(2),
  ]);
  // Old imports had no author. Attribute them only to a verified sole owner of a personal workspace.
  const allowLegacy = !workspace.error && !members.error && workspace.data?.kind === "personal" && workspace.data.owner_user_id === userId &&
    members.data?.length === 1 && members.data[0].user_id === userId;
  let movementQuery = supabase.from("movements")
    .select("id, description, movement_type, status, source_account_id, destination_account_id, category_id, metadata, client_dedupe_key, created_at, updated_at")
    .eq("workspace_id", workspaceId).eq("status", "posted");
  const editor = `or(updated_by_user_id.is.null,updated_by_user_id.eq.${userId})`;
  movementQuery = allowLegacy
    ? movementQuery.or(`and(created_by_user_id.eq.${userId},${editor}),and(created_by_user_id.is.null,${editor})`)
    : movementQuery.eq("created_by_user_id", userId).or(`updated_by_user_id.is.null,updated_by_user_id.eq.${userId}`);
  const [movements, receipts] = await Promise.all([
    movementQuery.order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(1000),
    supabase.from("notification_detected_movement_suggestions")
      .select("movement_id, description, movement_type, financial_app_key, metadata, status")
      .eq("workspace_id", workspaceId).eq("user_id", userId).in("status", ["registered", "duplicate"])
      .order("updated_at", { ascending: false }).limit(1000),
  ]);
  if (movements.error) throw movements.error;
  if (receipts.error) throw receipts.error;
  return attachLearningReceipts((movements.data ?? []) as LearningMovement[], (receipts.data ?? []) as LearningReceipt[]);
}

export function useDetectionLearningQuery(userId: string | null, workspaceId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["detection-learning", userId, workspaceId],
    queryFn: () => fetchDetectionLearning(userId!, workspaceId!),
    enabled: enabled && !!userId && !!workspaceId,
    meta: { uxBlocking: false }, staleTime: STALE.medium,
  });
}
