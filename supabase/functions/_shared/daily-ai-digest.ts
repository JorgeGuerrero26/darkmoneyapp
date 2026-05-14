const FEATURE_KEY = "daily-ai-digest";
const DAILY_LIMIT = 5;
const FALLBACK_PRO_EMAILS = new Set(["joradrianmori@gmail.com"]);

type SupabaseLikeClient = {
  from: (table: string) => any;
  auth?: {
    admin?: {
      getUserById?: (userId: string) => Promise<{ data?: { user?: { email?: string | null } | null }; error?: unknown }>;
    };
  };
};

export type DailyAiDigestSourceNotification = {
  kind: string | null;
  title?: string | null;
  body?: string | null;
  payload?: unknown;
  related_entity_type?: string | null;
  related_entity_id?: number | null;
};

export type DailyAiDigestResult = {
  ok: boolean;
  digest: {
    title: string;
    body: string;
    summary: string;
    highlights: string[];
    actionItems: string[];
    confidence: number;
    workspaceId: number | null;
  } | null;
  model: string;
  skipped?: string;
  error?: string;
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

function trimText(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function sanitizeTextList(value: unknown, maxItems = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, 140))
    .filter((item) => item.length >= 3)
    .slice(0, maxItems);
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

function workspaceIdFromNotifications(notifications: DailyAiDigestSourceNotification[]): number | null {
  for (const notification of notifications) {
    const payload = notification.payload && typeof notification.payload === "object" && !Array.isArray(notification.payload)
      ? notification.payload as Record<string, unknown>
      : null;
    const payloadWorkspaceId = Number(payload?.workspaceId);
    if (Number.isFinite(payloadWorkspaceId) && payloadWorkspaceId > 0) return payloadWorkspaceId;
    const relatedId = Number(notification.related_entity_id);
    if (notification.related_entity_type === "workspace" && Number.isFinite(relatedId) && relatedId > 0) return relatedId;
  }
  return null;
}

function compactNotifications(notifications: DailyAiDigestSourceNotification[]) {
  return notifications.slice(0, 12).map((notification) => {
    const payload = notification.payload && typeof notification.payload === "object" && !Array.isArray(notification.payload)
      ? notification.payload as Record<string, unknown>
      : {};
    return {
      kind: trimText(notification.kind, 50),
      title: trimText(notification.title, 90),
      body: trimText(notification.body, 180),
      entityType: trimText(notification.related_entity_type, 50),
      entityId: Number(notification.related_entity_id) || null,
      payload: Object.fromEntries(
        Object.entries(payload)
          .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
          .slice(0, 8),
      ),
    };
  });
}

function normalizeDigest(raw: string, workspaceId: number | null) {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const summary = trimText(parsed.summary, 220);
    const highlights = sanitizeTextList(parsed.highlights, 4);
    const actionItems = sanitizeTextList(parsed.actionItems, 3);
    const rawConfidence = Number(parsed.confidence ?? 0);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
    const title = trimText(parsed.title, 64) || "Resumen inteligente del día";
    const body = trimText(parsed.body, 190) || summary || highlights[0] || "Tu resumen financiero diario está listo.";
    if (!summary && highlights.length === 0 && actionItems.length === 0) return null;
    return {
      title,
      body,
      summary: summary || body,
      highlights,
      actionItems,
      confidence,
      workspaceId,
    };
  } catch {
    return null;
  }
}

function buildPrompt(input: unknown) {
  return [
    "Eres el asistente financiero de DarkMoney.",
    "Crea un resumen diario breve y util para un usuario PRO a partir de sus notificaciones financieras del dia.",
    "Prioriza alertas accionables: presupuestos, flujo, anomalías, recurrencias, suscripciones, obligaciones y movimientos detectados.",
    "No inventes montos, categorias, movimientos ni IDs. Si falta contexto, habla en terminos generales.",
    "No menciones IA, DeepSeek ni el proveedor.",
    "El tono debe ser directo, claro y no alarmista.",
    "Devuelve solo JSON valido con esta forma exacta:",
    '{"title":"titulo corto","body":"texto push corto","summary":"resumen de 1 frase","highlights":["punto clave"],"actionItems":["accion sugerida"],"confidence":0.0}',
    "",
    "Datos:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

async function authEmailForUser(client: SupabaseLikeClient, userId: string): Promise<string | null> {
  if (!client.auth?.admin?.getUserById) return null;
  const { data } = await client.auth.admin.getUserById(userId).catch(() => ({ data: null }));
  return typeof data?.user?.email === "string" ? data.user.email : null;
}

async function hasProAccess(client: SupabaseLikeClient, userId: string, email?: string | null) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const fallback = normalizedEmail ? FALLBACK_PRO_EMAILS.has(normalizedEmail) : false;
  const { data, error } = await client
    .from("user_entitlements")
    .select("plan_code, pro_access_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error, "user_entitlements")) return fallback;
    throw error;
  }
  if (!data) return fallback;
  return data.pro_access_enabled === true || data.plan_code === "pro" || fallback;
}

async function assertWorkspaceMember(client: SupabaseLikeClient, userId: string, workspaceId: number | null) {
  if (!workspaceId) return true;
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function usageCount(client: SupabaseLikeClient, userId: string, usageDate: string) {
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
  client: SupabaseLikeClient;
  userId: string;
  workspaceId: number | null;
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
      temperature: 0.1,
      max_tokens: 340,
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

export async function generateDailyAiDigest(input: {
  client: SupabaseLikeClient;
  userId: string;
  userEmail?: string | null;
  digestDate?: string;
  notifications: DailyAiDigestSourceNotification[];
  topicLabels?: string[];
  surface?: string;
}): Promise<DailyAiDigestResult> {
  const startedAt = Date.now();
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY")?.trim();
  const model = Deno.env.get("DEEPSEEK_MODEL")?.trim() || "deepseek-v4-flash";
  const digestDate = input.digestDate || usageDateInLima();
  const notifications = input.notifications.filter((item) => trimText(item.kind, 50));
  const workspaceId = workspaceIdFromNotifications(notifications);

  try {
    if (!apiKey) return { ok: false, digest: null, model, skipped: "missing_api_key" };
    if (notifications.length === 0) return { ok: true, digest: null, model, skipped: "no_notifications" };

    const userEmail = input.userEmail ?? await authEmailForUser(input.client, input.userId);
    const isPro = await hasProAccess(input.client, input.userId, userEmail);
    if (!isPro) return { ok: true, digest: null, model, skipped: "not_pro" };

    const isMember = await assertWorkspaceMember(input.client, input.userId, workspaceId);
    if (!isMember) return { ok: false, digest: null, model, error: "workspace_access_denied" };

    const usedToday = await usageCount(input.client, input.userId, digestDate);
    if (usedToday >= DAILY_LIMIT) return { ok: false, digest: null, model, skipped: "daily_limit" };

    const prompt = buildPrompt({
      digestDate,
      notificationCount: notifications.length,
      topicLabels: input.topicLabels?.slice(0, 5) ?? [],
      notifications: compactNotifications(notifications),
    });
    const rawReply = await requestDeepSeek(apiKey, model, prompt);
    const digest = normalizeDigest(rawReply, workspaceId);
    await recordUsage({
      client: input.client,
      userId: input.userId,
      workspaceId,
      usageDate: digestDate,
      model,
      surface: input.surface || "daily_digest",
      latencyMs: Date.now() - startedAt,
    });
    return { ok: true, digest, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el resumen inteligente.";
    return { ok: false, digest: null, model, error: message };
  }
}
