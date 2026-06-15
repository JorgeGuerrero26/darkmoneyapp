import { addDays, differenceInDays } from "date-fns";

import { movementDisplayAmount } from "../../../lib/movement-amounts";
import { parseDisplayDate } from "../../../lib/date";
import { findProbableDuplicateGroups } from "../../../services/analytics/duplicate-detection";
import type { DashboardMovementRow } from "./dashboard-row";

import { convertAmt, isCategorizedCashflow, isExpense } from "./aggregations";

export type DashboardReviewInbox = {
  uncategorizedCount: number;
  pendingMovementsCount: number;
  duplicateExpenseGroups: number;
  subscriptionsAttentionCount: number;
  obligationsWithoutPlanCount: number;
  staleObligationsCount: number;
  overdueObligationsCount: number;
  totalIssues: number;
};

export function buildReviewInboxSnapshot(
  movements: DashboardMovementRow[],
  subscriptions: Array<{ accountId?: number | null; nextDueDate: string; status: string }>,
  obligations: Array<{
    pendingAmount: number;
    dueDate: string | null;
    installmentCount?: number | null;
    installmentAmount?: number | null;
    lastPaymentDate?: string | null;
    startDate?: string | null;
    status: string;
  }>,
  now: Date = new Date(),
): DashboardReviewInbox {
  const today = now;
  const uncategorizedCount = movements.filter(
    (movement) =>
      movement.status === "posted" && isCategorizedCashflow(movement) && movement.categoryId == null,
  ).length;

  const pendingMovementsCount = movements.filter((movement) => movement.status === "pending").length;

  const duplicateExpenseGroups = findProbableDuplicateGroups({
    movements: movements.filter(isExpense),
    getAmount: movementDisplayAmount,
  }).length;

  const subscriptionsAttentionCount = subscriptions.filter((subscription) => {
    if (subscription.status !== "active") return false;
    const dueDate = parseDisplayDate(subscription.nextDueDate);
    return !subscription.accountId || dueDate < today;
  }).length;

  const activeObligations = obligations.filter(
    (obligation) => obligation.pendingAmount > 0.009 && obligation.status !== "paid",
  );

  const obligationsWithoutPlanCount = activeObligations.filter(
    (obligation) =>
      !obligation.dueDate &&
      !(obligation.installmentCount && obligation.installmentCount > 0) &&
      !(obligation.installmentAmount && obligation.installmentAmount > 0),
  ).length;

  const staleObligationsCount = activeObligations.filter((obligation) => {
    const referenceDate = obligation.lastPaymentDate ?? obligation.startDate;
    if (!referenceDate) return true;
    return differenceInDays(today, parseDisplayDate(referenceDate)) > 50;
  }).length;

  const overdueObligationsCount = activeObligations.filter(
    (obligation) => obligation.dueDate && parseDisplayDate(obligation.dueDate) < today,
  ).length;

  const totalIssues =
    uncategorizedCount +
    pendingMovementsCount +
    duplicateExpenseGroups +
    subscriptionsAttentionCount +
    obligationsWithoutPlanCount +
    staleObligationsCount +
    overdueObligationsCount;

  return {
    duplicateExpenseGroups,
    obligationsWithoutPlanCount,
    overdueObligationsCount,
    pendingMovementsCount,
    staleObligationsCount,
    subscriptionsAttentionCount,
    totalIssues,
    uncategorizedCount,
  };
}

export type FutureFlowWindow = {
  days: number;
  expectedInflow: number;
  expectedOutflow: number;
  estimatedBalance: number;
  scheduledCount: number;
  receivableCount: number;
  payableCount: number;
  /** Ítems cuyo monto no pudo convertirse a la moneda activa (sumaron 0). */
  unconvertedCount: number;
};

export function convertDashboardCurrency(
  amount: number,
  fromCurrency: string,
  displayCurrency: string,
  exchangeRateMap: Map<string, number>,
  baseCurrency: string,
): number | null {
  return convertAmt(amount, fromCurrency, displayCurrency, exchangeRateMap, baseCurrency);
}

export function buildFutureFlowWindows(
  obligations: Array<{
    direction: string;
    pendingAmount: number;
    installmentAmount?: number | null;
    currencyCode: string;
    dueDate: string | null;
    status: string;
  }>,
  subscriptions: Array<{
    amount: number;
    currencyCode: string;
    nextDueDate: string;
    status: string;
  }>,
  recurringIncome: Array<{
    amount: number;
    currencyCode: string;
    nextExpectedDate: string;
    status: string;
  }>,
  displayCurrency: string,
  exchangeRateMap: Map<string, number>,
  currentVisibleBalance: number,
  baseCurrency: string = displayCurrency,
  now: Date = new Date(),
): FutureFlowWindow[] {
  const today = now;

  function obligationDueAmount(obligation: { pendingAmount: number; installmentAmount?: number | null }) {
    if (obligation.installmentAmount && obligation.installmentAmount > 0) {
      return Math.min(obligation.pendingAmount, obligation.installmentAmount);
    }
    return obligation.pendingAmount;
  }

  return [7, 15, 30].map((days) => {
    const horizon = addDays(today, days);
    let expectedInflow = 0;
    let expectedOutflow = 0;
    let receivableCount = 0;
    let payableCount = 0;
    let scheduledCount = 0;
    let unconvertedCount = 0;

    for (const obligation of obligations) {
      if (!obligation.dueDate || obligation.pendingAmount <= 0.009 || obligation.status === "paid") continue;
      const dueDate = parseDisplayDate(obligation.dueDate);
      if (dueDate < today || dueDate > horizon) continue;
      const convertedAmount = convertDashboardCurrency(
        obligationDueAmount(obligation),
        obligation.currencyCode,
        displayCurrency,
        exchangeRateMap,
        baseCurrency,
      );
      if (convertedAmount === null) unconvertedCount += 1;
      scheduledCount += 1;
      if (obligation.direction === "receivable") {
        receivableCount += 1;
        expectedInflow += convertedAmount ?? 0;
      } else {
        payableCount += 1;
        expectedOutflow += convertedAmount ?? 0;
      }
    }

    for (const subscription of subscriptions) {
      if (subscription.status !== "active") continue;
      const dueDate = parseDisplayDate(subscription.nextDueDate);
      if (dueDate < today || dueDate > horizon) continue;
      scheduledCount += 1;
      const convertedAmount = convertDashboardCurrency(
        subscription.amount,
        subscription.currencyCode,
        displayCurrency,
        exchangeRateMap,
        baseCurrency,
      );
      if (convertedAmount === null) unconvertedCount += 1;
      expectedOutflow += convertedAmount ?? 0;
    }

    for (const income of recurringIncome) {
      if (income.status !== "active") continue;
      const expectedDate = parseDisplayDate(income.nextExpectedDate);
      if (expectedDate < today || expectedDate > horizon) continue;
      scheduledCount += 1;
      const convertedAmount = convertDashboardCurrency(
        income.amount,
        income.currencyCode,
        displayCurrency,
        exchangeRateMap,
        baseCurrency,
      );
      if (convertedAmount === null) unconvertedCount += 1;
      expectedInflow += convertedAmount ?? 0;
    }

    return {
      days,
      estimatedBalance: currentVisibleBalance + expectedInflow - expectedOutflow,
      expectedInflow,
      expectedOutflow,
      payableCount,
      receivableCount,
      scheduledCount,
      unconvertedCount,
    };
  });
}
