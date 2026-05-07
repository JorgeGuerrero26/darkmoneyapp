import {
  AlertTriangle,
  BarChart2,
  Bell,
  Calendar,
  Clock,
  CreditCard,
  Mail,
  Percent,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";

import { COLORS } from "../../../constants/theme";

export type NotificationKindMeta = {
  icon: LucideIcon;
  color: string;
};

export function getNotificationKindMeta(kind: string): NotificationKindMeta {
  switch (kind) {
    case "budget_alert":
      return { icon: TrendingUp, color: COLORS.warning };
    case "budget_period_ending":
      return { icon: Clock, color: COLORS.warning };
    case "daily_workspace_summary":
      return { icon: Bell, color: COLORS.storm };
    case "daily_cashflow_check":
      return { icon: Scale, color: COLORS.storm };
    case "daily_budget_review":
      return { icon: BarChart2, color: COLORS.storm };
    case "subscription_reminder":
      return { icon: RefreshCw, color: COLORS.ember };
    case "subscription_overdue":
      return { icon: AlertTriangle, color: COLORS.danger };
    case "multiple_subscriptions_due":
      return { icon: Calendar, color: COLORS.ember };
    case "obligation_due":
      return { icon: Clock, color: COLORS.warning };
    case "obligation_overdue":
      return { icon: AlertTriangle, color: COLORS.danger };
    case "obligation_no_payment":
    case "obligation_event_unlinked":
    case "obligation_payment_request":
    case "obligation_request_accepted":
    case "obligation_request_rejected":
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
      return { icon: CreditCard, color: COLORS.primary };
    case "obligation_share_invite":
      return { icon: Mail, color: COLORS.pine };
    case "workspace_invite":
      return { icon: Mail, color: COLORS.primary };
    case "multiple_obligations_overdue":
      return { icon: AlertTriangle, color: COLORS.danger };
    case "high_interest_obligation":
      return { icon: Percent, color: COLORS.danger };
    case "low_balance":
      return { icon: Wallet, color: COLORS.warning };
    case "negative_balance":
      return { icon: TrendingDown, color: COLORS.danger };
    case "account_dormant":
      return { icon: Bell, color: COLORS.storm };
    case "no_income_month":
      return { icon: TrendingDown, color: COLORS.warning };
    case "high_expense_month":
      return { icon: TrendingUp, color: COLORS.danger };
    case "category_spending_spike":
      return { icon: BarChart2, color: COLORS.warning };
    case "expense_income_imbalance":
      return { icon: Scale, color: COLORS.warning };
    case "net_worth_negative":
      return { icon: AlertTriangle, color: COLORS.danger };
    case "savings_rate_low":
      return { icon: TrendingDown, color: COLORS.warning };
    case "subscription_cost_heavy":
      return { icon: RefreshCw, color: COLORS.warning };
    case "upcoming_annual_subscription":
      return { icon: Calendar, color: COLORS.ember };
    case "no_movements_week":
      return { icon: Bell, color: COLORS.storm };
    default:
      return { icon: Bell, color: COLORS.storm };
  }
}

export function payloadString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}
