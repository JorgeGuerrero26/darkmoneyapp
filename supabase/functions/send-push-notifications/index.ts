/**
 * send-push-notifications
 *
 * Supabase Edge Function triggered by a Database Webhook on the `notifications`
 * table (INSERT events). For each new notification row it:
 *   1. Looks up the user's Expo push token in `notification_preferences`
 *   2. Sends the notification via the Expo Push API
 *   3. Marks the row as `sent`
 *
 * Setup (Supabase Dashboard → Database → Webhooks):
 *   - Table:  notifications
 *   - Events: INSERT
 *   - URL:    https://cawrdzrcipgibcoefltr.supabase.co/functions/v1/send-push-notifications
 *   - HTTP method: POST
 *   - Add header: x-webhook-secret: <any secret you choose>
 *   Set that same secret as env var WEBHOOK_SECRET in the function (Supabase → Edge Functions → Secrets)
 *
 * Deploy (--no-verify-jwt because caller is a DB webhook, not a user):
 *   npx supabase functions deploy send-push-notifications --no-verify-jwt --project-ref cawrdzrcipgibcoefltr
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyNotificationKind,
  expoPushPriority,
  type NotificationPriority,
} from "../_shared/notification-priority.ts";

interface NotificationRecord {
  id: number;
  user_id: string;
  title: string;
  body: string;
  kind: string;
  channel: string;
  status: string;
  related_entity_type: string | null;
  related_entity_id: number | null;
  payload: Record<string, unknown> | null;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: NotificationRecord;
  old_record: NotificationRecord | null;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DAILY_IMPORTANT_PUSH_LIMIT = 3;
const LIMA_TIMEZONE = "America/Lima";
type DeliveryDecision = "sent" | "skipped_daily_limit" | "skipped_priority" | "skipped_no_token";

function usageDateInLima(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function logDeliveryDecision(
  supabase: ReturnType<typeof createClient>,
  record: NotificationRecord,
  priority: NotificationPriority,
  decision: DeliveryDecision,
  bypassDailyLimit: boolean,
) {
  const { error } = await supabase
    .from("notification_push_delivery_log")
    .upsert({
      notification_id: record.id,
      user_id: record.user_id,
      kind: record.kind,
      priority,
      decision,
      usage_date: usageDateInLima(),
      bypass_daily_limit: bypassDailyLimit,
    }, { onConflict: "notification_id" });

  if (error) {
    console.warn("[PushNotif] delivery log error:", error.message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify webhook secret to prevent unauthorized calls
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const incoming = req.headers.get("x-webhook-secret");
    if (incoming !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Only handle INSERT events on the notifications table
  if (payload.type !== "INSERT" || payload.table !== "notifications") {
    return new Response("Ignored", { status: 200 });
  }

  const record = payload.record;

  // Only process in_app channel notifications (our generator produces these)
  if (!record?.user_id || record.channel !== "in_app") {
    return new Response("Skipped", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[PushNotif] Missing env vars");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const priority = classifyNotificationKind(record.kind);
  const bypassDailyLimit = priority === "critical";

  if (priority === "informational") {
    await logDeliveryDecision(supabase, record, priority, "skipped_priority", false);
    return new Response("Skipped by priority", { status: 200 });
  }

  // Look up push token
  const { data: pref } = await supabase
    .from("notification_preferences")
    .select("push_token, platform")
    .eq("user_id", record.user_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!pref?.push_token) {
    await logDeliveryDecision(supabase, record, priority, "skipped_no_token", bypassDailyLimit);
    // User hasn't granted push permissions — nothing to do
    return new Response("No push token", { status: 200 });
  }

  if (!bypassDailyLimit) {
    const usageDate = usageDateInLima();
    const { count, error: countError } = await supabase
      .from("notification_push_delivery_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", record.user_id)
      .eq("usage_date", usageDate)
      .eq("decision", "sent")
      .eq("bypass_daily_limit", false);

    if (countError) {
      console.warn("[PushNotif] delivery count error:", countError.message);
    } else if ((count ?? 0) >= DAILY_IMPORTANT_PUSH_LIMIT) {
      await logDeliveryDecision(supabase, record, priority, "skipped_daily_limit", false);
      return new Response("Daily limit reached", { status: 200 });
    }
  }

  // Send via Expo Push API
  const payload =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? record.payload
      : {};
  const notificationType =
    typeof payload.type === "string" && payload.type.trim()
      ? payload.type.trim()
      : record.kind;

  const pushBody = {
    to: pref.push_token,
    title: record.title,
    body: record.body,
    data: {
      ...payload,
      type: notificationType,
      kind: record.kind,
      priority,
      relatedEntityType: record.related_entity_type,
      relatedEntityId: record.related_entity_id,
    },
    sound: "default",
    badge: 1,
    priority: expoPushPriority(priority),
  };

  let pushRes: Response;
  try {
    pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(pushBody),
    });
  } catch (fetchErr) {
    console.error("[PushNotif] Network error calling Expo:", fetchErr);
    return new Response("Network error", { status: 502 });
  }

  if (!pushRes.ok) {
    const errText = await pushRes.text();
    console.error("[PushNotif] Expo API error:", pushRes.status, errText);
    return new Response("Push failed", { status: 500 });
  }

  const pushResult = await pushRes.json();
  const ticket = pushResult?.data;

  if (ticket?.status === "error") {
    console.warn("[PushNotif] Expo ticket error:", ticket.details);
    // If token is invalid, deactivate it
    if (ticket.details?.error === "DeviceNotRegistered") {
      await supabase
        .from("notification_preferences")
        .update({ is_active: false })
        .eq("user_id", record.user_id);
    }
    return new Response("Push ticket error", { status: 200 });
  }

  // Mark notification as sent
  await supabase
    .from("notifications")
    .update({ status: "sent" })
    .eq("id", record.id);

  await logDeliveryDecision(supabase, record, priority, "sent", bypassDailyLimit);

  return new Response("OK", { status: 200 });
});
