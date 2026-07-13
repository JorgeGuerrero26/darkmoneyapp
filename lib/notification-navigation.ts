import { buildNotificationReason } from "../features/notifications/lib/reason-labels";
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

const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Rango del mes actual + nombre del mes en español. */
function currentMonthRange(): { from: string; to: string; monthLabel: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(from), to: ymd(to), monthLabel: MONTH_NAMES_ES[now.getMonth()] };
}

/** Rango de los últimos 7 días. */
function lastWeekRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 7);
  return { from: ymd(from), to: ymd(now) };
}

/**
 * Deep link a Movimientos pre-filtrado. `quickScope` activa el bloque de filtros
 * rápidos y `quickToken` (único por tap) fuerza el re-trigger; `quickLabel` se
 * muestra en la ActiveFilterBar como el "porqué" de la notificación.
 */
function movementsQuickLink(opts: {
  label: string;
  type?: string;
  categoryId?: number | null;
  dateFrom?: string;
  dateTo?: string;
}) {
  const params: Record<string, string> = {
    quickScope: "notification",
    quickToken: String(Date.now()),
    quickLabel: opts.label,
  };
  if (opts.type) params.quickType = opts.type;
  if (opts.categoryId && opts.categoryId > 0) params.quickCategoryId = String(opts.categoryId);
  if (opts.dateFrom && opts.dateTo) {
    params.quickDateFrom = opts.dateFrom;
    params.quickDateTo = opts.dateTo;
  }
  return { pathname: "/(app)/movements", params };
}

/** Adjunta la nota del porqué (M2) a una ruta destino. Token único por tap. */
function withReason(kind: string, payload: NotificationPayload, pathname: string, params: Record<string, string> = {}) {
  const reason = buildNotificationReason(kind, payload ?? null);
  if (!reason) return Object.keys(params).length > 0 ? { pathname, params } : pathname;
  return { pathname, params: { ...params, reason, reasonToken: String(Date.now()) } };
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
    case "daily_ai_digest":
    case "daily_workspace_summary":
      // M1: dashboard con el sheet del día abierto (token retrigger, como quickToken).
      return { pathname: "/(app)/dashboard", params: { daySheet: "today", daySheetToken: String(Date.now()) } };
    case "daily_cashflow_check": {
      const { from, to } = currentMonthRange();
      return movementsQuickLink({ label: "Chequeo de flujo del mes", dateFrom: from, dateTo: to });
    }
    case "daily_budget_review":
      return withReason(kind, payload, "/(app)/budgets", { from: "notifications" });
    case "budget_alert":
    case "budget_period_ending":
      return "/budgets?from=notifications";
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
    case "high_expense_month": {
      const { from, to, monthLabel } = currentMonthRange();
      return movementsQuickLink({ label: `Gastos elevados de ${monthLabel}`, type: "expense", dateFrom: from, dateTo: to });
    }
    case "category_spending_spike": {
      const { from, to } = currentMonthRange();
      const catName = payloadString(payload, "categoryName");
      return movementsQuickLink({
        label: catName ? `Gasto alto: ${catName}` : "Gasto elevado en categoría",
        type: "expense",
        categoryId: relatedEntityType === "category" ? id : null,
        dateFrom: from,
        dateTo: to,
      });
    }
    case "no_income_month": {
      const { from, to } = currentMonthRange();
      return movementsQuickLink({ label: "Sin ingresos este mes", type: "income", dateFrom: from, dateTo: to });
    }
    case "expense_income_imbalance": {
      const { from, to } = currentMonthRange();
      return movementsQuickLink({ label: "Gastos vs ingresos del mes", dateFrom: from, dateTo: to });
    }
    case "savings_rate_low": {
      const { from, to } = currentMonthRange();
      return movementsQuickLink({ label: "Ahorro bajo este mes", dateFrom: from, dateTo: to });
    }
    case "no_movements_week": {
      const { from, to } = lastWeekRange();
      return movementsQuickLink({ label: "Sin movimientos (última semana)", dateFrom: from, dateTo: to });
    }
    case "net_worth_negative":
      return "/(app)/accounts";
    case "subscription_cost_heavy":
      return "/subscriptions";
    case "subscription_price_increase":
      return id ? `/subscription/${id}` : "/subscriptions";
    case "possible_duplicate_charge": {
      const day = payloadString(payload, "day");
      const amountLabel = payloadString(payload, "amountLabel");
      return movementsQuickLink({
        label: amountLabel ? `Posible cobro duplicado: ${amountLabel}` : "Posible cobro duplicado",
        type: "expense",
        dateFrom: day ?? undefined,
        dateTo: day ?? undefined,
      });
    }
    case "detected_suggestions_pending":
      return "/notifications";
    case "expected_income_missed":
      return "/recurring-income";
    case "monthly_recap": {
      const from = payloadString(payload, "monthFrom");
      const to = payloadString(payload, "monthTo");
      const monthLabel = payloadString(payload, "monthLabel");
      return from && to
        ? movementsQuickLink({ label: `Resumen de ${monthLabel ?? "el mes"}`, dateFrom: from, dateTo: to })
        : "/(app)/movements";
    }
    case "obligation_milestone":
      return obligationIdFromPayload ? `/obligation/${obligationIdFromPayload}` : "/(app)/obligations";
    case "cash_runway_alert":
      return "/(app)/accounts";
    case "commitments_vs_balance":
      return "/(app)/obligations";
    default:
      return "/notifications";
  }
}
