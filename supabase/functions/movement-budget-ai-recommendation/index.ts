/**
 * Deploy:
 *   npx supabase functions deploy movement-budget-ai-recommendation --project-ref <project-ref>
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

const FEATURE_KEY = "movement-budget-ai-recommendation";
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

function trimText(value: unknown, max = 180) {
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

function normalizeRecommendation(raw: string, budgetId: number, budgetName: string) {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const severity = parsed.severity === "high" || parsed.severity === "medium" || parsed.severity === "low"
      ? parsed.severity
      : "medium";
    const rawConfidence = Number(parsed.confidence ?? 0);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
    return {
      budgetId,
      budgetName,
      severity,
      confidence,
      title: trimText(parsed.title, 60) || "Impacto en presupuesto",
      recommendation: trimText(parsed.recommendation, 180) || "Este movimiento impacta un presupuesto activo.",
      reasons: sanitizeReasons(parsed.reasons),
    };
  } catch {
    return null;
  }
}

function buildPrompt(input: unknown) {
  return [
    "Eres el asistente financiero de DarkMoney.",
    "Explica el impacto de un movimiento sobre un presupuesto activo.",
    "No bloquees al usuario. Da una recomendacion breve, practica y neutral.",
    "No menciones IA, DeepSeek ni el proveedor.",
    "Devuelve solo JSON valido con esta forma exacta:",
    '{"severity":"low|medium|high","confidence":0.0,"title":"titulo breve","recommendation":"recomendacion breve","reasons":["razon"]}',
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
    .eq("usage_date", usageDate);
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
      status: "success",
      latency_ms: input.latencyMs,
    });
  if (error && !isMissingRelationError(error, "ai_feature_usage_events")) throw error;
}

async function requestDeepSeek(apiKey: string, model: string, prompt: string) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
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
      max_tokens: 240,
      response_format: { type: "json_object" },
    }),
  });
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
    const budgetImpact = body.budgetImpact as Record<string, unknown> | undefined;
    const budgetId = numberFromBody(budgetImpact?.budgetId);
    const budgetName = trimText(budgetImpact?.budgetName, 80);
    if (!workspaceId) return jsonResponse({ ok: false, error: "No se encontro el workspace." }, 400);
    if (!budgetId || !budgetName) return jsonResponse({ ok: true, recommendation: null, model });

    const isMember = await assertWorkspaceMember(client, user.id, workspaceId);
    if (!isMember) return jsonResponse({ ok: false, error: "No tienes acceso a este workspace." }, 403);
    const isPro = await hasProAccess(client, user);
    if (!isPro) return jsonResponse({ ok: false, error: "Disponible solo para usuarios Pro." }, 403);

    const usageDate = usageDateInLima();
    const usedToday = await usageCount(client, user.id, usageDate);
    if (usedToday >= DAILY_LIMIT) return jsonResponse({ ok: false, error: "Limite diario de recomendaciones IA alcanzado." }, 429);

    const prompt = buildPrompt({
      surface,
      movement: body.movement ?? null,
      budgetImpact,
    });
    const rawReply = await requestDeepSeek(apiKey, model, prompt);
    const recommendation = normalizeRecommendation(rawReply, budgetId, budgetName);
    await recordUsage({
      client,
      userId: user.id,
      workspaceId,
      usageDate,
      model,
      surface,
      latencyMs: Date.now() - startedAt,
    });
    return jsonResponse({ ok: true, recommendation, model });
  } catch (error) {
    console.error("[movement-budget-ai-recommendation]", error);
    const message = error instanceof Error ? error.message : "No se pudo recomendar sobre presupuesto.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
