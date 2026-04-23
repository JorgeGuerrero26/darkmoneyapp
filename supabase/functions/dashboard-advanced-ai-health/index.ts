/**
 * Deploy:
 *   npx supabase functions deploy dashboard-advanced-ai-health --project-ref <project-ref>
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
const DASHBOARD_AI_FEATURE_KEY = "dashboard-advanced-ai-health";

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
  const uncategorizedCount = typeof summary.uncategorizedCount === "number" ? summary.uncategorizedCount : 0;
  const overdueObligationsCount = typeof summary.overdueObligationsCount === "number" ? summary.overdueObligationsCount : 0;
  const pendingMovementsCount = typeof summary.pendingMovementsCount === "number" ? summary.pendingMovementsCount : 0;
  const categorySuggestionsCount = typeof summary.categorySuggestionsCount === "number" ? summary.categorySuggestionsCount : 0;
  const noCounterpartyCount = typeof summary.noCounterpartyCount === "number" ? summary.noCounterpartyCount : 0;

  if (overdueObligationsCount > 0) {
    return "Recomendación inmediata: resolver primero los cobros o pagos vencidos para que la lectura no arrastre atraso operativo.";
  }
  if (uncategorizedCount > 0) {
    return "Recomendación inmediata: categorizar los movimientos pendientes de clasificar para mejorar comparativos y precisión.";
  }
  if (pendingMovementsCount > 0) {
    return "Recomendación inmediata: aplicar la cola pendiente para que el saldo real y la proyección se alineen mejor.";
  }
  if (categorySuggestionsCount > 0) {
    return "Recomendación inmediata: revisar y aprobar las sugerencias de categoría con mayor confianza.";
  }
  if (noCounterpartyCount > 0) {
    return "Recomendación inmediata: completar contrapartes en los movimientos relevantes para ganar trazabilidad.";
  }
  return "Recomendación inmediata: mantener la base limpia y seguir alimentando el sistema con movimientos bien clasificados.";
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
        "Haz que el texto se sienta cercano, claro y orientado a ayudar al usuario a entender qué tan limpia y confiable está su información sin sonar informal.",
        "Usa palabras simples y fáciles de entender.",
        "Si necesitas mencionar un término analítico u operativo, explícalo en la misma frase con lenguaje común.",
      ].join("\n")
    : [
        "Escribe como un informe gerencial breve.",
        "Haz que el texto se sienta ejecutivo, ordenado y orientado a lectura de decisión.",
      ].join("\n");
  return [
    "Eres un analista financiero senior de DarkMoney especializado en salud operativa del dato.",
    "Tu trabajo es interpretar limpieza de movimientos, calidad del dato, sugerencias de categoría, eficiencia de cobranza y confianza del sistema usando solo el resumen recibido.",
    "No inventes datos. Usa solo el resumen recibido.",
    "Responde en texto plano, con redacción sobria, precisa y útil.",
    toneInstruction,
    extraInstruction,
    "Estructura obligatoria de fondo:",
    "Parrafo 1: lectura del estado actual de salud y calidad del dashboard.",
    "Parrafo 2: qué pendientes o fricciones operativas están afectando más la precisión.",
    "Parrafo 3: prioridad concreta para limpiar, corregir o fortalecer el sistema.",
    "Mantén la respuesta entre 120 y 200 palabras.",
    "No hables de modelos, IA, Gemini ni de limitaciones técnicas.",
    "No empieces con títulos como 'Salud', 'Respuesta' o 'Acción sugerida'.",
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
    "Resumen estructurado de salud del dashboard avanzado:",
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
  const totalIssues = typeof summary.totalIssues === "number" ? summary.totalIssues : 0;
  const uncategorizedCount = typeof summary.uncategorizedCount === "number" ? summary.uncategorizedCount : 0;
  const pendingMovementsCount = typeof summary.pendingMovementsCount === "number" ? summary.pendingMovementsCount : 0;
  const subscriptionsAttentionCount = typeof summary.subscriptionsAttentionCount === "number" ? summary.subscriptionsAttentionCount : 0;
  const overdueObligationsCount = typeof summary.overdueObligationsCount === "number" ? summary.overdueObligationsCount : 0;
  const duplicateExpenseCount = typeof summary.duplicateExpenseCount === "number" ? summary.duplicateExpenseCount : 0;
  const noCounterpartyCount = typeof summary.noCounterpartyCount === "number" ? summary.noCounterpartyCount : 0;
  const categorySuggestionsCount = typeof summary.categorySuggestionsCount === "number" ? summary.categorySuggestionsCount : 0;
  const acceptedFeedbackCount = typeof summary.acceptedFeedbackCount === "number" ? summary.acceptedFeedbackCount : 0;
  const collectionEfficiency = summary.collectionEfficiency && typeof summary.collectionEfficiency === "object"
    ? summary.collectionEfficiency as Record<string, unknown>
    : null;
  const systemReadiness = summary.systemReadiness && typeof summary.systemReadiness === "object"
    ? summary.systemReadiness as Record<string, unknown>
    : null;
  const projectionConfidence = summary.projectionConfidence && typeof summary.projectionConfidence === "object"
    ? summary.projectionConfidence as Record<string, unknown>
    : null;
  const cashCushion = summary.cashCushion && typeof summary.cashCushion === "object"
    ? summary.cashCushion as Record<string, unknown>
    : null;

  const collectionRate = collectionEfficiency && typeof collectionEfficiency.rate === "number"
    ? collectionEfficiency.rate
    : null;
  const collectionLabel = collectionEfficiency && typeof collectionEfficiency.label === "string"
    ? collectionEfficiency.label
    : null;
  const readinessScore = systemReadiness && typeof systemReadiness.score === "number"
    ? systemReadiness.score
    : null;
  const historyDays = systemReadiness && typeof systemReadiness.historyDays === "number"
    ? systemReadiness.historyDays
    : null;
  const projectionScore = projectionConfidence && typeof projectionConfidence.score === "number"
    ? projectionConfidence.score
    : null;
  const projectionLabel = projectionConfidence && typeof projectionConfidence.label === "string"
    ? projectionConfidence.label
    : null;
  const cashDays = cashCushion && typeof cashCushion.days === "number" ? cashCushion.days : null;
  const cashLabel = cashCushion && typeof cashCushion.label === "string" ? cashCushion.label : null;

  const body = tone === "personal"
    ? [
        `Hoy la salud del sistema muestra ${totalIssues} punto${totalIssues === 1 ? "" : "s"} por resolver. Lo que más afecta la lectura ahora son ${uncategorizedCount} movimientos sin categoría, ${pendingMovementsCount} pendientes de aplicar, ${overdueObligationsCount} vencimientos y ${subscriptionsAttentionCount} suscripciones que todavía necesitan revisión.`,
        `${categorySuggestionsCount > 0 ? `Además ya hay ${categorySuggestionsCount} sugerencia${categorySuggestionsCount === 1 ? "" : "s"} de categoría listas para ayudarte a limpiar más rápido la base.` : "Por ahora no hay sugerencias de categoría lo bastante fuertes como para acelerar la limpieza."} ${duplicateExpenseCount > 0 ? `También aparecen ${duplicateExpenseCount} posible${duplicateExpenseCount === 1 ? "" : "s"} duplicado${duplicateExpenseCount === 1 ? "" : "s"}.` : "No se observan duplicados relevantes en la revisión actual."} ${noCounterpartyCount > 0 ? `Y todavía hay ${noCounterpartyCount} movimiento${noCounterpartyCount === 1 ? "" : "s"} sin contraparte.` : "La trazabilidad por contraparte está bajo control."}`,
        `${readinessScore != null ? `La confianza del sistema hoy está en ${readinessScore}%` : "La confianza del sistema todavía necesita más base"}${historyDays != null ? ` con ${historyDays} días de historia` : ""}, ${projectionScore != null ? `mientras la proyección opera con ${projectionScore}% de confianza${projectionLabel ? ` (${projectionLabel})` : ""}` : "y la proyección todavía necesita más estabilidad"}. ${collectionRate != null ? `En cobros, la eficiencia actual es ${collectionRate}%${collectionLabel ? ` y se interpreta como ${collectionLabel.toLowerCase()}` : ""}.` : "La eficiencia de cobranza todavía no tiene suficiente señal."} ${cashDays != null ? `La caja libre se estima en ${cashDays} días${cashLabel ? `, hoy clasificada como ${cashLabel.toLowerCase()}` : ""}.` : ""}`,
      ].join("\n\n")
    : [
        `La salud operativa actual presenta ${totalIssues} fricción${totalIssues === 1 ? "" : "es"} pendiente${totalIssues === 1 ? "" : "s"} de resolución. Los principales focos son ${uncategorizedCount} movimientos sin categoría, ${pendingMovementsCount} pendientes por aplicar, ${overdueObligationsCount} obligaciones vencidas y ${subscriptionsAttentionCount} suscripciones con revisión pendiente.`,
        `${categorySuggestionsCount > 0 ? `El sistema ya propone ${categorySuggestionsCount} sugerencia${categorySuggestionsCount === 1 ? "" : "s"} de categoría con valor operativo inmediato.` : "No hay por ahora sugerencias de categoría con suficiente fuerza estadística."} ${duplicateExpenseCount > 0 ? `Adicionalmente se detectan ${duplicateExpenseCount} posible${duplicateExpenseCount === 1 ? "" : "s"} duplicado${duplicateExpenseCount === 1 ? "" : "s"}.` : "No se detectan duplicados relevantes en esta revisión."} ${noCounterpartyCount > 0 ? `Persisten además ${noCounterpartyCount} registros sin contraparte.` : "La trazabilidad por contraparte se mantiene bajo control."}`,
        `${readinessScore != null ? `La confianza del sistema se ubica en ${readinessScore}%` : "La confianza del sistema no es concluyente todavía"}${historyDays != null ? ` con ${historyDays} días de historia útil` : ""}, mientras ${projectionScore != null ? `la proyección trabaja con ${projectionScore}% de confianza${projectionLabel ? ` (${projectionLabel})` : ""}` : "la proyección aún requiere una base más sólida"}. ${collectionRate != null ? `La eficiencia de cobranza marca ${collectionRate}%${collectionLabel ? ` y se clasifica como ${collectionLabel.toLowerCase()}` : ""}.` : "La eficiencia de cobranza aún no dispone de suficiente señal."} ${acceptedFeedbackCount > 0 ? `Ya existen ${acceptedFeedbackCount} corrección${acceptedFeedbackCount === 1 ? "" : "es"} del usuario que fortalecen el aprendizaje del sistema.` : "Todavía no hay suficiente retroalimentación aplicada por el usuario para acelerar el aprendizaje."}`,
      ].join("\n\n");

  return ensureRecommendationLine(body, summary);
}

const FALLBACK_COMPLEX_TERM_EXPLANATIONS: Array<DashboardAiComplexTerm> = [
  { term: "salud operativa", explanation: "Mide qué tan ordenada y útil está tu información para que el dashboard te ayude bien." },
  { term: "fricción", explanation: "Es algo pendiente o desordenado que dificulta ver tus finanzas con claridad." },
  { term: "confianza del sistema", explanation: "Es qué tan seguro puede estar el dashboard de que su lectura es fiable." },
  { term: "proyección", explanation: "Es una estimación de cómo podrían terminar tus números más adelante." },
  { term: "eficiencia de cobranza", explanation: "Mide qué tanto del dinero por cobrar realmente se viene resolviendo." },
  { term: "trazabilidad", explanation: "Es la capacidad de seguir de dónde viene o hacia quién fue un movimiento." },
  { term: "duplicado", explanation: "Es un movimiento que parece repetido por fecha, monto o descripción." },
  { term: "retroalimentación", explanation: "Son las correcciones que haces y que el sistema usa para aprender." },
  { term: "cola pendiente", explanation: "Son movimientos todavía no aplicados al saldo real." },
  { term: "precisión", explanation: "Es qué tan exactas y confiables salen las lecturas del dashboard." },
  { term: "calidad del dato", explanation: "Es qué tan ordenada, completa y útil está tu información registrada." },
  { term: "base limpia", explanation: "Significa que tus movimientos están ordenados y listos para analizarse mejor." },
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
      return jsonResponse({ ok: false, error: "No hay datos de salud suficientes para analizar." }, 400);
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
    console.error("[dashboard-advanced-ai-health]", error);
    const message = error instanceof Error ? error.message : "No se pudo analizar la salud financiera.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
