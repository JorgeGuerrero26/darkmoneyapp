/**
 * Deploy:
 *   npx supabase functions deploy dashboard-advanced-ai-summary --project-ref <project-ref>
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
    .slice(0, 48);
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

function sanitizeTone(value: unknown): DashboardAiTone {
  return value === "personal" ? "personal" : "managerial";
}

function toneLabel(tone: DashboardAiTone) {
  return tone === "personal" ? "asesor financiero personal" : "informe gerencial";
}

function recommendationLine(summary: Record<string, unknown>) {
  const topFocusAction = summary.topFocusAction && typeof summary.topFocusAction === "object"
    ? summary.topFocusAction as Record<string, unknown>
    : null;
  const focusTitle = topFocusAction && typeof topFocusAction.title === "string" ? topFocusAction.title : "revisar el punto más importante del dashboard";
  return `Recomendación inmediata: ${focusTitle}.`;
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
        "Haz que el texto se sienta cercano, claro y orientado a ayudar al usuario a entender su situación sin sonar informal.",
        "Usa palabras simples y fáciles de entender.",
        "Si necesitas mencionar un término financiero o del dashboard, explícalo en la misma frase con lenguaje común.",
        "Ejemplo: en vez de decir solo 'cobertura de caja', explica que se refiere a cuántos días podría sostener sus pagos con el dinero disponible.",
      ].join("\n")
    : [
        "Escribe como un informe gerencial breve.",
        "Haz que el texto se sienta ejecutivo, ordenado y orientado a lectura de decisión.",
      ].join("\n");
  return [
    "Eres un analista financiero senior de DarkMoney.",
    "Tu trabajo es interpretar el estado actual de las finanzas del usuario con criterio ejecutivo, tono profesional y lenguaje claro.",
    "No inventes datos. Usa solo el resumen recibido.",
    "Responde en texto plano, con redacción sobria, precisa y útil.",
    toneInstruction,
    extraInstruction,
    "Estructura obligatoria de fondo:",
    "Parrafo 1: lectura ejecutiva del estado actual.",
    "Parrafo 2: implicancia financiera y riesgos u oportunidades inmediatas.",
    "Parrafo 3: prioridad concreta recomendada para hoy.",
    "Mantén la respuesta entre 120 y 200 palabras.",
    "No hables de modelos, IA, Gemini ni de limitaciones técnicas.",
    "No empieces con títulos como 'Estado actual', 'Respuesta' o 'Acción sugerida'.",
    "No uses emojis, frases promocionales, muletillas ni lenguaje demasiado coloquial.",
    "Escribe como un asesor financiero serio, no como un chatbot.",
    "Cierra siempre con una última línea independiente dentro de reply que empiece exactamente con 'Recomendación inmediata:' y contenga una sola recomendación concreta.",
    "Devuelve solo JSON valido. No agregues texto fuera del JSON.",
    "Usa exactamente esta estructura:",
    '{',
    '  "reply": "texto con 3 parrafos y la línea final de recomendación",',
    '  "complexTerms": [',
    '    { "term": "termino exacto usado en reply", "explanation": "explicacion breve y simple" }',
    "  ]",
    '}',
    "Reglas para complexTerms:",
    "Incluye entre 3 y 6 términos siempre que reply tenga suficientes expresiones útiles para explicar.",
    "Cada term debe aparecer literalmente dentro de reply con la misma escritura.",
    "Incluye solo términos o expresiones que puedan ser difíciles para un usuario común.",
    "No repitas términos.",
    "Cada explanation debe explicar el término con palabras simples en una sola oración corta.",
    "",
    "Resumen estructurado del dashboard avanzado:",
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
  const visibleBalance = typeof summary.visibleBalance === "string" ? summary.visibleBalance : null;
  const monthEndReading = typeof summary.monthEndReading === "string" ? summary.monthEndReading : null;
  const monthStatus = typeof summary.monthStatus === "string" ? summary.monthStatus : null;
  const weekStatus = typeof summary.weekStatus === "string" ? summary.weekStatus : null;
  const weekNet = typeof summary.weekNet === "string" ? summary.weekNet : null;
  const unresolvedIssues = typeof summary.unresolvedIssues === "number" ? summary.unresolvedIssues : null;
  const cashCushionDays = typeof summary.cashCushionDays === "number" ? summary.cashCushionDays : null;
  const topFocusAction = summary.topFocusAction && typeof summary.topFocusAction === "object"
    ? summary.topFocusAction as Record<string, unknown>
    : null;
  const focusTitle = topFocusAction && typeof topFocusAction.title === "string" ? topFocusAction.title : "revisar el foco principal del dashboard";
  const focusBody = topFocusAction && typeof topFocusAction.body === "string" ? topFocusAction.body : null;

  const body = tone === "personal"
    ? [
        `Hoy tu panorama financiero muestra un balance visible de ${visibleBalance ?? "N/D"} y un cierre estimado de mes de ${monthEndReading ?? "N/D"}. Con la información disponible, tu situación se ubica en ${monthStatus ?? "un estado no disponible"} y la presión de los próximos 7 días aparece como ${weekStatus ?? "sin lectura disponible"}, con un neto semanal de ${weekNet ?? "N/D"}.`,
        `Esto significa que no basta con mirar solo el saldo actual. También importa que hoy tienes ${unresolvedIssues ?? 0} puntos por revisar y que tu dinero disponible alcanzaría aproximadamente para ${cashCushionDays ?? 0} días de operación, es decir, para cubrir pagos y gastos por ese tiempo si no entrara más dinero.`,
        `${focusTitle} aparece como la prioridad principal en este momento. ${focusBody ?? "Conviene atender primero esa acción antes de asumir nuevos gastos, transferencias o compromisos adicionales."}`,
      ].join("\n\n")
    : [
        `La lectura actual muestra un balance visible de ${visibleBalance ?? "N/D"} y un cierre estimado de mes de ${monthEndReading ?? "N/D"}. En este momento, el dashboard ubica tu situación en ${monthStatus ?? "un estado no disponible"} y califica la presión financiera de los próximos 7 días como ${weekStatus ?? "sin lectura disponible"}, con un neto semanal de ${weekNet ?? "N/D"}.`,
        `En términos de gestión, este resultado debe interpretarse junto con la calidad operativa de la información. Hoy existen ${unresolvedIssues ?? 0} puntos por revisar y una cobertura de caja estimada de ${cashCushionDays ?? 0} días, por lo que la solidez de la posición no depende solo del saldo visible, sino también del control sobre pendientes, desorden operativo y compromisos inmediatos.`,
        `La prioridad recomendada en este momento es ${focusTitle}. ${focusBody ?? "Conviene ejecutar primero la acción prioritaria identificada por el resumen antes de asumir nuevos gastos, transferencias o compromisos adicionales."}`,
      ].join("\n\n");
  return ensureRecommendationLine(body, summary);
}

const FALLBACK_COMPLEX_TERM_EXPLANATIONS: Array<DashboardAiComplexTerm> = [
  { term: "balance visible", explanation: "Es el dinero que ves disponible ahora mismo en tus cuentas." },
  { term: "saldo actual", explanation: "Es el dinero disponible que tienes en este momento." },
  { term: "cierre estimado de mes", explanation: "Es cómo podrías terminar el mes si todo sigue como va hoy." },
  { term: "neto semanal", explanation: "Es la diferencia entre lo que entra y lo que sale durante la semana." },
  { term: "presión financiera", explanation: "Significa que tus pagos cercanos aprietan tu dinero disponible." },
  { term: "cobertura de caja", explanation: "Es cuántos días podrías seguir pagando con el dinero que ya tienes." },
  { term: "flujo", explanation: "Es el movimiento de dinero que entra y sale en un periodo." },
  { term: "proyección", explanation: "Es una estimación de lo que podría pasar con tus números más adelante." },
  { term: "compromisos inmediatos", explanation: "Son pagos u obligaciones que tienes que atender pronto." },
  { term: "desorden operativo", explanation: "Significa que hay pendientes o datos mal organizados que afectan el control." },
  { term: "margen", explanation: "Es el espacio que te queda entre lo que tienes y lo que necesitas pagar." },
  { term: "solidez", explanation: "Es qué tan fuerte o estable se ve tu situación financiera." },
  { term: "calidad operativa", explanation: "Es qué tan ordenados y confiables están tus datos para tomar decisiones." },
  { term: "lectura", explanation: "Es la interpretación del estado financiero usando los datos del dashboard." },
  { term: "riesgos", explanation: "Son problemas que podrían afectar tu dinero si no se atienden a tiempo." },
  { term: "oportunidades", explanation: "Son opciones para mejorar tu situación financiera o aprovechar mejor tu dinero." },
  { term: "prioridad", explanation: "Es lo más importante que conviene atender primero." },
];

function buildFallbackComplexTerms(reply: string): DashboardAiComplexTerm[] {
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
    const body = await readJsonBody(req);
    const workspaceId = numberFromBody(body.workspaceId);
    const summary = sanitizeSummary(body.summary);
    const tone = sanitizeTone(body.tone);

    if (!workspaceId) {
      return jsonResponse({ ok: false, error: "No se encontro el workspace." }, 400);
    }
    if (Object.keys(summary).length === 0) {
      return jsonResponse({ ok: false, error: "No hay resumen suficiente para analizar." }, 400);
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

    return jsonResponse({
      ok: true,
      reply,
      complexTerms,
      model,
      tone: toneLabel(tone),
    });
  } catch (error) {
    console.error("[dashboard-advanced-ai-summary]", error);
    const message = error instanceof Error ? error.message : "No se pudo analizar el resumen.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
