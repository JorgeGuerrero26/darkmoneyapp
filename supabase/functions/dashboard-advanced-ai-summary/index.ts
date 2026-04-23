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
        "Ahora debes responder con 3 parrafos completos, sin listas, sin markdown y sin asteriscos.",
        "Cada parrafo debe tener al menos 2 oraciones.",
      ].join("\n")
    : "Responde con 3 parrafos breves, sin markdown y sin asteriscos.";
  const toneInstruction = tone === "personal"
    ? [
        "Escribe como un asesor financiero personal.",
        "Haz que el texto se sienta cercano, claro y orientado a ayudar al usuario a entender su situación sin sonar informal.",
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
    "Cierra siempre con una última línea independiente que empiece exactamente con 'Recomendación inmediata:' y contenga una sola recomendación concreta.",
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
        `Esto significa que no basta con mirar solo el saldo actual. También importa que hoy tienes ${unresolvedIssues ?? 0} puntos por revisar y una cobertura de caja aproximada de ${cashCushionDays ?? 0} días, porque eso define cuánto margen real tienes para sostener pagos, responder a imprevistos y mantener orden en tus decisiones financieras.`,
        `${focusTitle} aparece como la prioridad principal en este momento. ${focusBody ?? "Conviene atender primero esa acción antes de asumir nuevos gastos, transferencias o compromisos adicionales."}`,
      ].join("\n\n")
    : [
        `La lectura actual muestra un balance visible de ${visibleBalance ?? "N/D"} y un cierre estimado de mes de ${monthEndReading ?? "N/D"}. En este momento, el dashboard ubica tu situación en ${monthStatus ?? "un estado no disponible"} y califica la presión financiera de los próximos 7 días como ${weekStatus ?? "sin lectura disponible"}, con un neto semanal de ${weekNet ?? "N/D"}.`,
        `En términos de gestión, este resultado debe interpretarse junto con la calidad operativa de la información. Hoy existen ${unresolvedIssues ?? 0} puntos por revisar y una cobertura de caja estimada de ${cashCushionDays ?? 0} días, por lo que la solidez de la posición no depende solo del saldo visible, sino también del control sobre pendientes, desorden operativo y compromisos inmediatos.`,
        `La prioridad recomendada en este momento es ${focusTitle}. ${focusBody ?? "Conviene ejecutar primero la acción prioritaria identificada por el resumen antes de asumir nuevos gastos, transferencias o compromisos adicionales."}`,
      ].join("\n\n");
  return ensureRecommendationLine(body, summary);
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
          responseMimeType: "text/plain",
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

  return normalizeReply(payload?.candidates?.[0]?.content?.parts
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

    let reply = await requestGeminiReply(geminiApiKey, model, buildPrompt(summary, tone, "normal"));
    reply = ensureRecommendationLine(reply, summary);
    if (isReplyInsufficient(reply)) {
      reply = await requestGeminiReply(geminiApiKey, model, buildPrompt(summary, tone, "strict"));
      reply = ensureRecommendationLine(reply, summary);
    }
    if (isReplyInsufficient(reply)) {
      reply = fallbackReply(summary, tone);
    }
    reply = ensureRecommendationLine(reply, summary);

    if (!reply) {
      return jsonResponse({ ok: false, error: "La IA no devolvio contenido util." }, 502);
    }

    return jsonResponse({
      ok: true,
      reply,
      model,
      tone: toneLabel(tone),
    });
  } catch (error) {
    console.error("[dashboard-advanced-ai-summary]", error);
    const message = error instanceof Error ? error.message : "No se pudo analizar el resumen.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
