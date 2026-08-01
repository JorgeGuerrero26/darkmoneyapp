/**
 * Deploy:
 *   npx supabase functions deploy movement-duplicate-ai-check --project-ref <project-ref>
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEEPSEEK_API_KEY
 * Optional: DEEPSEEK_MODEL
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

const FEATURE_KEY = "movement-duplicate-ai-check";
const DAILY_LIMIT = 50;
const USAGE_SURFACE = "duplicate_check";

type DuplicateVerdict = "duplicate" | "distinct" | "unknown";

type DuplicateCheckBody = {
  workspaceId: number;
  suggestion: { description: string; amountLabel: string; occurredAt: string; sourceApp: string; rawText: string | null };
  candidateMovement: { id: number; description: string | null; occurredAt: string; amount: number };
  counts: { sameDaySuggestions: number; sameDayRegisteredFromSuggestions: number; sameDayMatchingMovements: number };
};

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

function parseSuggestion(value: unknown): DuplicateCheckBody["suggestion"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const amountLabel = typeof row.amountLabel === "string" ? row.amountLabel.trim() : "";
  const occurredAt = typeof row.occurredAt === "string" ? row.occurredAt.trim() : "";
  const sourceApp = typeof row.sourceApp === "string" ? row.sourceApp.trim() : "";
  const rawText = typeof row.rawText === "string" && row.rawText.trim() ? row.rawText : null;
  if (!description || !amountLabel || !occurredAt || !sourceApp) return null;
  return { description, amountLabel, occurredAt, sourceApp, rawText };
}

function parseCandidateMovement(value: unknown): DuplicateCheckBody["candidateMovement"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = numberFromBody(row.id);
  const occurredAt = typeof row.occurredAt === "string" ? row.occurredAt.trim() : "";
  const amount = numberFromBody(row.amount);
  const description = typeof row.description === "string" && row.description.trim() ? row.description : null;
  if (!id || !occurredAt || !amount) return null;
  return { id, description, occurredAt, amount };
}

function parseCounts(value: unknown): DuplicateCheckBody["counts"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const sameDaySuggestions = Number(row.sameDaySuggestions);
  const sameDayRegisteredFromSuggestions = Number(row.sameDayRegisteredFromSuggestions);
  const sameDayMatchingMovements = Number(row.sameDayMatchingMovements);
  if (
    !Number.isFinite(sameDaySuggestions) ||
    !Number.isFinite(sameDayRegisteredFromSuggestions) ||
    !Number.isFinite(sameDayMatchingMovements)
  ) {
    return null;
  }
  return { sameDaySuggestions, sameDayRegisteredFromSuggestions, sameDayMatchingMovements };
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

function normalizeVerdict(raw: string): { verdict: DuplicateVerdict; reason: string | null } {
  const fallback: { verdict: DuplicateVerdict; reason: string | null } = { verdict: "unknown", reason: null };
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return fallback;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const verdict = parsed.verdict;
    if (verdict !== "duplicate" && verdict !== "distinct" && verdict !== "unknown") return fallback;
    const reason = typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim().slice(0, 200) : null;
    return { verdict, reason };
  } catch {
    return fallback;
  }
}

function buildPrompt(body: DuplicateCheckBody): string {
  return [
    "Eres un verificador de duplicados de una app de finanzas personales en Peru.",
    "Se detecto una notificacion bancaria cuyo monto y dia coinciden con un movimiento ya registrado.",
    "Decide si la notificacion corresponde AL MISMO movimiento (duplicate) o a OTRO movimiento real (distinct).",
    "Regla fuerte: si las senales detectadas del dia (sameDaySuggestions) superan los movimientos coincidentes registrados (sameDayMatchingMovements), probablemente es distinct.",
    "Senales como remitentes distintos en el texto tambien indican distinct.",
    "Si no puedes decidir con confianza, responde unknown.",
    'Responde SOLO JSON: {"verdict":"duplicate"|"distinct"|"unknown","reason":"<una frase en espanol>"}',
    "",
    "Notificacion detectada:",
    JSON.stringify(body.suggestion),
    "Movimiento ya registrado (candidato a duplicado):",
    JSON.stringify(body.candidateMovement),
    "Conteos del dia:",
    JSON.stringify(body.counts),
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
      surface: USAGE_SURFACE,
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
      max_tokens: 320,
      response_format: { type: "json_object" },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
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
    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const body = await readJsonBody(req);

    const workspaceId = numberFromBody(body.workspaceId);
    const suggestion = parseSuggestion(body.suggestion);
    const candidateMovement = parseCandidateMovement(body.candidateMovement);
    const counts = parseCounts(body.counts);
    if (!workspaceId || !suggestion || !candidateMovement || !counts) {
      return jsonResponse({ ok: false, error: "Datos incompletos para verificar el duplicado." }, 400);
    }

    const isMember = await assertWorkspaceMember(client, user.id, workspaceId);
    if (!isMember) return jsonResponse({ ok: false, error: "No tienes acceso a este workspace." }, 403);

    const isPro = await hasProAccess(client, user);
    if (!isPro) return jsonResponse({ verdict: "skipped", reason: null, source: "entitlement" });

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY")?.trim();
    const model = Deno.env.get("DEEPSEEK_MODEL")?.trim() || "deepseek-v4-flash";
    if (!apiKey) return jsonResponse({ ok: false, error: "Falta configurar DEEPSEEK_API_KEY." }, 500);

    const usageDate = usageDateInLima();
    const usedToday = await usageCount(client, user.id, usageDate);
    if (usedToday >= DAILY_LIMIT) {
      return jsonResponse({ verdict: "unknown", reason: "limite diario", source: "limit" });
    }

    const prompt = buildPrompt({ workspaceId, suggestion, candidateMovement, counts });
    const rawReply = await requestDeepSeek(apiKey, model, prompt);
    const { verdict, reason } = normalizeVerdict(rawReply);

    await recordUsage({
      client,
      userId: user.id,
      workspaceId,
      usageDate,
      model,
      latencyMs: Date.now() - startedAt,
    });

    return jsonResponse({ verdict, reason, source: "deepseek" });
  } catch (error) {
    console.error("[movement-duplicate-ai-check]", error);
    const message = error instanceof Error ? error.message : "No se pudo verificar el duplicado.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
