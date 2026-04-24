import { COLORS } from "../constants/theme";

export type NotificationPriority = "critical" | "important" | "informational";

const CRITICAL_KINDS = new Set([
  "workspace_invite",
  "obligation_share_invite",
  "obligation_payment_request",
  "obligation_event_delete_request",
  "obligation_event_edit_request",
  "obligation_request_accepted",
  "obligation_request_rejected",
  "negative_balance",
  "obligation_overdue",
  "subscription_overdue",
]);

const IMPORTANT_KINDS = new Set([
  "obligation_due",
  "multiple_obligations_overdue",
  "multiple_subscriptions_due",
  "subscription_reminder",
  "low_balance",
  "high_interest_obligation",
  "obligation_no_payment",
  "obligation_event_unlinked",
]);

export function getNotificationPriority(kind: string): NotificationPriority {
  if (CRITICAL_KINDS.has(kind)) return "critical";
  if (IMPORTANT_KINDS.has(kind)) return "important";
  return "informational";
}

export function getNotificationPriorityMeta(priority: NotificationPriority) {
  switch (priority) {
    case "critical":
      return {
        label: "Crítica",
        color: COLORS.danger,
        bg: COLORS.danger + "1A",
        border: COLORS.danger + "40",
        title: "Críticas",
        subtitle: "No esperan el límite diario y suelen pedir acción rápida.",
      };
    case "important":
      return {
        label: "Importante",
        color: COLORS.warning,
        bg: COLORS.warning + "18",
        border: COLORS.warning + "3A",
        title: "Importantes",
        subtitle: "Pueden salir por push, pero con límite diario.",
      };
    default:
      return {
        label: "Informativa",
        color: COLORS.storm,
        bg: COLORS.storm + "14",
        border: COLORS.storm + "30",
        title: "Informativas",
        subtitle: "Se quedan en bandeja para no saturarte.",
      };
  }
}
