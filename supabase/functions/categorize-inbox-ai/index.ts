/**
 * Propone categoría para los grupos de la bandeja "Sin categoría" que los patrones locales no
 * saben resolver.
 *
 * **Por lotes, no de uno en uno.** La bandeja agrupa 118 movimientos en 74 grupos; preguntar por
 * cada uno serían 74 llamadas de ~7 s y 74 registros de uso para una sola sesión de limpieza. Va
 * una llamada con hasta 25 etiquetas y vuelve con las 25 propuestas: es la misma razón por la
 * que la pantalla agrupa en vez de listar.
 *
 * **Solo para lo que los patrones no resuelven.** Si has puesto "Moto" en Transporte veinte
 * veces, eso lo sabe el teléfono gratis y sin señal. Aquí llegan las que no tienen historial
 * suficiente, que son justo las que un modelo puede reconocer por el nombre del comercio.
 *
 * Deploy:
 *   npx supabase functions deploy categorize-inbox-ai --project-ref <project-ref>
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
import { isFallbackProEmail } from "../_shared/admin-emails.ts";

type CategoryInput = { id: number; name: string; kind: "expense" | "income" | "both" };
type GroupInput = { key: string; label: string; count: number; total: number };
type Suggestion = { key: string; categoryId: number; confidence: number; reason: string };

const FEATURE_KEY = "categorize-inbox-ai";
/** Una llamada por lote, no por grupo: con 20 al día se limpia una bandeja entera. */
const DAILY_LIMIT = 20;
/** Techo de grupos por llamada. Más no cabe en un prompt legible ni en una sesión de limpieza. */
const MAX_GROUPS = 25;

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
    (message.includes("does not exist") || message.includes("not find"));
}

function sanitizeCategories(raw: unknown): CategoryInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CategoryInput[] = [];
  for (const item of raw) {
    const id = Number((item as { id?: unknown })?.id);
    const name = String((item as { name?: unknown })?.name ?? "").trim();
    const kindRaw = String((item as { kind?: unknown })?.kind ?? "both");
    if (!Number.isFinite(id) || id <= 0 || !name) continue;
    const kind = kindRaw === "expense" || kindRaw === "income" ? kindRaw : "both";
    out.push({ id, name: name.slice(0, 60), kind });
    if (out.length >= 80) break;
  }
  return out;
}

function sanitizeGroups(raw: unknown): GroupInput[] {
  if (!Array.isArray(raw)) return [];
  const out: GroupInput[] = [];
  for (const item of raw) {
    const key = String((item as { key?: unknown })?.key ?? "").trim();
    const label = String((item as { label?: unknown })?.label ?? "").trim().replace(/\s+/g, " ");
    if (!key || label.length < 3) continue;
    const count = Number((item as { count?: unknown })?.count);
    const total = Number((item as { total?: unknown })?.total);
    out.push({
      key: key.slice(0, 120),
      label: label.slice(0, 80),
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
      total: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0,
    });
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}

function buildPrompt(groups: GroupInput[], categories: CategoryInput[]) {
  return [
    "Eres un asistente de finanzas personales en Peru. Clasificas gastos e ingresos ya ocurridos.",
    "",
    "Reglas:",
    "- Elige SOLO entre las categorias dadas, por su id. No inventes categorias nuevas.",
    "- Si el texto no permite decidir con seguridad, omite ese grupo. Es preferible no proponer.",
    "- 'confidence' entre 0 y 1: cuanta seguridad tienes de que esa categoria es la correcta.",
    "- 'reason' de menos de 8 palabras, en espanol, sin repetir el nombre de la categoria.",
    "- Los nombres suelen ser comercios peruanos, apps de delivery o transporte.",
    "",
    "Categorias disponibles:",
    JSON.stringify(categories, null, 0),
    "",
    "Grupos a clasificar (label = lo que el usuario escribio, count = cuantas veces, total = suma):",
    JSON.stringify(groups, null, 0),
    "",
    "Devuelve SOLO JSON valido con esta forma exacta:",
    '{"suggestions":[{"key":"<key del grupo>","categoryId":123,"confidence":0.0,"reason":"texto breve"}]}',
  ].join("\n");
}

function normalizeSuggestions(raw: string, groups: GroupInput[], categories: CategoryInput[]): Suggestion[] {
  let parsed: unknown;
  try {
    const match = /\{[\s\S]*\}/.exec(raw);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    return [];
  }
  const list = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];

  const validKeys = new Set(groups.map((group) => group.key));
  const validCategories = new Set(categories.map((category) => category.id));
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const item of list) {
    const key = String((item as { key?: unknown })?.key ?? "").trim();
    const categoryId = Number((item as { categoryId?: unknown })?.categoryId);
    // Nada que no venga del lote y del catalogo: el modelo no decide el universo, solo elige.
    if (!validKeys.has(key) || seen.has(key) || !validCategories.has(categoryId)) continue;
    const confidenceRaw = Number((item as { confidence?: unknown })?.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0.5;
    const reason = String((item as { reason?: unknown })?.reason ?? "").trim().slice(0, 80);
    seen.add(key);
    out.push({ key, categoryId, confidence, reason });
  }
  return out;
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
      surface: "categorize_inbox",
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
      // Mismo par de mensajes que la sugerencia suelta, que lleva meses respondiendo JSON limpio.
      messages: [
        { role: "system", content: "Responde siempre como JSON valido y nada mas." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      // Veinticinco propuestas con su razon no caben en el techo de una sugerencia suelta (320).
      max_tokens: 1600,
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
    const groups = sanitizeGroups(body.groups);
    const categories = sanitizeCategories(body.categories);

    if (!workspaceId) return jsonResponse({ ok: false, error: "No se encontro el workspace." }, 400);
    if (groups.length === 0 || categories.length === 0) {
      return jsonResponse({ ok: true, suggestions: [], model });
    }

    const isMember = await assertWorkspaceMember(client, user.id, workspaceId);
    if (!isMember) return jsonResponse({ ok: false, error: "No tienes acceso a este workspace." }, 403);

    const isPro = await hasProAccess(client, user);
    if (!isPro) return jsonResponse({ ok: false, error: "Disponible solo para usuarios Pro." }, 403);

    const usageDate = usageDateInLima();
    const usedToday = await usageCount(client, user.id, usageDate);
    if (usedToday >= DAILY_LIMIT) {
      return jsonResponse({ ok: false, error: "Limite diario de sugerencias IA alcanzado." }, 429);
    }

    const rawReply = await requestDeepSeek(apiKey, model, buildPrompt(groups, categories));
    const suggestions = normalizeSuggestions(rawReply, groups, categories);
    await recordUsage({ client, userId: user.id, workspaceId, usageDate, model, latencyMs: Date.now() - startedAt });

    return jsonResponse({ ok: true, suggestions, model });
  } catch (error) {
    console.error("[categorize-inbox-ai]", error);
    const message = error instanceof Error ? error.message : "No se pudieron calcular las sugerencias.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
