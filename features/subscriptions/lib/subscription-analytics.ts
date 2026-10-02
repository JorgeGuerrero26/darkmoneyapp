import { format, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { getSubscriptionAnnualCost, movementAmountForSubscriptionAnalytics } from "../../../lib/subscription-helpers";
import type { SubscriptionPostedMovement, SubscriptionSummary } from "../../../types/domain";

export type SubscriptionAnalyticsMonth = { key: string; label: string; total: number };
export type SubscriptionAnalyticsCurrency = { code: string; total: number; count: number };

export type SubscriptionAnalytics = {
  annualEstimate: number | null;
  monthlyEstimate: number | null;
  paymentCount: number;
  currencies: SubscriptionAnalyticsCurrency[];
  comparableCount: number;
  comparableTotal: number;
  months: SubscriptionAnalyticsMonth[];
  latestPayment: SubscriptionPostedMovement | null;
};

/** Keeps currencies separate; a payment joins the base-currency series only with a valid conversion. */
export function buildSubscriptionAnalytics(
  subscription: SubscriptionSummary,
  movements: SubscriptionPostedMovement[],
  baseCurrencyCode: string,
  today = new Date(),
): SubscriptionAnalytics {
  const payments = movements
    .filter((movement) => movement.subscriptionId === subscription.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const currencies = new Map<string, SubscriptionAnalyticsCurrency>();
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = subMonths(new Date(today.getFullYear(), today.getMonth(), 1), 11 - index);
    return { key: format(date, "yyyy-MM"), label: format(date, "MMM yy", { locale: es }), total: 0 };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));
  let comparableCount = 0;
  let comparableTotal = 0;

  for (const payment of payments) {
    const amount = movementAmountForSubscriptionAnalytics(payment);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const code = (payment.amountCurrencyCode || subscription.currencyCode).toUpperCase();
    const row = currencies.get(code) ?? { code, total: 0, count: 0 };
    row.total += amount;
    row.count += 1;
    currencies.set(code, row);

    const converted = payment.amountInBaseCurrency;
    const comparable = converted != null && Number.isFinite(converted) && Math.abs(converted) > 0
      ? Math.abs(converted)
      : code === baseCurrencyCode.toUpperCase() ? amount : null;
    if (comparable == null) continue;
    comparableTotal += comparable;
    comparableCount += 1;
    const month = monthByKey.get(payment.occurredAt.slice(0, 7));
    if (month) month.total += comparable;
  }

  const annualEstimate = subscription.frequency === "custom"
    ? null
    : getSubscriptionAnnualCost(subscription.amount, subscription.frequency, subscription.intervalCount);
  return {
    annualEstimate,
    monthlyEstimate: annualEstimate == null ? null : annualEstimate / 12,
    paymentCount: payments.length,
    currencies: [...currencies.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    comparableCount,
    comparableTotal,
    months,
    latestPayment: payments[0] ?? null,
  };
}
