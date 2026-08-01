/**
 * proactive-insights: el contador interno habla primero.
 * Detección por REGLAS (sin LLM): resumen semanal (subidas por categoría) y
 * anomalías diarias (gasto atípico). Inserta filas en `notifications` con kind
 * `assistant_insight` y metadata.assistantPrompt; el webhook de notifications
 * dispara el push, y el tap abre el chat con esa pregunta (auto-envío).
 *
 * Invocada por 2 crons con ?mode=weekly (lunes) y ?mode=anomaly (diario).
 * Spec: docs/superpowers/specs/2026-07-19-assistant-semantica-proactividad-design.md
 *
 * Deploy:
 *   npx supabase functions deploy proactive-insights --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../_shared/database-types.ts";

const LIMA_TZ = "America/Lima";
const WEEKLY_MIN_INCREASE_PCT = 25;
const WEEKLY_MIN_DELTA = 50;
const ANOMALY_FACTOR = 2.5;
const ANOMALY_MIN_AMOUNT = 100;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function limaDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LIMA_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function daysAgo(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

type Client = ReturnType<typeof createClient<Database>>;

/** Cuentas del workspace cuya moneda es la base (evita mezclar divisas). */
async function baseCurrencyAccountIds(client: Client, workspaceId: number, base: string): Promise<Set<number>> {
  const { data } = await client
    .from("v_account_balances")
    .select("account_id, currency_code")
    .eq("workspace_id", workspaceId);
  return new Set((data ?? []).filter((a) => a.currency_code === base && a.account_id != null).map((a) => a.account_id as number));
}

type ExpenseRow = { source_amount: number | null; source_account_id: number | null; occurred_at: string | null; category_id: number | null };

async function fetchExpenses(client: Client, workspaceId: number, fromIso: string): Promise<ExpenseRow[]> {
  const { data } = await client
    .from("movements")
    .select("source_amount, source_account_id, occurred_at, category_id")
    .eq("workspace_id", workspaceId)
    .eq("movement_type", "expense")
    .eq("status", "posted")
    .gte("occurred_at", fromIso);
  return (data ?? []) as ExpenseRow[];
}

async function categoryNames(client: Client, workspaceId: number): Promise<Map<number, string>> {
  const { data } = await client.from("categories").select("id, name").eq("workspace_id", workspaceId);
  return new Map((data ?? []).map((c) => [c.id as number, String(c.name)]));
}

async function defaultWorkspace(client: Client, userId: string): Promise<{ id: number; base: string } | null> {
  const { data } = await client
    .from("v_user_workspaces")
    .select("workspace_id, is_default_workspace, base_currency_code, is_archived")
    .eq("user_id", userId);
  const ws = (data ?? []).find((w) => w.is_default_workspace) ?? (data ?? []).find((w) => !w.is_archived);
  if (!ws?.workspace_id || !ws.base_currency_code) return null;
  return { id: ws.workspace_id, base: ws.base_currency_code };
}

async function insertInsight(
  client: Client,
  userId: string,
  entityId: number,
  title: string,
  body: string,
  prompt: string,
): Promise<void> {
  await client.from("notifications").upsert(
    [{
      user_id: userId,
      channel: "in_app" as const,
      status: "pending" as const,
      kind: "assistant_insight",
      title,
      body,
      scheduled_for: new Date().toISOString(),
      related_entity_type: "assistant_insight",
      related_entity_id: entityId,
      payload: { assistantPrompt: prompt, generatedBy: "proactive_insights" },
    }],
    { onConflict: "user_id,related_entity_type,related_entity_id,kind", ignoreDuplicates: true },
  );
}

