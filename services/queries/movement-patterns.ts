import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export type PatternMovement = {
  description: string;
  category_id: number | null;
  counterparty_id: number | null;
  source_account_id: number | null;
  movement_type: string;
};

async function fetchMovementPatterns(workspaceId: number): Promise<PatternMovement[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase
    .from("movements")
    .select("description, category_id, counterparty_id, source_account_id, movement_type")
    .eq("workspace_id", workspaceId)
    .eq("status", "posted")
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as PatternMovement[];
}

export function useMovementPatternsQuery(workspaceId: number | null) {
  return useQuery({
    queryKey: ["movement-patterns", workspaceId],
    queryFn: () => fetchMovementPatterns(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
