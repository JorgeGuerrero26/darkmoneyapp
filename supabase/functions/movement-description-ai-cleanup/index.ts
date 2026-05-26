/**
 * Deploy:
 *   npx supabase functions deploy movement-description-ai-cleanup --project-ref <project-ref>
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

type Surface = "movement_form" | "notification_form" | "android_overlay";

type LocalCleanup = {
  cleanedDescription: string;
  confidence: number;
  reasons: string[];
} | null;

const FEATURE_KEY = "movement-description-ai-cleanup";
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

function sanitizeSurface(value: unknown): Surface {
  return value === "notification_form" || value === "android_overlay" ? value : "movement_form";
}

function sanitizeInlineText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function sanitizeReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const reasons: string[] = [];
  for (const entry of value) {
    const reason = sanitizeInlineText(entry, 120);
    if (reason.length < 3) continue;
    reasons.push(reason);
    if (reasons.length >= 3) break;
  }
  return reasons;
}

function sanitizeLocalCleanup(value: unknown): LocalCleanup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const cleanedDescription = sanitizeInlineText(row.cleanedDescription, 80);
  const rawConfidence = Number(row.confidence ?? 0);
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
  if (cleanedDescription.length < 4) return null;
  return {
    cleanedDescription,
    confidence,
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

function normalizeCleanup(rawReply: string) {
  const fallback = { cleanedDescription: null as string | null, confidence: 0, reasons: [] as string[] };
  const jsonText = extractJsonObject(rawReply);
  if (!jsonText) return fallback;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const cleanedDescription = sanitizeInlineText(parsed.cleanedDescription, 80);
    const rawConfidence = Number(parsed.confidence ?? 0);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
    if (cleanedDescription.length < 4) return fallback;
    return {
      cleanedDescription,
      confidence,
      reasons: sanitizeReasons(parsed.reasons),
    };
  } catch {
    return fallback;
  }
}

function buildPrompt(input: {
  surface: Surface;
  rawDescription: string;
  appLabel: string | null;
  financialAppKey: string | null;
  amount: number | null;
  currencyCode: string;
  localCleanup: LocalCleanup;
}) {
  return [
    "Eres el limpiador de descripciones financieras de DarkMoney.",
    "Convierte textos crudos de bancos, Yape, Plin o billeteras en una descripcion humana, corta y neutral.",
    "No inventes personas, marcas ni comercios que no aparezcan o no se puedan inferir claramente.",
    "Quita telefonos, codigos, fechas, numeros de operacion, montos y ruido bancario.",
    "Si solo detectas el tipo de comercio, usa una frase generica como 'Compra en botica'.",
    "No menciones IA, DeepSeek ni el proveedor.",
    "Prohibicion: no uses palabras como 'movimiento', 'transaccion' ni 'operacion' en la descripcion final.",
    "",
    "Reglas segun financialAppKey:",
    "- yape / plin: si aparece un nombre de persona, usalo (ej: 'Pago a Maria Torres'). Si no hay nombre claro, usa 'Transferencia Yape' o 'Transferencia Plin'.",
    "- bcp / bbva / interbank / scotiabank: extrae el nombre del comercio de 'CONSUMO [NOMBRE]' o 'Compra en [NOMBRE]'.",
    "- gmail_financial: el texto ya viene parcialmente limpio; enfocate en extraer comercio o descripcion principal.",
    "",
    "Regla para localCleanup: si localCleanup.confidence >= 0.75, confirma o mejora levemente esa descripcion en vez de reemplazarla por completo.",
    "",
    "Ejemplos:",
    "PLIN 948*** BOTICAS 13MAY => Compra en botica",
    "YAPE 987*** REST ALEX OP 123456 => Comida en Restaurante Alex",
    "BCP Consumo SUPERMERCADOS METRO CUSCO 15MAY => Compra en supermercado",
    "YAPE 999*** SERVICIOS CLARO SAC OP 99999 => Pago de internet Claro",
    "PLIN 901*** GYM BODYTECH OP 87654 => Mensualidad de gimnasio",
    "BCP Abono SUELDO EMPRESA SA 01JUN => Ingreso de sueldo",
    "INTERBANK CONSUMO RAPPI PERU SAC => Pedido por delivery Rappi",
    "BCP CONSUMO NETFLIX.COM 16MAY => Suscripcion Netflix",
    "BBVA Transferencia enviada JOSE GARCIA 948*** => Transferencia a Jose Garcia",
    "YAPE Pago recibido de ANA TORRES => Cobro de Ana Torres",
    "BCP OP 77543 REF 12345 16MAY => null",
    "",
    "Devuelve solo JSON valido con esta forma exacta:",
    '{"cleanedDescription":"descripcion"|null,"confidence":0.0,"reasons":["razon breve"]}',
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
      max_tokens: 220,
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
    const surface = sanitizeSurface(body.surface);
    const rawDescription = sanitizeInlineText(body.rawDescription, 300);
    const appLabel = sanitizeInlineText(body.appLabel, 80) || null;
    const financialAppKey = sanitizeInlineText(body.financialAppKey, 40) || null;
    const amountRaw = Number(body.amount ?? 0);
    const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;
    const currencyCode = typeof body.currencyCode === "string" ? body.currencyCode.trim().toUpperCase().slice(0, 8) : "PEN";
    const localCleanup = sanitizeLocalCleanup(body.localCleanup);

    if (!workspaceId) return jsonResponse({ ok: false, error: "No se encontro el workspace." }, 400);
    if (rawDescription.length < 4) {
      return jsonResponse({ ok: true, cleanedDescription: null, confidence: 0, reasons: [], model });
    }

    const isMember = await assertWorkspaceMember(client, user.id, workspaceId);
    if (!isMember) return jsonResponse({ ok: false, error: "No tienes acceso a este workspace." }, 403);

    const isPro = await hasProAccess(client, user);
    if (!isPro) return jsonResponse({ ok: false, error: "Disponible solo para usuarios Pro." }, 403);

    const usageDate = usageDateInLima();
    const usedToday = await usageCount(client, user.id, usageDate);
    if (usedToday >= DAILY_LIMIT) {
      return jsonResponse({ ok: false, error: "Limite diario de limpiezas IA alcanzado." }, 429);
    }

    const prompt = buildPrompt({
      surface,
      rawDescription,
      appLabel,
      financialAppKey,
      amount,
      currencyCode,
      localCleanup,
    });
    const rawReply = await requestDeepSeek(apiKey, model, prompt);
    const cleanup = normalizeCleanup(rawReply);
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
      cleanedDescription: cleanup.cleanedDescription,
      confidence: cleanup.confidence,
      reasons: cleanup.reasons,
      model,
    });
  } catch (error) {
    console.error("[movement-description-ai-cleanup]", error);
    const message = error instanceof Error ? error.message : "No se pudo limpiar la descripcion.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