async function runWeekly(client: Client, userId: string, ws: { id: number; base: string }, today: string): Promise<boolean> {
  const accountIds = await baseCurrencyAccountIds(client, ws.id, ws.base);
  if (accountIds.size === 0) return false;
  const from = daysAgo(today, 35); // 7 recientes + 28 previos
  const rows = (await fetchExpenses(client, ws.id, from)).filter((r) => r.source_account_id != null && accountIds.has(r.source_account_id));
  const weekStart = daysAgo(today, 7);
  const names = await categoryNames(client, ws.id);

  const recent = new Map<number, number>();
  const prior = new Map<number, number>();
  let weekTotal = 0;
  for (const r of rows) {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    const amount = Number(r.source_amount ?? 0);
    const cat = r.category_id ?? -1;
    if (day >= weekStart) {
      recent.set(cat, (recent.get(cat) ?? 0) + amount);
      weekTotal += amount;
    } else {
      prior.set(cat, (prior.get(cat) ?? 0) + amount);
    }
  }
  if (weekTotal <= 0) return false;

  // Categoría real (no "sin categoría") con mayor subida en soles vs su promedio
  // semanal de las 4 semanas previas.
  let top: { cat: number; delta: number; weeklyAvg: number; recent: number } | null = null;
  for (const [cat, recentTotal] of recent) {
    if (cat < 0) continue; // ignorar el bucket sin categoría como titular
    const weeklyAvg = (prior.get(cat) ?? 0) / 4;
    const delta = recentTotal - weeklyAvg;
    if (delta < WEEKLY_MIN_DELTA) continue;
    // Con baseline chico el % explota (ej. 85006%): exigir baseline real O tratarlo
    // como "gasto nuevo". El delta en soles ya garantiza relevancia.
    const pctOk = weeklyAvg <= 0 || (delta / weeklyAvg) * 100 >= WEEKLY_MIN_INCREASE_PCT;
    if (pctOk && (!top || delta > top.delta)) {
      top = { cat, delta, weeklyAvg, recent: recentTotal };
    }
  }

  const entityId = Number(today.replace(/-/g, ""));
  if (top) {
    const catName = names.get(top.cat) ?? "una categoría";
    const amount = `${ws.base} ${top.recent.toFixed(2)}`;
    let phrase: string;
    if (top.weeklyAvg < 5) {
      phrase = `Gastaste ${amount} en ${catName} esta semana, algo que casi no sueles gastar.`;
    } else if (top.recent >= top.weeklyAvg * 2) {
      phrase = `Gastaste ${amount} en ${catName} esta semana, más del doble de tu promedio (${ws.base} ${top.weeklyAvg.toFixed(2)}).`;
    } else {
      const pct = Math.round(((top.recent - top.weeklyAvg) / top.weeklyAvg) * 100);
      phrase = `Gastaste ${amount} en ${catName} esta semana, ${pct}% más que tu promedio.`;
    }
    await insertInsight(
      client,
      userId,
      entityId,
      "Tu semana en cifras",
      `${phrase} Toca para ver el detalle.`,
      `¿Por qué gasté más en ${catName} esta semana y en qué exactamente?`,
    );
    return true;
  }
  // Sin subidas: resumen neutro para mantener el hábito semanal.
  await insertInsight(
    client,
    userId,
    entityId,
    "Tu semana en cifras",
    `Gastaste ${ws.base} ${weekTotal.toFixed(2)} esta semana. Toca para ver en qué se fue.`,
    "¿En qué gasté esta semana y cómo se compara con mi promedio?",
  );
  return true;
}

async function runAnomaly(client: Client, userId: string, ws: { id: number; base: string }, today: string): Promise<boolean> {
  const accountIds = await baseCurrencyAccountIds(client, ws.id, ws.base);
  if (accountIds.size === 0) return false;
  const from = daysAgo(today, 90);
  const rows = (await fetchExpenses(client, ws.id, from)).filter((r) => r.source_account_id != null && accountIds.has(r.source_account_id));
  const names = await categoryNames(client, ws.id);

  const todayByCat = new Map<number, number>();
  const total90ByCat = new Map<number, number>();
  for (const r of rows) {
    const day = String(r.occurred_at ?? "").slice(0, 10);
    const amount = Number(r.source_amount ?? 0);
    const cat = r.category_id ?? -1;
    total90ByCat.set(cat, (total90ByCat.get(cat) ?? 0) + amount);
    if (day === today) todayByCat.set(cat, (todayByCat.get(cat) ?? 0) + amount);
  }

  // Categoría más atípica hoy: hoy > 2.5× su promedio diario de 90d y ≥ mínimo.
  let worst: { cat: number; today: number; avg: number } | null = null;
  for (const [cat, todayTotal] of todayByCat) {
    if (todayTotal < ANOMALY_MIN_AMOUNT) continue;
    const dailyAvg = (total90ByCat.get(cat) ?? 0) / 90;
    if (dailyAvg > 0 && todayTotal > dailyAvg * ANOMALY_FACTOR && (!worst || todayTotal > worst.today)) {
      worst = { cat, today: todayTotal, avg: dailyAvg };
    }
  }
  if (!worst) return false;

  const catName = names.get(worst.cat) ?? "una categoría";
  // entityId con sufijo 2: la anomalía y el semanal del mismo día no colisionan.
  const entityId = Number(today.replace(/-/g, "")) * 10 + 2;
  await insertInsight(
    client,
    userId,
    entityId,
    "Gasto inusual hoy",
    `Hoy llevas ${ws.base} ${worst.today.toFixed(2)} en ${catName}, bastante más de lo habitual. Toca para revisarlo.`,
    `¿Qué gastos de ${catName} tengo hoy y por qué es más de lo normal?`,
  );
  return true;
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get("DIGEST_WEBHOOK_SECRET") ?? Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret && req.headers.get("x-webhook-secret") !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, error: "Missing Supabase env vars" }, 500);

  const mode = new URL(req.url).searchParams.get("mode") === "anomaly" ? "anomaly" : "weekly";
  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const today = limaDate();

  const { data: prefs, error } = await client
    .from("notification_preferences")
    .select("user_id, predictive_alerts_enabled")
    .eq("is_active", true)
    .not("push_token", "is", null);
  if (error) return json({ ok: false, error: error.message }, 500);

  let emitted = 0;
  for (const pref of prefs ?? []) {
    const userId = String(pref.user_id ?? "");
    if (!userId || pref.predictive_alerts_enabled === false) continue;
    try {
      const ws = await defaultWorkspace(client, userId);
      if (!ws) continue;
      const did = mode === "anomaly" ? await runAnomaly(client, userId, ws, today) : await runWeekly(client, userId, ws, today);
      if (did) emitted += 1;
    } catch (e) {
      console.warn("[proactive-insights]", mode, userId, e instanceof Error ? e.message : e);
    }
  }

  return json({ ok: true, mode, today, emitted });
});
