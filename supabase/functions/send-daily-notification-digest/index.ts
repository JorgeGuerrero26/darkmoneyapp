/**
 * Deploy:
 *   npx supabase functions deploy send-daily-notification-digest --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInformationalNotificationKind } from "../_shared/notification-priority.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const LIMA_TIMEZONE = "America/Lima";

const KIND_LABELS: Record<string, string> = {
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
      .select("kind, scheduled_for, status")
      .eq("user_id", userId)
      .eq("channel", "in_app")
      .neq("status", "read")
      .order("scheduled_for", { ascending: false })
      .limit(100);
    if (notificationsError) {
      results.push({ userId, ok: false, error: notificationsError.message });
      continue;
    }

    const todaysInformational = (notifications ?? []).filter((row) => {
      const kind = typeof row.kind === "string" ? row.kind : "";
      const scheduledFor = typeof row.scheduled_for === "string" ? row.scheduled_for : "";
      if (!isInformationalNotificationKind(kind) || !scheduledFor) return false;
      return usageDateInLima(new Date(scheduledFor)) === digestDate;
    });

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
    });
  }

  return json({ ok: true, digestDate, results });
});
