/**
 * Deploy:
 *   npx supabase functions deploy movement-category-ai-suggestion --project-ref <project-ref>
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

type MovementType = "expense" | "income";
type Surface = "movement_form" | "notification_form" | "android_overlay";
type CategoryInput = {
  id: number;
  name: string;
  kind: "expense" | "income" | "both";
};
type LocalSuggestion = {
  categoryId: number | null;
  categoryName: string | null;
  confidence: number | null;
  reasons: string[];
} | null;
type AiRecommendation = {
  type: "existing_category" | "new_category" | "none";
  categoryId: number | null;
  categoryName: string | null;
  newCategoryName: string | null;
  confidence: number;
  reasons: string[];
};

const FEATURE_KEY = "movement-category-ai-suggestion";
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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function sanitizeMovementType(value: unknown): MovementType {
  return value === "income" ? "income" : "expense";
}

function sanitizeSurface(value: unknown): Surface {
  return value === "notification_form" || value === "android_overlay" ? value : "movement_form";
}

function sanitizeCategories(value: unknown, movementType: MovementType): CategoryInput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const compatibleKind = movementType === "income" ? "income" : "expense";
  const categories: CategoryInput[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = numberFromBody(row.id);
    const name = typeof row.name === "string" ? row.name.trim().replace(/\s+/g, " ") : "";
    const kind = row.kind === "income" || row.kind === "both" ? row.kind : "expense";
    if (!id || !name || seen.has(id)) continue;
    if (kind !== "both" && kind !== compatibleKind) continue;
    seen.add(id);
    categories.push({ id, name: name.slice(0, 80), kind });
    if (categories.length >= 80) break;
  }

  return categories;
}

function sanitizeReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const reasons: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const reason = entry.trim().replace(/\s+/g, " ");
    if (reason.length < 3) continue;
    reasons.push(reason.slice(0, 120));
    if (reasons.length >= 3) break;
  }
  return reasons;
}

function sanitizeLocalSuggestion(value: unknown, categories: CategoryInput[]): LocalSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const categoryId = numberFromBody(row.categoryId);
  const category = categoryId ? categories.find((item) => item.id === categoryId) : null;
  if (!category) return null;
  const rawConfidence = Number(row.confidence ?? 0);
  return {
    categoryId: category.id,
    categoryName: category.name,
    confidence: Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : null,
    reasons: sanitizeReasons(row.reasons),
  };
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

function normalizeRecommendation(raw: string, categories: CategoryInput[]): AiRecommendation {
  const fallback: AiRecommendation = {
    type: "none",
    categoryId: null,
    categoryName: null,
    newCategoryName: null,
    confidence: 0,
    reasons: [],
  };
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return fallback;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const type = parsed.type === "existing_category" || parsed.type === "new_category" ? parsed.type : "none";
    const rawConfidence = Number(parsed.confidence ?? 0);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
    const reasons = sanitizeReasons(parsed.reasons);

    if (type === "existing_category") {
      const categoryId = numberFromBody(parsed.categoryId);
      const category = categoryId ? categories.find((item) => item.id === categoryId) : null;
      if (!category) return fallback;
      return {
        type,
        categoryId: category.id,
        categoryName: category.name,
        newCategoryName: null,
        confidence,
        reasons: reasons.length ? reasons : ["coincide con tus categorias actuales"],
      };
    }

    if (type === "new_category") {
      const rawName = typeof parsed.newCategoryName === "string" ? parsed.newCategoryName : "";
      const newCategoryName = rawName.trim().replace(/\s+/g, " ").slice(0, 48);
      if (newCategoryName.length < 3) return fallback;
      const duplicate = categories.find((item) => normalizeText(item.name) === normalizeText(newCategoryName));
      if (duplicate) {
        return {
          type: "existing_category",
          categoryId: duplicate.id,
          categoryName: duplicate.name,
          newCategoryName: null,
          confidence,
          reasons: reasons.length ? reasons : ["la categoria ya existe con un nombre equivalente"],
        };
      }
      return {
        type,
        categoryId: null,
        categoryName: null,
        newCategoryName,
        confidence,
        reasons: reasons.length ? reasons : ["no hay una categoria existente suficientemente especifica"],
      };
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function buildPrompt(input: {
  surface: Surface;
  movementType: MovementType;
  amount: number | null;
  currencyCode: string;
  description: string;
  occurredAt: string | null;
  categories: CategoryInput[];
  localSuggestion: LocalSuggestion;
}) {
  return [
    "Eres el clasificador financiero de DarkMoney.",
    "Debes recomendar una categoria para un movimiento usando solo los datos recibidos.",
    "No inventes IDs. Si eliges una categoria existente, categoryId debe estar en categories.",
    "Si ninguna categoria existente encaja bien, puedes proponer una nueva categoria corta y clara.",
    "Si la descripcion es insuficiente, responde type none.",
    "No expliques que eres IA ni menciones DeepSeek.",
    "Devuelve solo JSON valido con esta forma exacta:",
    '{"type":"existing_category|new_category|none","categoryId":123|null,"categoryName":"nombre"|null,"newCategoryName":"nombre"|null,"confidence":0.0,"reasons":["razon breve"]}',
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
  surface: Surface;
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
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY")?.trim();
    const model = Deno.env.get("DEEPSEEK_MODEL")?.trim() || "deepseek-v4-flash";
    if (!apiKey) return jsonResponse({ ok: false, error: "Falta configurar DEEPSEEK_API_KEY." }, 500);

    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const body = await readJsonBody(req);
    const workspaceId = numberFromBody(body.workspaceId);
    const movementType = sanitizeMovementType(body.movementType);
    const surface = sanitizeSurface(body.surface);
    const description = typeof body.description === "string" ? body.description.trim().replace(/\s+/g, " ") : "";
    const amountRaw = Number(body.amount ?? 0);
    const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;
    const currencyCode = typeof body.currencyCode === "string" ? body.currencyCode.trim().toUpperCase().slice(0, 8) : "PEN";
    const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : null;
    const categories = sanitizeCategories(body.categories, movementType);
    const localSuggestion = sanitizeLocalSuggestion(body.localSuggestion, categories);

    if (!workspaceId) return jsonResponse({ ok: false, error: "No se encontro el workspace." }, 400);
    if (description.length < 3) return jsonResponse({ ok: true, recommendation: null, model });
    if (categories.length === 0) return jsonResponse({ ok: true, recommendation: null, model });

    const isMember = await assertWorkspaceMember(client, user.id, workspaceId);
    if (!isMember) return jsonResponse({ ok: false, error: "No tienes acceso a este workspace." }, 403);

    const isPro = await hasProAccess(client, user);
    if (!isPro) return jsonResponse({ ok: false, error: "Disponible solo para usuarios Pro." }, 403);

    const usageDate = usageDateInLima();
    const usedToday = await usageCount(client, user.id, usageDate);
    if (usedToday >= DAILY_LIMIT) {
      return jsonResponse({ ok: false, error: "Limite diario de sugerencias IA alcanzado." }, 429);
    }

    const prompt = buildPrompt({
      surface,
      movementType,
      amount,
      currencyCode,
      description,
      occurredAt,
      categories,
      localSuggestion,
    });
    const rawReply = await requestDeepSeek(apiKey, model, prompt);
    const recommendation = normalizeRecommendation(rawReply, categories);
    await recordUsage({
      client,
      userId: user.id,
      workspaceId,
      usageDate,
      model,
      surface,
      latencyMs: Date.now() - startedAt,
    });

    return jsonResponse({
      ok: true,
      recommendation: recommendation.type === "none" ? null : recommendation,
      model,
    });
  } catch (error) {
    console.error("[movement-category-ai-suggestion]", error);
    const message = error instanceof Error ? error.message : "No se pudo calcular la sugerencia IA.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
