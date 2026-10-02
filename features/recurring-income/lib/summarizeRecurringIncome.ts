import type { RecurringIncomeSummary } from "../../../types/domain";
import { monthlyRecurringIncomeEquivalent } from "./recurringIncomeFilters";
import { recurringIncomeStanding } from "./recurringIncomeStanding";

export type RecurringIncomeListSummary = {
  activeCount: number;
  pausedCount: number;
  unconfirmedCount: number;
  monthlyTotal: number;
  comparableActiveCount: number;
  excludedActiveCount: number;
  unconfirmedTotal: number;
  excludedUnconfirmedCount: number;
};

/** Summarizes only amounts that can safely be expressed in the workspace currency. */
export function summarizeRecurringIncome(
  items: RecurringIncomeSummary[],
  baseCurrencyCode: string,
  today: string,
): RecurringIncomeListSummary {
  const result: RecurringIncomeListSummary = {
    activeCount: 0,
    pausedCount: 0,
    unconfirmedCount: 0,
    monthlyTotal: 0,
    comparableActiveCount: 0,
    excludedActiveCount: 0,
    unconfirmedTotal: 0,
    excludedUnconfirmedCount: 0,
  };
  const base = baseCurrencyCode.toUpperCase();

  for (const item of items) {
    if (item.status === "paused") {
      result.pausedCount += 1;
      continue;
    }
    if (item.status !== "active") continue;

    result.activeCount += 1;
    const unconfirmed = item.nextExpectedDate < today;
    if (unconfirmed) result.unconfirmedCount += 1;

    const converted = item.amountInBaseCurrency;
    const comparableAmount = item.currencyCode.toUpperCase() === base
      ? item.amount
      : converted != null && Number.isFinite(converted) && (converted > 0 || item.amount === 0)
        ? converted
        : null;

    if (comparableAmount == null || !Number.isFinite(comparableAmount)) {
      result.excludedActiveCount += 1;
      if (unconfirmed) result.excludedUnconfirmedCount += 1;
      continue;
    }

    result.comparableActiveCount += 1;
    result.monthlyTotal += monthlyRecurringIncomeEquivalent(
      comparableAmount,
      item.frequency,
      item.intervalCount,
    );

    if (unconfirmed) {
      const standing = recurringIncomeStanding({
        item,
        today,
        formatAmount: String,
        formatDate: (value) => value,
      });
      result.unconfirmedTotal += standing.missedArrivals * comparableAmount;
    }
  }

  return result;
}
