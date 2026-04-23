/**
 * Deploy:
 *   npx supabase functions deploy dashboard-advanced-ai-flow --project-ref <project-ref>
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY
 *
 * Optional secret:
 *   GEMINI_MODEL
 */

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  numberFromBody,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";

function sanitizeSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .slice(0, 64);
  return Object.fromEntries(entries);
}

function formatSummary(summary: Record<string, unknown>) {
  return JSON.stringify(summary, null, 2);
}

type DashboardAiTone = "managerial" | "personal";
type DashboardAiComplexTerm = {
  term: string;
  explanation: string;
};
type DashboardAiStructuredReply = {
  reply: string;
  complexTerms: DashboardAiComplexTerm[];
};
const DASHBOARD_AI_ADMIN_EMAIL = "joradrianmori@gmail.com";
const DASHBOARD_AI_FEATURE_KEY = "dashboard-advanced-ai-flow";

function sanitizeTone(value: unknown): DashboardAiTone {
  return value === "personal" ? "personal" : "managerial";
}

function toneLabel(tone: DashboardAiTone) {
  return tone === "personal" ? "asesor financiero personal" : "informe gerencial";
}

function usageDateInLima(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function recommendationLine(summary: Record<string, unknown>) {
  const paymentOptimizationTop = Array.isArray(summary.paymentOptimizationTop)
    ? summary.paymentOptimizationTop[0] as Record<string, unknown> | undefined
    : undefined;
  const optimizationTitle = paymentOptimizationTop && typeof paymentOptimizationTop.title === "string"
    ? paymentOptimizationTop.title
    : null;
  const weekStatus = typeof summary.weekStatus === "string" ? summary.weekStatus : null;
  return `Recomendación inmediata: ${optimizationTitle ?? weekStatus ?? "revisar primero la presión de caja y los compromisos cercanos"}.`;
}

function buildPrompt(summary: Record<string, unknown>, tone: DashboardAiTone, mode: "normal" | "strict" = "normal") {
  const extraInstruction = mode === "strict"
    ? [
        "La respuesta anterior quedo demasiado corta o incompleta.",
        "Ahora debes responder con 3 parrafos completos dentro del campo reply, sin listas, sin markdown y sin asteriscos.",
        "Cada parrafo debe tener al menos 2 oraciones.",
      ].join("\n")
    : "Responde con 3 parrafos breves dentro del campo reply, sin markdown y sin asteriscos.";
  const toneInstruction = tone === "personal"
    ? [
        "Escribe como un asesor financiero personal.",
        "Haz que el texto se sienta cercano, claro y orientado a ayudar al usuario a entender su caja y sus pagos sin sonar informal.",
        "Usa palabras simples y fáciles de entender.",
        "Si necesitas mencionar un término financiero, explícalo en la misma frase con lenguaje común.",
      ].join("\n")
    : [
        "Escribe como un informe gerencial breve.",
        "Haz que el texto se sienta ejecutivo, ordenado y orientado a lectura de decisión.",
      ].join("\n");
  return [
    "Eres un analista financiero senior de DarkMoney especializado en flujo de caja.",
    "Tu trabajo es interpretar caja visible, agenda comprometida, proyección y presión de pagos usando solo el resumen recibido.",
    "No inventes datos. Usa solo el resumen recibido.",
    "Responde en texto plano, con redacción sobria, precisa y útil.",
    toneInstruction,
    extraInstruction,
    "Estructura obligatoria de fondo:",
    "Parrafo 1: lectura del flujo cercano y del estado actual de caja.",
    "Parrafo 2: implicancia de la proyección, compromisos y riesgos inmediatos.",
    "Parrafo 3: acción concreta o prioridad que conviene cuidar primero.",
    "Mantén la respuesta entre 120 y 200 palabras.",
    "No hables de modelos, IA, Gemini ni de limitaciones técnicas.",
    "No empieces con títulos como 'Flujo', 'Respuesta' o 'Acción sugerida'.",
    "No uses emojis, frases promocionales, muletillas ni lenguaje demasiado coloquial.",
    "Escribe como un asesor financiero serio, no como un chatbot.",
    "Cierra siempre con una última línea independiente dentro de reply que empiece exactamente con 'Recomendación inmediata:' y contenga una sola recomendación concreta.",
    "Devuelve solo JSON valido. No agregues texto fuera del JSON.",
    "Usa exactamente esta estructura:",
    "{",
    '  "reply": "texto con 3 parrafos y la línea final de recomendación",',
    '  "complexTerms": [',
    '    { "term": "termino exacto usado en reply", "explanation": "explicacion breve y simple" }',
    "  ]",
    "}",
    "Reglas para complexTerms:",
    "Incluye entre 3 y 6 términos siempre que reply tenga suficientes expresiones útiles para explicar.",
    "Cada term debe aparecer literalmente dentro de reply con la misma escritura.",
    "Incluye solo términos o expresiones que puedan ser difíciles para un usuario común.",
    "No repitas términos.",
    "Cada explanation debe explicar el término con palabras simples en una sola oración corta.",
    "",
    "Resumen estructurado de flujo del dashboard avanzado:",
    formatSummary(summary),
  ].join("\n");
}

function normalizeReply(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineText(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeComplexTerms(value: unknown, reply: string): DashboardAiComplexTerm[] {
  if (!Array.isArray(value) || !reply) return [];
  const normalizedReply = reply.toLocaleLowerCase("es");
  const seen = new Set<string>();
  const terms: DashboardAiComplexTerm[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rawTerm = typeof (entry as Record<string, unknown>).term === "string"
      ? (entry as Record<string, unknown>).term
      : "";
    const rawExplanation = typeof (entry as Record<string, unknown>).explanation === "string"
      ? (entry as Record<string, unknown>).explanation
      : "";
    const term = normalizeInlineText(rawTerm).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
    const explanation = normalizeInlineText(rawExplanation);
    if (term.length < 3 || term.length > 80 || explanation.length < 8 || explanation.length > 220) continue;
    if (!normalizedReply.includes(term.toLocaleLowerCase("es"))) continue;
    const key = term.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push({ term, explanation });
    if (terms.length >= 6) break;
  }

  return terms;
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

function parseStructuredReply(raw: string): DashboardAiStructuredReply {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    const reply = normalizeReply(raw);
    return { reply, complexTerms: [] };
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const reply = normalizeReply(typeof parsed.reply === "string" ? parsed.reply : "");
    return {
      reply,
      complexTerms: sanitizeComplexTerms(parsed.complexTerms, reply),
    };
  } catch {
    const reply = normalizeReply(raw);
    return { reply, complexTerms: [] };
  }
}

function ensureRecommendationLine(reply: string, summary: Record<string, unknown>) {
  if (/^Recomendación inmediata:/m.test(reply)) return reply;
  return `${reply}\n\n${recommendationLine(summary)}`.trim();
}

function hasEnoughParagraphs(reply: string) {
  const withoutRecommendation = reply
    .split("\n")
    .filter((line) => !line.trim().startsWith("Recomendación inmediata:"))
    .join("\n")
    .trim();
  const paragraphs = withoutRecommendation
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  return paragraphs.length >= 3;
}

function isReplyInsufficient(reply: string) {
  const text = reply.trim();
  if (text.length < 140) return true;
  const sentenceCount = text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length;
  if (sentenceCount < 4) return true;
  if (!hasEnoughParagraphs(text)) return true;
  if (!/^Recomendación inmediata:/m.test(text)) return true;
  return false;
}

function fallbackReply(summary: Record<string, unknown>, tone: DashboardAiTone) {
  const currentVisibleBalance = typeof summary.currentVisibleBalance === "string" ? summary.currentVisibleBalance : "N/D";
  const weekNet = typeof summary.weekNet === "string" ? summary.weekNet : "N/D";
  const weekStatus = typeof summary.weekStatus === "string" ? summary.weekStatus : "sin lectura disponible";
  const monthEndReading = typeof summary.monthEndReading === "string" ? summary.monthEndReading : "N/D";
  const conservativeBalance = typeof summary.conservativeBalance === "string" ? summary.conservativeBalance : "N/D";
  const confidencePct = typeof summary.confidencePct === "number" ? summary.confidencePct : null;
  const committedNet = typeof summary.committedNet === "string" ? summary.committedNet : "N/D";
  const variableNet = typeof summary.variableNet === "string" ? summary.variableNet : "N/D";
  const cashCushionDays = typeof summary.cashCushionDays === "number" ? summary.cashCushionDays : null;
  const cashCushionLabel = typeof summary.cashCushionLabel === "string" ? summary.cashCushionLabel : null;

  const body = tone === "personal"
    ? [
        `Hoy tu caja visible está en ${currentVisibleBalance} y la ventana cercana deja un neto de ${weekNet}. Eso hace que tu flujo inmediato se vea ${weekStatus}, porque importa no solo cuánto dinero tienes hoy, sino también cuánto entra y cuánto sale en los próximos días.`,
        `La proyección actual apunta a cerrar el periodo en ${monthEndReading}, con un piso conservador de ${conservativeBalance}${confidencePct != null ? ` y una confianza de ${confidencePct}%` : ""}. Además, la agenda comprometida deja ${committedNet} neto y el ritmo variable reciente aporta ${variableNet}, así que el cierre depende tanto de tus pagos programados como de lo que sigas gastando o cobrando.`,
        `${cashCushionDays != null ? `Con tu caja actual, el sistema estima ${cashCushionDays} días de aire financiero${cashCushionLabel ? `, lo que hoy se interpreta como ${cashCushionLabel.toLowerCase()}` : ""}.` : "La caja disponible sigue siendo el punto clave a vigilar."} Conviene cuidar primero cualquier salida cercana que pueda presionar el flujo antes de que el mes pierda margen.`,
      ].join("\n\n")
    : [
        `La posición actual de caja muestra ${currentVisibleBalance} visibles y un neto cercano de ${weekNet}. En la lectura inmediata, el flujo se clasifica como ${weekStatus}, por lo que la ventana corta ya permite evaluar si la agenda de pagos entra bajo control o con presión.`,
        `La proyección central ubica el cierre en ${monthEndReading}, con un escenario conservador de ${conservativeBalance}${confidencePct != null ? ` y ${confidencePct}% de confianza` : ""}. La agenda comprometida aporta ${committedNet} neto y el componente variable reciente añade ${variableNet}, de modo que la lectura no depende solo del saldo actual sino del comportamiento operativo del resto del periodo.`,
        `${cashCushionDays != null ? `La cobertura actual se estima en ${cashCushionDays} días${cashCushionLabel ? ` y se interpreta como ${cashCushionLabel.toLowerCase()}` : ""}.` : "La cobertura de caja sigue siendo el dato central de vigilancia."} La prioridad recomendada es proteger el margen de caja antes de asumir nuevas salidas o relajar el control sobre compromisos próximos.`,
      ].join("\n\n");

  return ensureRecommendationLine(body, summary);
}

const FALLBACK_COMPLEX_TERM_EXPLANATIONS: Array<DashboardAiComplexTerm> = [
  { term: "caja visible", explanation: "Es el dinero que puedes ver disponible ahora mismo en tus cuentas." },
  { term: "neto", explanation: "Es la diferencia entre lo que entra y lo que sale." },
  { term: "flujo", explanation: "Es cómo se mueve tu dinero entre ingresos y salidas." },
  { term: "proyección", explanation: "Es una estimación de cómo podrías terminar más adelante si sigues igual." },
  { term: "piso conservador", explanation: "Es el escenario prudente o más defensivo de tu cierre esperado." },
  { term: "agenda comprometida", explanation: "Son ingresos y pagos ya previstos o programados." },
  { term: "ritmo variable", explanation: "Es el comportamiento reciente de ingresos y gastos que no son fijos." },
  { term: "margen", explanation: "Es el espacio que te queda para operar sin quedarte corto de dinero." },
  { term: "presión", explanation: "Significa que tus salidas cercanas aprietan tu dinero disponible." },
  { term: "cobertura de caja", explanation: "Es cuántos días podrías seguir pagando con el dinero que ya tienes." },
];

function buildFallbackComplexTerms(reply: string) {
  const normalizedReply = reply.toLocaleLowerCase("es");
  return FALLBACK_COMPLEX_TERM_EXPLANATIONS
    .filter((item) => normalizedReply.includes(item.term.toLocaleLowerCase("es")))
    .slice(0, 6);
}

function ensureMinimumComplexTerms(reply: string, terms: DashboardAiComplexTerm[]) {
  const merged = [...terms];
  const seen = new Set(terms.map((item) => item.term.toLocaleLowerCase("es")));
  const fallbackTerms = buildFallbackComplexTerms(reply);

  for (const item of fallbackTerms) {
    const key = item.term.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 6) break;
  }

  return merged.slice(0, 6);
}

async function requestGeminiReply(apiKey: string, model: string, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 420,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "No se pudo obtener respuesta del modelo.";
    throw new Error(message);
  }

  return parseStructuredReply(payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part?.text ?? "")
    .join("\n")
    .trim() ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Metodo no permitido." }, 405);

  try {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.0-flash";
    if (!geminiApiKey) {
      return jsonResponse({ ok: false, error: "Falta configurar GEMINI_API_KEY." }, 500);
    }

    const client = serviceClient();
    const user = await authenticatedUser(req, client);
    const isAdminUser = user.email?.trim().toLowerCase() === DASHBOARD_AI_ADMIN_EMAIL;
    const usageDate = usageDateInLima();
    const body = await readJsonBody(req);
    const workspaceId = numberFromBody(body.workspaceId);
    const summary = sanitizeSummary(body.summary);
    const tone = sanitizeTone(body.tone);

    if (!workspaceId) {
      return jsonResponse({ ok: false, error: "No se encontro el workspace." }, 400);
    }
    if (Object.keys(summary).length === 0) {
      return jsonResponse({ ok: false, error: "No hay datos de flujo suficientes para analizar." }, 400);
    }

    const { data: membership, error: membershipError } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) {
      return jsonResponse({ ok: false, error: "No tienes acceso a este workspace." }, 403);
    }

    if (!isAdminUser) {
      const { data: existingUsage, error: usageLookupError } = await client
        .from("ai_feature_daily_usage")
        .select("id")
        .eq("feature_key", DASHBOARD_AI_FEATURE_KEY)
        .eq("user_id", user.id)
        .eq("usage_date", usageDate)
        .maybeSingle();
      if (usageLookupError) throw usageLookupError;
      if (existingUsage) {
        return jsonResponse({
          ok: false,
          error: "Ya usaste tu explicación de IA de hoy. Podrás pedir otra mañana.",
        }, 429);
      }
    }

    let structuredReply = await requestGeminiReply(geminiApiKey, model, buildPrompt(summary, tone, "normal"));
    let reply = ensureRecommendationLine(structuredReply.reply, summary);
    let complexTerms = ensureMinimumComplexTerms(reply, sanitizeComplexTerms(structuredReply.complexTerms, reply));

    if (isReplyInsufficient(reply)) {
      structuredReply = await requestGeminiReply(geminiApiKey, model, buildPrompt(summary, tone, "strict"));
      reply = ensureRecommendationLine(structuredReply.reply, summary);
      complexTerms = ensureMinimumComplexTerms(reply, sanitizeComplexTerms(structuredReply.complexTerms, reply));
    }
    if (isReplyInsufficient(reply)) {
      reply = fallbackReply(summary, tone);
      complexTerms = ensureMinimumComplexTerms(reply, buildFallbackComplexTerms(reply));
    }
    reply = ensureRecommendationLine(reply, summary);
    if (complexTerms.length < 3) {
      complexTerms = ensureMinimumComplexTerms(reply, complexTerms);
    }

    if (!reply) {
      return jsonResponse({ ok: false, error: "La IA no devolvio contenido util." }, 502);
    }

    if (!isAdminUser) {
      const { error: usageInsertError } = await client
        .from("ai_feature_daily_usage")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          feature_key: DASHBOARD_AI_FEATURE_KEY,
          usage_date: usageDate,
          tone,
          model,
        });
      if (usageInsertError) {
        if ((usageInsertError as { code?: string }).code === "23505") {
          return jsonResponse({
            ok: false,
            error: "Ya usaste tu explicación de IA de hoy. Podrás pedir otra mañana.",
          }, 429);
        }
        throw usageInsertError;
      }
    }

    return jsonResponse({
      ok: true,
      reply,
      complexTerms,
      model,
      tone: toneLabel(tone),
    });
  } catch (error) {
    console.error("[dashboard-advanced-ai-flow]", error);
    const message = error instanceof Error ? error.message : "No se pudo analizar el flujo.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
