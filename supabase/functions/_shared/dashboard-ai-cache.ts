import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Client = ReturnType<typeof createClient>;

export type DashboardAiCacheLookupInput = {
  client: Client;
  workspaceId: number;
  featureKey: string;
  usageDate: string;
};

export type DashboardAiCacheWriteInput = DashboardAiCacheLookupInput & {
  userId: string;
  response: Record<string, unknown>;
  tone?: string | null;
  model?: string | null;
  summaryHash?: string | null;
};

/**
 * Devuelve la respuesta cacheada para (workspace, feature, fecha) si existe.
 * Devuelve null si no hay caché o si ocurre un error de lectura.
 */
export async function readDashboardAiCache(
  input: DashboardAiCacheLookupInput,
): Promise<Record<string, unknown> | null> {
  const { client, workspaceId, featureKey, usageDate } = input;
  const { data, error } = await client
    .from("dashboard_ai_cache")
    .select("response")
    .eq("workspace_id", workspaceId)
    .eq("feature_key", featureKey)
    .eq("usage_date", usageDate)
    .maybeSingle();
  if (error || !data) return null;
  const response = (data as { response?: unknown }).response;
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  return response as Record<string, unknown>;
}

/**
 * Inserta la respuesta en el caché. Idempotente vía índice único
 * (workspace_id, feature_key, usage_date): si ya existe, ignora el error 23505.
 * Errores no críticos se silencian para no romper la respuesta principal.
 */
export async function writeDashboardAiCache(input: DashboardAiCacheWriteInput): Promise<void> {
  const { client, workspaceId, userId, featureKey, usageDate, response, tone, model, summaryHash } = input;
  const { error } = await client.from("dashboard_ai_cache").insert({
    workspace_id: workspaceId,
    user_id: userId,
    feature_key: featureKey,
    usage_date: usageDate,
    tone: tone ?? null,
    model: model ?? null,
    response,
    summary_hash: summaryHash ?? null,
  });
  if (error && (error as { code?: string }).code !== "23505") {
    console.warn("[dashboard-ai-cache] insert error", error);
  }
}
