/**
 * Deploy:
 *   npx supabase functions deploy send-daily-notification-digest --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../_shared/database-types.ts";
import { isInformationalNotificationKind } from "../_shared/notification-priority.ts";
import { generateDailyAiDigest } from "../_shared/daily-ai-digest.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const LIMA_TIMEZONE = "America/Lima";
const DAILY_INFORMATIONAL_MINIMUM = 3;

const KIND_LABELS: Record<string, string> = {
  daily_workspace_summary: "resumen",
  daily_cashflow_check: "flujo",
  daily_budget_review: "revisión",
  budget_alert: "presupuestos",
  budget_period_ending: "presupuestos",
  account_dormant: "cuentas",
  no_income_month: "ingresos",
  high_expense_month: "gastos",
  category_spending_spike: "categorías",
  expense_income_imbalance: "flujo",
  net_worth_negative: "patrimonio",
  savings_rate_low: "ahorro",
  subscription_cost_heavy: "suscripciones",
  upcoming_annual_subscription: "suscripciones",
  no_movements_week: "actividad",
};

type DigestNotificationRow = {
  kind: string | null;
  title?: string | null;
  body?: string | null;
  scheduled_for: string | null;
  status: string | null;
  related_entity_type: string | null;
  related_entity_id: number | null;
  payload?: unknown;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function usageDateInLima(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function topTopicLabels(kinds: string[]): string[] {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    const label = KIND_LABELS[kind] ?? "finanzas";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label);
}

function buildDigestBody(count: number, labels: string[]): string {
  const topics = labels.length > 0 ? labels.join(", ") : "tu actividad financiera";
  return count === 1
    ? `Hoy tienes 1 alerta informativa sobre ${topics}. Revísala cuando tengas un momento.`
    : `Hoy tienes ${count} alertas informativas sobre ${topics}. Revísalas en tu bandeja cuando tengas un momento.`;
}

function buildDailyAiDigestEntityId(digestDate: string): number {
  return Number(digestDate.replace(/-/g, "")) * 10 + 9;
}

function dailyBaselineEntityId(digestDate: string, index: number): number {
  return Number(digestDate.replace(/-/g, "")) * 10 + index + 1;
}

function buildDailyBaselineRows(userId: string, digestDate: string, nowIso: string) {
  return [
    {
      user_id: userId,
      channel: "in_app" as const,
      status: "pending" as const,
      kind: "daily_workspace_summary",
      title: "Resumen financiero del día",
      body: "Tienes tu resumen diario listo para revisar cómo va tu workspace.",
      scheduled_for: nowIso,
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(digestDate, 0),
      payload: { todayKey: digestDate, generatedBy: "daily_digest" },
    },
    {
      user_id: userId,
      channel: "in_app" as const,
      status: "pending" as const,
      kind: "daily_cashflow_check",
      title: "Chequeo de flujo",
      body: "Revisa ingresos y gastos registrados para mantener claro tu margen del mes.",
      scheduled_for: nowIso,
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(digestDate, 1),
      payload: { todayKey: digestDate, generatedBy: "daily_digest" },
    },
    {
      user_id: userId,
      channel: "in_app" as const,
      status: "pending" as const,
      kind: "daily_budget_review",
      title: "Revisión diaria",
      body: "Haz una revisión rápida de presupuestos, obligaciones y suscripciones activas.",
      scheduled_for: nowIso,
      related_entity_type: "daily_digest",
      related_entity_id: dailyBaselineEntityId(digestDate, 2),
      payload: { todayKey: digestDate, generatedBy: "daily_digest" },
    },
  ];
}

function filterTodaysInformational(
  notifications: DigestNotificationRow[],
  digestDate: string,
) {
  return notifications.filter((row) => {
    const kind = typeof row.kind === "string" ? row.kind : "";
    const scheduledFor = typeof row.scheduled_for === "string" ? row.scheduled_for : "";
    const status = typeof row.status === "string" ? row.status : "";
    if (kind === "daily_ai_digest" || status === "read" || !isInformationalNotificationKind(kind) || !scheduledFor) {
      return false;
    }
    return usageDateInLima(new Date(scheduledFor)) === digestDate;
  });
}

async function ensureDailyInformationalMinimum(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  digestDate: string,
  notifications: DigestNotificationRow[],
): Promise<{ notifications: DigestNotificationRow[]; addedCount: number; error?: string }> {
  const todaysInformational = filterTodaysInformational(notifications, digestDate);
  const missingCount = DAILY_INFORMATIONAL_MINIMUM - todaysInformational.length;
  if (missingCount <= 0) return { notifications, addedCount: 0 };

  const existingDailyKeys = new Set(
    notifications
      .filter((row) => {
        const scheduledFor = typeof row.scheduled_for === "string" ? row.scheduled_for : "";
        return scheduledFor && usageDateInLima(new Date(scheduledFor)) === digestDate;
      })
      .map((row) => `${row.kind}:${row.related_entity_type}:${row.related_entity_id}`),
  );
  const nowIso = new Date().toISOString();
  const rows = buildDailyBaselineRows(userId, digestDate, nowIso)
    .filter((row) => !existingDailyKeys.has(`${row.kind}:${row.related_entity_type}:${row.related_entity_id}`))
    .slice(0, missingCount);
  if (!rows.length) return { notifications, addedCount: 0 };

  const { error } = await supabase
    .from("notifications")
    .upsert(rows, {
      onConflict: "user_id,related_entity_type,related_entity_id,kind",
      ignoreDuplicates: true,
    });

  if (error) {
    return { notifications, addedCount: 0, error: error.message };
  }

  return {
    notifications: [
      ...notifications,
      ...rows.map((row) => ({
        kind: row.kind,
        title: row.title,
        body: row.body,
        scheduled_for: row.scheduled_for,
        status: row.status,
        related_entity_type: row.related_entity_type,
        related_entity_id: row.related_entity_id,
        payload: row.payload,
      })),
    ],
    addedCount: rows.length,
  };
}

type PredictiveInput = {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
  todayKey: string; // YYYY-MM-DD en Lima
};

/**
 * Calcula y upsertea (si aplica) las 2 alertas predictivas del día para un usuario:
 *   - cash_runway_alert: el saldo líquido proyectado se agota antes de fin de mes.
 *   - commitments_vs_balance: compromisos (obligaciones + suscripciones) del resto
 *     del mes superan el saldo disponible.
 * Idempotente por día (related_entity_id = YYYYMMDD) vía upsert + ignoreDuplicates.
 */
