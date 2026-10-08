import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS } from "../../../constants/theme";
import { EMAIL_SOURCE_PACKAGE } from "../../../services/queries/inbound-email-alias";
import type { DetectedMovementSuggestion } from "../../../services/queries/notification-detection";
import type { DetectionDraft } from "./review-draft";
import { todayPeru } from "../../../lib/date";
import { parseAmountInput } from "../../../lib/amount-parsing";

export function detectionTone(type: string): string {
  return type === "transfer" ? COLORS.transfer : type === "income" ? COLORS.income : COLORS.expense;
}
export function detectionAmount(amount: string | number, currency: string, type: string): string {
  const value = typeof amount === "number" ? amount : parseAmountInput(amount) ?? NaN;
  return `${type === "income" ? "+" : type === "expense" ? "−" : ""}${formatCurrency(Number.isFinite(value) ? Math.abs(value) : 0, currency)}`;
}
export function detectionContext(suggestion: DetectedMovementSuggestion, draft: DetectionDraft): string {
  const label = draft.movementType === "transfer" ? "Transferencia" : draft.movementType === "income" ? "Ingreso" : "Gasto";
  const date = draft.date === todayPeru() ? "hoy" : draft.date.split("-").reverse().join("/");
  return `${label} · ${date} ${draft.time} · ${suggestion.appLabel} · ${suggestion.packageName === EMAIL_SOURCE_PACKAGE ? "Por correo" : "Por notificación"}`;
}
