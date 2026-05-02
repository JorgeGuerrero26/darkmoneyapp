import { obligationShareHref } from "./obligation-share-link";
import { workspaceInviteHref } from "./workspace-invite-link";

type NotificationPayload = Record<string, unknown> | null | undefined;

function payloadNumber(payload: NotificationPayload, key: string): number | null {
  const value = payload?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function payloadString(payload: NotificationPayload, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveNotificationNavigationTarget(input: {
  kind: string;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  payload?: NotificationPayload;
}) {
  const { kind, relatedEntityType, relatedEntityId, payload } = input;
  const id = relatedEntityId ?? null;
  const obligationIdFromPayload = payloadNumber(payload, "obligationId");
  const requestIdFromPayload = payloadNumber(payload, "requestId");
  const eventIdFromPayload = payloadNumber(payload, "eventId");
  const responseStatusFromPayload = payloadString(payload, "responseStatus");
  const obligationRouteId =
    obligationIdFromPayload ?? (relatedEntityType === "obligation" ? id : null);

  switch (kind) {
    case "daily_digest":
      return "/notifications";
    case "budget_alert":
    case "budget_period_ending":
      return "/(app)/budgets?from=notifications";
    case "subscription_reminder":
    case "subscription_overdue":
      return id ? `/subscription/${id}` : "/subscriptions";
    case "multiple_subscriptions_due":
      return "/subscriptions";
    case "obligation_due":
    case "obligation_overdue":
    case "obligation_no_payment":
    case "high_interest_obligation":
      return obligationRouteId ? `/obligation/${obligationRouteId}` : "/(app)/obligations";
    case "multiple_obligations_overdue":
      return "/(app)/obligations";
    case "obligation_event_unlinked":
      return obligationRouteId
        ? {
            pathname: "/obligation/[id]",
            params: {
              id: String(obligationRouteId),
              eventId: String(eventIdFromPayload ?? ""),
              notificationKind: kind,
            },
          }
        : "/(app)/obligations";
    case "obligation_payment_request":
      if (!obligationRouteId) return "/(app)/obligations";
      if (responseStatusFromPayload === "accepted" || responseStatusFromPayload === "rejected") {
        return `/obligation/${obligationRouteId}`;
      }
      return {
        pathname: "/obligation/[id]",
        params: {
          id: String(obligationRouteId),
          paymentRequestId: String(requestIdFromPayload ?? id ?? ""),
          notificationKind: kind,
        },
      };
    case "obligation_share_invite": {
      const token = payloadString(payload, "token");
      return token ? obligationShareHref(token) : "/(app)/obligations";
    }
    case "workspace_invite": {
      const token = payloadString(payload, "token");
      return token ? workspaceInviteHref(token) : "/notifications";
    }
    case "obligation_request_accepted":
    case "obligation_request_rejected":
      return obligationRouteId ? `/obligation/${obligationRouteId}` : "/(app)/obligations";
    case "obligation_event_delete_request":
    case "obligation_event_delete_pending":
    case "obligation_event_delete_accepted":
    case "obligation_event_delete_rejected":
    case "obligation_event_deleted":
    case "obligation_event_edit_request":
    case "obligation_event_edit_pending":
    case "obligation_event_edit_accepted":
    case "obligation_event_edit_rejected":
    case "obligation_event_updated":
      return obligationRouteId
        ? {
            pathname: "/obligation/[id]",
            params: {
              id: String(obligationRouteId),
              eventId: String(eventIdFromPayload ?? id ?? ""),
              notificationKind: kind,
            },
          }
        : "/(app)/obligations";
    case "low_balance":
    case "negative_balance":
    case "account_dormant":
      return id ? `/account/${id}` : "/(app)/accounts";
    case "upcoming_annual_subscription":
      return id ? `/subscription/${id}` : "/subscriptions";
    case "recurring_income_reminder":
      return "/recurring-income";
    case "savings_rate_low":
    case "subscription_cost_heavy":
    case "no_movements_week":
    case "no_income_month":
    case "high_expense_month":
    case "category_spending_spike":
    case "expense_income_imbalance":
    case "net_worth_negative":
      return "/(app)/dashboard";
    default:
      return "/notifications";
  }
}
