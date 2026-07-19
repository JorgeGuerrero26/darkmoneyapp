/**
 * Asistente IA de consulta de movimientos (v1 solo lectura).
 * Spec: docs/superpowers/specs/2026-07-19-assistant-chat-consulta-design.md
 *
 * Deploy:
 *   npx supabase functions deploy assistant-chat --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  authenticatedUser,
  corsHeaders,
  jsonResponse,
  readJsonBody,
  serviceClient,
} from "../_shared/obligation-share-utils.ts";
import {
  ASSISTANT_TOOLS,
  buildEvidence,
  buildSystemPrompt,
  clampSearchParams,
  clampSummarizeParams,
  escapeIlike,
  type AssistantEvidence,
} from "./logic.ts";

const DAILY_LIMIT = 30;
const FEATURE_KEY = "assistant_chat";
const MAX_TOOL_ROUNDS = 3;
const MAX_HISTORY = 8;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: unknown;
  tool_call_id?: string;
};

function userClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("Falta configurar Supabase en la Edge Function.");
  return createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function usageDateInLima(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

async function callDeepSeek(messages: ChatMessage[]) {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY")?.trim();
  if (!apiKey) throw new Error("Falta DEEPSEEK_API_KEY.");
  // NO heredar DEEPSEEK_MODEL: el digest usa deepseek-v4-flash, que ignora
  // function calling (bug 2026-07-19: respondía el preámbulo sin ejecutar
  // tools). El asistente exige un modelo con tools.
  const model = Deno.env.get("ASSISTANT_DEEPSEEK_MODEL")?.trim() || "deepseek-chat";
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      tools: ASSISTANT_TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`DeepSeek respondió ${response.status}`);
  }
  const json = await response.json();
  const message = json?.choices?.[0]?.message;
  if (!message) throw new Error("DeepSeek no devolvió mensaje.");
  return { message, model };
}

type CompactMovement = {
  id: number;
  date: string;
  type: string;
  amount: number;
  currency: string;
  description: string | null;
  category: string | null;
  counterparty: string | null;
};

// deno-lint-ignore no-explicit-any
function compactRow(row: any): CompactMovement {
  const amount = Number(row.source_amount ?? row.destination_amount ?? 0);
  const currency =
    row.source_account?.currency_code ?? row.destination_account?.currency_code ?? "PEN";
  return {
    id: Number(row.id),
    date: String(row.occurred_at ?? "").slice(0, 10),
    type: String(row.movement_type ?? ""),
    amount,
    currency: String(currency),
    description: row.description ?? null,
    category: row.category?.name ?? null,
    counterparty: row.counterparty?.name ?? null,
  };
}

const MOVEMENT_SELECT = `id, movement_type, occurred_at, description, notes,
  source_amount, destination_amount, category_id, counterparty_id,
  category:categories(name),
  counterparty:counterparties(name),
  source_account:accounts!movements_source_account_id_fkey(currency_code),
  destination_account:accounts!movements_destination_account_id_fkey(currency_code)`;

async function matchingIds(
  client: ReturnType<typeof userClient>,
  table: "counterparties" | "categories",
  workspaceId: number,
  text: string,
): Promise<number[]> {
  const { data } = await client
    .from(table)
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("name", `%${escapeIlike(text)}%`)
    .limit(20);
  return (data ?? []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
}

async function runSearchMovements(
  client: ReturnType<typeof userClient>,
  workspaceId: number,
  rawArgs: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; movementIds: number[] }> {
  const params = clampSearchParams(rawArgs);
  let query = client
    .from("movements")
    .select(MOVEMENT_SELECT)
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit);

  if (params.movementType) query = query.eq("movement_type", params.movementType);
  if (params.dateFrom) query = query.gte("occurred_at", params.dateFrom);
  if (params.dateTo) query = query.lte("occurred_at", `${params.dateTo}T23:59:59`);
  if (params.minAmount != null) query = query.gte("source_amount", params.minAmount);
  if (params.maxAmount != null) query = query.lte("source_amount", params.maxAmount);
  if (params.text) {
    const pattern = `*${escapeIlike(params.text).replace(/\s+/g, "*")}*`;
    const orParts = [`description.ilike.${pattern}`, `notes.ilike.${pattern}`];
    const counterpartyIds = await matchingIds(client, "counterparties", workspaceId, params.text);
    if (counterpartyIds.length > 0) orParts.push(`counterparty_id.in.(${counterpartyIds.join(",")})`);
    query = query.or(orParts.join(","));
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map(compactRow);
  return {
    result: { count: rows.length, movements: rows },
    movementIds: rows.map((row) => row.id),
  };
}

async function runSummarizeMovements(
  client: ReturnType<typeof userClient>,
  workspaceId: number,
  rawArgs: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; movementIds: number[] }> {
  const params = clampSummarizeParams(rawArgs);
  if (!params) {
    return { result: { error: "dateFrom y dateTo son obligatorios (YYYY-MM-DD)." }, movementIds: [] };
  }

  let query = client
    .from("movements")
    .select(MOVEMENT_SELECT)
    .eq("workspace_id", workspaceId)
    .gte("occurred_at", params.dateFrom)
    .lte("occurred_at", `${params.dateTo}T23:59:59`)
    .order("occurred_at", { ascending: false })
    // ponytail: agregación en JS sobre ≤1000 filas; si un workspace supera eso
    // por período consultado, mover la agregación a SQL/RPC.
    .limit(1000);
  if (params.movementType) query = query.eq("movement_type", params.movementType);
  if (params.categoryName) {
    const categoryIds = await matchingIds(client, "categories", workspaceId, params.categoryName);
    if (categoryIds.length === 0) {
      return { result: { total: 0, count: 0, note: `Sin categoría que coincida con "${params.categoryName}".` }, movementIds: [] };
    }
    query = query.in("category_id", categoryIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map(compactRow);

  const byCurrency = new Map<string, { total: number; count: number }>();
  const groups = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const currencyEntry = byCurrency.get(row.currency) ?? { total: 0, count: 0 };
    currencyEntry.total += row.amount;
    currencyEntry.count += 1;
    byCurrency.set(row.currency, currencyEntry);
    if (params.groupBy !== "none") {
      const key = (params.groupBy === "category" ? row.category : row.counterparty) ?? "(sin asignar)";
      const groupEntry = groups.get(key) ?? { total: 0, count: 0 };
      groupEntry.total += row.amount;
      groupEntry.count += 1;
      groups.set(key, groupEntry);
    }
  }

  const topMovements = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 10);
  return {
    result: {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      totalsByCurrency: Object.fromEntries(
        [...byCurrency].map(([currency, entry]) => [currency, { total: Number(entry.total.toFixed(2)), count: entry.count }]),
      ),
      groups:
        params.groupBy === "none"
          ? undefined
          : [...groups]
              .sort((a, b) => b[1].total - a[1].total)
              .slice(0, 10)
              .map(([name, entry]) => ({ name, total: Number(entry.total.toFixed(2)), count: entry.count })),
      topMovements,
    },
    movementIds: rows.map((row) => row.id),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Método no permitido." }, 405);

  try {
    const body = await readJsonBody(req);
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
    const workspaceId = Number(body.workspaceId);
    if (!message || !Number.isFinite(workspaceId)) {
      return jsonResponse({ ok: false, error: "Faltan message o workspaceId." }, 400);
    }

    const admin = serviceClient();
    const user = await authenticatedUser(req, admin);
    const rls = userClient(req);

    // Cuota diaria por usuario.
    const usageDate = usageDateInLima();
    const { count: usedToday, error: usageError } = await admin
      .from("ai_feature_daily_usage")
      .select("id", { count: "exact", head: true })
      .eq("feature_key", FEATURE_KEY)
      .eq("user_id", user.id)
      .eq("usage_date", usageDate);
    if (usageError) throw usageError;
    if ((usedToday ?? 0) >= DAILY_LIMIT) {
      return jsonResponse(
        { ok: false, error: "Alcanzaste tu límite de preguntas de hoy. Vuelve mañana.", remainingToday: 0 },
        429,
      );
    }

    // Historial efímero del cliente: solo texto de turnos previos.
    const history: ChatMessage[] = Array.isArray(body.history)
      ? (body.history as Array<Record<string, unknown>>)
          .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
          .slice(-MAX_HISTORY)
          .map((item) => ({ role: item.role as "user" | "assistant", content: (item.content as string).slice(0, 500) }))
      : [];

    const nowLima = new Date().toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "full" });
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(nowLima) },
      ...history,
      { role: "user", content: message },
    ];

    const evidence: AssistantEvidence[] = [];
    const toolsUsed: string[] = [];
    let reply = "";
    let modelUsed = "";

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const { message: aiMessage, model } = await callDeepSeek(messages);
      modelUsed = model;
      const toolCalls = Array.isArray(aiMessage.tool_calls) ? aiMessage.tool_calls : [];

      if (toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
        reply = typeof aiMessage.content === "string" && aiMessage.content.trim()
          ? aiMessage.content.trim()
          : "No pude armar una respuesta. Intenta reformular la pregunta.";
        break;
      }

      messages.push(aiMessage as ChatMessage);
      for (const call of toolCalls) {
        const name = call?.function?.name as string;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call?.function?.arguments ?? "{}");
        } catch {
          // args inválidos: la tool responde con error y el modelo se corrige
        }
        toolsUsed.push(name);
        let output: { result: Record<string, unknown>; movementIds: number[] };
        try {
          if (name === "search_movements") {
            output = await runSearchMovements(rls, workspaceId, args);
            const label = typeof args.text === "string" && args.text.trim()
              ? `Resultados: ${args.text.trim()}`
              : "Movimientos encontrados";
            const item = buildEvidence(label, output.movementIds);
            if (item) evidence.push(item);
          } else if (name === "summarize_movements") {
            output = await runSummarizeMovements(rls, workspaceId, args);
            const item = buildEvidence(
              `Período ${String(args.dateFrom ?? "")} – ${String(args.dateTo ?? "")}`,
              output.movementIds,
            );
            if (item) evidence.push(item);
          } else {
            output = { result: { error: `Herramienta desconocida: ${name}` }, movementIds: [] };
          }
        } catch (toolError) {
          output = {
            result: { error: toolError instanceof Error ? toolError.message : "Error ejecutando la consulta." },
            movementIds: [],
          };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(output.result),
        });
      }
    }

    await admin.from("ai_feature_daily_usage").insert({
      feature_key: FEATURE_KEY,
      user_id: user.id,
      usage_date: usageDate,
      workspace_id: workspaceId,
      model: modelUsed || null,
    });

    // Auditoría minimizada (logs de la función, retención de Supabase).
    console.log("[assistant-chat]", JSON.stringify({
      userId: user.id,
      workspaceId,
      questionChars: message.length,
      tools: toolsUsed,
      evidenceCount: evidence.reduce((total, item) => total + item.movementIds.length, 0),
    }));

    return jsonResponse({
      ok: true,
      reply,
      evidence,
      remainingToday: Math.max(0, DAILY_LIMIT - (usedToday ?? 0) - 1),
    });
  } catch (error) {
    console.error("[assistant-chat]", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo responder. Inténtalo de nuevo.",
    }, 502);
  }
});
