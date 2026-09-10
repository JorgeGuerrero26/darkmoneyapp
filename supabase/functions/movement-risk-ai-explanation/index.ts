/**
 * Deploy:
 *   npx supabase functions deploy movement-risk-ai-explanation --project-ref <project-ref>
 */

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  numberFromBody,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";
import { isFallbackProEmail } from "../_shared/admin-emails.ts";

const FEATURE_KEY = "movement-risk-ai-explanation";
const DAILY_LIMIT = 100;

function usageDateInLima(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isMissingRelationError(error: unknown, relation: string) {
  const message = String((error as { message?: unknown })?.message ?? "").toLowerCase();
  return message.includes(relation.toLowerCase()) &&
    (message.includes("does not exist") || message.includes("could not find") || message.includes("schema cache"));
}

function trimText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function sanitizeReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, 120))
    .filter((item) => item.length >= 3)
    .slice(0, 3);
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return withoutFences.slice(start, end + 1);
}

function normalizeExplanation(raw: string, fallbackIds: number[]) {
  const fallback = null;
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return fallback;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const kind = parsed.kind === "amount_anomaly" ? "amount_anomaly" : parsed.kind === "duplicate" ? "duplicate" : null;
    if (!kind) return fallback;
    const severity = parsed.severity === "high" || parsed.severity === "medium" || parsed.severity === "low"
      ? parsed.severity
      : "medium";
    const rawConfidence = Number(parsed.confidence ?? 0);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
    return {
      kind,
      severity,
      confidence,
      title: trimText(parsed.title, 60) || (kind === "duplicate" ? "Podría estar repetido" : "Monto inusual"),
      explanation: trimText(parsed.explanation, 180) || "Hay señales que conviene revisar antes de guardar.",
      reasons: sanitizeReasons(parsed.reasons),
      relatedMovementIds: Array.isArray(parsed.relatedMovementIds)
        ? parsed.relatedMovementIds.map(Number).filter((id) => Number.isFinite(id) && fallbackIds.includes(id)).slice(0, 5)
        : fallbackIds.slice(0, 5),
    };
  } catch {
    return fallback;
  }
}

