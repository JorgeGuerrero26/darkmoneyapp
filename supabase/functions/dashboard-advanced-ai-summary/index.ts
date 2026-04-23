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

function buildPrompt(summary: Record<string, unknown>) {
  return [
    "Eres un analista financiero personal de DarkMoney.",
    "Tu trabajo es explicar en español, con tono profesional y claro, el estado actual de las finanzas del usuario.",
    "No inventes datos. Usa solo el resumen recibido.",
    "Responde en texto plano, breve y útil.",
    "Estructura obligatoria:",
    "1. Estado actual",
    "2. Qué significa",
    "3. Acción sugerida inmediata",
    "Mantén la respuesta en máximo 170 palabras.",
    "No hables de modelos, IA, Gemini ni de limitaciones técnicas.",
    "",
    "Resumen estructurado del dashboard avanzado:",
    JSON.stringify(summary),
  ].join("\n");
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildPrompt(summary) }],
            },
          ],
          generationConfig: {
            temperature: 0.45,
            topP: 0.9,
            maxOutputTokens: 260,
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
      return jsonResponse({ ok: false, error: message }, response.status);
    }

    const reply = payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text ?? "")
      .join("\n")
      .trim();

    if (!reply) {
      return jsonResponse({ ok: false, error: "La IA no devolvio contenido util." }, 502);
    }

    return jsonResponse({
      ok: true,
      reply,
      model,
    });
  } catch (error) {
    console.error("[dashboard-advanced-ai-summary]", error);
    const message = error instanceof Error ? error.message : "No se pudo analizar el resumen.";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
