/**
 * Deploy:
 *   npx supabase functions deploy daily-ai-digest --project-ref <project-ref>
 */

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";
import {
  generateDailyAiDigest,
  type DailyAiDigestSourceNotification,
} from "../_shared/daily-ai-digest.ts";

function stringFromBody(value: unknown, max = 80) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function normalizeNotifications(value: unknown): DailyAiDigestSourceNotification[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      kind: stringFromBody(item.kind, 60),
      title: stringFromBody(item.title, 100),
      body: stringFromBody(item.body, 220),
      payload: item.payload,
      related_entity_type: stringFromBody(item.related_entity_type ?? item.relatedEntityType, 60),
      related_entity_id: Number(item.related_entity_id ?? item.relatedEntityId) || null,
    }))
    .slice(0, 20);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Metodo no permitido." }, 405);

  try {
    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const body = await readJsonBody(req);
    const digestDate = stringFromBody(body.digestDate, 20);
    const notifications = normalizeNotifications(body.notifications);
    const topicLabels = Array.isArray(body.topicLabels)
      ? body.topicLabels.filter((item): item is string => typeof item === "string").slice(0, 5)
      : [];

    const result = await generateDailyAiDigest({
      client,
      userId: user.id,
      userEmail: user.email,
      digestDate: digestDate || undefined,
      notifications,
      topicLabels,
      surface: stringFromBody(body.surface, 40) || "daily_ai_digest",
    });

    return jsonResponse(result, result.skipped === "daily_limit" ? 429 : 200);
  } catch (error) {
    console.error("[daily-ai-digest]", error);
    const message = error instanceof Error ? error.message : "No se pudo generar el resumen inteligente.";
    return jsonResponse({ ok: false, digest: null, error: message }, 500);
  }
});
