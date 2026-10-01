import { format } from "date-fns";
import { es } from "date-fns/locale";

import { parseDisplayDate } from "../../../lib/date";
import type { AccountMovementAnalytics } from "../../../services/queries/accounts";

const VISIBLE_CATEGORIES = 4;

export function buildAccountAnalytics(
  accountId: number,
  movements: AccountMovementAnalytics[],
  limit: number,
) {
  if (movements.length === 0) return null;

  let totalIn = 0;
  let totalOut = 0;
  let transferOut = 0;
  let uncategorized = 0;
  let uncategorizedCount = 0;
  let oldest = movements[0].occurredAt;
  let newest = movements[0].occurredAt;
  const byCategory = new Map<string, number>();
  const byMonth = new Map<string, { income: number; expense: number }>();

  for (const movement of movements) {
    if (movement.occurredAt < oldest) oldest = movement.occurredAt;
    if (movement.occurredAt > newest) newest = movement.occurredAt;

    // La fecha local de Perú evita mover operaciones nocturnas al mes siguiente.
    const monthKey = format(parseDisplayDate(movement.occurredAt), "yyyy-MM");
    const month = byMonth.get(monthKey) ?? { income: 0, expense: 0 };

    if (movement.destinationAccountId === accountId && movement.destinationAmount != null) {
      totalIn += movement.destinationAmount;
      month.income += movement.destinationAmount;
    }
    if (movement.sourceAccountId === accountId && movement.sourceAmount != null) {
      totalOut += movement.sourceAmount;
      month.expense += movement.sourceAmount;
      if (movement.movementType === "transfer") {
        transferOut += movement.sourceAmount;
      } else if (movement.categoryName) {
        byCategory.set(
          movement.categoryName,
          (byCategory.get(movement.categoryName) ?? 0) + movement.sourceAmount,
        );
      } else {
        uncategorized += movement.sourceAmount;
        uncategorizedCount += 1;
      }
    }
    byMonth.set(monthKey, month);
  }

  const rankedCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const visibleCategories = rankedCategories.slice(0, VISIBLE_CATEGORIES);
  const remainingCategories = rankedCategories.slice(VISIBLE_CATEGORIES);
  const months = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6)
    .map(([key, values]) => {
      const [year, month] = key.split("-").map(Number);
      return {
        key,
        label: format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: es }),
        ...values,
        net: values.income - values.expense,
      };
    });

  return {
    count: movements.length,
    from: parseDisplayDate(oldest),
    to: parseDisplayDate(newest),
    truncated: movements.length >= limit,
    totalIn,
    totalOut,
    netFlow: totalIn - totalOut,
    spent: totalOut - transferOut,
    transferOut,
    uncategorized,
    uncategorizedCount,
    visibleCategories,
    remainingCategoryCount: remainingCategories.length,
    remainingCategoryTotal: remainingCategories.reduce((sum, [, amount]) => sum + amount, 0),
    maxCategoryAmount: Math.max(uncategorized, visibleCategories[0]?.[1] ?? 0, 1),
    months,
  };
}
