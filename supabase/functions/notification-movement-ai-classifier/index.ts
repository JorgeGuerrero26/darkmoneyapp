/**
 * Deploy:
 *   npx supabase functions deploy notification-movement-ai-classifier --project-ref <project-ref>
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DEEPSEEK_API_KEY
 *
 * Optional secret:
 *   DEEPSEEK_MODEL
 */

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  numberFromBody,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";

type MovementType = "expense" | "income" | "unknown";

type Classification = {
  isMovement: boolean;
  movementType: MovementType;
  confidence: number;
  reason: string;
};

const FEATURE_KEY = "notification-movement-ai-classifier";
const DAILY_LIMIT = 100;
const FALLBACK_PRO_EMAILS = new Set(["joradrianmori@gmail.com"]);

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

function trimText(value: unknown, max = 220) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (withoutFences.startsWith("{") && withoutFences.endsWith("}")) return withoutFences;
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return withoutFences.slice(start, end + 1);
}

function normalizeClassification(raw: string): Classification {
  const fallback: Classification = {
    isMovement: true,
    movementType: "unknown",
    confidence: 0,
    reason: "respuesta no concluyente",
  };
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return fallback;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const movementType = parsed.movementType === "income" || parsed.movementType === "expense"
      ? parsed.movementType
      : "unknown";
    const rawConfidence = Number(parsed.confidence ?? 0);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
    const reason = trimText(parsed.reason, 120) || "clasificación de notificación";
    return {
      isMovement: parsed.isMovement === true,
      movementType,
      confidence,
      reason,
    };
  } catch {
    return fallback;
  }
}

function buildPrompt(input: {
  packageName: string;
  appLabel: string;
  financialAppKey: string | null;
  title: string;
  text: string;
  subText: string;
  amountLabel: string;
  movementType: string;
  localConfidence: string;
}) {
  return [
    "Clasifica si una notificacion bancaria representa un movimiento financiero real ya ocurrido.",
    "Movimiento real: pago, compra aprobada, transferencia enviada/recibida, cargo ejecutado, abono recibido.",
    "No es movimiento: promocion, premio, sorteo, publicidad, beneficio, campaña, recordatorio generico, mensaje educativo.",
    "Importante: un monto en una promocion como 'gana hasta S/ 5000' no es monto transaccional.",
    "Si el texto dice 'por cada consumo' o 'tu compra viene con premio' normalmente es promocion, no movimiento.",
    "No menciones IA, DeepSeek ni el proveedor.",
    "Devuelve solo JSON valido con esta forma exacta:",
    '{"isMovement":true,"movementType":"expense|income|unknown","confidence":0.0,"reason":"razon breve"}',
    "",
    "Datos:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

async function hasProAccess(client: ReturnType<typeof serviceClient>, user: { id: string; email?: string | null }) {
  const fallback = Boolean(user.email && FALLBACK_PRO_EMAILS.has(user.email.trim().toLowerCase()));
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
      surface: "android_overlay",
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
      max_tokens: 180,
      response_format: { type: "json_object" },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string"
      ? payload.error.message
      : "No se pudo obtener respuesta del modelo.";
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
    if (!workspaceId) return jsonResponse({ ok: false, error: "No se encontro el workspace." }, 400);

    const isMember = await assertWorkspaceMember(client, user.id, workspaceId);
    if (!isMember) return jsonResponse({ ok: false, error: "No tienes acceso a este workspace." }, 403);

    const isPro = await hasProAccess(client, user);
    if (!isPro) return jsonResponse({ ok: false, error: "Disponible solo para usuarios Pro." }, 403);

    const usageDate = usageDateInLima();
    const usedToday = await usageCount(client, user.id, usageDate);
    if (usedToday >= DAILY_LIMIT) {
      return jsonResponse({ ok: false, error: "Limite diario de clasificaciones IA alcanzado." }, 429);
    }

    const prompt = buildPrompt({
      packageName: trimText(body.packageName, 120),
      appLabel: trimText(body.appLabel, 80),
      financialAppKey: trimText(body.financialAppKey, 40) || null,
      title: trimText(body.title),
      text: trimText(body.text),
      subText: trimText(body.subText),
      amountLabel: trimText(body.amountLabel, 40),
      movementType: trimText(body.movementType, 20),
      localConfidence: trimText(body.localConfidence, 20),
    });
    const rawReply = await requestDeepSeek(apiKey, model, prompt);
    const classification = normalizeClassification(rawReply);
    await recordUsage({
      client,
      userId: user.id,
      workspaceId,
      usageDate,
      model,
      latencyMs: Date.now() - startedAt,
    });

    return jsonResponse({ ok: true, classification, model });
  } catch (error) {
    console.error("[notification-movement-ai-classifier]", error);
    const message = error instanceof Error ? error.message : "No se pudo clasificar la notificación.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