async function insertPredictiveAlerts({ supabase, userId, todayKey }: PredictiveInput): Promise<void> {
  const entityId = Number(todayKey.replace(/-/g, ""));

  // 1) Workspace por defecto del usuario (fallback: el primero no archivado)
  const { data: workspaces } = await supabase
    .from("v_user_workspaces")
    .select("workspace_id, is_default_workspace, base_currency_code, is_archived")
    .eq("user_id", userId);
  if (!workspaces?.length) return;
  const workspace =
    workspaces.find((w) => w.is_default_workspace) ??
    workspaces.find((w) => !w.is_archived);
  if (!workspace) return;
  const workspaceId = workspace.workspace_id;
  const base = workspace.base_currency_code;
  // Columnas nullable en la vista: sin workspace o sin moneda base no hay cálculo posible.
  if (workspaceId == null || !base) return;

  // 2) Saldos del workspace (todas las cuentas, para mapear account_id → currency_code)
  const { data: accountBalances } = await supabase
    .from("v_account_balances")
    .select("account_id, type, currency_code, current_balance")
    .eq("workspace_id", workspaceId);
  if (!accountBalances?.length) return;
  const currencyByAccount = new Map(accountBalances.map((a) => [a.account_id, a.currency_code]));

  // Excluir cuentas archivadas (v_account_balances no trae ese flag)
  const { data: accountsMeta } = await supabase
    .from("accounts")
    .select("id, is_archived")
    .eq("workspace_id", workspaceId);
  const archivedIds = new Set((accountsMeta ?? []).filter((a) => a.is_archived).map((a) => a.id));

  const liquid = accountBalances.filter(
    (a) =>
      a.account_id != null &&
      a.type != null &&
      a.currency_code != null &&
      !archivedIds.has(a.account_id) &&
      ["bank", "cash", "savings"].includes(a.type),
  );
  if (!liquid.length) return;

  // 3) Tasas persistidas → todo a la moneda base del workspace
  const { data: rates } = await supabase
    .from("v_latest_exchange_rates")
    .select("from_currency_code, to_currency_code, rate");
  const toBase = (amount: number, currency: string): number | null => {
    if (currency === base) return amount;
    const direct = (rates ?? []).find((r) => r.from_currency_code === currency && r.to_currency_code === base);
    if (direct) return amount * Number(direct.rate);
    const inverse = (rates ?? []).find((r) => r.from_currency_code === base && r.to_currency_code === currency);
    if (inverse && Number(inverse.rate) !== 0) return amount / Number(inverse.rate);
    return null; // sin tasa: excluir, no asumir 1:1
  };

  let disponible = 0;
  for (const a of liquid) {
    if (!a.currency_code) continue;
    const v = toBase(Number(a.current_balance), a.currency_code);
    if (v !== null) disponible += v;
  }

  // 4) Gasto promedio diario del mes en curso
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const { data: mvts } = await supabase
    .from("movements")
    .select("movement_type, status, occurred_at, source_amount, source_account_id")
    .eq("workspace_id", workspaceId)
    .eq("movement_type", "expense")
    .eq("status", "posted")
    .gte("occurred_at", monthStart);
  const dayOfMonth = Number(todayKey.slice(8, 10));
  let gastoMes = 0;
  for (const m of mvts ?? []) {
    const currency = currencyByAccount.get(m.source_account_id);
    if (!currency) continue;
    const v = toBase(Number(m.source_amount ?? 0), currency);
    if (v !== null) gastoMes += v;
  }
  const gastoDiario = dayOfMonth > 0 ? gastoMes / dayOfMonth : 0;

  // 5) cash_runway_alert: saldo proyectado llega a 0 antes de fin de mes
  const lastDay = new Date(Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7)), 0).getDate();
  const diasRestantes = lastDay - dayOfMonth;
  if (gastoDiario > 0) {
    const diasDeCaja = disponible / gastoDiario;
    if (diasDeCaja < diasRestantes) {
      const fechaCero = new Date(Date.now() + diasDeCaja * 86_400_000).toISOString().slice(0, 10);
      const { error } = await supabase.from("notifications").upsert([{
        user_id: userId, channel: "in_app", status: "pending",
        kind: "cash_runway_alert",
        title: "Tu saldo no llega a fin de mes",
        body: `A tu ritmo de gasto actual, tu saldo disponible se agota alrededor del ${fechaCero}.`,
        scheduled_for: new Date().toISOString(),
        related_entity_type: "cash_runway", related_entity_id: entityId,
        // El bypass del límite diario de push NO se lee del payload: lo deriva
        // send-push-notifications de la prioridad critical del kind (_shared/notification-priority.ts).
        payload: { projectedZeroDate: fechaCero, available: disponible, dailySpend: gastoDiario },
      }], { onConflict: "user_id,related_entity_type,related_entity_id,kind", ignoreDuplicates: true });
      if (error) {
        console.warn("[Digest] cash_runway_alert upsert failed:", userId, error.message);
      }
    }
  }

  // 6) commitments_vs_balance: compromisos del resto del mes vs disponible
  const monthEnd = `${todayKey.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  const { data: obligations } = await supabase
    .from("v_obligation_summary")
    .select("pending_amount, currency_code, due_date, status, direction")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .eq("direction", "payable")
    .gte("due_date", todayKey)
    .lte("due_date", monthEnd);
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("amount, currency_code, next_due_date, status")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .gte("next_due_date", todayKey)
    .lte("next_due_date", monthEnd);
  let compromisos = 0;
  for (const o of obligations ?? []) {
    if (!o.currency_code) continue;
    const v = toBase(Number(o.pending_amount ?? 0), o.currency_code);
    if (v !== null) compromisos += v;
  }
  for (const s of subs ?? []) {
    if (!s.currency_code) continue;
    const v = toBase(Number(s.amount ?? 0), s.currency_code);
    if (v !== null) compromisos += v;
  }
  if (compromisos > disponible) {
    const { error } = await supabase.from("notifications").upsert([{
      user_id: userId, channel: "in_app", status: "pending",
      kind: "commitments_vs_balance",
      title: "Compromisos superan tu saldo",
      body: `Entre hoy y fin de mes vencen ${compromisos.toFixed(2)} ${base} en obligaciones y suscripciones, y tu saldo disponible es ${disponible.toFixed(2)} ${base}.`,
      scheduled_for: new Date().toISOString(),
      related_entity_type: "commitments_check", related_entity_id: entityId,
      payload: { committed: compromisos, available: disponible, gap: compromisos - disponible },
    }], { onConflict: "user_id,related_entity_type,related_entity_id,kind", ignoreDuplicates: true });
    if (error) {
      console.warn("[Digest] commitments_vs_balance upsert failed:", userId, error.message);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret =
    Deno.env.get("DIGEST_WEBHOOK_SECRET") ??
    Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const incoming = req.headers.get("x-webhook-secret");
    if (incoming !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "Missing Supabase env vars" }, 500);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const digestDate = usageDateInLima();

  const { data: prefs, error: prefsError } = await supabase
    .from("notification_preferences")
    .select("user_id, push_token, daily_digest_enabled, predictive_alerts_enabled")
    .eq("is_active", true)
    .not("push_token", "is", null);
  if (prefsError) {
    return json({ ok: false, error: prefsError.message }, 500);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const pref of prefs ?? []) {
    const userId = String(pref.user_id ?? "");
    const pushToken = typeof pref.push_token === "string" ? pref.push_token : "";
    const dailyDigestEnabled = pref.daily_digest_enabled !== false;

    if (userId && pref.predictive_alerts_enabled !== false) {
      try {
        await insertPredictiveAlerts({ supabase, userId, todayKey: digestDate });
      } catch (e) {
        console.warn("[Digest] predictive alerts failed:", userId, e instanceof Error ? e.message : e);
      }
    }

    if (!dailyDigestEnabled) {
      results.push({ userId, ok: true, skipped: "digest_disabled" });
      continue;
    }
    if (!userId || !pushToken) continue;

    const { data: existingDigest, error: digestError } = await supabase
      .from("notification_digest_daily_log")
      .select("id")
      .eq("user_id", userId)
      .eq("digest_date", digestDate)
      .maybeSingle();
    if (digestError) {
      results.push({ userId, ok: false, error: digestError.message });
      continue;
    }
    if (existingDigest) {
      results.push({ userId, ok: true, skipped: "already_sent_today" });
      continue;
    }

    const { data: notifications, error: notificationsError } = await supabase
      .from("notifications")
      .select("kind, title, body, payload, scheduled_for, status, related_entity_type, related_entity_id")
      .eq("user_id", userId)
      .eq("channel", "in_app")
      .order("scheduled_for", { ascending: false })
      .limit(100);
    if (notificationsError) {
      results.push({ userId, ok: false, error: notificationsError.message });
      continue;
    }

    const minimumResult = await ensureDailyInformationalMinimum(
      supabase,
      userId,
      digestDate,
      (notifications ?? []) as DigestNotificationRow[],
    );
    if (minimumResult.error) {
      results.push({ userId, ok: false, error: minimumResult.error });
      continue;
    }

    const todaysInformational = filterTodaysInformational(
      minimumResult.notifications,
      digestDate,
    );

    if (todaysInformational.length === 0) {
      results.push({ userId, ok: true, skipped: "no_informational_notifications" });
      continue;
    }

    const kinds = todaysInformational
      .map((row) => typeof row.kind === "string" ? row.kind : "")
      .filter(Boolean);
    const labels = topTopicLabels(kinds);
    const aiDigestResult = await generateDailyAiDigest({
      client: supabase,
      userId,
      digestDate,
      notifications: todaysInformational,
      topicLabels: labels,
      surface: "send_daily_notification_digest",
    });
    let pushTitle = "Resumen diario de DarkMoney";
    let pushBodyText = buildDigestBody(todaysInformational.length, labels);
    let aiDigestInserted = false;

    if (aiDigestResult.digest) {
      const nowIso = new Date().toISOString();
      const { error: aiDigestError } = await supabase
        .from("notifications")
        .upsert({
          user_id: userId,
          channel: "in_app" as const,
          status: "pending",
          kind: "daily_ai_digest",
          title: aiDigestResult.digest.title,
          body: aiDigestResult.digest.summary,
          scheduled_for: nowIso,
          related_entity_type: "daily_digest",
          related_entity_id: buildDailyAiDigestEntityId(digestDate),
          payload: {
            todayKey: digestDate,
            generatedBy: "daily_ai_digest",
            model: aiDigestResult.model,
            workspaceId: aiDigestResult.digest.workspaceId,
            highlights: aiDigestResult.digest.highlights,
            actionItems: aiDigestResult.digest.actionItems,
            confidence: aiDigestResult.digest.confidence,
          },
        }, {
          onConflict: "user_id,related_entity_type,related_entity_id,kind",
        });
      if (!aiDigestError) {
        pushTitle = aiDigestResult.digest.title;
        pushBodyText = aiDigestResult.digest.body;
        aiDigestInserted = true;
      }
    }

    // Fallback SIEMPRE: si el digest IA no se insertó (falla o deshabilitado), el push
    // quedaba "huérfano" — el tap llevaba a la bandeja pero el resumen no existía como
    // fila y el usuario no encontraba nada. Insertar la versión resumida clásica.
    if (!aiDigestInserted) {
      const { error: fallbackError } = await supabase
        .from("notifications")
        .upsert({
          user_id: userId,
          channel: "in_app" as const,
          status: "pending",
          kind: "daily_digest",
          title: pushTitle,
          body: pushBodyText,
          scheduled_for: new Date().toISOString(),
          related_entity_type: "daily_digest",
          related_entity_id: Number(digestDate.replace(/-/g, "")),
          payload: {
            todayKey: digestDate,
            generatedBy: "daily_digest_fallback",
            count: todaysInformational.length,
            topKinds: kinds.slice(0, 5),
          },
        }, {
          onConflict: "user_id,related_entity_type,related_entity_id,kind",
          ignoreDuplicates: true,
        });
      if (fallbackError) {
        console.warn("[Digest] fallback digest row upsert failed:", userId, fallbackError.message);
      }
    }
    const pushBody = {
      to: pushToken,
      title: pushTitle,
      body: pushBodyText,
      data: {
        type: "daily_digest",
        kind: aiDigestInserted ? "daily_ai_digest" : "daily_digest",
        relatedEntityType: "daily_digest",
        relatedEntityId: aiDigestInserted ? buildDailyAiDigestEntityId(digestDate) : null,
        count: todaysInformational.length,
        topKinds: kinds.slice(0, 5),
        aiDigest: aiDigestInserted,
      },
      sound: "default",
      badge: 1,
      channelId: "default",
      priority: "high",
    };

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(pushBody),
    });

    if (!pushRes.ok) {
      results.push({ userId, ok: false, error: `Expo ${pushRes.status}` });
      continue;
    }

    const ticket = await pushRes.json();
    const ticketData = ticket?.data;
    if (ticketData?.status === "error") {
      results.push({ userId, ok: false, error: ticketData?.details?.error ?? "push_ticket_error" });
      continue;
    }

    const { error: insertDigestError } = await supabase
      .from("notification_digest_daily_log")
      .insert({
        user_id: userId,
        digest_date: digestDate,
        notification_count: todaysInformational.length,
        top_kinds: kinds.slice(0, 5),
      });
    if (insertDigestError) {
      results.push({ userId, ok: false, error: insertDigestError.message });
      continue;
    }

    results.push({
      userId,
      ok: true,
      sent: true,
      count: todaysInformational.length,
      dailyBaselineAdded: minimumResult.addedCount,
      aiDigest: aiDigestInserted ? "sent" : aiDigestResult.skipped ?? aiDigestResult.error ?? "not_generated",
    });
  }

  return json({ ok: true, digestDate, results });
});
