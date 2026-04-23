/**
 * Deploy:
 *   npx supabase functions deploy dashboard-advanced-ai-history --project-ref <project-ref>
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
    .slice(0, 72);
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
const DASHBOARD_AI_FEATURE_KEY = "dashboard-advanced-ai-history";

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
  const changePoint = summary.changePoint && typeof summary.changePoint === "object"
    ? summary.changePoint as Record<string, unknown>
    : null;
  const monthClusters = Array.isArray(summary.monthClusters)
    ? summary.monthClusters as Array<Record<string, unknown>>
    : [];
  const factorAnalysis = summary.factorAnalysis && typeof summary.factorAnalysis === "object"
    ? summary.factorAnalysis as Record<string, unknown>
    : null;
  const changeTitle = changePoint && typeof changePoint.title === "string" ? changePoint.title : null;
  const clusterTitle = monthClusters[0] && typeof monthClusters[0].title === "string" ? monthClusters[0].title : null;
  const factorTitle = factorAnalysis && typeof factorAnalysis.title === "string" ? factorAnalysis.title : null;
  return `Recomendación inmediata: ${changeTitle ?? clusterTitle ?? factorTitle ?? "revisar el tramo del historial donde cambió más tu comportamiento"}.`;
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
        "Haz que el texto se sienta cercano, claro y orientado a ayudar al usuario a entender su evolución financiera sin sonar informal.",
        "Usa palabras simples y fáciles de entender.",
        "Si necesitas mencionar un término analítico, explícalo en la misma frase con lenguaje común.",
      ].join("\n")
    : [
        "Escribe como un informe gerencial breve.",
        "Haz que el texto se sienta ejecutivo, ordenado y orientado a lectura de decisión.",
      ].join("\n");
  return [
    "Eres un analista financiero senior de DarkMoney especializado en evolución histórica.",
    "Tu trabajo es interpretar cambios de comportamiento, tipos de meses, estabilidad y factores que explican el año usando solo el resumen recibido.",
    "No inventes datos. Usa solo el resumen recibido.",
    "Responde en texto plano, con redacción sobria, precisa y útil.",
    toneInstruction,
    extraInstruction,
    "Estructura obligatoria de fondo:",
    "Parrafo 1: lectura de la evolución general del año seleccionado.",
    "Parrafo 2: cambio principal, tipos de meses o patrón histórico dominante y su implicancia.",
    "Parrafo 3: qué parte del historial conviene vigilar o corregir primero.",
    "Mantén la respuesta entre 120 y 200 palabras.",
    "No hables de modelos, IA, Gemini ni de limitaciones técnicas.",
    "No empieces con títulos como 'Historial', 'Respuesta' o 'Acción sugerida'.",
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
    "Resumen estructurado de historial del dashboard avanzado:",
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
  const selectedYear = typeof summary.selectedYear === "number" ? summary.selectedYear : null;
  const observedMonths = typeof summary.observedMonths === "number" ? summary.observedMonths : 0;
  const annualNet = typeof summary.annualNet === "string" ? summary.annualNet : "N/D";
  const positiveMonths = typeof summary.positiveMonths === "number" ? summary.positiveMonths : 0;
  const negativeMonths = typeof summary.negativeMonths === "number" ? summary.negativeMonths : 0;
  const changePoint = summary.changePoint && typeof summary.changePoint === "object"
    ? summary.changePoint as Record<string, unknown>
    : null;
  const monthClusters = Array.isArray(summary.monthClusters)
    ? summary.monthClusters as Array<Record<string, unknown>>
    : [];
  const factorAnalysis = summary.factorAnalysis && typeof summary.factorAnalysis === "object"
    ? summary.factorAnalysis as Record<string, unknown>
    : null;
  const savingsRate = summary.savingsRate && typeof summary.savingsRate === "object"
    ? summary.savingsRate as Record<string, unknown>
    : null;
  const incomeStability = summary.incomeStability && typeof summary.incomeStability === "object"
    ? summary.incomeStability as Record<string, unknown>
    : null;
  const seasonalComparison = summary.seasonalComparison && typeof summary.seasonalComparison === "object"
    ? summary.seasonalComparison as Record<string, unknown>
    : null;

  const changeTitle = changePoint && typeof changePoint.title === "string" ? changePoint.title : null;
  const clusterTitle = monthClusters[0] && typeof monthClusters[0].title === "string" ? monthClusters[0].title : null;
  const clusterDescription = monthClusters[0] && typeof monthClusters[0].description === "string"
    ? monthClusters[0].description
    : null;
  const factorTitle = factorAnalysis && typeof factorAnalysis.title === "string" ? factorAnalysis.title : null;
  const explainedVariancePct = factorAnalysis && typeof factorAnalysis.explainedVariancePct === "number"
    ? factorAnalysis.explainedVariancePct
    : null;
  const savingsTrend = savingsRate && typeof savingsRate.trend === "string" ? savingsRate.trend : null;
  const lastRate = savingsRate && typeof savingsRate.lastRate === "number" ? savingsRate.lastRate : null;
  const stabilityLabel = incomeStability && typeof incomeStability.label === "string" ? incomeStability.label : null;
  const stabilityScore = incomeStability && typeof incomeStability.score === "number" ? incomeStability.score : null;
  const seasonalLabel = seasonalComparison && typeof seasonalComparison.expenseLabel === "string"
    ? seasonalComparison.expenseLabel
    : null;

  const body = tone === "personal"
    ? [
        `En ${selectedYear ?? "el año seleccionado"} ya hay ${observedMonths} meses observados y el recorrido deja un saldo neto acumulado de ${annualNet}. Ese historial mezcla ${positiveMonths} meses positivos con ${negativeMonths} meses negativos, así que ya se puede ver si tu dinero avanzó con margen o si pasó por etapas más ajustadas.`,
        `${changeTitle ? `${changeTitle} es la señal más clara del periodo.` : "Todavía no hay un cambio de comportamiento lo bastante fuerte como para dominar toda la lectura."} ${clusterTitle ? `Además aparece un ${clusterTitle.toLowerCase()}, lo que indica que ${clusterDescription ?? "ciertos meses comparten una misma forma de comportarse"}.` : "Los meses aún no forman grupos lo bastante marcados como para resumirlos en un solo patrón."}`,
        `${factorTitle ? `${factorTitle} ayuda a explicar el año${explainedVariancePct != null ? ` y concentra ${explainedVariancePct}% de la variación observada` : ""}.` : "Todavía no hay un factor principal fuerte para explicar por qué algunos meses se alejaron del promedio."} ${stabilityLabel ? `Tus ingresos se ven ${stabilityLabel.toLowerCase()}${stabilityScore != null ? ` con un score de ${stabilityScore}/100` : ""}` : "La estabilidad de ingresos todavía necesita más historia"}${lastRate != null ? ` y la tasa de ahorro más reciente se ubica en ${lastRate}%` : ""}${savingsTrend ? ` con una tendencia ${savingsTrend}` : ""}.`,
      ].join("\n\n")
    : [
        `La lectura histórica de ${selectedYear ?? "el año seleccionado"} ya cubre ${observedMonths} meses observados y acumula un saldo neto de ${annualNet}. El recorrido combina ${positiveMonths} meses con resultado positivo y ${negativeMonths} meses en terreno negativo, por lo que ya existe una base suficiente para distinguir comportamiento estructural de eventos aislados.`,
        `${changeTitle ? `${changeTitle} aparece como el cambio de comportamiento más relevante del periodo.` : "No aparece todavía un cambio de comportamiento dominante en el periodo analizado."} ${clusterTitle ? `En paralelo, se repite un patrón tipo ${clusterTitle.toLowerCase()}, lo que confirma que ${clusterDescription ?? "hay meses con una dinámica similar"}.` : "La clasificación de tipos de meses aún no muestra una recurrencia claramente dominante."}`,
        `${factorTitle ? `${factorTitle} resume la fuerza principal que explica el año${explainedVariancePct != null ? ` y representa ${explainedVariancePct}% de la variación observada` : ""}.` : "Aún no existe un factor principal suficientemente fuerte para explicar la variación del año."} ${stabilityLabel ? `La estabilidad de ingresos se clasifica como ${stabilityLabel.toLowerCase()}${stabilityScore != null ? ` con ${stabilityScore}/100` : ""}` : "La estabilidad de ingresos aún no es concluyente"}${seasonalLabel ? ` y la comparación estacional actual se lee como ${seasonalLabel.toLowerCase()}` : ""}.`,
      ].join("\n\n");

  return ensureRecommendationLine(body, summary);
}

const FALLBACK_COMPLEX_TERM_EXPLANATIONS: Array<DashboardAiComplexTerm> = [
  { term: "saldo neto", explanation: "Es la diferencia entre todo lo que entró y todo lo que salió." },
  { term: "cambio de comportamiento", explanation: "Significa que tu forma de mover dinero ya no se parece a la etapa anterior." },
  { term: "mes positivo", explanation: "Es un mes en el que quedó más dinero del que salió." },
  { term: "mes negativo", explanation: "Es un mes en el que salió más dinero del que entró." },
  { term: "factor principal", explanation: "Es la causa más fuerte que ayuda a explicar por qué cambió el resultado del año." },
  { term: "variación observada", explanation: "Es el cambio real que se vio entre unos meses y otros." },
  { term: "estabilidad de ingresos", explanation: "Mide qué tan parecidos o cambiantes son tus ingresos entre meses." },
  { term: "tasa de ahorro", explanation: "Es la parte del ingreso que logra quedarse contigo después de gastar." },
  { term: "comparación estacional", explanation: "Compara el mes actual con el mismo mes del año pasado." },
  { term: "mes ajustado", explanation: "Es un mes con poco margen o con presión sobre tu dinero." },
  { term: "mes con margen", explanation: "Es un mes en el que el ingreso cubrió bien el gasto y sobró espacio." },
  { term: "patrón", explanation: "Es una forma repetida en la que se comportan tus meses o tus finanzas." },
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
      return jsonResponse({ ok: false, error: "No hay historial suficiente para analizar." }, 400);
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
    console.error("[dashboard-advanced-ai-history]", error);
    const message = error instanceof Error ? error.message : "No se pudo analizar el historial.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
