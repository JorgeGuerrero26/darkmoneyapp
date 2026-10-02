import type { CategoryPostedMovement } from "../../../types/domain";
import { buildCurrencyBreakdown } from "../../../lib/analytics-currency";
import { analyticsMonthKey, analyticsMonthKeys, catalogMovementAmount, comparableAmount, currencyTotals } from "../../../lib/catalog-money";
import { movementActsAsIncome } from "../../../lib/movement-amounts";

export function buildCategoryAnalytics(movements: CategoryPostedMovement[], categoryId: number, baseCurrencyCode: string, now = new Date()) {
  const filtered = movements.filter((item) => item.categoryId === categoryId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id);
  const monetary = (item: CategoryPostedMovement) => ({
    amount: catalogMovementAmount(item), currencyCode: item.amountCurrencyCode ?? baseCurrencyCode,
    amountInBaseCurrency: item.amountInBaseCurrency,
  });
  const totalsByMonth = new Map(analyticsMonthKeys(now).map((key) => [key, 0]));
  let totalBase = 0;
  let comparableCount = 0;
  for (const item of filtered) {
    const amount = comparableAmount(monetary(item), baseCurrencyCode);
    if (amount == null) continue;
    totalBase += amount; comparableCount++;
    const key = analyticsMonthKey(item.occurredAt);
    if (totalsByMonth.has(key)) totalsByMonth.set(key, totalsByMonth.get(key)! + amount);
  }
  const last12 = [...totalsByMonth].map(([ym, totalBase]) => ({ ym, totalBase }));
  const activeMonths = last12.filter((item) => item.totalBase > 0);
  const totalLast12 = last12.reduce((sum, item) => sum + item.totalBase, 0);
  const strongestMonth = activeMonths.reduce<{ ym: string; totalBase: number } | null>(
    (best, item) => !best || item.totalBase > best.totalBase ? item : best, null,
  );
  return {
    filtered, paymentCount: filtered.length, totalBase, totalLast12, comparableCount,
    unconvertedCount: filtered.length - comparableCount,
    received: currencyTotals(filtered.filter(movementActsAsIncome).map(monetary), baseCurrencyCode),
    spent: currencyTotals(filtered.filter((item) => ["expense", "subscription_payment", "obligation_payment"].includes(item.movementType ?? "") && !movementActsAsIncome(item)).map(monetary), baseCurrencyCode),
    averageBase: comparableCount ? totalBase / comparableCount : 0,
    averageActiveMonthBase: activeMonths.length ? totalLast12 / activeMonths.length : 0,
    last12, strongestMonth, maxBar: Math.max(1, ...last12.map((item) => item.totalBase)),
    breakdown: buildCurrencyBreakdown(filtered.map((item) => monetary(item))),
    latestMovement: filtered[0] ?? null,
  };
}