function buildPrompt(input: unknown) {
  return [
    "Eres el asistente financiero de DarkMoney.",
    "Explica brevemente si el movimiento actual parece duplicado o tiene un monto inusual.",
    "Usa solo los datos enviados. No inventes movimientos ni IDs.",
    "No bloquees al usuario; la respuesta debe ayudar a decidir si guardar o revisar.",
    "No menciones IA, DeepSeek ni el proveedor.",
    "Devuelve solo JSON valido con esta forma exacta:",
    '{"kind":"duplicate|amount_anomaly","severity":"low|medium|high","confidence":0.0,"title":"titulo breve","explanation":"explicacion breve","reasons":["razon"],"relatedMovementIds":[1]}',
    "",
    "Datos:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

async function hasProAccess(client: ReturnType<typeof serviceClient>, user: { id: string; email?: string | null }) {
  const fallback = isFallbackProEmail(user.email);
  const { data, error } = await client
    .from("user_entitlements")
    .select("plan_code, pro_access_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error, "user_entitlements")) return fallback;
    throw error;
  }
  if (!data) return fallback;
  return data.pro_access_enabled === true || data.plan_code === "pro" || fallback;
}

async function assertWorkspaceMember(client: ReturnType<typeof serviceClient>, userId: string, workspaceId: number) {
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function usageCount(client: ReturnType<typeof serviceClient>, userId: string, usageDate: string) {
  const { count, error } = await client
    .from("ai_feature_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("feature_key", FEATURE_KEY)
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    // Un timeout no gasta cupo: el usuario no recibio nada.
    .eq("status", "success");
  if (error) {
    if (isMissingRelationError(error, "ai_feature_usage_events")) return 0;
    throw error;
  }
  return count ?? 0;
}

async function recordUsage(input: {
  client: ReturnType<typeof serviceClient>;
  userId: string;
  workspaceId: number;
  usageDate: string;
  model: string;
  surface: string;
  latencyMs: number;
  /* Un fallo tambien es uso: si no se apunta, la unica senal de que el modelo se atasca es que
     alguien lo cuente. Ver `usageCount`, que solo suma los que sirvieron. */
  status?: "success" | "error";
}) {
  const { error } = await input.client
    .from("ai_feature_usage_events")
    .insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      feature_key: FEATURE_KEY,
      usage_date: input.usageDate,
      model: input.model,
      surface: input.surface,
      status: input.status ?? "success",
      latency_ms: input.latencyMs,
    });
  if (error && !isMissingRelationError(error, "ai_feature_usage_events")) throw error;
}

/**
 * Cuanto esperamos al modelo antes de rendirnos.
 *
 * Por debajo de los 20 s que aguanta el cliente: sin esto, la peticion seguia viva despues de que
 * el telefono ya se habia rendido, y trabajaba para nadie. Registradas en 30 dias: 43 llamadas
 * por encima de 20 s, dos de ellas de 60 s exactos. Y como el resultado llegaba igual, se
 * apuntaba como `success`, asi que la tabla decia 765 de 765 correctas mientras el usuario veia
 * fallos.
 */
const MODEL_TIMEOUT_MS = 18_000;

async function requestDeepSeek(apiKey: string, model: string, prompt: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Responde siempre como JSON valido y nada mas." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 260,
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`El modelo tardo mas de ${MODEL_TIMEOUT_MS / 1000} segundos.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "No se pudo obtener respuesta del modelo.";
    throw new Error(message);
  }
  return String(payload?.choices?.[0]?.message?.content ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Metodo no permitido." }, 405);

  const startedAt = Date.now();
  try {
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY")?.trim();
    const model = Deno.env.get("DEEPSEEK_MODEL")?.trim() || "deepseek-v4-flash";
    if (!apiKey) return jsonResponse({ ok: false, error: "Falta configurar DEEPSEEK_API_KEY." }, 500);

    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const body = await readJsonBody(req);
    const workspaceId = numberFromBody(body.workspaceId);
    const surface = trimText(body.surface, 40) || "movement_form";
    if (!workspaceId) return jsonResponse({ ok: false, error: "No se encontro el workspace." }, 400);

    const isMember = await assertWorkspaceMember(client, user.id, workspaceId);
    if (!isMember) return jsonResponse({ ok: false, error: "No tienes acceso a este workspace." }, 403);
    const isPro = await hasProAccess(client, user);
    if (!isPro) return jsonResponse({ ok: false, error: "Disponible solo para usuarios Pro." }, 403);

    const usageDate = usageDateInLima();
    const usedToday = await usageCount(client, user.id, usageDate);
    if (usedToday >= DAILY_LIMIT) return jsonResponse({ ok: false, error: "Limite diario de explicaciones IA alcanzado." }, 429);

    const relatedMovements = Array.isArray(body.relatedMovements) ? body.relatedMovements.slice(0, 5) : [];
    const relatedIds = relatedMovements.map((movement: Record<string, unknown>) => Number(movement.id)).filter(Number.isFinite);
    const prompt = buildPrompt({
      surface,
      currentMovement: body.currentMovement ?? null,
      relatedMovements,
      localRisk: body.localRisk ?? null,
    });
    let rawReply: string;
    /* Un fallo del modelo —o el corte por tardar demasiado— se apunta igual que un acierto.
       Sin esto la tabla de uso solo sabia de los que salieron bien, y no habia forma de ver
       desde fuera que algo se estaba atascando. */
    try {
      rawReply = await requestDeepSeek(apiKey, model, prompt);
    } catch (modelError) {
      await recordUsage({
        client,
        userId: user.id,
        workspaceId,
        usageDate,
        model,
        surface,
        latencyMs: Date.now() - startedAt,
        status: "error",
      }).catch(() => undefined);
      throw modelError;
    }
    const explanation = normalizeExplanation(rawReply, relatedIds);
    await recordUsage({
      client,
      userId: user.id,
      workspaceId,
      usageDate,
      model,
      surface,
      latencyMs: Date.now() - startedAt,
    });
    return jsonResponse({ ok: true, explanation, model });
  } catch (error) {
    console.error("[movement-risk-ai-explanation]", error);
    const message = error instanceof Error ? error.message : "No se pudo explicar el riesgo.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
