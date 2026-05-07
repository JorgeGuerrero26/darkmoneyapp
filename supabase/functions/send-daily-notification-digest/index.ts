/**
 * Deploy:
 *   npx supabase functions deploy send-daily-notification-digest --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInformationalNotificationKind } from "../_shared/notification-priority.ts";

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
  scheduled_for: string | null;
  status: string | null;
  related_entity_type: string | null;
  related_entity_id: number | null;
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

function dailyBaselineEntityId(digestDate: string, index: number): number {
  return Number(digestDate.replace(/-/g, "")) * 10 + index + 1;
}

function buildDailyBaselineRows(userId: string, digestDate: string, nowIso: string) {
  return [
    {
      user_id: userId,
      channel: "in_app",
      status: "pending",
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
      channel: "in_app",
      status: "pending",
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
      channel: "in_app",
      status: "pending",
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
    if (status === "read" || !isInformationalNotificationKind(kind) || !scheduledFor) return false;
    return usageDateInLima(new Date(scheduledFor)) === digestDate;
  });
}

async function ensureDailyInformationalMinimum(
  supabase: ReturnType<typeof createClient>,
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
        scheduled_for: row.scheduled_for,
        status: row.status,
        related_entity_type: row.related_entity_type,
        related_entity_id: row.related_entity_id,
      })),
    ],
    addedCount: rows.length,
  };
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const digestDate = usageDateInLima();

  const { data: prefs, error: prefsError } = await supabase
    .from("notification_preferences")
    .select("user_id, push_token, daily_digest_enabled")
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
      .select("kind, scheduled_for, status, related_entity_type, related_entity_id")
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
    const pushBody = {
      to: pushToken,
      title: "Resumen diario de DarkMoney",
      body: buildDigestBody(todaysInformational.length, labels),
      data: {
        type: "daily_digest",
        count: todaysInformational.length,
        topKinds: kinds.slice(0, 5),
      },
      sound: "default",
      badge: 1,
      priority: "normal",
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
    });
  }

  return json({ ok: true, digestDate, results });
});
