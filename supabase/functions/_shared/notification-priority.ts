export type NotificationPriority = "critical" | "important" | "informational";

const CRITICAL_KINDS = new Set([
  "workspace_invite",
  "obligation_payment_request",
  "obligation_event_delete_request",
  "obligation_event_edit_request",
  "negative_balance",
  "obligation_overdue",
  "multiple_obligations_overdue",
  "subscription_overdue",
]);

const IMPORTANT_KINDS = new Set([
  "obligation_share_invite",
  "obligation_request_accepted",
  "obligation_request_rejected",
  "obligation_due",
  "multiple_subscriptions_due",
  "subscription_reminder",
  "low_balance",
  "high_interest_obligation",
  "obligation_no_payment",
  "obligation_event_unlinked",
  "obligation_event_delete_pending",
  "obligation_event_delete_accepted",
  "obligation_event_delete_rejected",
  "obligation_event_edit_pending",
  "obligation_event_edit_accepted",
  "obligation_event_edit_rejected",
  "obligation_event_updated",
  "obligation_event_deleted",
]);

export function classifyNotificationKind(kind: string): NotificationPriority {
  if (CRITICAL_KINDS.has(kind)) return "critical";
  if (IMPORTANT_KINDS.has(kind)) return "important";
  return "informational";
}

export function isInformationalNotificationKind(kind: string): boolean {
  return classifyNotificationKind(kind) === "informational";
}

export function expoPushPriority(priority: NotificationPriority): "high" | "default" {
  return priority === "critical" ? "high" : "default";
}
