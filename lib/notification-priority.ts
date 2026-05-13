import { COLORS } from "../constants/theme";

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
  "detected_movement_suggestion",
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
        subtitle: "Riesgo real o acciones humanas que no deberían quedarse esperando.",
      };
    case "important":
      return {
        label: "Importante",
        color: COLORS.warning,
        bg: COLORS.warning + "18",
        border: COLORS.warning + "3A",
        title: "Importantes",
        subtitle: "Necesitan atención, pero sí respetan control para no saturarte.",
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
